const VIDU_API_KEY = import.meta.env.VITE_VIDU_API_KEY?.trim();

// Helper to convert Blob URL (standard in React local dev) to Base64 Data URL
async function blobToBase64(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export interface VideoOptions {
    model?: string;
    duration?: number;
    resolution?: string;
}

export async function generateVideo(imageUrl: string, prompt?: string, options?: VideoOptions): Promise<string> {
    if (!VIDU_API_KEY) {
        throw new Error("VIDU API Key is missing. Please check .env settings.");
    }

    // 1. Handle Image Source (Blob URL vs Remote URL)
    let finalImageInput = imageUrl;
    if (imageUrl.startsWith('blob:')) {
        console.log("[VIDU API] Converting Blob URL to Base64...");
        try {
            finalImageInput = await blobToBase64(imageUrl);
        } catch (e) {
            console.error("Failed to convert blob to base64:", e);
            throw new Error("Failed to process image. Please try saving it first.");
        }
    }

    // 2. Construct Payload strictly according to Vidu API Docs
    const payload = {
        model: options?.model || "viduq3-pro",
        images: [finalImageInput],
        prompt: prompt || "Animate this scene naturally, cinematic movement",
        duration: options?.duration || 5,
        resolution: options?.resolution || "1080p"
    };

    console.log("[VIDU API] Sending payload...", { ...payload, images: ["<base64_data>"] });

    try {
        // 3. Send Request
        // Proxy: /api/vidu -> https://api.vidu.com
        const response = await fetch('/api/vidu/ent/v2/img2video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${VIDU_API_KEY}` // Docs specify 'Token {key}'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("[VIDU API Error Body]", errText);
            throw new Error(`VIDU API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();

        // 4. Handle Response
        // Docs: returns { task_id, state, ... }
        const taskId = data.task_id || data.id;
        if (!taskId) {
            throw new Error("No task_id returned from Vidu API");
        }

        // 5. Poll for Result
        return await pollForVideo(taskId);

    } catch (e: any) {
        console.error("VIDU Generation Failed:", e);
        throw e;
    }
}

async function pollForVideo(taskId: string): Promise<string> {
    const maxAttempts = 60; // Wait up to 60 seconds
    let attempts = 0;

    console.log(`[VIDU API] Polling for task: ${taskId}`);

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;

        try {
            const res = await fetch(`/api/vidu/ent/v2/tasks/${taskId}/creations`, {
                headers: {
                    'Authorization': `Token ${VIDU_API_KEY}`
                }
            });

            if (!res.ok) continue;

            const data = await res.json();
            // Docs say callback body has "state": "success" | "processing" | "failed"
            // The polling endpoint typically returns the same structure or a list of creations

            // Check status/state
            const state = data.state || data.status;

            if (state === 'success') {
                // Success! Find the video URL.
                // data could be the creation object itself or contain 'creations' list
                let resultUrl = data.url || data.output_url;

                // If data.creations exists (common in list endpoints), check that
                if (!resultUrl && Array.isArray(data.creations) && data.creations.length > 0) {
                    resultUrl = data.creations[0].url || data.creations[0].output_url;
                }

                // If still not found, check top level 'images' or 'video_url'
                if (!resultUrl) resultUrl = data.video_url;

                if (resultUrl) return resultUrl;
            } else if (state === 'failed') {
                throw new Error(`Video generation failed: ${JSON.stringify(data)}`);
            }
            // If 'processing' or 'queueing', continue loop
        } catch (e) {
            console.warn("[VIDU API] Polling error:", e);
        }
    }
    throw new Error("Video generation timed out (60s).");
}
