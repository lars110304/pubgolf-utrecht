<?php
// Shared by index.php (the web API) and scripts/migrate.php (npm run migrate):
// reading .env, connecting to the database and creating the tables.

declare(strict_types=1);

/** Thrown when .env is missing or incomplete. */
class NotConfigured extends RuntimeException {}

/** Read KEY=VALUE lines from the first .env found. Real environment variables win. */
function load_env(): ?string {
    foreach ([__DIR__ . '/.env', dirname(__DIR__) . '/.env', dirname(__DIR__, 2) . '/.env'] as $file) {
        if (!is_file($file)) continue;
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[-1] === $value[0]) {
                $value = substr($value, 1, -1);
            }
            if ($key !== '' && getenv($key) === false) { putenv("$key=$value"); $_ENV[$key] = $value; }
        }
        return dirname($file);
    }
    return null;
}

function env(string $key, string $default = ''): string {
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}

function connect(?string $envDir): PDO {
    $driver = strtolower(env('DB_DRIVER', 'mysql'));
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if ($driver === 'sqlite') {
        $path = env('DB_PATH');
        if ($path === '') throw new NotConfigured('DB_PATH is empty');
        if (!preg_match('~^([A-Za-z]:)?[\\\\/]~', $path)) $path = ($envDir ?? __DIR__) . '/' . $path;
        return new PDO('sqlite:' . $path, null, null, $options);
    }
    if ($driver !== 'mysql') throw new NotConfigured("DB_DRIVER must be mysql or sqlite, not \"$driver\"");
    $missing = array_filter(['DB_NAME', 'DB_USER'], fn ($k) => env($k) === '');
    if ($missing) throw new NotConfigured(implode(' and ', $missing) . ' ' . (count($missing) > 1 ? 'are' : 'is') . ' empty');
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env('DB_HOST', 'localhost'), env('DB_PORT', '3306'), env('DB_NAME'));
    return new PDO($dsn, env('DB_USER'), env('DB_PASS'), $options);
}

const TABLES = ['pubgolf_teams', 'pubgolf_scores', 'pubgolf_powers', 'pubgolf_locks', 'pubgolf_penalties'];

function table_exists(PDO $db, string $table): bool {
    try { $db->query("SELECT 1 FROM $table LIMIT 1"); return true; } catch (PDOException $e) { return false; }
}

/** Run schema.sql. Every statement is CREATE TABLE IF NOT EXISTS, so this is safe to repeat. */
function create_tables(PDO $db): void {
    $schema = (string) file_get_contents(__DIR__ . '/schema.sql');
    foreach (explode(';', preg_replace('/^--.*$/m', '', $schema)) as $statement) {
        if (trim($statement) !== '') $db->exec($statement);
    }
}

/** The web API calls this on every request; it only does work the first time. */
function ensure_tables(PDO $db): void {
    if (!table_exists($db, TABLES[count(TABLES) - 1])) create_tables($db);   // also adds tables introduced by later versions
}
