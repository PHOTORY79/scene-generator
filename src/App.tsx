import { useState, useRef } from 'react';
import {
  Upload, Camera, Film, Smile, Zap, CheckCircle,
  Settings, Download, RefreshCw, ChevronRight, Image as ImageIcon, Send
} from 'lucide-react';
import { initialState } from './types/sceneGenerator';
import type { SceneGeneratorState, UsageStats } from './types/sceneGenerator';
import { determineLogicMode } from './utils/determineLogicMode';
import { PreviewGrid } from './components/PreviewGrid';
import { generatePreview, generateFinal } from './api/geminiApi';

function App() {
  const [state, setState] = useState<SceneGeneratorState>(initialState);
  const [stats, setStats] = useState<UsageStats>({ previewCount: 0, finalCount: 0 });

  // Refs for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large (>10MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;

        // Auto-detect original image aspect ratio
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
          const divisor = gcd(w, h);
          const ratioW = w / divisor;
          const ratioH = h / divisor;
          // Simplify to common ratios or use raw
          let ratioStr = `${ratioW}:${ratioH}`;
          // Common simplifications
          if (Math.abs(w / h - 16 / 9) < 0.05) ratioStr = '16:9';
          else if (Math.abs(w / h - 9 / 16) < 0.05) ratioStr = '9:16';
          else if (Math.abs(w / h - 4 / 3) < 0.05) ratioStr = '4:3';
          else if (Math.abs(w / h - 3 / 4) < 0.05) ratioStr = '3:4';
          else if (Math.abs(w / h - 1) < 0.05) ratioStr = '1:1';

          setState(prev => ({
            ...prev,
            referenceImage: file,
            referenceImagePreview: dataUrl,
            gridAspectRatio: ratioStr
          }));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleCategory = (cat: 'angle' | 'shot' | 'expression') => {
    setState(prev => {
      const newCats = { ...prev.selectedCategories, [cat]: !prev.selectedCategories[cat] };
      return {
        ...prev,
        selectedCategories: newCats,
        logicMode: determineLogicMode(newCats)
      };
    });
  };

  const handleContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, contextPrompt: e.target.value }));
  };

  // Helper: Crop Cell from Grid
  const cropCellFromGrid = async (gridUrl: string, cellIndex: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject("No canvas context"); return; }

        // Grid is 3x3
        const cellWidth = img.width / 3;
        const cellHeight = img.height / 3;

        const row = Math.floor(cellIndex / 3);
        const col = cellIndex % 3;

        canvas.width = cellWidth;
        canvas.height = cellHeight;

        ctx.drawImage(
          img,
          col * cellWidth, row * cellHeight, cellWidth, cellHeight, // Source
          0, 0, cellWidth, cellHeight // Dest
        );

        const base64 = canvas.toDataURL('image/jpeg', 0.95);
        console.log(`[App] Cropped Cell ${cellIndex}: ${base64.substring(0, 50)}... Length: ${base64.length}`);
        resolve(base64);
      };
      img.onerror = (e) => reject(e);
      img.src = gridUrl;
    });
  };

  const handleGeneratePreview = async () => {
    if (!state.referenceImage) return;

    setState(prev => ({ ...prev, isGeneratingPreview: true }));
    setStats(prev => ({ ...prev, previewCount: prev.previewCount + 1 }));

    // Determine dimensions based on ratio
    let width = 1024;
    let height = 1024;
    const ratio = state.gridAspectRatio;

    if (ratio === '16:9') { width = 1792; height = 1024; } // Approximating 16:9 for models
    else if (ratio === '9:16') { width = 1024; height = 1792; }
    else if (ratio === '4:3') { width = 1408; height = 1056; }
    else if (ratio === 'Original' && state.referenceImage) {
      // We'd ideally need natural width/height from the file. 
      // For now, let's stick to a safe default if not easily available sync, 
      // or use a standard '1:1' if we can't determine it quickly without loading <img>.
      // But wait, we have `referenceImagePreview`! We could technically check it, but let's default to square for safety or 4:3.
      // Actually, let's rely on the prompt "Original" to guide the model if we pass 'Original' as ratioLabel.
    }

    try {
      const result = await generatePreview(
        state.referenceImage,
        state.logicMode,
        Object.keys(state.selectedCategories).filter(k => state.selectedCategories[k as keyof typeof state.selectedCategories]),
        state.contextPrompt,
        width,
        height,
        ratio
      );

      setState(prev => ({
        ...prev,
        isGeneratingPreview: false,
        previewGridUrl: result.url,
        gridMetadata: result.metadata
      }));
    } catch (err: any) {
      // Error is handled in API with alert, but we also clear loading
      setState(prev => ({ ...prev, isGeneratingPreview: false, error: err.message }));
    }
  };

  const handleCellSelect = (index: number) => {
    setState(prev => ({ ...prev, selectedCellIndex: index }));
  };

  const handleGenerateFinal = async () => {
    if (state.selectedCellIndex === null || !state.previewGridUrl) return;

    setState(prev => ({ ...prev, isGeneratingFinal: true }));
    setStats(prev => ({ ...prev, finalCount: prev.finalCount + 1 }));

    try {
      // Crop the cell first
      const croppedBase64 = await cropCellFromGrid(state.previewGridUrl, state.selectedCellIndex);

      const finalUrl = await generateFinal(
        state.previewGridUrl,
        state.selectedCellIndex,
        state.outputResolution,
        state.outputAspectRatio,
        state.referenceImage!, // Pass original
        croppedBase64,         // Pass cropped
        state.contextPrompt
      );

      setState(prev => ({
        ...prev,
        isGeneratingFinal: false,
        finalImageUrl: finalUrl
      }));

      // Send PostMessage
      window.parent.postMessage({
        imageUrl: finalUrl,
        stats: {
          previewCount: stats.previewCount, // current total
          finalCount: stats.finalCount + 1 // include this one
        }
      }, "*");

      console.log("PostMessage sent!", {
        imageUrl: finalUrl,
        stats: { previewCount: stats.previewCount + 1, finalCount: stats.finalCount + 1 }
      });

    } catch (err: any) {
      setState(prev => ({ ...prev, isGeneratingFinal: false, error: err.message }));
    }
  };

  const resetAll = () => {
    if (window.confirm("Start over? This will clear current progress.")) {
      setState(initialState);
      // We do not reset stats as they are cumulative for the session? 
      // User request says "count attempts... results send usage stats". 
      // Probably should keep counting.
    }
  };

  // Render Helpers
  const renderStep1 = () => (
    <div className="bg-gray-800/50 backdrop-blur-md p-8 rounded-2xl border border-white/10 shadow-xl">
      <div
        className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center hover:border-blue-500 transition-colors cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-all">
          <Upload size={32} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Upload Reference Image</h3>
        <p className="text-gray-400">JPG, PNG, WEBP up to 10MB</p>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Reference Preview */}
      <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10 h-fit">
        <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <ImageIcon size={20} /> Reference
        </h3>
        <img
          src={state.referenceImagePreview!}
          alt="Ref"
          className="w-full rounded-lg shadow-lg border border-gray-700"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full mt-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 flex items-center justify-center gap-2"
        >
          <Upload size={16} /> Change Image
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Select Variations</h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => toggleCategory('angle')}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.selectedCategories.angle ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Camera size={20} /> <span>Camera Angle</span></div>
              {state.selectedCategories.angle && <CheckCircle size={18} />}
            </button>
            <button
              onClick={() => toggleCategory('shot')}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.selectedCategories.shot ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Film size={20} /> <span>Shot Distance</span></div>
              {state.selectedCategories.shot && <CheckCircle size={18} />}
            </button>
            <button
              onClick={() => toggleCategory('expression')}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.selectedCategories.expression ? 'bg-pink-600/20 border-pink-500 text-pink-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Smile size={20} /> <span>Expression</span></div>
              {state.selectedCategories.expression && <CheckCircle size={18} />}
            </button>
          </div>

          <div className="mt-6 p-4 bg-black/20 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Logic Mode:</span>
              <span className={`text-sm font-bold px-2 py-1 rounded ${state.logicMode === 'DYNAMIC' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' :
                state.logicMode === 'MATRIX' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-white'
                }`}>{state.logicMode}</span>
            </div>
            <p className="text-xs text-gray-500">
              {state.logicMode === 'LINEAR' && "Explores 9 presets of the single selected category."}
              {state.logicMode === 'MATRIX' && "Combines top 3 traits from two categories (3x3)."}
              {state.logicMode === 'DYNAMIC' && "AI creatively mixes all three for maximum cinematic diversity."}
            </p>
          </div>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-2">Context Prompt</h3>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. Cyberpunk detective in rainy neon-lit alley..."
            rows={3}
            value={state.contextPrompt}
            onChange={handleContextChange}
          />
        </div>

        {/* Original aspect ratio is auto-detected and shown */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-white/10 text-center">
          <span className="text-sm text-gray-400">Aspect Ratio: </span>
          <span className="text-sm font-bold text-white">{state.gridAspectRatio}</span>
          <span className="text-xs text-gray-500 ml-2">(auto-detected)</span>
        </div>

        <button
          onClick={handleGeneratePreview}
          disabled={state.isGeneratingPreview || Object.values(state.selectedCategories).every(v => !v)}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${Object.values(state.selectedCategories).some(v => v) && !state.isGeneratingPreview
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-[1.02] shadow-lg shadow-blue-500/25'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
        >
          {state.isGeneratingPreview ? <RefreshCw className="animate-spin" /> : <Zap fill="currentColor" />}
          {state.isGeneratingPreview ? 'Generating Preview...' : 'Generate 3x3 Preview (1 Credit)'}
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          Select Your Best Shot <span className="text-sm font-normal text-gray-400 bg-gray-800 px-2 py-1 rounded-full">Grid View</span>
        </h2>
        {/* Applied Variations */}
        <div className="flex flex-wrap gap-2">
          {state.selectedCategories.angle && <span className="px-3 py-1 bg-blue-600/20 border border-blue-500 text-blue-300 text-xs rounded-full">📐 앵글 변경</span>}
          {state.selectedCategories.shot && <span className="px-3 py-1 bg-purple-600/20 border border-purple-500 text-purple-300 text-xs rounded-full">🎬 샷 디스턴스</span>}
          {state.selectedCategories.expression && <span className="px-3 py-1 bg-pink-600/20 border border-pink-500 text-pink-300 text-xs rounded-full">😊 표정 변화</span>}
        </div>
        <PreviewGrid
          imageUrl={state.previewGridUrl!}
          selectedCell={state.selectedCellIndex}
          onCellSelect={handleCellSelect}
          aspectRatio={state.gridAspectRatio}
        />
        <div className="text-center text-gray-400 text-sm">
          Click on a panel to select it for high-resolution rendering.
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Settings size={20} /> Final Settings</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Resolution</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1K', '2K', '4K'] as const).map(res => (
                  <button
                    key={res}
                    onClick={() => setState(p => ({ ...p, outputResolution: res }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${state.outputResolution === res ? 'bg-white text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] as const).map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setState(p => ({ ...p, outputAspectRatio: ratio }))}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${state.outputAspectRatio === ratio ? 'bg-white text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerateFinal}
          disabled={state.selectedCellIndex === null || state.isGeneratingFinal}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${state.selectedCellIndex !== null && !state.isGeneratingFinal
            ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:scale-[1.02] shadow-lg shadow-orange-500/25 text-black'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
        >
          {state.isGeneratingFinal ? <RefreshCw className="animate-spin" /> : <Download size={20} />}
          {state.isGeneratingFinal ? 'Upscaling...' : 'Generate Final Image (1 Credit)'}
        </button>

        {state.selectedCellIndex !== null && (
          <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 text-sm text-gray-300">
            <strong>Selected Panel {state.selectedCellIndex}:</strong><br />
            {state.gridMetadata[state.selectedCellIndex]?.angle},
            {state.gridMetadata[state.selectedCellIndex]?.shot},
            {state.gridMetadata[state.selectedCellIndex]?.expression}
          </div>
        )}

        {/* New Project Button */}
        <button
          onClick={resetAll}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white flex items-center justify-center gap-2 mt-4"
        >
          <Upload size={18} /> New Project
        </button>
      </div>
    </div>
  );

  const renderResult = () => (
    <div className="text-center space-y-8 animate-fade-in">
      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
        Masterpiece Created!
      </h2>
      <div className="relative max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-gray-700 group">
        <img src={state.finalImageUrl!} alt="Final" className="w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end">
          <div className="text-left">
            <p className="text-white font-bold">{state.outputResolution} • {state.outputAspectRatio}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = state.finalImageUrl!;
                link.download = `scene-generator-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="bg-white text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-200"
            >
              <Download size={18} /> Download
            </button>
            <button
              onClick={() => {
                const payload = {
                  type: 'SCENE_GENERATED',
                  image: state.finalImageUrl,
                  stats: stats
                };
                // Send to parent (iframe) or opener (popup)
                if (window.opener) {
                  window.opener.postMessage(payload, '*');
                }
                window.parent.postMessage(payload, '*');
                alert('Data sent to framework!');
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-500"
            >
              <Send size={18} /> Save to Project
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button
          onClick={() => setState(prev => ({ ...prev, finalImageUrl: null, isGeneratingFinal: false }))}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white flex items-center gap-2"
        >
          <ChevronRight className="rotate-180" size={18} /> Back to Selection
        </button>
        <button
          onClick={resetAll}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white flex items-center gap-2"
        >
          <Upload size={18} /> New Project
        </button>
      </div>

      <div className="p-4 bg-black/40 inline-block rounded-lg text-xs text-gray-500">
        Session Stats: Previews {stats.previewCount} / Finals {stats.finalCount}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black text-white selection:bg-blue-500/30">
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Film size={18} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">AIFI Scene Generator <span className="text-xs font-normal text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded ml-2">PRO</span></h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>Vertex AI (Gemini 3 Pro)</span>
            <div className="w-px h-4 bg-gray-700"></div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Online
            </div>
            <div className="w-px h-4 bg-gray-700"></div>
            <button
              onClick={() => {
                window.parent.postMessage({ action: 'close' }, '*');
                window.close();
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors"
              title="Close"
            >
              <ChevronRight size={20} className="rotate-180" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Global file input - always in DOM */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/png, image/jpeg, image/webp"
          onChange={handleImageUpload}
        />

        {!state.referenceImage && renderStep1()}

        {state.referenceImage && !state.previewGridUrl && renderStep2()}

        {state.previewGridUrl && !state.finalImageUrl && renderStep3()}

        {state.finalImageUrl && renderResult()}
      </main>
    </div>
  );
}

export default App;
