const VIDU_API_KEY = import.meta.env.VITE_VIDU_API_KEY;

export async function generateVideo(imageUrl: string, prompt?: string): Promise<string> {
    if (!VIDU_API_KEY) {
        throw new Error("VIDU API Key is missing. Please check .env settings.");
    }

    console.log("[VIDU API] Starting video generation...");

    // VIDU typically requires an image URL accessible from the internet.
    // Since we are running locally, we might need a workaround if the image URL is a blob.
    // However, many modern APIs accept base64 or upload. 
    // Let's try standard Vidu API usage.
    // According to knowledge/search, endpoints often follow standard REST patterns.
    // We will try the https://api.vidu.studio/v1/videos endpoint (or similar known common pattern).
    // Note: If Vidu requires uploading, we'd need a separate upload step. 
    // For this implementation, we assume it can take the URL we have (if public) or we try to send base64 if supported.
    // If usage fails due to URL not being public (localhost), user will see error.

    try {
        const payload = {
            image_url: imageUrl, // Assumes public URL or supported format
            prompt: prompt || "Animate this scene naturally",
            duration: 5 // Default duration
        };

        // We'll use a standard fetch to the likely endpoint. 
        // If specific docs were provided, I'd use them. 
        // Based on "vidu-studio" hits, let's try assuming standard Vidu/vda pattern.
        // Actually, without exact docs, I will use a generic structure that is easy to adapt.

        // MOCK/PLACEHOLDER WARNING: 
        // Since I don't have the EXACT Vidu API endpoint specs (urls can vary: api.vidu.studio, api.vidu.com, etc.),
        // I will implement this with a fetch structure that mimics standard behaviour but log clearly.
        // I will use `https://api.vidu.studio/v1/videos` as a best guess from search snippets.

        // DEBUG: Check if API Key exists and what endpoint is used
        const keyStatus = VIDU_API_KEY ? `Present (Starts with ${VIDU_API_KEY.substring(0, 4)}...)` : 'MISSING';
        console.log(`[VIDU DEBUG] Key: ${keyStatus}`);
        console.log(`[VIDU DEBUG] Endpoint: /api/vidu/ent/v2/img2video`);

        // Temporary Alert for immediate feedback in Prod
        alert(`[DEBUG] API Key: ${keyStatus}\nEndpoint: /api/vidu/ent/v2/img2video`);

        // Use local proxy to avoid CORS
        // Endpoint: https://api.vidu.com/ent/v2/img2video (Inferred from docs pattern)
        const response = await fetch('/api/vidu/ent/v2/img2video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VIDU_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`VIDU API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const taskId = data.id || data.task_id;

        // Poll for result
        return await pollForVideo(taskId);

    } catch (e: any) {
        console.error("VIDU Generation Failed:", e);
        throw e;
    }
}

async function pollForVideo(taskId: string): Promise<string> {
    const maxAttempts = 60; // 60 seconds (approx)
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;

        try {
            // Polling endpoint: https://api.vidu.com/ent/v2/tasks/{id}/creations
            const res = await fetch(`/api/vidu/ent/v2/tasks/${taskId}/creations`, {
                headers: {
                    'Authorization': `Bearer ${VIDU_API_KEY}`
                }
            });

            if (!res.ok) continue;

            const data = await res.json();
            // Data structure check - typically returns a list or status object
            // Assuming data is standard Vidu response: { state: "success", creations: [...] }
            if (data.state === 'success' || data.status === 'success') {
                // If it's a list, take the first one
                const result = Array.isArray(data.creations) ? data.creations[0] : (data.creations || data);
                return result.url || result.output_url || result;
            } else if (data.state === 'failed' || data.status === 'failed') {
                throw new Error("Video generation failed server-side.");
            }
        } catch (e) {
            console.warn("Polling error:", e);
        }
    }
    throw new Error("Video generation timed out.");
}
