<?php
declare(strict_types=1);

/** Loads config.php (git-ignored). CC_* environment variables override it, which the tests use. */
final class Config
{
    public const MIN_TOKEN_LENGTH = 16;

    /** @return array{db: array{dsn: string, user: string, pass: string}, admin_token: string, write_limit: int, window: int} */
    public static function load(): array
    {
        $file = dirname(__DIR__) . '/config.php';
        $base = is_file($file) ? require $file : [];

        $db = $base['db'] ?? [];
        $config = [
            'db' => [
                'dsn' => (string) (getenv('CC_DB_DSN') ?: ($db['dsn'] ?? '')),
                'user' => (string) (getenv('CC_DB_USER') ?: ($db['user'] ?? '')),
                'pass' => (string) (getenv('CC_DB_PASS') ?: ($db['pass'] ?? '')),
            ],
            'admin_token' => (string) (getenv('CC_ADMIN_TOKEN') ?: ($base['admin_token'] ?? '')),
            'write_limit' => (int) (getenv('CC_WRITE_LIMIT') ?: ($base['write_limit'] ?? 30)),
            'window' => (int) ($base['window'] ?? 900),
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
