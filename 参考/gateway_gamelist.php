<?php

$token = 'b32cca927fd63b931dfe53a7db51f6d54c51ef8a1fa3dac98d5b4fce518fd11eafdfcea12ed3b2b28e560c62ff87bd9b'; // 或从安全配置读取

$url = 'https://api.gt96.xyz/api/gateway/ProjectInfo';
$payload = json_decode('{}', true);
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
]);
$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo $raw;
