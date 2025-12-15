import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function generatePreview(
    referenceImage: File,
    logicMode: string,
    selectedCategories: string[],
    contextPrompt: string,
    width: number,
    height: number,
    ratioLabel: string
): Promise<{ url: string; metadata: any[] }> {
    // 1. gemini-3-pro-image-preview (Nano Banana Pro)
    // 2. imagen-3.0-generate-001 (fallback)
    const modelsToTry = ['gemini-3-pro-image-preview', 'imagen-3.0-generate-001'];
    let lastError = null;

    let imagePart;
    try {
        imagePart = await fileToGenerativePart(referenceImage);
    } catch (e) {
        console.error("Failed to process reference image:", e);
        throw new Error("Failed to process reference image");
    }

    const prompt = `IMPORTANT CONSTRAINT: The final output image must be a 3x3 grid. The overall canvas aspect ratio must match ${ratioLabel} (e.g., 16:9). Do NOT generate a square image if 16:9 is requested. Fill the entire width.

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

    for (const modelName of modelsToTry) {
        try {
            console.log(`[Gemini API] Generating Preview with model: ${modelName} (${width}x${height})`);

            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;

            const imageUrl = await extractImageFromResponse(response);

            // Success
            return {
                url: imageUrl,
                metadata: Array.from({ length: 9 }).map((_, i) => ({
                    cell: i,
                    angle: 'AI Generated',
                    shot: 'AI Generated',
                    expression: 'AI Generated'
                }))
            };

        } catch (err: any) {
            console.warn(`[Gemini API] Model ${modelName} failed:`, err);
            lastError = err;
        }
    }

    // All failed
    alert("모델명을 확인해주세요");
    throw lastError || new Error("All models failed");
}

export async function generateFinal(
    previewUrl: string, // Kept for reference, but we use strict inputs now
    cellIndex: number,
    resolution: string,
    aspectRatio: string,
    originalImage: File,
    croppedImageBase64: string,
    contextPrompt?: string
): Promise<string> {
    const modelsToTry = ['gemini-3-pro-image-preview', 'imagen-3.0-generate-001'];
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

    alert("모델명을 확인해주세요");
    throw lastError || new Error("All models failed");
}
