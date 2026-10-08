// ── OpenRouter configuration ──────────────────────────────────────────────────
// The API key is loaded at runtime from the server's /api/config endpoint.
// This keeps the key out of the source code and GitHub.
// On Render, set OPENROUTER_API_KEY as an environment variable.
export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODELS = [
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "google/gemini-flash-1.5",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-8b-instruct",
    "meta-llama/llama-3.1-70b-instruct"
];

let _cachedApiKey = null;

async function getOpenRouterKey() {
    if (_cachedApiKey) return _cachedApiKey;
    try {
        // /api/config is served by the Node.js server on Render
        const res = await fetch("/api/config");
        if (res.ok) {
            const data = await res.json();
            if (data && data.OPENROUTER_API_KEY) {
                _cachedApiKey = data.OPENROUTER_API_KEY;
                return _cachedApiKey;
            }
        }
    } catch (e) {
        console.warn("Could not fetch runtime config:", e.message);
    }
    // Fallback: empty string will cause a clean API error rather than exposing a key
    return "";
}


export async function generateExamQuestions({ contextText, numQuestions = 5, token = null }) {
    try {
        const apiKey = await getOpenRouterKey();
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin || "http://localhost",
            "X-Title": "Exatopia"
        };

        const res = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                model: OPENROUTER_MODELS[0], 
                messages: [{ role: "user", content: `Generate ${numQuestions} multiple choice questions based on the following text.\n\nText:\n${contextText.slice(0, 10000)}\n\nReturn strictly a JSON array of objects with no markdown formatting.\nEach object must have: 'text' (question), 'options' (array of 4 strings), 'correctAnswer' (exact string from options).` }],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        const data = await res.json();
        
        if (res.ok && data.choices && data.choices.length > 0) {
            const content = data.choices[0].message.content || "";
            return parseOpenRouterQuestions(content);
        }
        
        throw new Error("OpenRouter API error: " + (data?.error?.message || 'Unknown error'));
    } catch (e) {
        console.warn("OpenRouter API failed:", e.message);
        throw new Error("AI service unavailable. Please check your OpenRouter key.");
    }
}


function parseOpenRouterQuestions(rawText) {
    let cleanJson = String(rawText || "").trim();
    
    const fence = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) {
        cleanJson = fence[1].trim();
    } else {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    let questions = [];
    try {
        questions = JSON.parse(cleanJson);
        if (Array.isArray(questions)) return questions;
    } catch (_) {}
    
    const arrayMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try { 
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) return parsed; 
        } catch (_) {}
    }

    return questions;
}


export async function generateMockQuestions({ contextText, numQuestions = 10, token = null }) {
    try {
        const apiKey = await getOpenRouterKey();
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin || "http://localhost",
            "X-Title": "Exatopia"
        };

        const res = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                model: OPENROUTER_MODELS[0], 
                messages: [{ role: "user", content: `Generate ${numQuestions} multiple choice practice questions based on the following text.\n\nText:\n${contextText.slice(0, 10000)}\n\nReturn valid JSON array with objects containing: id, text, options (array of 4 strings), correctAnswer, and explanation for each question.` }],
                max_tokens: 3000,
                temperature: 0.7
            })
        });

        const data = await res.json();
        
        if (res.ok && data.choices && data.choices.length > 0) {
            const content = data.choices[0].message.content || "";
            return parseOpenRouterQuestions(content);
        }
        
        throw new Error("OpenRouter API error: " + (data?.error?.message || 'Unknown error'));
    } catch (e) {
        console.warn("OpenRouter API failed:", e.message);
        throw new Error("AI service unavailable. Please check your OpenRouter key.");
    }
}


export async function generateVivaQuestions({ contextText, token = null }) {
    try {
        const apiKey = await getOpenRouterKey();
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin || "http://localhost",
            "X-Title": "Exatopia"
        };

        const prompt = `You are a strict oral examiner conducting a spoken viva voce. `
            + `Based on the study text below, generate exactly 3 insightful open-ended viva questions `
            + `that test conceptual understanding (not just factual recall).\n`
            + `Return STRICTLY a JSON array of objects with no markdown formatting.\n`
            + `Each object MUST contain this exact key:\n`
            + `- 'text': The viva question as a single string\n\n`
            + `Study Text:\n${contextText.slice(0, 12000)}`;

        const res = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                model: OPENROUTER_MODELS[0], 
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 1000
            })
        });

        const data = await res.json();
        
        if (res.ok && data.choices && data.choices.length > 0) {
            const content = data.choices[0].message.content || "";
            let cleanJson = content.trim();
            const fence = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (fence) cleanJson = fence[1].trim();
            else cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            
            const questions = JSON.parse(cleanJson);
            if (Array.isArray(questions)) return questions.slice(0, 3);
        }
        
        throw new Error("OpenRouter API viva generation failed.");
    } catch (e) {
        console.warn("OpenRouter API viva generation failed:", e.message);
        throw new Error("Failed to generate viva questions from AI.");
    }
}


export async function evaluateVivaAnswer({ question, userAnswer, contextText = "", token = null }) {
    try {
        const apiKey = await getOpenRouterKey();
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin || "http://localhost",
            "X-Title": "Exatopia"
        };

        let prompt = "You are a kind but rigorous oral examiner evaluating a student's spoken viva answer.\n";
        prompt += "Question: " + question + "\n";
        prompt += "Student's Answer: " + userAnswer + "\n";
        if (contextText) {
            prompt += "Reference Text:\n" + contextText.slice(0, 6000) + "\n\n";
        }
        prompt += "Evaluate and respond with a JSON object containing:\n";
        prompt += "- 'score': integer 0-10\n";
        prompt += "- 'feedback': 2-4 friendly but honest sentences spoken directly to the student\n";
        prompt += "- 'isCorrect': boolean (true if score >= 5)\n";
        prompt += "Respond ONLY with the JSON object, no markdown.";

        const res = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                model: OPENROUTER_MODELS[0], 
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        const data = await res.json();
        
        if (res.ok && data.choices && data.choices.length > 0) {
            const content = data.choices[0].message.content || "";
            let cleanJson = content.trim();
            const fence = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (fence) cleanJson = fence[1].trim();
            else cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            
            const result = JSON.parse(cleanJson);
            if (result && typeof result.score !== "undefined") {
                result.score     = Math.max(0, Math.min(10, parseInt(result.score, 10)));
                result.feedback  = result.feedback || result.comment || result.evaluation || "";
                result.isCorrect = result.score >= 5;
                return result;
            }
        }
        
        throw new Error("OpenRouter API evaluation failed: " + (data?.error?.message || 'Unknown error'));
    } catch (e) {
        console.warn("OpenRouter API evaluation failed:", e.message);
        throw new Error("AI evaluation unavailable. Please try again.");
    }
}