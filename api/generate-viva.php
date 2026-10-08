<?php
require_once 'cors.php';
require_once 'verify-token.php';

header('Content-Type: application/json');
set_time_limit(120);

$user = verifyFirebaseToken();

$input = json_decode(file_get_contents('php://input'), true);
$mode  = $input['mode'] ?? 'generate'; 

$apiKey = GEMINI_API_KEY;
$model  = defined('GEMINI_MODEL') ? GEMINI_MODEL : 'gemini-3.5-flash';
$url    = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key=" . trim($apiKey);


function callGemini($url, $prompt) {
    $payload = [
        "contents" => [
            ["parts" => [["text" => $prompt]]]
        ]
    ];
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) throw new Exception("cURL error: $curlError");
    if ($httpCode !== 200) throw new Exception("Gemini API HTTP $httpCode: $response");

    $data    = json_decode($response, true);
    $rawText = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return $rawText;
}

function parseAiJson($rawText) {
    $clean = trim($rawText);
    if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/', $clean, $m)) {
        $clean = trim($m[1]);
    } else {
        $clean = preg_replace('/```(?:json)?/i', '', $clean);
        $clean = trim($clean);
    }

    $decoded = json_decode($clean, true);
    if ($decoded !== null) return $decoded;

    if (preg_match('/\[[\s\S]*\]/', $clean, $m)) {
        $decoded = json_decode($m[0], true);
        if ($decoded !== null) return $decoded;
    }
    if (preg_match('/\{[\s\S]*\}/', $clean, $m)) {
        $decoded = json_decode($m[0], true);
        if ($decoded !== null) return $decoded;
    }

    throw new Exception("AI did not return valid JSON.");
}

function normalizeVivaQuestions($questions) {
    if (isset($questions['questions']) && is_array($questions['questions'])) {
        $questions = $questions['questions'];
    }
    if (!is_array($questions)) return [];

    $out = [];
    foreach ($questions as $q) {
        if (is_string($q) && trim($q) !== '') {
            $out[] = trim($q);
        } elseif (is_array($q)) {
            $text = trim($q['text'] ?? $q['question'] ?? $q['prompt'] ?? '');
            if ($text !== '') $out[] = $text;
        }
    }
    return $out;
}


if ($mode === 'generate') {
    $contextText = isset($input['contextText']) ? trim($input['contextText']) : '';

    if (empty($contextText)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'contextText is required.']);
        exit();
    }

    $contextText = substr($contextText, 0, 12000);

    $prompt = "You are a strict oral examiner conducting a spoken viva voce. "
            . "Based on the study text below, generate exactly 3 insightful open-ended viva questions "
            . "that test conceptual understanding (not just factual recall).\n"
            . "Return STRICTLY a JSON array of objects with no markdown formatting.\n"
            . "Each object MUST contain this exact key:\n"
            . "- 'text': The viva question as a single string\n\n"
            . "Study Text:\n" . $contextText;

    try {
        $rawText = callGemini($url, $prompt);
        $decoded = parseAiJson($rawText);
        $questions = normalizeVivaQuestions($decoded);

        if (count($questions) < 1) {
            throw new Exception("AI did not return a valid question array.");
        }

        $questions = array_slice($questions, 0, 3);

        echo json_encode(['status' => 'success', 'questions' => array_values($questions)]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit();
}


if ($mode === 'evaluate') {
    $question    = trim($input['question']    ?? '');
    $userAnswer  = trim($input['userAnswer']  ?? '');
    $contextText = substr(trim($input['contextText'] ?? ''), 0, 6000);

    if (empty($question) || empty($userAnswer)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'question and userAnswer are required.']);
        exit();
    }

    $prompt = "You are a kind but rigorous oral examiner evaluating a student's spoken viva answer.\n"
            . "Question: " . $question . "\n"
            . "Student's Answer: " . $userAnswer . "\n"
            . ($contextText ? "Reference Text (use this as ground truth):\n" . $contextText . "\n\n" : "\n")
            . "Evaluate the answer and respond with a JSON object containing:\n"
            . "- 'score': integer 0–10 (10 = perfect, 0 = completely wrong/blank)\n"
            . "- 'feedback': 2–4 friendly but honest sentences spoken directly to the student, "
            .   "highlighting what was correct, what was missing, and a helpful insight.\n"
            . "- 'isCorrect': boolean — true if score >= 5\n"
            . "Respond ONLY with the JSON object, no markdown, no extra text.";

    try {
        $rawText = callGemini($url, $prompt);
        $result = parseAiJson($rawText);

        if (!isset($result['score']) || !isset($result['feedback'])) {
            throw new Exception("AI returned unexpected format.");
        }

        $result['score']     = max(0, min(10, intval($result['score'])));
        $result['isCorrect'] = ($result['score'] >= 5);

        echo json_encode(['status' => 'success', 'result' => $result]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit();
}


http_response_code(400);
echo json_encode(['status' => 'error', 'message' => "Unknown mode '$mode'."]);
