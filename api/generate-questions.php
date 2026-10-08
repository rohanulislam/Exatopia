<?php
require_once 'cors.php';
require_once 'verify-token.php';


$user = verifyFirebaseToken();


$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['contextText']) || empty(trim($input['contextText']))) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Context text is required.']);
    exit();
}

$contextText = substr($input['contextText'], 0, 8000); 
$numQuestions = isset($input['numQuestions']) ? intval($input['numQuestions']) : 5;


$apiKey = GEMINI_API_KEY;
$model = defined('GEMINI_MODEL') ? GEMINI_MODEL : 'gemini-3.5-flash';
$url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key=" . trim($apiKey);

$prompt = "You are an expert exam creator. Generate $numQuestions multiple choice questions based strictly on the following text.\n"
        . "Return strictly a JSON array of objects with no markdown formatting or extra text.\n"
        . "Each object must have these exact keys:\n"
        . "- 'text': The question text\n"
        . "- 'options': Array of exactly 4 strings [Option A, Option B, Option C, Option D]\n"
        . "- 'correctAnswer': The EXACT string matching the correct option from the options array\n\n"
        . "Text:\n" . $contextText;

$payload = [
    "contents" => [
        [
            "parts" => [
                ["text" => $prompt]
            ]
        ]
    ]
];


$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    http_response_code(500);
    $errorDetail = $response ? json_decode($response, true) : null;
    $errorMsg = isset($errorDetail['error']['message']) ? $errorDetail['error']['message'] : 'Failed to reach AI service.';
    echo json_encode(['status' => 'error', 'message' => 'AI service error: ' . $errorMsg]);
    exit();
}


$responseData = json_decode($response, true);
$rawText = $responseData['candidates'][0]['content']['parts'][0]['text'] ?? '';


$cleanJson = trim($rawText);
if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/', $cleanJson, $matches)) {
    $cleanJson = trim($matches[1]);
}
$questions = json_decode($cleanJson, true);

if (!$questions) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to parse AI output into valid JSON.']);
    exit();
}

echo json_encode([
    'status' => 'success',
    'questions' => $questions
]);