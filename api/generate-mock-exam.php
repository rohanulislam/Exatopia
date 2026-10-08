<?php
require_once 'cors.php';
require_once 'verify-token.php';

set_time_limit(180); 

$user = verifyFirebaseToken();$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['contextText']) \vert{}\vert{} empty(trim($input['contextText']))) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Lecture notes or syllabus text is required.']);
    exit();
}

$contextText = substr($input['contextText'], 0, 12000);$numQuestions = isset($input['numQuestions']) ? min(100, max(1, intval($input['numQuestions']))) : 10;


$groqApiKey = getenv('GROQ_API_KEY') ?: '';
$geminiApiKey = getenv('GEMINI_API_KEY') ?: '';


$prompt = "You are an AI exam generator. Create exactly {$numQuestions} multiple-choice practice questions based on the text below.\n"
        . "Respond strictly with valid JSON format (a JSON array of objects). Do NOT include markdown code blocks (```json).\n"
        . "Format for each question object:\n"
        . "{\n"
        . "  \"id\": 1,\n"
        . "  \"text\": \"Question text here?\",\n"
        . "  \"options\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],\n"
        . "  \"correctAnswer\": \"Option A\",\n"
        . "  \"explanation\": \"Brief explanation of why Option A is correct.\"\n"
        . "}\n\n"
        . "Study Text:\n" . $contextText;

$questions = null;


$groqPayload = [
    "model" => "llama-3.1-8b-instant",
    "messages" => [
        ["role" => "system", "content" => "You output raw JSON arrays containing exam questions without markdown formatting."],
        ["role" => "user", "content" => $prompt]
    ],
    "response_format" => ["type" => "json_object"]
];

$ch = curl_init("[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . trim($groqApiKey),
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($groqPayload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 && $response) {
    $resData = json_decode($response, true);
    $rawText = $resData['choices'][0]['message']['content'] ?? '';
    
    
    $cleanJson = preg_replace('/```(?:json)?/i', '', $rawText);
    $parsed = json_decode(trim($cleanJson), true);

    
    if (isset($parsed['questions'])) {
        $questions =$parsed['questions'];
    } elseif (is_array($parsed) && array_is_list($parsed)) {
        $questions =$parsed;
    }
}


if (!$questions && !empty($geminiApiKey) &&$geminiApiKey !== "YOUR_AIzaSy_KEY_HERE") {
    $geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . trim($geminiApiKey);$geminiPayload = [
        "contents" => [
            ["parts" => [["text" => $prompt]]]
        ]
    ];

    $ch = curl_init($geminiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($geminiPayload));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {$resData = json_decode($response, true);$rawText = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';$cleanJson = preg_replace('/```(?:json)?/i', '', $rawText);
        $questions = json_decode(trim($cleanJson), true);
    }
}


if (!$questions) {
    http_response_code(503);
    echo json_encode([
        'status' => 'error',
        'message' => 'AI servers are currently busy. Please try again in a few moments.'
    ]);
    exit();
}

echo json_encode([
    'status' => 'success',
    'questions' => $questions
]);