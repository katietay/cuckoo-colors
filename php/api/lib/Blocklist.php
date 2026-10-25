<?php
declare(strict_types=1);

/**
 * Blocked words for visitor-added color names. Mirrors api/blocklist.js and reads the same word list
 * (shared/blocked-terms.json in the repository, api/blocked-terms.json on the server).
 */
final class Blocklist
{
    /** @var array{fold: array<string,string>, allow: string[], contains: string[], whole: string[]}|null */
    private static ?array $data = null;

    private static function data(): array
    {
        if (self::$data === null) {
            $paths = [dirname(__DIR__) . '/blocked-terms.json', dirname(__DIR__, 3) . '/shared/blocked-terms.json'];
            foreach ($paths as $path) {
                if (is_file($path)) {
                    self::$data = json_decode((string) file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
                    break;
                }
            }
            if (self::$data === null) {
                throw new RuntimeException('blocked-terms.json is missing.');
            }
        }
        return self::$data;
    }

    /** Lowercase and fold Latin-1 accents to plain letters. */
    private static function fold(string $text): string
    {
        return strtr(mb_strtolower($text, 'UTF-8'), self::data()['fold']);
    }

    private static function collapse(string $s): string
    {
        return (string) preg_replace('/(.)\1+/', '$1', $s);
    }

    /** True when the name contains a blocked term. Callers must not reveal which one. */
    public static function isBlocked(string $name): bool
    {
        $data = self::data();
        $folded = self::fold($name);
        $joined = (string) preg_replace('/[^a-z]/', '', $folded);
        foreach ($data['allow'] as $ok) {
            $joined = str_replace($ok, '', $joined);
        }
        $collapsed = self::collapse($joined);

        foreach ($data['contains'] as $term) {
            if (str_contains($joined, $term)) {
                return true;
            }
            if (strlen($term) >= 4 && str_contains($collapsed, self::collapse($term))) {
                return true;
            }
        }

        $whole = array_flip($data['whole']);
        foreach (preg_split('/[^a-z]+/', $folded, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
            $trimmed = (string) preg_replace('/(.)\1{2,}/', '$1$1', $word);
            if (isset($whole[$word]) || isset($whole[$trimmed])) {
                return true;
            }
        }
        return false;
    }
}
