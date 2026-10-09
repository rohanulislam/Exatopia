
function getApiBaseUrl() {
    if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        const port = window.location.port;
        const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
        if (isLocalhost && port !== "3000" && port !== "") {
            return "http://localhost:3000";
        }
    }
    return "";
}

function cleanAiJson(rawText) {
    let clean = String(rawText || "").trim();
    const fence = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) {
        clean = fence[1].trim();
    } else {
        clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    return clean;
}

async function directOpenRouterCall(prompt, { maxTokens = 2500, temperature = 0.5 } = {}) {
    const key = (typeof localStorage !== "undefined" ? localStorage.getItem("OPENROUTER_API_KEY") : "") || "";
    if (!key) {
        throw new Error(
            "Backend server is not running on port 3000. Please run 'npm start' in your project terminal to start the server."
        );
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key.trim()}`,
            "HTTP-Referer": window.location.origin || "http://localhost:3000",
            "X-Title": "Exatopia"
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
            temperature
        })
    });

    const data = await res.json();
    if (res.ok && data.choices && data.choices.length > 0) {
        return cleanAiJson(data.choices[0].message?.content || "");
    }
    throw new Error(data?.error?.message || "Direct OpenRouter API call failed.");
}

export async function generateExamQuestions({ contextText, numQuestions = 5, token = null }) {
    if (!contextText || !contextText.trim()) {
        throw new Error("Please provide syllabus text or upload notes first.");
    }

    const baseUrl = getApiBaseUrl();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/api/ai/generate-questions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                contextText,
                numQuestions: parseInt(numQuestions, 10) || 5
            })
        });

        const data = await res.json();
        if (res.ok && data.status === "success" && Array.isArray(data.questions)) {
            return data.questions;
        }

        throw new Error(data.message || `Server error (${res.status}) generating questions.`);
    } catch (err) {
        if (err.name === "TypeError" && String(err.message).toLowerCase().includes("fetch")) {
            console.warn("Backend server offline on port 3000, attempting client fallback...");
            const prompt = `Generate ${parseInt(numQuestions, 10) || 5} multiple choice questions based on the following text.\n\n`
                + `Text:\n${contextText.slice(0, 10000)}\n\n`
                + `Return strictly a JSON array of objects with no markdown formatting.\n`
                + `Each object must have: 'text' (question), 'options' (array of 4 strings), 'correctAnswer' (exact string from options).`;
            
            const raw = await directOpenRouterCall(prompt, { maxTokens: 2500, temperature: 0.7 });
            let questions = [];
            try { questions = JSON.parse(raw); } catch (_) {
                const match = raw.match(/\[[\s\S]*\]/);
                if (match) questions = JSON.parse(match[0]);
            }
            if (Array.isArray(questions) && questions.length > 0) return questions;
        }
        console.error("Exam generation failed:", err);
        throw new Error(err.message || "Failed to generate questions. Please ensure the backend server is running.");
    }
}

export async function generateMockQuestions({ contextText, numQuestions = 10, token = null }) {
    if (!contextText || !contextText.trim()) {
        throw new Error("Please provide lecture notes or study text.");
    }

    const baseUrl = getApiBaseUrl();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/api/ai/generate-mock-exam`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                contextText,
                numQuestions: parseInt(numQuestions, 10) || 10
            })
        });

        const data = await res.json();
        if (res.ok && data.status === "success" && Array.isArray(data.questions)) {
            return data.questions;
        }

        throw new Error(data.message || `Server error (${res.status}) generating mock questions.`);
    } catch (err) {
        if (err.name === "TypeError" && String(err.message).toLowerCase().includes("fetch")) {
            console.warn("Backend server offline on port 3000, attempting client fallback...");
            const prompt = `Generate ${parseInt(numQuestions, 10) || 10} multiple choice practice questions based on the following text.\n\n`
                + `Text:\n${contextText.slice(0, 10000)}\n\n`
                + `Return valid JSON array with objects containing: id, text, options (array of 4 strings), correctAnswer, and explanation for each question.`;
            
            const raw = await directOpenRouterCall(prompt, { maxTokens: 3000, temperature: 0.7 });
            let questions = [];
            try { questions = JSON.parse(raw); } catch (_) {
                const match = raw.match(/\[[\s\S]*\]/);
                if (match) questions = JSON.parse(match[0]);
            }
            if (Array.isArray(questions) && questions.length > 0) return questions;
        }
        console.error("Mock generation failed:", err);
        throw new Error(err.message || "Failed to generate practice questions. Please try again.");
    }
}

export async function generateVivaQuestions({ contextText, token = null }) {
    if (!contextText || !contextText.trim()) {
        throw new Error("Please provide study context for the viva exam.");
    }

    const baseUrl = getApiBaseUrl();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/api/ai/generate-viva`, {
            method: "POST",
            headers,
            body: JSON.stringify({ contextText })
        });

        const data = await res.json();
        if (res.ok && data.status === "success" && Array.isArray(data.questions)) {
            return data.questions;
        }

        throw new Error(data.message || `Server error (${res.status}) generating viva questions.`);
    } catch (err) {
        if (err.name === "TypeError" && String(err.message).toLowerCase().includes("fetch")) {
            console.warn("Backend server offline on port 3000, attempting client fallback...");
            const prompt = `You are a strict oral examiner conducting a spoken viva voce. `
                + `Based on the study text below, generate exactly 3 insightful open-ended viva questions `
                + `that test conceptual understanding (not just factual recall).\n`
                + `Return STRICTLY a JSON array of objects with no markdown formatting.\n`
                + `Each object MUST contain this exact key:\n`
                + `- 'text': The viva question as a single string\n\n`
                + `Study Text:\n${contextText.slice(0, 12000)}`;
            
            const raw = await directOpenRouterCall(prompt, { maxTokens: 1200, temperature: 0.2 });
            let questions = [];
            try { questions = JSON.parse(raw); } catch (_) {
                const match = raw.match(/\[[\s\S]*\]/);
                if (match) questions = JSON.parse(match[0]);
            }
            if (Array.isArray(questions) && questions.length > 0) {
                return questions.slice(0, 3).map(q => (typeof q === "string" ? { text: q } : { text: q.text || q.question || String(q) }));
            }
        }
        console.error("Viva generation failed:", err);
        throw new Error(err.message || "Failed to generate viva questions. Please check connection.");
    }
}

export async function evaluateVivaAnswer({ question, userAnswer, contextText = "", token = null }) {
    if (!question || !userAnswer) {
        throw new Error("Question and student answer are required.");
    }

    const baseUrl = getApiBaseUrl();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/api/ai/evaluate-viva`, {
            method: "POST",
            headers,
            body: JSON.stringify({ question, userAnswer, contextText })
        });

        const data = await res.json();
        if (res.ok && data.status === "success" && data.result) {
            return data.result;
        }

        throw new Error(data.message || `Server error (${res.status}) evaluating viva answer.`);
    } catch (err) {
        if (err.name === "TypeError" && String(err.message).toLowerCase().includes("fetch")) {
            console.warn("Backend server offline on port 3000, attempting client fallback...");
            let prompt = "You are a kind but rigorous oral examiner evaluating a student's spoken viva answer.\n";
            prompt += "Question: " + question + "\n";
            prompt += "Student's Answer: " + userAnswer + "\n";
            if (contextText) {
                prompt += "Reference Text:\n" + String(contextText).slice(0, 6000) + "\n\n";
            }
            prompt += "Evaluate and respond with a JSON object containing:\n";
            prompt += "- 'score': integer 0-10\n";
            prompt += "- 'feedback': 2-4 friendly but honest sentences spoken directly to the student\n";
            prompt += "- 'isCorrect': boolean (true if score >= 5)\n";
            prompt += "Respond ONLY with the JSON object, no markdown.";

            const raw = await directOpenRouterCall(prompt, { maxTokens: 600, temperature: 0.3 });
            let result = null;
            try { result = JSON.parse(raw); } catch (_) {
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) result = JSON.parse(match[0]);
            }
            if (result && typeof result.score !== "undefined") {
                const score = Math.max(0, Math.min(10, parseInt(result.score, 10) || 0));
                return {
                    score,
                    feedback: result.feedback || "Answer evaluated.",
                    isCorrect: score >= 5
                };
            }
        }
        console.error("Viva evaluation failed:", err);
        throw new Error(err.message || "Failed to evaluate answer. Please try again.");
    }
}