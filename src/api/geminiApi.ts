import { GoogleGenerativeAI } from "@google/generative-ai";
import { GENRE_PRESETS } from "../types/sceneGenerator";

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// Helper to convert File to GenerativePart (base64)
async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // reader.result is something like "data:image/jpeg;base64,....."
            // We need just the base64 part
            const base64Data = (reader.result as string).split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Extracts an image URL from the Gemini/Imagen response.
 * Handles cases where the model returns inline data (image/png) or a text URL.
 */
async function extractImageFromResponse(response: any): Promise<string> {
    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (part?.inlineData) {
        // Return base64 data URL
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }

    // Check if there is text that might be a URL
    const text = response.text ? response.text() : '';
    if (text && text.startsWith('http')) {
        return text;
    }

    throw new Error("No image data found in response");
}

// CINEMATIC mode prompt template (Smart Layout)
function buildCinematicPrompt(genrePresetId: string, ratioLabel: string): string {
    const genre = GENRE_PRESETS.find(g => g.id === genrePresetId) || GENRE_PRESETS[1]; // Default: cinematic

    return `[ROLE]
You are a veteran cinematographer creating a professional shot breakdown.

[REFERENCE - IMMUTABLE]
The FIRST IMAGE is your ONLY source of truth.
This is the ABSOLUTE REFERENCE for all visual elements.

[IDENTITY LOCK - CRITICAL]
FROM the reference image, EXTRACT and permanently LOCK:
- Facial geometry: bone structure, eye spacing, nose shape, lip form
- Skin tone and texture
- Hair: exact style, color, volume, parting direction
- Outfit: every garment, accessory, fabric fold, pattern
- Environment: background elements, props, surfaces, architecture
- Lighting baseline: direction, color temperature, shadow characteristics

ANY deviation = COMPLETE FAILURE. No exceptions.

[ANALYSIS TASK]
Analyze the input image and identify:
1. Subject type: person / couple / group / vehicle / object / animal
2. Spatial relationships and interactions between subjects
3. Environmental context and setting
4. Current lighting conditions

[SUBJECT ADAPTATION RULES]
Apply framing rules based on detected subject type:

IF person:
  - Maintain consistent facial features across all 9 shots
  - ECU focuses on eyes with catchlight OR emotional detail

IF couple:
  - Keep both subjects in frame for all shots (except ECU)
  - Preserve spatial relationship and interaction
  - ECU: intertwined hands OR shared gaze point

IF group:
  - Maintain all group members visible (except ECU)
  - Preserve group dynamics and positioning
  - ECU: central interaction point OR leader's expression

IF vehicle:
  - Show complete vehicle in wider shots
  - CU: front grille / headlights
  - ECU: emblem / wheel detail / surface texture

IF object/product:
  - Frame complete object in wider shots
  - Emphasize form and material
  - ECU: logo / texture / unique design element

IF animal:
  - Maintain species characteristics
  - ECU: eyes OR fur/feather texture

[GENERATION TASK]
Create a SINGLE IMAGE containing a 3x3 grid with exactly 9 panels.
The overall canvas aspect ratio must match ${ratioLabel}.

Grid Structure:
┌─────────────────────────────────────────────────────┐
│ Row 1: ESTABLISHING CONTEXT                         │
├─────────────────┬─────────────────┬─────────────────┤
│ Cell 0          │ Cell 1          │ Cell 2          │
│ Extreme Long    │ Long Shot       │ Medium Long     │
│ Subject small   │ Full body/form  │ 3/4 view        │
│ in vast space   │ head to toe     │ knees up        │
├─────────────────┼─────────────────┼─────────────────┤
│ Row 2: CORE COVERAGE                                │
├─────────────────┼─────────────────┼─────────────────┤
│ Cell 3          │ Cell 4          │ Cell 5          │
│ Medium Shot     │ Medium Close-Up │ Close-Up        │
│ Waist up        │ Chest up        │ Face/front      │
│ Action focus    │ Intimate frame  │ tight framing   │
├─────────────────┼─────────────────┼─────────────────┤
│ Row 3: DETAIL & ANGLES                              │
├─────────────────┼─────────────────┼─────────────────┤
│ Cell 6          │ Cell 7          │ Cell 8          │
│ Extreme Close   │ Low Angle       │ High Angle      │
│ Macro detail    │ Worm's eye view │ Bird's eye view │
│ Key feature     │ Looking up      │ Looking down    │
└─────────────────┴─────────────────┴─────────────────┘

[STYLE PRESET: ${genre.name_en}]
Color Grading: ${genre.color_grading}
Lighting Style: ${genre.lighting}
Mood: ${genre.mood}

Apply this style CONSISTENTLY across all 9 panels.

[TECHNICAL REQUIREMENTS]
- Photorealistic rendering quality
- Consistent color grading across ALL 9 panels
- Realistic depth of field progression (shallow DOF with bokeh in close-ups)
- Seamless panel arrangement (no visible borders between cells)
- Single cohesive image output

[FORBIDDEN - ABSOLUTE]
- Different person/subject in any panel
- Changed clothing, hairstyle, or accessories
- Different background environment
- Inconsistent lighting direction or color temperature
- Frame borders, panel dividers, or grid lines
- Text, labels, numbers, or annotations
- Watermarks or signatures
- Cartoon or illustration style
- Multiple characters unless present in reference

[NEGATIVE PROMPT]
different person, changed identity, altered face, different clothes, 
changed hairstyle, different hair color, modified background, 
inconsistent lighting, deformed features, distorted proportions,
frame borders, panel borders, grid lines, text overlay, 
labels, numbers, watermark, signature, logo,
cartoon style, illustration style, anime style, 
painting style, sketch style, low quality, blurry`;
}

export async function generatePreview(
    referenceImage: File,
    logicMode: string,
    selectedCategories: string[],
    contextPrompt: string,
    width: number,
    height: number,
    ratioLabel: string,
    genrePresetId?: string // For CINEMATIC mode
): Promise<{ url: string; metadata: any[] }> {
    // 1. gemini-3-pro-image-preview (Nano Banana Pro)
    // 2. imagen-3.0-generate-001 (fallback)
    // Updated to use confirmed available models
    const modelsToTry = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
    let lastError = null;

    let imagePart;
    try {
        imagePart = await fileToGenerativePart(referenceImage);
    } catch (e) {
        console.error("Failed to process reference image:", e);
        throw new Error("Failed to process reference image");
    }

    // Build prompt based on mode
    let prompt: string;

    if (logicMode === 'CINEMATIC' && genrePresetId) {
        // Smart Layout mode - use cinematic prompt template
        prompt = buildCinematicPrompt(genrePresetId, ratioLabel);
    } else {
        // Original mode (LINEAR/MATRIX/DYNAMIC)
        prompt = `IMPORTANT CONSTRAINT: The final output image must be a 3x3 grid. The overall canvas aspect ratio must match ${ratioLabel} (e.g., 16:9). Do NOT generate a square image if 16:9 is requested. Fill the entire width.

    [Grid Composition]
    Generate a 3x3 grid where each panel STRICTLY follows this shot progression to show diverse distances:

    1. Extreme Close-up (Focus on Eyes/Details)
    2. Close-up (Face only)
    3. Over-the-Shoulder (OTS) - Added for depth
    4. Medium Close-up (Chest up)
    5. Medium Shot (Waist up)
    6. Cowboy Shot (Thighs up)
    7. Full Shot (Whole body)
    8. Wide Shot (Subject + Surroundings)
    9. Extreme Wide Shot (Vast landscape/Establishing)

    Ensure each panel distinctly represents these distances.

    Generate a cinematic preview grid (3x3 style) based on this reference image.
    Logic Mode: ${logicMode}
    Selected Categories: ${selectedCategories.join(', ')}
    Context: ${contextPrompt}
    Return the generated image directly.`;
    }

    for (const modelName of modelsToTry) {
        try {
            console.log(`[Gemini API] Generating Preview with model: ${modelName} (${width}x${height}), Mode: ${logicMode}`);

            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;

            const imageUrl = await extractImageFromResponse(response);

            // Build metadata based on mode
            const metadata = logicMode === 'CINEMATIC'
                ? [
                    { cell: 0, shot: 'Extreme Long Shot', angle: 'Eye Level' },
                    { cell: 1, shot: 'Long Shot', angle: 'Eye Level' },
                    { cell: 2, shot: 'Medium Long Shot', angle: 'Eye Level' },
                    { cell: 3, shot: 'Medium Shot', angle: 'Eye Level' },
                    { cell: 4, shot: 'Medium Close-Up', angle: 'Eye Level' },
                    { cell: 5, shot: 'Close-Up', angle: 'Eye Level' },
                    { cell: 6, shot: 'Extreme Close-Up', angle: 'Eye Level' },
                    { cell: 7, shot: 'Medium Shot', angle: 'Low Angle' },
                    { cell: 8, shot: 'Medium Shot', angle: 'High Angle' }
                ]
                : Array.from({ length: 9 }).map((_, i) => ({
                    cell: i,
                    angle: 'AI Generated',
                    shot: 'AI Generated',
                    expression: 'AI Generated'
                }));

            // Success
            return {
                url: imageUrl,
                metadata
            };

        } catch (err: any) {
            console.warn(`[Gemini API] Model ${modelName} failed:`, err);
            lastError = err;
        }
    }

    // All failed
    // All failed
    const errorMsg = lastError?.message || "All models failed";
    alert(`Generation failed. Details: ${errorMsg}`);
    throw lastError || new Error("All models failed");
}

export async function generateFinal(
    _previewUrl: string, // Kept for reference, but we use strict inputs now
    _cellIndex: number,
    resolution: string,
    aspectRatio: string,
    originalImage: File,
    croppedImageBase64: string,
    contextPrompt?: string
): Promise<string> {
    const modelsToTry = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
    let lastError = null;

    // 1. Original Image (Character/Style Reference)
    let originalPart;
    try {
        originalPart = await fileToGenerativePart(originalImage);
    } catch (e) {
        throw new Error("Failed to process original image");
    }

    // 2. Cropped Image (Composition Reference)
    // croppedImageBase64 is already a data URL or raw base64? 
    // Helpers usually return data URL "data:image/png;base64,..."
    // We need to parse it if passing as inlineData
    const cropData = croppedImageBase64.split(',')[1] || croppedImageBase64;
    const croppedPart = {
        inlineData: {
            data: cropData,
            mimeType: "image/png"
        }
    };

    const prompt = `DO NOT generate a new random scene. 
    STRICTLY UPSCALING TASK: Look at Image 2 (The Cropped Patch). 
    Reconstruct that exact scene in high resolution using the character details from Image 1. 
    The composition MUST match Image 2.
    Resolution: ${resolution}
    Aspect Ratio: ${aspectRatio}
    Context: ${contextPrompt || ''}`;

    for (const modelName of modelsToTry) {
        try {
            console.log(`[Gemini API] Generating Final with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            // STRICT ORDER: Original, Cropped, Prompt
            const result = await model.generateContent([
                originalPart, // Image 1
                croppedPart,  // Image 2
                prompt
            ]);
            const response = await result.response;

            return await extractImageFromResponse(response);

        } catch (err: any) {
            console.warn(`[Gemini API] Model ${modelName} failed:`, err);
            lastError = err;
        }
    }

    const errorMsg = lastError?.message || "All models failed";
    alert(`Generation failed. Details: ${errorMsg}`);
    throw lastError || new Error("All models failed");
}
