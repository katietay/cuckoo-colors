<?php
declare(strict_types=1);

/** Loads config.php (git-ignored). CC_* environment variables override it, which the tests use. */
final class Config
{
    public const MIN_TOKEN_LENGTH = 16;

    /** @return array{db: array{dsn: string, user: string, pass: string}, admin_token: string, write_limit: int, window: int, public_add: bool, visitor_max_colors: int, visitor_daily_limit: int, visitor_expire_seconds: int, contact_email: string} */
    public static function load(): array
    {
        $file = dirname(__DIR__) . '/config.php';
        $base = is_file($file) ? require $file : [];

        $db = $base['db'] ?? [];
        $envPublic = getenv('CC_PUBLIC_ADD');
        $public = $envPublic !== false
            ? in_array(strtolower($envPublic), ['1', 'true'], true)
            : (bool) ($base['public_add'] ?? false);
        $email = (string) (getenv('CC_CONTACT_EMAIL') ?: ($base['contact_email'] ?? ''));
        $config = [
            'db' => [
                'dsn' => (string) (getenv('CC_DB_DSN') ?: ($db['dsn'] ?? '')),
                'user' => (string) (getenv('CC_DB_USER') ?: ($db['user'] ?? '')),
                'pass' => (string) (getenv('CC_DB_PASS') ?: ($db['pass'] ?? '')),
            ],
            'admin_token' => (string) (getenv('CC_ADMIN_TOKEN') ?: ($base['admin_token'] ?? '')),
            'write_limit' => (int) (getenv('CC_WRITE_LIMIT') ?: ($base['write_limit'] ?? 30)),
            'window' => (int) ($base['window'] ?? 900),
            // Visitors (no admin key) may add colors only when this is switched on. Off by default.
            'public_add' => $public,
            'visitor_max_colors' => max(1, (int) (getenv('CC_VISITOR_MAX_COLORS') ?: ($base['visitor_max_colors'] ?? 10))),
            'visitor_daily_limit' => max(1, (int) (getenv('CC_VISITOR_DAILY_LIMIT') ?: ($base['visitor_daily_limit'] ?? 3))),
            'visitor_expire_seconds' => max(1, (int) (getenv('CC_VISITOR_EXPIRE_SECONDS')
                ?: (round((float) ($base['visitor_expire_days'] ?? 3) * 86400)))),
            'contact_email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '',
        ];

        if ($config['db']['dsn'] === '') {
            throw new RuntimeException('Missing database settings. Copy config.sample.php to config.php and fill it in.');
        }
        if ($config['admin_token'] !== '' && strlen($config['admin_token']) < self::MIN_TOKEN_LENGTH) {
            throw new RuntimeException('admin_token must be at least ' . self::MIN_TOKEN_LENGTH . ' characters.');
        }
        return $config;
    }
}
