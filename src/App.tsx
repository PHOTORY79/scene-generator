import { useState, useRef, useEffect } from 'react';
import {
  Upload, Camera, Film, Smile, Zap, CheckCircle,
  Settings, Download, RefreshCw, ChevronRight, Image as ImageIcon, Send, Sparkles
} from 'lucide-react';
import { initialState, GENRE_PRESETS } from './types/sceneGenerator';
import type { SceneGeneratorState, UsageStats } from './types/sceneGenerator';
import { determineLogicMode } from './utils/determineLogicMode';
import { PreviewGrid } from './components/PreviewGrid';
import { generatePreview, generateFinal, modifyImage } from './api/geminiApi';


function App() {
  const [state, setState] = useState<SceneGeneratorState>(initialState);
  const [stats, setStats] = useState<UsageStats>({ previewCount: 0, finalCount: 0 });

  // External Integration Mode (33Grid from Concept Art Editor)
  const [externalMode, setExternalMode] = useState<{
    enabled: boolean;
    sourceImageUrl: string | null;
    mode: '33grid' | null;
  }>({ enabled: false, sourceImageUrl: null, mode: null });

  // Refs for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle URL parameters for external integration
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const imageUrl = urlParams.get('imageUrl');
    const mode = urlParams.get('mode');

    if (imageUrl && mode === '33grid') {
      setExternalMode({
        enabled: true,
        sourceImageUrl: imageUrl,
        mode: '33grid'
      });

      // Auto-load the image
      fetch(imageUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'external-image.jpg', { type: blob.type });
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
              const w = img.naturalWidth;
              const h = img.naturalHeight;
              let ratioStr = '16:9';
              if (Math.abs(w / h - 16 / 9) < 0.05) ratioStr = '16:9';
              else if (Math.abs(w / h - 9 / 16) < 0.05) ratioStr = '9:16';
              else if (Math.abs(w / h - 4 / 3) < 0.05) ratioStr = '4:3';
              else if (Math.abs(w / h - 1) < 0.05) ratioStr = '1:1';

              setState(prev => ({
                ...prev,
                referenceImage: file,
                referenceImagePreview: dataUrl,
                gridAspectRatio: ratioStr,
                smartLayoutEnabled: true,
                logicMode: 'CINEMATIC'
              }));
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        })
        .catch(err => {
          console.error('Failed to load external image:', err);
        });
    }
  }, []);

  // Function to send upscaled image back to opener
  const sendToOpener = (imageUrl: string) => {
    if (window.opener) {
      window.opener.postMessage({
        type: '33grid-complete',
        imageUrl: imageUrl
      }, '*');
    }
  };


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
    // Disabled when Smart Layout OR Story Mode is enabled
    if (state.smartLayoutEnabled || state.storyModeEnabled) return;

    setState(prev => {
      const newCats = { ...prev.selectedCategories, [cat]: !prev.selectedCategories[cat] };
      return {
        ...prev,
        selectedCategories: newCats,
        logicMode: determineLogicMode(newCats)
      };
    });
  };

  const toggleSmartLayout = () => {
    setState(prev => {
      if (prev.smartLayoutEnabled) {
        // Turning off Smart Layout
        return {
          ...prev,
          smartLayoutEnabled: false,
          logicMode: determineLogicMode(prev.selectedCategories)
        };
      } else {
        // Turning on Smart Layout - disable all categories AND Story Mode
        return {
          ...prev,
          smartLayoutEnabled: true,
          storyModeEnabled: false,
          selectedCategories: { angle: false, shot: false, expression: false },
          logicMode: 'CINEMATIC'
        };
      }
    });
  };

  // Toggle Story Mode
  const toggleStoryMode = () => {
    setState(prev => {
      if (prev.storyModeEnabled) {
        // Turning OFF Story Mode
        return {
          ...prev,
          storyModeEnabled: false,
          logicMode: determineLogicMode(prev.selectedCategories)
        };
      } else {
        // Turning ON Story Mode - disable all categories AND Smart Layout
        return {
          ...prev,
          storyModeEnabled: true,
          smartLayoutEnabled: false,
          selectedCategories: { angle: false, shot: false, expression: false },
          logicMode: 'STORY'
        };
      }
    });
  };

  const selectGenre = (genreId: string) => {
    setState(prev => ({ ...prev, selectedGenre: genreId }));
  };

  const handleContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, contextPrompt: e.target.value }));
  };

  // Helper: Update Grid Cell with New Image
  const updateGridWithImage = async (gridUrl: string, cellIndex: number, newImageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const gridImg = new Image();
      gridImg.crossOrigin = "Anonymous";
      gridImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = gridImg.width;
        canvas.height = gridImg.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject("No canvas context"); return; }

        // Draw original grid
        ctx.drawImage(gridImg, 0, 0);

        // Load new image
        const cellImg = new Image();
        cellImg.crossOrigin = "Anonymous";
        cellImg.onload = () => {
          // Calculate cell position
          const cellWidth = gridImg.width / 3;
          const cellHeight = gridImg.height / 3;
          const row = Math.floor(cellIndex / 3);
          const col = cellIndex % 3;

          // Draw new image into the cell slot
          ctx.drawImage(cellImg, col * cellWidth, row * cellHeight, cellWidth, cellHeight);

          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        cellImg.onerror = (e) => reject(e);
        cellImg.src = newImageUrl;
      };
      gridImg.onerror = (e) => reject(e);
      gridImg.src = gridUrl;
    });
  };

  // Helper: Crop Cell from Grid
  const cropCellFromGrid = async (gridUrl: string, cellIndex: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      // ... (existing code, unchanged relative to replacement block, but included if needed, 
      // avoiding massive re-paste if possible. However, since we are replacing a large block, 
      // it's safer to just include the necessary parts or target carefully.
      // Let's assume this helper is outside the replace block or I need to include it if I target a large range.)
      // Wait, I am replacing from `toggleCategory` (line 62) down to `renderStep2` end (line 412ish)?
      // No, that's too much. I should target specific blocks or use multi-replace.
      // The instruction asks for `toggleStoryMode`, updates to others, and UI additions.
      // I'll stick to replacing the handler section first, then the UI section in a separate chunk to be safe/clean.
      // Actually, multi_replace is safer.
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
      // ...
    }

    try {
      const result = await generatePreview(
        state.referenceImage,
        state.logicMode,
        Object.keys(state.selectedCategories).filter(k => state.selectedCategories[k as keyof typeof state.selectedCategories]),
        state.contextPrompt, // Shared field for Context or Story
        width,
        height,
        ratio,
        state.smartLayoutEnabled ? state.selectedGenre : undefined // Pass genre for CINEMATIC mode
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

      // If in external mode (33grid from Concept Art Editor), send back to opener
      if (externalMode.enabled && externalMode.mode === '33grid') {
        sendToOpener(finalUrl);
      }

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

  const handleModifyImage = async () => {
    // Determine which image to modify: the Modified one if it exists (for iterative edits) or the Final one
    const sourceImage = state.modifiedImageUrl || state.finalImageUrl;
    if (!sourceImage || !state.modificationPrompt.trim()) return;

    setState(prev => ({ ...prev, isModifying: true }));

    try {
      const newImageUrl = await modifyImage(sourceImage, state.modificationPrompt);
      setState(prev => ({
        ...prev,
        isModifying: false,
        modifiedImageUrl: newImageUrl,
        modificationPrompt: '' // Clear prompt after success? Or keep it? Let's clear it.
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, isModifying: false, error: err.message }));
    }
  };



  const resetAll = () => {
    if (window.confirm("Start over? This will clear current progress.")) {
      setState(initialState);
    }
  };

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
        {/* Category Selection */}
        <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Select Variations</h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => toggleCategory('angle')}
              disabled={state.smartLayoutEnabled || state.storyModeEnabled}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.smartLayoutEnabled || state.storyModeEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedCategories.angle ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Camera size={20} /> <span>Camera Angle</span></div>
              {state.selectedCategories.angle && <CheckCircle size={18} />}
            </button>
            <button
              onClick={() => toggleCategory('shot')}
              disabled={state.smartLayoutEnabled || state.storyModeEnabled}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.smartLayoutEnabled || state.storyModeEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedCategories.shot ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Film size={20} /> <span>Shot Distance</span></div>
              {state.selectedCategories.shot && <CheckCircle size={18} />}
            </button>
            <button
              onClick={() => toggleCategory('expression')}
              disabled={state.smartLayoutEnabled || state.storyModeEnabled}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${state.smartLayoutEnabled || state.storyModeEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedCategories.expression ? 'bg-pink-600/20 border-pink-500 text-pink-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Smile size={20} /> <span>Expression</span></div>
              {state.selectedCategories.expression && <CheckCircle size={18} />}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-600"></div>
            <span className="text-xs text-gray-500">스마트 모드</span>
            <div className="flex-1 h-px bg-gray-600"></div>
          </div>

          <div className="space-y-3">
            {/* Smart Layout Toggle */}
            <button
              onClick={toggleSmartLayout}
              disabled={Object.values(state.selectedCategories).some(v => v) || state.storyModeEnabled}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${Object.values(state.selectedCategories).some(v => v) || state.storyModeEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${state.smartLayoutEnabled ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500 text-amber-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Sparkles size={20} /> <span>Smart Layout (스마트 레이아웃)</span></div>
              {state.smartLayoutEnabled && <CheckCircle size={18} />}
            </button>

            {/* Story Mode Toggle */}
            <button
              onClick={toggleStoryMode}
              disabled={Object.values(state.selectedCategories).some(v => v) || state.smartLayoutEnabled}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${Object.values(state.selectedCategories).some(v => v) || state.smartLayoutEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${state.storyModeEnabled ? 'bg-gradient-to-r from-green-500/20 to-teal-500/20 border-green-500 text-green-300' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3"><Film size={20} /> <span>Story (스토리)</span></div>
              {state.storyModeEnabled && <CheckCircle size={18} />}
            </button>
          </div>

          {/* Logic Mode Display */}
          <div className="mt-6 p-4 bg-black/20 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Logic Mode:</span>
              <span className={`text-sm font-bold px-2 py-1 rounded ${state.logicMode === 'CINEMATIC' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black' :
                state.logicMode === 'STORY' ? 'bg-gradient-to-r from-green-500 to-teal-500 text-black' :
                  state.logicMode === 'DYNAMIC' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' :
                    state.logicMode === 'MATRIX' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-white'
                }`}>{state.logicMode}</span>
            </div>
            <p className="text-xs text-gray-500">
              {state.logicMode === 'LINEAR' && "Explores 9 presets of the single selected category."}
              {state.logicMode === 'MATRIX' && "Combines top 3 traits from two categories (3x3)."}
              {state.logicMode === 'DYNAMIC' && "AI creatively mixes all three for maximum cinematic diversity."}
              {state.logicMode === 'CINEMATIC' && "AI auto-generates fixed 9-shot cinematic grid with genre styling."}
              {state.logicMode === 'STORY' && "AI generates a 3x3 visual storyboard based on your story line."}
            </p>
          </div>
        </div>

        {/* Genre Preset Selector (Only shown when Smart Layout is enabled) */}
        {state.smartLayoutEnabled && (
          <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">Select Genre</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {GENRE_PRESETS.map(genre => (
                <button
                  key={genre.id}
                  onClick={() => selectGenre(genre.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all overflow-hidden group ${state.selectedGenre === genre.id ? 'border-white ring-2 ring-white/30' : 'border-transparent hover:border-gray-500'}`}
                >
                  {/* Background gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${genre.cardColor} opacity-80 group-hover:opacity-100 transition-opacity`}></div>
                  {/* Content */}
                  <div className="relative z-10 text-center">
                    <p className="font-bold text-white text-sm">{genre.name_en}</p>
                    <p className="text-xs text-white/70 mt-1">{genre.name_ko}</p>
                  </div>
                  {/* Selected indicator */}
                  {state.selectedGenre === genre.id && (
                    <div className="absolute top-2 right-2 z-10">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Context Prompt (Shared with Story Mode) */}
        {(!state.smartLayoutEnabled || state.storyModeEnabled) && (
          <div className={`bg-gray-800/50 p-6 rounded-2xl border ${state.storyModeEnabled ? 'border-green-500/50 bg-green-900/10' : 'border-white/10'}`}>
            <h3 className="text-lg font-semibold text-white mb-2">
              {state.storyModeEnabled ? 'Story Line (스토리 라인)' : 'Context Prompt (Optional)'}
            </h3>
            <textarea
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder={state.storyModeEnabled ? "e.g. A detective finds a clue in the rain, looks shocked, then runs towards the shadow..." : "e.g. Cyberpunk detective in rainy neon-lit alley..."}
              rows={3}
              value={state.contextPrompt}
              onChange={handleContextChange}
            />
          </div>
        )}

        {/* Original aspect ratio is auto-detected and shown */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-white/10 text-center">
          <span className="text-sm text-gray-400">Aspect Ratio: </span>
          <span className="text-sm font-bold text-white">{state.gridAspectRatio}</span>
          <span className="text-xs text-gray-500 ml-2">(auto-detected)</span>
        </div>

        <button
          onClick={handleGeneratePreview}
          disabled={state.isGeneratingPreview || (!state.smartLayoutEnabled && !state.storyModeEnabled && Object.values(state.selectedCategories).every(v => !v))}
          className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${(state.smartLayoutEnabled || state.storyModeEnabled || Object.values(state.selectedCategories).some(v => v)) && !state.isGeneratingPreview
            ? state.smartLayoutEnabled
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:scale-[1.02] shadow-lg shadow-orange-500/25 text-black'
              : state.storyModeEnabled
                ? 'bg-gradient-to-r from-green-500 to-teal-500 hover:scale-[1.02] shadow-lg shadow-green-500/25 text-black'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-[1.02] shadow-lg shadow-blue-500/25'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
        >
          {state.isGeneratingPreview ? <RefreshCw className="animate-spin" /> : state.smartLayoutEnabled ? <Sparkles /> : state.storyModeEnabled ? <Film /> : <Zap fill="currentColor" />}
          {state.isGeneratingPreview ? 'Generating Preview...' : state.storyModeEnabled ? 'Generate Story Grid (1 Credit)' : 'Generate 3x3 Preview (1 Credit)'}
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
        <div className="flex flex-col items-center gap-3">
          <div className="text-center text-gray-400 text-sm">
            Click on a panel to select it for high-resolution rendering.
          </div>
          <button
            onClick={() => {
              const link = document.createElement('a');
              link.href = state.previewGridUrl!;
              link.download = `33grid-preview-${Date.now()}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <Download size={16} />
            Download Full Grid Image (전체 그리드 다운로드)
          </button>
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
    <div className="text-center space-y-8 animate-fade-in relative z-10 pb-20">
      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
        Masterpiece Created!
      </h2>

      {/* Main Image Display (Final or Modified) */}
      <div className="relative max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-gray-700 group">
        <img
          src={state.modifiedImageUrl || state.finalImageUrl!}
          alt="Final"
          className="w-full"
        />

        {/* Undo/Comparison if Modified */}
        {state.modifiedImageUrl && (
          <button
            onClick={() => setState(prev => ({ ...prev, modifiedImageUrl: null }))}
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur-md border border-white/20 transition-all"
          >
            ↺ Revert to Original
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end">
          <div className="text-left">
            <p className="text-white font-bold">{state.outputResolution} • {state.outputAspectRatio}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = state.modifiedImageUrl || state.finalImageUrl!;
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
              onClick={async () => {
                const currentImage = state.modifiedImageUrl || state.finalImageUrl;
                if (!currentImage) return;

                // 1. Update Grid locally
                if (state.previewGridUrl && state.selectedCellIndex !== null) {
                  try {
                    const newGridUrl = await updateGridWithImage(state.previewGridUrl, state.selectedCellIndex, currentImage);
                    setState(prev => ({ ...prev, previewGridUrl: newGridUrl }));
                  } catch (e) {
                    console.error("Failed to update grid:", e);
                  }
                }

                // 2. Send to Parent
                const payload = {
                  type: 'SCENE_GENERATED',
                  image: currentImage,
                  stats: stats
                };
                if (window.opener) {
                  window.opener.postMessage(payload, '*');
                }
                window.parent.postMessage(payload, '*');
                alert('Saved to Project & Grid Updated!');
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-500"
            >
              <Send size={18} /> Save & Update Grid
            </button>
          </div>
        </div>
      </div>

      {/* Modification Section */}
      <div className="max-w-2xl mx-auto bg-gray-800/50 p-6 rounded-2xl border border-white/10 mt-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Sparkles size={20} className="text-yellow-400" />
          Modify Image (AI 수정)
        </h3>
        <div className="flex flex-col gap-3">
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-yellow-500 focus:outline-none"
            placeholder="e.g. Change background to sunset, Add rain, Make lighting darker..."
            rows={2}
            value={state.modificationPrompt}
            onChange={(e) => setState(prev => ({ ...prev, modificationPrompt: e.target.value }))}
          />
          <button
            onClick={handleModifyImage}
            disabled={state.isModifying || !state.modificationPrompt.trim()}
            className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${!state.isModifying && state.modificationPrompt.trim()
              ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:scale-[1.02] text-black shadow-lg shadow-amber-500/20'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
          >
            {state.isModifying ? <RefreshCw className="animate-spin" /> : <Sparkles size={18} />}
            {state.isModifying ? 'Modifying...' : 'Apply Modification (1 Credit)'}
          </button>
        </div>
      </div>



      <div className="flex justify-center gap-4 mt-8">
        <button
          onClick={() => setState(prev => ({ ...prev, finalImageUrl: null, modifiedImageUrl: null, isGeneratingFinal: false, isModifying: false }))}
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
