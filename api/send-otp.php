<?php
header('Content-Type: application/json');
require_once 'cors.php';



$input = json_decode(file_get_contents('php://input'), true);
$email = filter_var($input['email'] ?? '', FILTER_VALIDATE_EMAIL);
$otp   = trim($input['otp'] ?? '');

if (!$email || !$otp) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Email and OTP are required.']);
    exit();
}

$subject = 'Exatopia — Your Verification Code';
$message = "Your Exatopia account verification code is: " . htmlspecialchars($otp);
$headers = "From: no-reply@examshield.ai\r\nContent-Type: text/plain; charset=UTF-8";

$sent = @mail($email, $subject, $message, $headers);

if ($sent) {
    echo json_encode(['status' => 'success', 'message' => 'OTP email queued to ' . $email]);
} else {
    echo json_encode(['status' => 'error', 'message' => 'mail() unavailable on this server.']);
}
