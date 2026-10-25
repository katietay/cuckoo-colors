<?php
declare(strict_types=1);

/** PDO connection, schema creation and seeding. Works with MySQL/MariaDB (production) and SQLite (tests). */
final class Database
{
    public const MIN_COLORS = 2;
    public const MAX_COLORS = 75;

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
            $pdo->query('SELECT id, name, hex, source, created_at FROM colors LIMIT 1');
            $pdo->query('SELECT 1 FROM rate_limits LIMIT 1');
            return;
        } catch (PDOException) {
            // A table or column is missing: create or upgrade below.
        }

        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $pdo->exec('CREATE TABLE IF NOT EXISTS colors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
                hex TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(hex) = 7),
                source TEXT NOT NULL DEFAULT \'admin\',
                created_at INTEGER NOT NULL DEFAULT 0
            )');
            $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
                k TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL
            )');
        } else {
            $pdo->exec('CREATE TABLE IF NOT EXISTS colors (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(40) NOT NULL,
                hex CHAR(7) NOT NULL,
                source VARCHAR(8) NOT NULL DEFAULT \'admin\',
                created_at INT UNSIGNED NOT NULL DEFAULT 0,
                UNIQUE KEY uq_colors_name (name),
                UNIQUE KEY uq_colors_hex (hex)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
            $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
                k CHAR(64) NOT NULL PRIMARY KEY,
                window_start INT UNSIGNED NOT NULL,
                hits INT UNSIGNED NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        }

        self::addMissingColumns($pdo);

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

    /** Databases made before visitor colors existed get the two new columns. Existing rows count as admin colors. */
    private static function addMissingColumns(PDO $pdo): void
    {
        $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
        $columns = [
            'source' => $sqlite ? "TEXT NOT NULL DEFAULT 'admin'" : "VARCHAR(8) NOT NULL DEFAULT 'admin'",
            'created_at' => $sqlite ? 'INTEGER NOT NULL DEFAULT 0' : 'INT UNSIGNED NOT NULL DEFAULT 0',
        ];
        foreach ($columns as $name => $definition) {
            try {
                $pdo->query("SELECT $name FROM colors LIMIT 1");
            } catch (PDOException) {
                try {
                    $pdo->exec("ALTER TABLE colors ADD COLUMN $name $definition");
                } catch (PDOException) {
                    // Another request added it at the same moment. Ignore.
                }
            }
        }
    }

    /** Deletes visitor colors older than $expireSeconds. Admin colors never expire. */
    public static function purgeExpired(PDO $pdo, int $expireSeconds): void
    {
        $pdo->prepare("DELETE FROM colors WHERE source = 'visitor' AND created_at <= ?")
            ->execute([time() - $expireSeconds]);
    }

    public static function isDuplicate(PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_starts_with((string) $e->getCode(), '23');
    }
}
