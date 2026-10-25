<?php
declare(strict_types=1);

/**
 * Cuckoo Colors API (PHP). Same endpoints and rules as the Node API in /api.
 *
 *   GET    /api/health        GET /api/config        GET /api/colors
 *   POST   /api/colors        PUT /api/colors/{id}   DELETE /api/colors/{id}   (admin key required)
 *   POST /api/colors without a key adds a short-lived visitor color, only when public_add is switched on.
 */

require __DIR__ . '/lib/Blocklist.php';
require __DIR__ . '/lib/Validate.php';
require __DIR__ . '/lib/Config.php';
require __DIR__ . '/lib/Database.php';
require __DIR__ . '/lib/RateLimit.php';

const BODY_LIMIT = 2048;

function respond(int $status, mixed $data = null): never
{
    http_response_code($status);
    if ($status !== 204 && $data !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['error' => $message]);
}

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Referrer-Policy: no-referrer');
header('Cross-Origin-Resource-Policy: same-origin');

// Never show PHP errors to visitors. Log them instead.
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e): void {
    error_log('[cuckoo-colors] ' . get_class($e) . ': ' . $e->getMessage());
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
    }
    echo json_encode(['error' => 'Something went wrong on the server.']);
});

// ---- Routing --------------------------------------------------------------
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'HEAD') {
    $method = 'GET';
}
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$route = '/';
if (preg_match('#/api(?:/index\.php)?(/.*)?$#', $path, $m)) {
    $route = rtrim(rawurldecode($m[1] ?? '/'), '/') ?: '/';
}

$colorId = null;
if (preg_match('#^/colors/([^/]*)$#', $route, $m)) {
    $route = '/colors/:id';
    $colorId = $m[1];
}

$isWrite = ($method === 'POST' && $route === '/colors')
    || (in_array($method, ['PUT', 'DELETE'], true) && $route === '/colors/:id');
$known = $isWrite || ($method === 'GET' && in_array($route, ['/health', '/config', '/colors'], true));
if (!$known) {
    fail(404, 'Not found.');
}

$config = Config::load();
$pdo = Database::connect($config['db']);
Database::purgeExpired($pdo, $config['visitor_expire_seconds']);

/** What the API returns for one row. Visitor colors say when they will be removed. */
function colorShape(array $r, int $expireSeconds): array
{
    $visitor = ($r['source'] ?? 'admin') === 'visitor';
    return [
        'id' => (int) $r['id'],
        'name' => $r['name'],
        'hex' => $r['hex'],
        'source' => $visitor ? 'visitor' : 'admin',
        'expiresAt' => $visitor ? (int) $r['created_at'] + $expireSeconds : null,
    ];
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
// With a key: the normal admin rules. Without one: a visitor submission, only if that is switched on.
$isVisitor = $method === 'POST' && $route === '/colors' && $config['public_add']
    && ($_SERVER['HTTP_X_ADMIN_KEY'] ?? '') === '';

// ---- Writes: rate limit, body, admin key ----------------------------------
$input = [];
if ($isWrite) {
    if (!RateLimit::allow($pdo, 'write|' . $ip, $config['write_limit'], $config['window'])) {
        header('Retry-After: ' . $config['window']);
        fail(429, 'Too many requests. Please try again later.');
    }

    if ($method !== 'DELETE') {
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $raw = $length > BODY_LIMIT ? false : file_get_contents('php://input', false, null, 0, BODY_LIMIT + 1);
        if ($raw === false || strlen($raw) > BODY_LIMIT) {
            fail(413, 'Request body is too large.');
        }
        $isJson = stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0;
        if ($isJson && $raw !== '') {
            try {
                $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                fail(400, 'Request body is not valid JSON.');
            }
        } else {
            $input = null;
        }
    }

    if (!$isVisitor) {
        if ($config['admin_token'] === '') {
            fail(503, 'Editing is disabled on this server.');
        }
        $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
        if ($key === '' || !hash_equals(hash('sha256', $config['admin_token'], true), hash('sha256', $key, true))) {
            fail(401, 'A valid admin key is required.');
        }
    }
}

// ---- Handlers -------------------------------------------------------------
$duplicate = 'A color with that name or hex value already exists.';

switch ($method . ' ' . $route) {
    case 'GET /health':
        respond(200, ['status' => 'ok']);

    case 'GET /config':
        respond(200, [
            'editingEnabled' => $config['admin_token'] !== '',
            'minColors' => Database::MIN_COLORS,
            'maxColors' => Database::MAX_COLORS,
            'publicAdding' => $config['public_add'],
            'contactEmail' => $config['contact_email'],
            'visitorLimits' => [
                'maxColors' => $config['visitor_max_colors'],
                'perDay' => $config['visitor_daily_limit'],
                'expireSeconds' => $config['visitor_expire_seconds'],
                'nameMin' => Validate::VISITOR_NAME_MIN,
                'nameMax' => Validate::VISITOR_NAME_MAX,
            ],
        ]);

    case 'GET /colors':
        $rows = $pdo->query('SELECT id, name, hex, source, created_at FROM colors ORDER BY id')->fetchAll();
        $expire = $config['visitor_expire_seconds'];
        respond(200, array_map(static fn(array $r): array => colorShape($r, $expire), $rows));

    case 'POST /colors':
        if ($isVisitor) {
            $checked = Validate::visitorColor($input);
            if (isset($checked['error'])) {
                fail(400, $checked['error']);
            }
            $visitorCount = (int) $pdo->query("SELECT COUNT(*) FROM colors WHERE source = 'visitor'")->fetchColumn();
            $total = (int) $pdo->query('SELECT COUNT(*) FROM colors')->fetchColumn();
            if ($visitorCount >= $config['visitor_max_colors'] || $total >= Database::MAX_COLORS) {
                fail(409, 'The visitor color list is full right now. Visitor colors are removed automatically, so please try again later.');
            }
            if (!RateLimit::allow($pdo, 'visitor-add|' . $ip, $config['visitor_daily_limit'], 86400)) {
                fail(429, 'You can add up to ' . $config['visitor_daily_limit'] . ' colors per day. Please try again tomorrow.');
            }
            $source = 'visitor';
        } else {
            $checked = Validate::color($input);
            if (isset($checked['error'])) {
                fail(400, $checked['error']);
            }
            $count = (int) $pdo->query('SELECT COUNT(*) FROM colors')->fetchColumn();
            if ($count >= Database::MAX_COLORS) {
                fail(409, 'The color list is limited to ' . Database::MAX_COLORS . ' colors.');
            }
            $source = 'admin';
        }
        $now = time();
        try {
            $pdo->prepare('INSERT INTO colors (name, hex, source, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$checked['value']['name'], $checked['value']['hex'], $source, $now]);
        } catch (PDOException $e) {
            if (Database::isDuplicate($e)) {
                fail(409, $duplicate);
            }
            throw $e;
        }
        respond(201, colorShape([
            'id' => $pdo->lastInsertId(),
            'name' => $checked['value']['name'],
            'hex' => $checked['value']['hex'],
            'source' => $source,
            'created_at' => $now,
        ], $config['visitor_expire_seconds']));

    case 'PUT /colors/:id':
        $id = Validate::id((string) $colorId);
        if ($id === null) {
            fail(400, 'Invalid color id.');
        }
        $exists = $pdo->prepare('SELECT 1 FROM colors WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            fail(404, 'Color not found.');
        }
        $checked = Validate::color($input);
        if (isset($checked['error'])) {
            fail(400, $checked['error']);
        }
        try {
            // Saving an edit as admin keeps a visitor color permanently.
            $pdo->prepare("UPDATE colors SET name = ?, hex = ?, source = 'admin' WHERE id = ?")
                ->execute([$checked['value']['name'], $checked['value']['hex'], $id]);
        } catch (PDOException $e) {
            if (Database::isDuplicate($e)) {
                fail(409, $duplicate);
            }
            throw $e;
        }
        respond(200, ['id' => $id] + $checked['value'] + ['source' => 'admin', 'expiresAt' => null]);

    case 'DELETE /colors/:id':
        $id = Validate::id((string) $colorId);
        if ($id === null) {
            fail(400, 'Invalid color id.');
        }
        $exists = $pdo->prepare('SELECT 1 FROM colors WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            fail(404, 'Color not found.');
        }
        $count = (int) $pdo->query('SELECT COUNT(*) FROM colors')->fetchColumn();
        if ($count <= Database::MIN_COLORS) {
            fail(409, 'You must keep at least ' . Database::MIN_COLORS . ' colors.');
        }
        $pdo->prepare('DELETE FROM colors WHERE id = ?')->execute([$id]);
        respond(204);
}

fail(404, 'Not found.');
