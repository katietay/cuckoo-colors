<?php
declare(strict_types=1);

/** Input validation. Mirrors api/validate.js so both backends accept and reject the same input. */
final class Validate
{
    public const NAME_MAX = 40;
    public const VISITOR_NAME_MIN = 3;
    public const VISITOR_NAME_MAX = 24;
    public const VISITOR_WORDS_MAX = 3;

    /** Trim and collapse whitespace. Returns null when the name is not acceptable. */
    public static function name(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $name = preg_replace('/\s+/u', ' ', $value);
        if ($name === null) {
            return null; // invalid UTF-8
        }
        $name = preg_replace('/^ | $/', '', $name);
        $length = mb_strlen($name, 'UTF-8');
        if ($length < 1 || $length > self::NAME_MAX) {
            return null;
        }
        if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} \'\-]*$/u', $name)) {
            return null;
        }
        return $name;
    }

    /** "#abc" or "#AABBCC" becomes lowercase "#aabbcc". Returns null when invalid. */
    public static function hex(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $hex = trim($value);
        if (!preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $hex)) {
            return null;
        }
        $digits = strtolower(substr($hex, 1));
        if (strlen($digits) === 3) {
            $digits = $digits[0] . $digits[0] . $digits[1] . $digits[1] . $digits[2] . $digits[2];
        }
        return '#' . $digits;
    }

    /**
     * Validate a create or update body.
     * @return array{value?: array{name: string, hex: string}, error?: string}
     */
    public static function color(mixed $body): array
    {
        if (!is_array($body) || array_is_list($body)) {
            return ['error' => 'Request body must be a JSON object with "name" and "hex".'];
        }
        $name = self::name($body['name'] ?? null);
        if ($name === null) {
            return ['error' => 'Name must be 1 to ' . self::NAME_MAX . ' characters: letters, numbers, spaces, hyphens or apostrophes.'];
        }
        $hex = self::hex($body['hex'] ?? null);
        if ($hex === null) {
            return ['error' => 'Hex value must look like #rrggbb or #rgb, using only the digits 0-9 and A-F.'];
        }
        return ['value' => ['name' => $name, 'hex' => $hex]];
    }

    /**
     * Validate a color submitted by a visitor (no admin key). Stricter than the admin rules.
     * @return array{value?: array{name: string, hex: string}, error?: string}
     */
    public static function visitorColor(mixed $body): array
    {
        if (!is_array($body) || array_is_list($body)) {
            return ['error' => 'Request body must be a JSON object with "name" and "hex".'];
        }
        $name = self::name($body['name'] ?? null);
        $length = $name === null ? 0 : mb_strlen($name, 'UTF-8');
        if (
            $name === null
            || $length < self::VISITOR_NAME_MIN
            || $length > self::VISITOR_NAME_MAX
            || !preg_match('/^[A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}]+(?:[ \'\-][A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}]+)*$/u', $name)
            || count(preg_split('/[ \'\-]/', $name) ?: []) > self::VISITOR_WORDS_MAX
            || preg_match('/(.)\1{2,}/iu', $name)
        ) {
            return ['error' => 'Names must be ' . self::VISITOR_NAME_MIN . ' to ' . self::VISITOR_NAME_MAX
                . ' letters (A to Z), up to ' . self::VISITOR_WORDS_MAX . ' words, with no numbers or symbols.'];
        }
        if (Blocklist::isBlocked($name)) {
            return ['error' => 'That name is not allowed. Please choose a different name.'];
        }
        $hex = self::hex($body['hex'] ?? null);
        if ($hex === null) {
            return ['error' => 'Hex value must look like #rrggbb or #rgb, using only the digits 0-9 and A-F.'];
        }
        return ['value' => ['name' => $name, 'hex' => $hex]];
    }

    /** A positive integer route id, or null. */
    public static function id(string $value): ?int
    {
        return preg_match('/^[1-9][0-9]{0,9}$/', $value) ? (int) $value : null;
    }
}
