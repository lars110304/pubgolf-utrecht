# Pubgolf Utrecht

An 18-hole, par 72 pubgolf course through central Utrecht for two teams of two: 10 pubs and 8 Albert Heijns, with no restaurants. The Albert Heijn holes keep it cheap: buy the drink in the shop and finish it outside. Drinking on the street is banned in much of the centre, so check the alcohol-free zones first. The page has a scorecard that counts strokes per team, a route map with walking directions, a deck of power-ups, the rules and a plan for a Saturday.

## Run it

Needs Node 18 or newer. There are no dependencies to install.

```bash
npm run build     # writes dist/index.html
npm run preview   # serves dist/ on http://localhost:4173
npm start         # both
```

`dist/index.html` is a single self-contained file, so you can host it anywhere: GitHub Pages, Netlify, Vercel, or just open it in a browser.

The build fails if the course is broken: it checks there are 18 holes numbered in order, par 36 out and 36 in, exactly 8 Albert Heijn holes, and that every hole has a name, address, time, drink and coordinates.

## Change the course

Everything about the course is in `src/course.js`:

- `HOLES`: the holes in walking order. Each has a number, start time, `kind` (`pub` or `ah`), name, address, drink, par, coordinates and Google Maps place ID. `unit: "bite"` marks food holes, `water: 1` marks water hazards and `breakAfter` adds a break row to the scorecard.
- `CANAL` and `STREETS`: the canal line and street names drawn on the map.

The other files:

| File | What it holds |
| --- | --- |
| `src/index.html` | Page template; the build replaces the `@inline` markers |
| `src/body.html` | Page text: rules, plan, backups |
| `src/styles.css` | Styles, with light and dark themes |
| `src/app.js` | Scorecard, power-ups, route list and map |
| `scripts/build.mjs` | Checks the course and inlines everything into `dist/index.html` |

Scores are saved in the browser's local storage, so they stay on the phone you enter them on.

## Before the day

Opening hours come from Google Maps listings checked on 9 November 2026, and the timings assume a Saturday. Check the hours that week: three of the Albert Heijns close at 21:00 and Café 't Pandje opens at 21:00.
