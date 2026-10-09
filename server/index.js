const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const PROJECT_ROOT = path.resolve(__dirname, '..');
app.use(express.static(PROJECT_ROOT));

const OPENROUTER_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.1-8b-instruct"
];

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
          "HTTP-Referer": process.env.SITE_URL || "https://exatopia-1.onrender.com",
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

app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    emailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    brevoConfigured: Boolean(process.env.BREVO_API_KEY)
  });
});

app.post(['/api/send-otp', '/api/send-otp.php'], async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ status: 'error', message: 'Email and OTP are required.' });
  }

  const gmailUser = (process.env.GMAIL_USER || "").trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || "").trim();
  const brevoKey = (process.env.BREVO_API_KEY || "").trim();
  const brevoSender = (process.env.BREVO_SENDER_EMAIL || gmailUser || "").trim();

  if (!brevoKey && (!gmailUser || !gmailPass)) {
    console.warn('[send-otp] Email credentials missing in environment.');
    return res.json({
      status: 'warning',
      message: 'Email service not configured. Please set BREVO_API_KEY or GMAIL_USER and GMAIL_APP_PASSWORD.'
    });
  }

  const subject = 'Exatopia — Your Verification Code';
  const text = `Your Exatopia verification code is: ${otp}`;
  const html = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">Exatopia Verification</h2>
          <p style="font-size: 15px; color: #374151;">Use the following code to complete your verification:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; background: #f3f4f6; padding: 12px 20px; border-radius: 6px; text-align: center; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #6b7280;">This code expires in 2 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `;

  if (brevoKey && brevoSender) {
    try {
      const apiRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoKey
        },
        body: JSON.stringify({
          sender: { name: "Exatopia", email: brevoSender },
          to: [{ email }],
          subject,
          textContent: text,
          htmlContent: html
        })
      });
      const data = await apiRes.json().catch(() => null);
      if (apiRes.ok) {
        return res.json({ status: 'success', message: 'OTP sent to ' + email, via: 'brevo' });
      }
      console.warn('[send-otp] Brevo failed:', apiRes.status, data?.message || '');
    } catch (err) {
      console.warn('[send-otp] Brevo error:', err.message);
    }
  }

  if (!gmailUser || !gmailPass) {
    return res.json({ status: 'warning', message: 'Email delivery unavailable. OTP is shown on screen.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    await transporter.sendMail({
      from: `"Exatopia" <${gmailUser}>`,
      to: email,
      subject,
      text,
      html,
    });

    res.json({ status: 'success', message: 'OTP sent to ' + email, via: 'gmail' });
  } catch (err) {
    console.warn('[send-otp] Mail delivery skipped:', err.message);
    res.json({ status: 'warning', message: 'Failed to send OTP email: ' + err.message });
  }
});

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

app.get('/favicon.ico', (req, res) => {
  res.redirect(302, '/assets/favicon.svg');
});

app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send('File Not Found');
  }
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Exatopia server running on port ${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — is another Exatopia server already running?`);
    process.exit(1);
  }
  throw err;
});
