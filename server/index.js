const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from both root and server directory if available
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Static frontend directory (Project root)
const PROJECT_ROOT = path.resolve(__dirname, '..');
app.use(express.static(PROJECT_ROOT));

// Available OpenRouter models in fallback order
const OPENROUTER_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.1-8b-instruct"
];

// Helper to clean Markdown fences from AI response
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

// Call OpenRouter with automatic model fallback
async function callOpenRouter(prompt, { maxTokens = 2500, temperature = 0.5 } = {}) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured on the server. Please check your Render environment variables.");
  }

  let lastError = null;

  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.SITE_URL || "https://exatopia.onrender.com",
          "X-Title": "Exatopia"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature
        })
      });

      const data = await res.json();
      if (res.ok && data.choices && data.choices.length > 0) {
        const content = data.choices[0].message?.content || "";
        return cleanAiJson(content);
      }

      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[OpenRouter] Model ${model} failed: ${errMsg}. Trying fallback...`);
      lastError = new Error(errMsg);
    } catch (err) {
      console.warn(`[OpenRouter] Network error with model ${model}: ${err.message}. Trying fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error("All AI models failed to respond. Please try again later.");
}

// ── Health Check ────────────────────────────────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    emailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  });
});

// ── OTP Mail Endpoint ───────────────────────────────────────────────────────
app.post(['/api/send-otp', '/api/send-otp.php'], async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ status: 'error', message: 'Email and OTP are required.' });
  }

  const gmailUser = (process.env.GMAIL_USER || "").trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!gmailUser || !gmailPass) {
    console.warn('[send-otp] Gmail credentials missing in environment.');
    return res.json({
      status: 'warning',
      message: 'Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000
    });

    await transporter.sendMail({
      from: `"Exatopia" <${gmailUser}>`,
      to: email,
      subject: 'Exatopia — Your Verification Code',
      text: `Your Exatopia verification code is: ${otp}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">Exatopia Verification</h2>
          <p style="font-size: 15px; color: #374151;">Use the following code to complete your verification:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; background: #f3f4f6; padding: 12px 20px; border-radius: 6px; text-align: center; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #6b7280;">This code expires in 2 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

    res.json({ status: 'success', message: 'OTP sent to ' + email });
  } catch (err) {
    console.warn('[send-otp] Mail delivery skipped:', err.message);
    res.json({ status: 'warning', message: 'Failed to send OTP email: ' + err.message });
  }
});

// ── AI Endpoint: Generate Exam Questions (Teacher) ─────────────────────────
app.post(['/api/ai/generate-questions', '/api/generate-questions'], async (req, res) => {
  const { contextText, numQuestions = 5 } = req.body || {};
  if (!contextText || !String(contextText).trim()) {
    return res.status(400).json({ status: 'error', message: 'contextText is required.' });
  }

  const count = Math.min(50, Math.max(1, parseInt(numQuestions, 10) || 5));
  const textSample = String(contextText).slice(0, 10000);

  const prompt = `Generate ${count} multiple choice questions based on the following text.\n\n`
    + `Text:\n${textSample}\n\n`
    + `Return strictly a JSON array of objects with no markdown formatting.\n`
    + `Each object must have: 'text' (question), 'options' (array of 4 strings), 'correctAnswer' (exact string from options).`;

  try {
    const rawOutput = await callOpenRouter(prompt, { maxTokens: 2500, temperature: 0.7 });
    let questions = [];

    try {
      questions = JSON.parse(rawOutput);
    } catch (_) {
      const arrayMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        questions = JSON.parse(arrayMatch[0]);
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("AI returned invalid question format.");
    }

    res.json({ status: 'success', questions });
  } catch (err) {
    console.error('[generate-questions] failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to generate questions.' });
  }
});

// ── AI Endpoint: Generate Mock Practice Questions (Student) ─────────────────
app.post(['/api/ai/generate-mock-exam', '/api/generate-mock-exam'], async (req, res) => {
  const { contextText, numQuestions = 10 } = req.body || {};
  if (!contextText || !String(contextText).trim()) {
    return res.status(400).json({ status: 'error', message: 'contextText is required.' });
  }

  const count = Math.min(50, Math.max(1, parseInt(numQuestions, 10) || 10));
  const textSample = String(contextText).slice(0, 10000);

  const prompt = `Generate ${count} multiple choice practice questions based on the following text.\n\n`
    + `Text:\n${textSample}\n\n`
    + `Return valid JSON array with objects containing: id, text, options (array of 4 strings), correctAnswer, and explanation for each question.`;

  try {
    const rawOutput = await callOpenRouter(prompt, { maxTokens: 3000, temperature: 0.7 });
    let questions = [];

    try {
      questions = JSON.parse(rawOutput);
    } catch (_) {
      const arrayMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        questions = JSON.parse(arrayMatch[0]);
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("AI returned invalid mock question format.");
    }

    res.json({ status: 'success', questions });
  } catch (err) {
    console.error('[generate-mock-exam] failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to generate practice questions.' });
  }
});

// ── AI Endpoint: Generate Viva Questions (Student Viva Voce) ───────────────
app.post(['/api/ai/generate-viva', '/api/generate-viva'], async (req, res) => {
  const { contextText } = req.body || {};
  if (!contextText || !String(contextText).trim()) {
    return res.status(400).json({ status: 'error', message: 'contextText is required.' });
  }

  const textSample = String(contextText).slice(0, 12000);
  const prompt = `You are a strict oral examiner conducting a spoken viva voce. `
    + `Based on the study text below, generate exactly 3 insightful open-ended viva questions `
    + `that test conceptual understanding (not just factual recall).\n`
    + `Return STRICTLY a JSON array of objects with no markdown formatting.\n`
    + `Each object MUST contain this exact key:\n`
    + `- 'text': The viva question as a single string\n\n`
    + `Study Text:\n${textSample}`;

  try {
    const rawOutput = await callOpenRouter(prompt, { maxTokens: 1200, temperature: 0.2 });
    let questions = [];

    try {
      questions = JSON.parse(rawOutput);
    } catch (_) {
      const arrayMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        questions = JSON.parse(arrayMatch[0]);
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("AI returned invalid viva questions.");
    }

    // Normalize to strings or objects with text property
    const normalized = questions.slice(0, 3).map(q => {
      if (typeof q === "string") return { text: q };
      return { text: q.text || q.question || String(q) };
    });

    res.json({ status: 'success', questions: normalized });
  } catch (err) {
    console.error('[generate-viva] failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to generate viva questions.' });
  }
});

// ── AI Endpoint: Evaluate Spoken Viva Answer ────────────────────────────────
app.post(['/api/ai/evaluate-viva', '/api/evaluate-viva'], async (req, res) => {
  const { question, userAnswer, contextText = "" } = req.body || {};
  if (!question || !userAnswer) {
    return res.status(400).json({ status: 'error', message: 'question and userAnswer are required.' });
  }

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

  try {
    const rawOutput = await callOpenRouter(prompt, { maxTokens: 600, temperature: 0.3 });
    let result = null;

    try {
      result = JSON.parse(rawOutput);
    } catch (_) {
      const objMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (objMatch) {
        result = JSON.parse(objMatch[0]);
      }
    }

    if (!result || typeof result.score === "undefined") {
      throw new Error("Invalid evaluation format from AI.");
    }

    const score = Math.max(0, Math.min(10, parseInt(result.score, 10) || 0));
    const feedback = result.feedback || result.comment || "Answer evaluated.";
    const isCorrect = score >= 5;

    res.json({
      status: 'success',
      result: { score, feedback, isCorrect }
    });
  } catch (err) {
    console.error('[evaluate-viva] failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to evaluate viva answer.' });
  }
});

// ── Exam Submit Endpoint (Fallback scoring acknowledgement) ─────────────────
app.post(['/api/submit-exam', '/api/submit-exam.php'], (req, res) => {
  const { examId, answers, autoSubmitted, violationCount } = req.body || {};
  res.json({
    status: 'success',
    examId,
    received: true,
    autoSubmitted: Boolean(autoSubmitted),
    violationCount: parseInt(violationCount, 10) || 0
  });
});

// ── Fallback Route: Serve index.html for navigation ─────────────────────────
app.get('*', (req, res) => {
  // If request looks like a missing asset/file with extension, send 404
  if (path.extname(req.path)) {
    return res.status(404).send('File Not Found');
  }
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Exatopia server running on port ${PORT}`);
});
