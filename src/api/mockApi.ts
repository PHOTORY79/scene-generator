import type { CellMetadata, LogicMode, Resolution, AspectRatio } from '../types/sceneGenerator';

// Mock delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function mockGeneratePreview(
    referenceImage: File,
    logicMode: LogicMode,
    selectedCategories: string[],
    contextPrompt: string
): Promise<{ url: string; metadata: CellMetadata[] }> {
    console.log('Mocking Preview Generation...', { referenceImage, logicMode, selectedCategories, contextPrompt });

    await delay(2000); // 2 second delay

    // Return a placeholder image URL that represents a 3x3 grid
    // Using a solid color or pattern service for now
    const url = `https://placehold.co/1024x1024/222222/FFF?text=Preview+Grid+(${logicMode})`;

    // Generate mock metadata based on logic mode
    const metadata: CellMetadata[] = Array.from({ length: 9 }).map((_, i) => ({
        cell: i,
        angle: 'Eye Level',
        shot: 'Medium Shot',
        expression: 'Neutral'
    }));

    return { url, metadata };
}

export async function mockGenerateFinal(
    previewUrl: string,
    cellIndex: number,
    resolution: Resolution,
    aspectRatio: AspectRatio
): Promise<string> {
    console.log('Mocking Final Generation...', { previewUrl, cellIndex, resolution, aspectRatio });

    await delay(3000); // 3 second delay

    // Return a high-res placeholder
    return `https://placehold.co/1920x1080/111111/FFF?text=Final+Result+(${resolution})`;
}
