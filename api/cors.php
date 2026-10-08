<?php
require_once 'config.php';


$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

if (ALLOWED_ORIGIN === '*' || ALLOWED_ORIGIN === $origin) {
    header("Access-Control-Allow-Origin: " . (ALLOWED_ORIGIN === '*' ? '*' : $origin));
}

header("Access-Control-Allow-Credentials: true");
header("Access-Control-Max-Age: 86400"); 

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    }
    exit(0);
}