<?php
declare(strict_types=1);

/** PDO connection, schema creation and seeding. Works with MySQL/MariaDB (production) and SQLite (tests). */
final class Database
{
    public const MIN_COLORS = 2;
    public const MAX_COLORS = 50;

    private const DEFAULT_COLORS = [
        ['red', '#ff0000'], ['orange', '#ffa500'], ['yellow', '#ffff00'], ['green', '#008000'],
        ['teal', '#008080'], ['blue', '#0000ff'], ['purple', '#800080'], ['grey', '#808080'],
        ['brown', '#a52a2a'], ['black', '#000000'],
    ];

    /** @param array{dsn: string, user?: string, pass?: string} $db */
    public static function connect(array $db): PDO
    {
        $pdo = new PDO($db['dsn'], $db['user'] ?? null, $db['pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        self::ensureSchema($pdo);
        return $pdo;
    }

    /** Creates the tables the first time, then seeds an empty colors table. Never drops anything. */
    private static function ensureSchema(PDO $pdo): void
    {
        try {
            $pdo->query('SELECT 1 FROM colors LIMIT 1');
            $pdo->query('SELECT 1 FROM rate_limits LIMIT 1');
            return;
        } catch (PDOException) {
            // Tables are missing: create them below.
        }

        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $pdo->exec('CREATE TABLE IF NOT EXISTS colors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
                hex TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(hex) = 7)
            )');
            $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
                k TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL
            )');
        } else {
            $pdo->exec('CREATE TABLE IF NOT EXISTS colors (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(40) NOT NULL,
                hex CHAR(7) NOT NULL,
                UNIQUE KEY uq_colors_name (name),
                UNIQUE KEY uq_colors_hex (hex)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
            $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
                k CHAR(64) NOT NULL PRIMARY KEY,
                window_start INT UNSIGNED NOT NULL,
                hits INT UNSIGNED NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        }

        $count = (int) $pdo->query('SELECT COUNT(*) FROM colors')->fetchColumn();
        if ($count === 0) {
            $insert = $pdo->prepare('INSERT INTO colors (name, hex) VALUES (?, ?)');
            foreach (self::DEFAULT_COLORS as [$name, $hex]) {
                try {
                    $insert->execute([$name, $hex]);
                } catch (PDOException) {
                    // Another request seeded at the same moment. Ignore.
                }
            }
        }
    }

    public static function isDuplicate(PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_starts_with((string) $e->getCode(), '23');
    }
}
