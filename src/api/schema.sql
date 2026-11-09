-- Tables for the score API. index.php creates them on the first request if they are missing,
-- so you only need this file if you would rather run it by hand. Works on MySQL and SQLite.
CREATE TABLE IF NOT EXISTS pubgolf_teams (
  game VARCHAR(64) NOT NULL,
  team CHAR(1) NOT NULL,
  name VARCHAR(64) NOT NULL,
  p1 VARCHAR(64) NOT NULL DEFAULT '',
  p2 VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game, team)
);

CREATE TABLE IF NOT EXISTS pubgolf_scores (
  game VARCHAR(64) NOT NULL,
  team CHAR(1) NOT NULL,
  hole INT NOT NULL,
  strokes INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game, team, hole)
);

CREATE TABLE IF NOT EXISTS pubgolf_powers (
  game VARCHAR(64) NOT NULL,
  team CHAR(1) NOT NULL,
  power VARCHAR(32) NOT NULL,
  used INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (game, team, power)
);

-- Holes whose row has been locked with the Lock button. A locked hole can't be changed for either team.
CREATE TABLE IF NOT EXISTS pubgolf_locks (
  game VARCHAR(64) NOT NULL,
  hole INT NOT NULL,
  PRIMARY KEY (game, hole)
);

-- Penalty points and minigame results, logged per team from the scorecard. Not tied to a hole.
-- id is made by the page, so the same SQL works on MySQL and SQLite. points can be negative (a won minigame).
CREATE TABLE IF NOT EXISTS pubgolf_penalties (
  game VARCHAR(64) NOT NULL,
  id VARCHAR(16) NOT NULL,
  team CHAR(1) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  points INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game, id)
);
