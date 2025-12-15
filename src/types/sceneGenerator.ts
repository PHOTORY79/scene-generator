export type LogicMode = 'LINEAR' | 'MATRIX' | 'DYNAMIC';
export type Resolution = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';

export interface CellMetadata {
    cell: number;
    angle?: string;
    shot?: string;
    expression?: string;
}

export interface SceneGeneratorState {
    // Step 1: Upload
    referenceImage: File | null;
    referenceImagePreview: string | null;

    // Step 2: Configuration
    selectedCategories: {
        angle: boolean;
        shot: boolean;
        expression: boolean;
    };
    logicMode: LogicMode;
    contextPrompt: string;

    // Step 3: Preview
    isGeneratingPreview: boolean;
    previewGridUrl: string | null;
    gridMetadata: CellMetadata[];
    gridAspectRatio: string; // "Original", "16:9", "1:1", etc.

    // State for Final Generation
    selectedCellIndex: number | null;

    // Step 5: Final Settings
    outputResolution: Resolution;
    outputAspectRatio: AspectRatio;

    // Step 6: Final Generation
    isGeneratingFinal: boolean;
    finalImageUrl: string | null;

    // Error handling
    error: string | null;
}

export const initialState: SceneGeneratorState = {
    referenceImage: null,
    referenceImagePreview: null,
    selectedCategories: { angle: false, shot: false, expression: false },
    logicMode: 'LINEAR',
    contextPrompt: '',
    isGeneratingPreview: false,
    previewGridUrl: null,
    gridMetadata: [],
    gridAspectRatio: '1:1', // Default
    selectedCellIndex: null,
    outputResolution: '2K',
    outputAspectRatio: '16:9',
    isGeneratingFinal: false,
    finalImageUrl: null,
    error: null,
};

export interface UsageStats {
    previewCount: number;
    finalCount: number;
}
