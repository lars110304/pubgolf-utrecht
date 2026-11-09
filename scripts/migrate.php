<?php
// npm run migrate: create the score tables in the database from .env.
// Safe to run again: it only creates what is missing and never deletes data.

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require dirname(__DIR__) . '/src/api/lib.php';

$envDir = load_env();
echo $envDir === null ? "No .env found; using environment variables only.\n" : "Using $envDir/.env\n";

try {
    $db = connect($envDir);
} catch (NotConfigured $e) {
    fwrite(STDERR, "Not configured: {$e->getMessage()}. Fill in the DB_ variables in .env (see .env.example).\n");
    exit(1);
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to the database: {$e->getMessage()}\n");
    exit(1);
}

$driver = strtolower(env('DB_DRIVER', 'mysql'));
echo $driver === 'sqlite' ? 'Database: sqlite (' . env('DB_PATH') . ")\n" : 'Database: mysql ' . env('DB_NAME') . ' on ' . env('DB_HOST', 'localhost') . "\n";

$before = array_map(fn ($t) => table_exists($db, $t), TABLES);

try {
    create_tables($db);
} catch (PDOException $e) {
    fwrite(STDERR, "Migration failed: {$e->getMessage()}\nDoes the database user have permission to create tables? You can also run src/api/schema.sql by hand.\n");
    exit(1);
}

foreach (TABLES as $i => $table) {
    $rows = (int) $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
    printf("  %-16s %s (%d rows)\n", $table, $before[$i] ? 'already existed' : 'created', $rows);
}
echo "Done.\n";
