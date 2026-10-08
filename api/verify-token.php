<?php
require_once 'cors.php';

function verifyFirebaseToken() {
    $headers = getallheaders();
    $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';

    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Authorization token missing.']);
        exit();
    }

    $jwt = $matches[1];
    $tokenParts = explode('.', $jwt);

    if (count($tokenParts) !== 3) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Malformed authentication token.']);
        exit();
    }

    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $tokenParts[1])), true);

    if (!$payload || !isset($payload['sub'])) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Invalid token payload.']);
        exit();
    }

    
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Token has expired.']);
        exit();
    }

    return $payload; 
}