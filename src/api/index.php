<?php
// Score API for Pubgolf Utrecht.
//   GET  api/   -> the whole game: both teams, their scores and power-ups
//   POST api/   -> one change at a time, as JSON:
//                  {"op":"team","team":"a","name":"..","p1":"..","p2":".."}
//                  {"op":"score","team":"a","hole":3,"strokes":5}   (strokes 0 clears the hole)
//                  {"op":"powers","team":"a","powers":[{"id":"gimme","used":false}]}
//                  {"op":"penalty","team":"a","id":"k3x9q","reason":"Spilling","points":1}   (points -10 to 10)
//                  {"op":"unpenalty","id":"k3x9q"}
//                  {"op":"reset"}
// Every POST answers with the whole game, so the page can redraw from it.
// Connection settings come from .env (see .env.example), never from the browser.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(int $code, string $message): never {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

require __DIR__ . '/lib.php'; // load_env(), env(), connect(), ensure_tables()

function read_game(PDO $db, string $game): array {
    $teams = [];
    $q = $db->prepare('SELECT team, name, p1, p2 FROM pubgolf_teams WHERE game = ?');
    $q->execute([$game]);
    foreach ($q as $r) $teams[$r['team']] = ['name' => $r['name'], 'p1' => $r['p1'], 'p2' => $r['p2'], 'scores' => (object) [], 'powers' => []];

    $q = $db->prepare('SELECT team, hole, strokes FROM pubgolf_scores WHERE game = ? ORDER BY hole');
    $q->execute([$game]);
    $scores = [];
    foreach ($q as $r) $scores[$r['team']][(int) $r['hole']] = (int) $r['strokes'];

    $q = $db->prepare('SELECT team, power, used FROM pubgolf_powers WHERE game = ? ORDER BY sort_order');
    $q->execute([$game]);
    $powers = [];
    foreach ($q as $r) $powers[$r['team']][] = ['id' => $r['power'], 'used' => (bool) $r['used']];

    $q = $db->prepare('SELECT hole FROM pubgolf_locks WHERE game = ? ORDER BY hole');
    $q->execute([$game]);
    $locks = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));

    $q = $db->prepare('SELECT id, team, reason, points FROM pubgolf_penalties WHERE game = ? ORDER BY created_at, id');
    $q->execute([$game]);
    $pens = [];
    foreach ($q as $r) $pens[$r['team']][] = ['id' => $r['id'], 'reason' => $r['reason'], 'points' => (int) $r['points']];

    foreach (['a', 'b'] as $t) {
        // A team may have scores before its names were ever saved; the page fills in default names.
        $teams[$t] ??= ['name' => null, 'p1' => null, 'p2' => null, 'scores' => (object) [], 'powers' => []];
        if (!empty($scores[$t])) $teams[$t]['scores'] = $scores[$t];
        $teams[$t]['powers'] = $powers[$t] ?? [];
        $teams[$t]['penalties'] = $pens[$t] ?? [];
    }
    return ['teams' => $teams, 'locks' => $locks, 'saved' => true];
}

function hole_locked(PDO $db, string $game, int $hole): bool {
    $q = $db->prepare('SELECT 1 FROM pubgolf_locks WHERE game = ? AND hole = ?');
    $q->execute([$game, $hole]);
    return (bool) $q->fetchColumn();
}

function text(mixed $v, int $max): string {
    // First $max characters, without needing the mbstring extension (not every PHP install has it).
    $s = trim(is_string($v) ? $v : '');
    return preg_match('/^.{0,' . $max . '}/us', $s, $m) ? $m[0] : '';
}

function team_of(array $in): string {
    $t = $in['team'] ?? '';
    if ($t !== 'a' && $t !== 'b') fail(400, 'team must be a or b');
    return $t;
}

function apply_op(PDO $db, string $game, array $in): void {
    $op = $in['op'] ?? '';
    $db->beginTransaction();
    try {
        if ($op === 'team') {
            $t = team_of($in);
            $db->prepare('DELETE FROM pubgolf_teams WHERE game = ? AND team = ?')->execute([$game, $t]);
            $db->prepare('INSERT INTO pubgolf_teams (game, team, name, p1, p2) VALUES (?, ?, ?, ?, ?)')
               ->execute([$game, $t, text($in['name'] ?? '', 24), text($in['p1'] ?? '', 20), text($in['p2'] ?? '', 20)]);
        } elseif ($op === 'score') {
            $t = team_of($in);
            $hole = filter_var($in['hole'] ?? null, FILTER_VALIDATE_INT);
            $strokes = filter_var($in['strokes'] ?? null, FILTER_VALIDATE_INT);
            if ($hole === false || $hole < 1 || $hole > 18) fail(400, 'hole must be 1 to 18');
            if ($strokes === false || $strokes < 0 || $strokes > 30) fail(400, 'strokes must be 0 to 30');
            // A locked hole (the Lock button on its row) can't be changed for either team.
            if (hole_locked($db, $game, $hole)) { $db->rollBack(); fail(409, 'hole locked in'); }
            $db->prepare('DELETE FROM pubgolf_scores WHERE game = ? AND team = ? AND hole = ?')->execute([$game, $t, $hole]);
            if ($strokes > 0) {
                $db->prepare('INSERT INTO pubgolf_scores (game, team, hole, strokes) VALUES (?, ?, ?, ?)')->execute([$game, $t, $hole, $strokes]);
            }
        } elseif ($op === 'lock') {
            $hole = filter_var($in['hole'] ?? null, FILTER_VALIDATE_INT);
            if ($hole === false || $hole < 1 || $hole > 18) { $db->rollBack(); fail(400, 'hole must be 1 to 18'); }
            $q = $db->prepare('SELECT 1 FROM pubgolf_scores WHERE game = ? AND hole = ?');
            $q->execute([$game, $hole]);
            if (!$q->fetchColumn()) { $db->rollBack(); fail(400, 'nothing scored on this hole yet'); }
            if (!hole_locked($db, $game, $hole)) {
                $db->prepare('INSERT INTO pubgolf_locks (game, hole) VALUES (?, ?)')->execute([$game, $hole]);
            }
        } elseif ($op === 'powers') {
            $t = team_of($in);
            $list = is_array($in['powers'] ?? null) ? array_slice($in['powers'], 0, 12) : [];
            $db->prepare('DELETE FROM pubgolf_powers WHERE game = ? AND team = ?')->execute([$game, $t]);
            $seen = [];
            $ins = $db->prepare('INSERT INTO pubgolf_powers (game, team, power, used, sort_order) VALUES (?, ?, ?, ?, ?)');
            foreach ($list as $i => $p) {
                $id = is_array($p) ? ($p['id'] ?? '') : '';
                if (!is_string($id) || !preg_match('/^[a-z]{2,24}$/', $id) || isset($seen[$id])) continue;
                $seen[$id] = true;
                $ins->execute([$game, $t, $id, !empty($p['used']) ? 1 : 0, $i]);
            }
        } elseif ($op === 'penalty') {
            $t = team_of($in);
            $id = $in['id'] ?? '';
            $points = filter_var($in['points'] ?? null, FILTER_VALIDATE_INT);
            $reason = text($in['reason'] ?? '', 64);
            if (!is_string($id) || !preg_match('/^[a-z0-9]{4,16}$/', $id)) { $db->rollBack(); fail(400, 'bad penalty id'); }
            if ($points === false || $points < -10 || $points > 10 || $points === 0) { $db->rollBack(); fail(400, 'points must be -10 to 10'); }
            if ($reason === '') $reason = 'Penalty';
            // Adding the same id twice (a phone retrying) keeps one row.
            $db->prepare('DELETE FROM pubgolf_penalties WHERE game = ? AND id = ?')->execute([$game, $id]);
            $db->prepare('INSERT INTO pubgolf_penalties (game, id, team, reason, points) VALUES (?, ?, ?, ?, ?)')
               ->execute([$game, $id, $t, $reason, $points]);
        } elseif ($op === 'unpenalty') {
            $id = $in['id'] ?? '';
            if (!is_string($id) || !preg_match('/^[a-z0-9]{4,16}$/', $id)) { $db->rollBack(); fail(400, 'bad penalty id'); }
            $db->prepare('DELETE FROM pubgolf_penalties WHERE game = ? AND id = ?')->execute([$game, $id]);
        } elseif ($op === 'reset') {
            foreach (TABLES as $table) {
                $db->prepare("DELETE FROM $table WHERE game = ?")->execute([$game]);
            }
        } else {
            fail(400, 'unknown op');
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

$envDir = load_env();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') fail(405, 'method not allowed');

$game = preg_replace('/[^A-Za-z0-9_-]/', '', env('GAME_ID', 'pubgolf-utrecht')) ?: 'pubgolf-utrecht';

try {
    $db = connect($envDir);
    ensure_tables($db);
    if ($method === 'POST') {
        $raw = file_get_contents('php://input', false, null, 0, 65536);
        $in = json_decode($raw ?: '', true);
        if (!is_array($in)) fail(400, 'expected a JSON body');
        apply_op($db, $game, $in);
    }
    echo json_encode(read_game($db, $game), JSON_UNESCAPED_UNICODE);
} catch (NotConfigured $e) {
    fail(503, 'not configured');
} catch (PDOException $e) {
    error_log('pubgolf api: ' . $e->getMessage()); // details stay in the server log, not in the response
    fail(503, 'database unavailable');
}
