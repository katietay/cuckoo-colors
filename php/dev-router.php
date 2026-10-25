<?php
// Router for PHP's built-in server (local use and tests only; production uses Apache + .htaccess).
//   php -S 127.0.0.1:8080 php/dev-router.php            (API only)
//   CC_STATIC_DIR=dist/cuckoo-colors/browser php -S ... (API + built app)
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if (preg_match('#^/api(/|$)#', $path)) {
    require __DIR__ . '/api/index.php';
    return true;
}

$static = getenv('CC_STATIC_DIR');
if (!$static || !is_dir($static)) {
    http_response_code(404);
    return true;
}
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
$file = realpath($static . $path);
$root = realpath($static);
if ($file && is_file($file) && str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'html' => 'text/html', 'woff2' => 'font/woff2', 'woff' => 'font/woff', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'ico' => 'image/x-icon'];
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    readfile($file);
    return true;
}
header('Content-Type: text/html; charset=utf-8');
readfile($root . '/index.html');
return true;
