import { GENRE_PRESETS } from "../types/sceneGenerator";

// ── Proxy 기반 Gemini API (직접 호출 대신 인증+과금 프록시 사용) ──

// 프록시 API 엔드포인트 (concept-art-editor 배포 URL)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://concept-art-aifi.vercel.app';

// URL에서 토큰 추출
function getAuthToken(): string {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
}

// Helper: File → base64 data URL
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Helper: base64 이미지를 리사이즈 + JPEG 압축 (Vercel 4.5MB body 제한 대응)
const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.7;
const MAX_SINGLE_IMAGE_BYTES = 1_500_000; // 1.5MB per image

async function compressImage(base64DataUrl: string): Promise<string> {
    // base64가 아닌 경우 (URL 등) 그대로 반환
    if (!base64DataUrl.startsWith('data:')) return base64DataUrl;

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            // 긴 변이 MAX_IMAGE_DIMENSION 이하가 되도록 리사이즈
            if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, width, height);

            // 품질을 단계적으로 낮춰서 크기 제한 충족
            let quality = JPEG_QUALITY;
            let result = canvas.toDataURL('image/jpeg', quality);
            while (result.length > MAX_SINGLE_IMAGE_BYTES * 1.37 && quality > 0.3) {
                quality -= 0.1;
                result = canvas.toDataURL('image/jpeg', quality);
            }

            const originalKB = Math.round(base64DataUrl.length / 1024);
            const compressedKB = Math.round(result.length / 1024);
            console.log(`[Compress] ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, ${originalKB}KB → ${compressedKB}KB (q=${quality.toFixed(1)})`);
            resolve(result);
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
        img.src = base64DataUrl;
    });
}

// 공통 프록시 호출 함수
async function callProxy(action: string, prompt: string, images: string[], pricingType?: string): Promise<string> {
    const token = getAuthToken();

    if (!token) {
        throw new Error('인증 토큰이 없습니다. AIFI 에디터에서 Scene Generator를 열어주세요.');
    }

    // Vercel body 크기 제한(4.5MB) 대응: 이미지 압축
    const compressedImages = await Promise.all(images.map(img => compressImage(img)));

    const response = await fetch(`${API_BASE_URL}/api/gemini-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prompt, images: compressedImages, pricingType, token }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        if (response.status === 401) {
            throw new Error('인증 만료. AIFI 에디터에서 다시 열어주세요.');
        }
        if (response.status === 402) {
            throw new Error(`크레딧 부족 (잔액: ${data.creditBalance || 0})`);
        }
        throw new Error(data.error || 'API 호출 실패');
    }

    // 크레딧 정보 콘솔에 표시
    if (data.creditCost) {
        console.log(`[Credit] ${action}: -${data.creditCost} (잔액: ${data.creditBalance})`);
    }

    return data.imageUrl;
}

// ── 프롬프트 빌더 (기존과 동일) ──

function buildCinematicPrompt(genrePresetId: string, ratioLabel: string): string {
    const genre = GENRE_PRESETS.find(g => g.id === genrePresetId) || GENRE_PRESETS[1];

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

function buildStoryPrompt(storyLine: string, ratioLabel: string): string {
    return `[ROLE]
You are a Visual Director creating a storyboard based on a specific narrative.

[REFERENCE - IMMUTABLE]
The FIRST IMAGE is your ONLY visual source for the character's appearance (face, hair, clothes).
You MUST maintain the character's identity exactly as shown in the reference image.

[NARRATIVE INPUT]
Story Line: "${storyLine}"

[TASK]
Create a single image containing a 3x3 grid (9 panels) that visualizes this story line.
The 9 panels should represent a sequence of key moments or a variety of shots that best depict the atmosphere and action of the provided story line.
The overall canvas aspect ratio must be ${ratioLabel}.

[GRID CONTENTS]
- Each panel should show a distinct beat or angle related to the story.
- Use a mix of shot distances (Wide, Medium, Close-up) to create visual interest.
- Ensure the character's emotion matches the story context in each panel.

[REQUIREMENTS]
- STRICT IDENTITY CONSISTENCY: The character must look exactly like the reference.
- Photorealistic style.
- Cinematic lighting and composition.
- Seamless grid layout (no borders).
- No text or speech bubbles.

[NEGATIVE PROMPT]
different person, changed identity, wrong clothes, cartoon, illustration, text, watermark, borders, speech bubbles`;
}

// ── 공개 API 함수들 ──

export async function generatePreview(
    referenceImage: File,
    logicMode: string,
    selectedCategories: string[],
    contextPrompt: string,
    width: number,
    height: number,
    ratioLabel: string,
    genrePresetId?: string
): Promise<{ url: string; metadata: any[] }> {
    // 이미지를 base64로 변환
    const imageBase64 = await fileToBase64(referenceImage);

    // 프롬프트 생성
    let prompt: string;
    if (logicMode === 'CINEMATIC' && genrePresetId) {
        prompt = buildCinematicPrompt(genrePresetId, ratioLabel);
    } else if (logicMode === 'STORY') {
        prompt = buildStoryPrompt(contextPrompt, ratioLabel);
    } else {
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

    console.log(`[Gemini Proxy] Generating Preview, Mode: ${logicMode}, Size: ${width}x${height}`);

    const imageUrl = await callProxy('generatePreview', prompt, [imageBase64], 'grid_story');

    // 메타데이터 빌드
    if (logicMode === 'CINEMATIC') {
        return {
            url: imageUrl,
            metadata: [
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
        };
    }

    const metadata = (logicMode === 'STORY')
        ? Array.from({ length: 9 }).map((_, i) => ({
            cell: i, shot: `Story Shot ${i + 1}`, angle: 'Visual Storytelling'
        }))
        : Array.from({ length: 9 }).map((_, i) => ({
            cell: i, angle: 'AI Generated', shot: 'AI Generated', expression: 'AI Generated'
        }));

    return { url: imageUrl, metadata };
}

export async function generateFinal(
    _previewUrl: string,
    _cellIndex: number,
    resolution: string,
    aspectRatio: string,
    originalImage: File,
    croppedImageBase64: string,
    contextPrompt?: string
): Promise<string> {
    const originalBase64 = await fileToBase64(originalImage);

    const prompt = `DO NOT generate a new random scene. 
    STRICTLY UPSCALING TASK: Look at Image 2 (The Cropped Patch). 
    Reconstruct that exact scene in high resolution using the character details from Image 1. 
    The composition MUST match Image 2.
    Resolution: ${resolution}
    Aspect Ratio: ${aspectRatio}
    Context: ${contextPrompt || ''}`;

    console.log(`[Gemini Proxy] Generating Final`);

    return await callProxy('generateFinal', prompt, [originalBase64, croppedImageBase64], 'upscale');
}

export async function modifyImage(
    sourceImageUrl: string,
    modificationPrompt: string
): Promise<string> {
    // URL이면 fetch 후 base64 변환
    let imageBase64: string;
    if (sourceImageUrl.startsWith('data:')) {
        imageBase64 = sourceImageUrl;
    } else {
        const response = await fetch(sourceImageUrl);
        const blob = await response.blob();
        imageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    const prompt = `[IMAGE MODIFICATION TASK]
    Input Image: The provided image.
    Instruction: ${modificationPrompt}
    
    [REQUIREMENTS]
    - MODIFY ONLY what is requested in the instruction.
    - PRESERVE the original composition, angle, character identity, and style strictly.
    - Do NOT reimagine the whole scene unless asked.
    - Photorealistic quality.
    - Return the modified image.`;

    console.log(`[Gemini Proxy] Modifying Image`);

    return await callProxy('modifyImage', prompt, [imageBase64], 'img_edit');
}
