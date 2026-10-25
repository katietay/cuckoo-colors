<?php
declare(strict_types=1);

/** Fixed-window rate limiter stored in the database (shared hosting has no Redis). */
final class RateLimit
{
    /** Counts one hit for $key. Returns false when the limit for the current window is exceeded. */
    public static function allow(PDO $pdo, string $key, int $limit, int $windowSeconds): bool
    {
        $now = time();
        $hash = hash('sha256', $key);

        // Start a fresh window when the old one has expired.
        $pdo->prepare('DELETE FROM rate_limits WHERE k = ? AND window_start <= ?')
            ->execute([$hash, $now - $windowSeconds]);

        try {
            $pdo->prepare('INSERT INTO rate_limits (k, window_start, hits) VALUES (?, ?, 1)')
                ->execute([$hash, $now]);
            $hits = 1;
        } catch (PDOException $e) {
            if (!Database::isDuplicate($e)) {
                throw $e;
            }
            $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE k = ?')->execute([$hash]);
            $select = $pdo->prepare('SELECT hits FROM rate_limits WHERE k = ?');
            $select->execute([$hash]);
            $hits = (int) $select->fetchColumn();
        }

        // Occasional cleanup of old rows.
        if (random_int(1, 100) === 1) {
            $pdo->prepare('DELETE FROM rate_limits WHERE window_start <= ?')->execute([$now - $windowSeconds]);
        }

        return $hits <= $limit;
    }
}
