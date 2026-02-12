export type LogicMode = 'LINEAR' | 'MATRIX' | 'DYNAMIC' | 'CINEMATIC' | 'STORY';
export type Resolution = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';

// Genre Preset for Smart Layout (CINEMATIC mode)
export interface GenrePreset {
    id: string;
    name_ko: string;
    name_en: string;
    color_grading: string;
    lighting: string;
    mood: string;
    cardColor: string; // For UI color card display
}

export const GENRE_PRESETS: GenrePreset[] = [
    {
        id: "neutral",
        name_ko: "뉴트럴",
        name_en: "Neutral",
        color_grading: "natural colors, balanced exposure",
        lighting: "natural ambient lighting",
        mood: "clean, versatile, documentary-like",
        cardColor: "from-gray-500 to-gray-600"
    },
    {
        id: "cinematic",
        name_ko: "시네마틱",
        name_en: "Cinematic",
        color_grading: "teal and orange, rich contrast",
        lighting: "dramatic three-point lighting",
        mood: "hollywood blockbuster feel",
        cardColor: "from-amber-500 to-orange-600"
    },
    {
        id: "noir",
        name_ko: "느와르",
        name_en: "Noir",
        color_grading: "high contrast black and white, deep shadows",
        lighting: "hard side lighting, venetian blind shadows",
        mood: "mysterious, tension, classic crime",
        cardColor: "from-slate-800 to-black"
    },
    {
        id: "romantic",
        name_ko: "로맨틱",
        name_en: "Romantic",
        color_grading: "warm tones, soft highlights, gentle glow",
        lighting: "golden hour, backlight, soft diffused",
        mood: "intimate, warm, dreamy",
        cardColor: "from-pink-400 to-rose-500"
    },
    {
        id: "horror",
        name_ko: "호러",
        name_en: "Horror",
        color_grading: "desaturated, green/blue tint, crushed blacks",
        lighting: "underlight, unstable flickering, harsh shadows",
        mood: "dread, unease, supernatural",
        cardColor: "from-emerald-900 to-gray-900"
    },
    {
        id: "scifi",
        name_ko: "SF",
        name_en: "Sci-Fi",
        color_grading: "cyan and orange, neon accents, cool tones",
        lighting: "rim light, artificial glow, lens flares",
        mood: "futuristic, technological, cold",
        cardColor: "from-cyan-500 to-blue-600"
    }
];

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
    contextPrompt: string; // Used for Context or Story Line

    // Smart Layout (CINEMATIC mode)
    smartLayoutEnabled: boolean;
    selectedGenre: string; // Genre preset ID

    // Story Mode
    storyModeEnabled: boolean;

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

    // Image Modification
    isModifying: boolean;
    modificationPrompt: string;
    modifiedImageUrl: string | null;



    // Error handling
    error: string | null;
}

export const initialState: SceneGeneratorState = {
    referenceImage: null,
    referenceImagePreview: null,
    selectedCategories: { angle: false, shot: false, expression: false },
    logicMode: 'LINEAR',
    contextPrompt: '',
    smartLayoutEnabled: false,
    selectedGenre: 'cinematic', // Default: Cinematic
    storyModeEnabled: false,
    isGeneratingPreview: false,
    previewGridUrl: null,
    gridMetadata: [],
    gridAspectRatio: '1:1', // Default
    selectedCellIndex: null,
    outputResolution: '2K',
    outputAspectRatio: '16:9',
    isGeneratingFinal: false,
    finalImageUrl: null,

    isModifying: false,
    modificationPrompt: '',
    modifiedImageUrl: null,



    error: null,
};

export interface UsageStats {
    previewCount: number;
    finalCount: number;
}
