// js/api.js - AI question generation and viva evaluation service
// Securely proxies requests through the Express backend to keep API keys private

function getApiBaseUrl() {
    if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        const port = window.location.port;
        const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
        // If developer is using Live Server (e.g., port 5500), target Express backend on port 3000
        if (isLocalhost && port !== "3000" && port !== "") {
            return "http://localhost:3000";
        }
    }
    // In production on Render or when served directly by Express, use relative root
    return "";
}

/**
 * Generate questions for Teacher Exam Creation
 */
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
        console.error("Exam generation failed:", err);
        throw new Error(err.message || "Failed to generate questions. Please ensure the backend server is running.");
    }
}

/**
 * Generate practice questions for Student Mock Exam
 */
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
        console.error("Mock generation failed:", err);
        throw new Error(err.message || "Failed to generate practice questions. Please try again.");
    }
}

/**
 * Generate viva voce questions for Student Oral Examination
 */
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
        console.error("Viva generation failed:", err);
        throw new Error(err.message || "Failed to generate viva questions. Please check connection.");
    }
}

/**
 * Evaluate student's spoken or typed answer in Viva Voce
 */
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
        console.error("Viva evaluation failed:", err);
        throw new Error(err.message || "Failed to evaluate answer. Please try again.");
    }
}