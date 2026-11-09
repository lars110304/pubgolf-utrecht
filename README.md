# Pubgolf Utrecht

An 18-hole, par 18 pubgolf course through central Utrecht for two teams of two: 10 pubs and 8 Albert Heijns, with no restaurants. The Albert Heijn holes keep it cheap: buy the drink in the shop and finish it outside. Drinking on the street is banned in much of the centre, so check the alcohol-free zones first. The page has a scorecard that counts strokes per team, a route map with walking directions, a deck of power-ups, the rules and a plan for a Saturday.

## Run it

Needs Node 18 or newer. There are no dependencies to install.

```bash
npm run dev       # build, serve on http://localhost:5173 and reload on every change in src/
npm run build     # writes the site to dist/
npm run preview   # serves dist/ on http://localhost:4173 (static, no PHP)
npm start         # build + preview
```

`npm run dev` also prints a Network URL. Open it on a phone on the same Wi-Fi to test with real fingers.

The site is a set of separate pages with one navigation bar on top (a hamburger menu on phones): Home, Scorecard, Route, Power-ups, Rules, Plan and Finger Chooser (`dist/index.html`, `scorecard.html`, `route.html`, `powerups.html`, `rules.html`, `plan.html`, `finger-chooser.html`).

The build fails if the course is broken: it checks there are 18 holes numbered in order, par 1 on every hole (9 out and 9 in), exactly 8 Albert Heijn holes, and that every hole has a name, address, drink and coordinates. It also checks that every script parses and every link between pages points at a page that exists.

## Score database (PHP)

Scores, team names, players and power-ups are stored in a database through a small PHP API (`src/api/`, built to `dist/api/`), so every phone sees the same scorecard. Without PHP or a database the scorecard still works and saves on that device only.

1. Copy `.env.example` to `.env` and fill in the variables (`.env` is git-ignored).
2. Run `npm run migrate` to create the tables in the database from `.env`. It needs the PHP command line with `pdo_mysql`, only creates what's missing, never deletes data, and is safe to run again. The API also creates the tables on its first request, and `src/api/schema.sql` is there if you'd rather run it by hand.
3. Upload the contents of `dist/` to a PHP host.
4. Keep `.env` outside the web root, or next to `dist/`. The API looks for it in `api/`, the folder above and the folder above that.

`npm run dev` starts PHP's built-in server for `/api/` when `php` is on your PATH.

| Variable | Meaning |
| --- | --- |
| `DB_DRIVER` | `mysql` (default) or `sqlite` for local testing |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL connection |
| `DB_PATH` | SQLite file, only for `DB_DRIVER=sqlite` |
| `GAME_ID` | Name of the game; use another value to keep a separate scorecard in the same database |

There is no login: anyone with the link can change the scores.

**Locked holes:** once a team has scored a later hole, its earlier scored holes are locked in. The API refuses changes to them (HTTP 409), so a phone that is out of date cannot bypass it. A team's progress is kept in `pubgolf_progress` and never goes down, so clearing the latest hole does not unlock the ones before it. Holes a team skipped stay open until they are scored. The tables are added automatically to an existing database on the next request, and `npm run migrate` creates them too. To fix a mistake after locking, use "Start a new game" on the scorecard, or edit the `pubgolf_scores` and `pubgolf_progress` rows in the database.

## Change the course

Everything about the course is in `src/course.js`:

- `HOLES`: the holes in walking order. Each has a number, `kind` (`pub` or `ah`), name, address, drink, par, coordinates and Google Maps place ID. `unit: "bite"` marks food holes, `water: 1` marks water hazards and `breakAfter` adds a break row to the scorecard.
- `CANAL` and `STREETS`: the canal line and street names drawn on the map.

The other files:

| File | What it holds |
| --- | --- |
| `src/layout.html` | Shared page shell for the pubgolf pages (head, nav, footer) |
| `src/pages/` | One file per page: `home`, `scorecard`, `route`, `powerups`, `rules`, `plan` and the standalone `finger-chooser` |
| `src/nav.css` | The navigation bar, used by every page |
| `src/styles.css` | Styles for the pubgolf pages, with light and dark themes |
| `src/app.js` | Scorecard, power-ups, route list and map; builds only what the current page contains, and syncs with the API |
| `src/api/` | PHP API (`index.php`), `schema.sql` and an `.htaccess` that blocks `.env` |
| `scripts/build.mjs` | Checks the course and assembles the pages into `dist/` |
| `scripts/dev.mjs` | Dev server with rebuild and live reload |

To add a page, put a file in `src/pages/` and add it to `PAGES` in `scripts/build.mjs`; it shows up in the navigation automatically.

The teams are Cilio & Faas against Thibault & Lars. Change the default names in `src/app.js` (`DEFAULT_TEAMS`).

## Before the day

Opening hours come from Google Maps listings checked on 9 November 2026, and the timings assume a Saturday. Check the hours that week: three of the Albert Heijns close at 21:00 and Café 't Pandje opens at 21:00.
