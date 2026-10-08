<?php
require_once 'cors.php';
require_once 'verify-token.php';


$user = verifyFirebaseToken();
$userId = $user['uid'];


$authHeader = "";
foreach ($_SERVER as $k => $v) {
    if (strtolower($k) === 'http_authorization' || strtolower($k) === 'redirect_http_authorization') {
        $authHeader = $v;
        break;
    }
}
if (!$authHeader && function_exists('getallheaders')) {
    $headers = getallheaders();
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'authorization') { $authHeader = $v; break; }
    }
}

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['examId']) || !isset($input['answers'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid submission payload.']);
    exit();
}

$examId = $input['examId'];
$studentAnswers = $input['answers']; 
$autoSubmitted = isset($input['autoSubmitted']) ? filter_var($input['autoSubmitted'], FILTER_VALIDATE_BOOLEAN) : false;
$violationCount = isset($input['violationCount']) ? intval($input['violationCount']) : 0;


$firestoreUrl = "https://firestore.googleapis.com/v1/projects/exam-platform-59d6e/databases/(default)/documents/exams/{$examId}/questions";

$ch = curl_init($firestoreUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$headers = ["Content-Type: application/json"];
if ($authHeader) { $headers[] = $authHeader; }
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to retrieve exam key for scoring.']);
    exit();
}

$data = json_decode($response, true);
$documents = $data['documents'] ?? [];

$score = 0;
$totalQuestions = count($documents);

foreach ($documents as $doc) {
    
    $pathParts = explode('/', $doc['name']);
    $qId = end($pathParts);
    
    $fields = $doc['fields'];
    $correctAnswer = $fields['correctAnswer']['stringValue'] ?? '';

    if (isset($studentAnswers[$qId]) && $studentAnswers[$qId] === $correctAnswer) {
        $score++;
    }
}


echo json_encode([
    'status' => 'success',
    'score' => $score,
    'total' => $totalQuestions,
    'autoSubmitted' => $autoSubmitted,
    'violationCount' => $violationCount
]);