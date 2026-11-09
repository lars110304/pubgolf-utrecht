const PLAY = HOLES;
const parOf = list => list.reduce((s, h) => s + h.par, 0);
const FRONT = PLAY.slice(0, 9), BACK = PLAY.slice(9);

const POWERS = [
  ["mulligan","Mulligan","after your hole","Knock 2 strokes off your score on this hole, down to a minimum of 1."],
  ["gimme","Gimme","during your hole","Your score for this hole stops at par. Finish the drink slowly and stop counting."],
  ["caddie","Caddie","before the hole","One teammate drinks the whole hole while the other carries the bag and rests."],
  ["handicap","Handicap","during a hole","Add 1 stroke to the other team's score on this hole."],
  ["sandtrap","Sand Trap","before they order","Pick the other team's drink for this hole. It can't be bigger or stronger than the listed drink."],
  ["clubswap","Club Swap","before the hole","Swap one of your players with one of theirs for this hole. Each player's sips count for the team they join."],
  ["cardswap","Scorecard Swap","after both finish","Swap both teams' scores on this hole. You can't play it on hole 18."],
  ["doubledown","Double Down","before the hole","Your difference from par counts double on this hole, so a birdie scores 2 under and a bogey 2 over."],
  ["raindelay","Rain Delay","any time","Everyone stops for 10 minutes and has a glass of water. Nobody takes a sip until the time is up."],
  ["umbrella","Umbrella","when targeted","Cancel a power-up the other team just played against you. Both cards are spent."]
];
const POWER_BY_ID = Object.fromEntries(POWERS.map(p => [p[0], p]));

/* Penalties and minigame results you can add from the scorecard. They count towards the team's total,
   not towards a hole. Keep this list in step with the Rules and Minigames pages. */
const PENALTIES = [
  ["Penalties", [
    ["Spilling", 1], ["Peeing", 1], ["Sipping out of turn", 1], ["Glass in dominant hand", 1], ["Glass left on table", 1],
    ["Falling over", 2], ["First to the toilet", 2], ["Wrong drink ordered", 2], ["Sip from someone else's glass", 2], ["Helping an opponent", 2],
    ["Walking off", 3], ["Littering", 3], ["Not finishing your drink", 4],
    ["Throwing up", 5], ["Refused a drink or kicked out", 5], ["Fighting the other team", 5], ["Rude to staff", 5], ["Left a teammate behind", 5],
    ["Cheating", 10]
  ]],
  ["Minigames", [
    ["Broke the RPS rule", 1], ["No reaction shot", 2], ["Sprite challenge made", -3], ["Sprite challenge, sips", 1],
    ["Statues: last to freeze", 1], ["Categories: hesitated", 1]
  ]]
];

/* The two teams. Names and players can still be edited on the scorecard. */
const DEFAULT_TEAMS = {
  a: { name: "Cilio & Faas", p1: "Cilio", p2: "Faas" },
  b: { name: "Thibault & Lars", p1: "Thibault", p2: "Lars" }
};
const blank = (t) => ({ ...DEFAULT_TEAMS[t], scores: {}, powers: [], pens: [] });
const state = { a: blank("a"), b: blank("b"), locks: {} };   // locks: {holeNumber: true}, shared by both teams
const KEY = "pubgolf-" + CITY.toLowerCase() + "-v2";
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- Saving ----------
   Every change is kept on this device (localStorage) and sent to the PHP API (api/), so all phones
   share one scorecard. If the API isn't there, the scorecard keeps working on this device alone. */
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.a && s.b) { accept("a", s.a); accept("b", s.b); state.locks = s.locks && typeof s.locks === "object" ? { ...s.locks } : {}; }
  } catch (e) {}
}
function accept(t, d) {
  const def = DEFAULT_TEAMS[t], str = (v, fallback) => typeof v === "string" ? v : fallback;
  state[t] = { name: str(d.name, def.name), p1: str(d.p1, def.p1), p2: str(d.p2, def.p2),
    scores: (d.scores && typeof d.scores === "object") ? { ...d.scores } : {},
    powers: Array.isArray(d.powers) ? d.powers.filter(p => p && POWER_BY_ID[p.id]).map(p => ({ id: p.id, used: !!p.used })) : [],
    pens: (Array.isArray(d.penalties) ? d.penalties : Array.isArray(d.pens) ? d.pens : [])
      .filter(p => p && typeof p.id === "string" && Number.isInteger(p.points))
      .map(p => ({ id: p.id, reason: String(p.reason || "Penalty"), points: p.points })) };
}
function save() { saveLocal(); }
/* The Lock button on a hole's row locks the whole row: neither team can change that hole any more. */
const isLocked = n => !!state.locks[n];
window.addEventListener("storage", e => { if (e.key === KEY) { loadLocal(); update(); } });

const API = "api/";
let online = false, queued = 0, queue = Promise.resolve();
const teamTimers = {};
const busy = () => queued > 0 || Object.keys(teamTimers).length > 0;
function setOnline(v, why) {
  online = v;
  const s = $("saved");
  if (!s) return;
  s.textContent = v ? "Live" : "This phone only";
  s.title = v ? "Shared with every phone" : "Not syncing" + (why ? ": " + why : "");
  s.classList.toggle("on", v);
}
/* A short reason for the line above: what the API said, or that it couldn't be reached at all. */
async function failReason(r) {
  let msg = "";
  try { msg = (await r.json()).error || ""; } catch (e) {}
  return msg || "server answered " + r.status;
}
const whyOffline = e => e instanceof TypeError ? "server not reachable" : (e && e.message) || "unknown error";
/* Changes go out one at a time, in order. The server answers with the whole game. */
function push(op) {
  queued++;
  queue = queue.then(async () => {
    let data = null, refused = false;
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
      if (r.status === 409) { refused = true; setOnline(true); }   // e.g. the hole was locked in on another phone
      else {
        if (!r.ok) throw new Error(await failReason(r));
        data = await r.json();
        setOnline(true);
      }
    } catch (e) { setOnline(false, whyOffline(e)); }
    queued--;
    if (data && !busy()) applyServer(data);
    if (refused) pull(false);   // take the server's version so this phone shows what is really saved
  });
}
function pushTeam(t) {
  clearTimeout(teamTimers[t]);
  teamTimers[t] = setTimeout(() => {
    delete teamTimers[t];
    push({ op: "team", team: t, name: state[t].name, p1: state[t].p1, p2: state[t].p2 });
  }, 400);
}
const pushScore = (t, n) => push({ op: "score", team: t, hole: n, strokes: state[t].scores[n] || 0 });
const pushPowers = (t) => push({ op: "powers", team: t, powers: state[t].powers });
const pushPenalty = (t, p) => push({ op: "penalty", team: t, id: p.id, reason: p.reason, points: p.points });
function applyServer(data) {
  if (!data || !data.teams) return;
  ["a", "b"].forEach(t => accept(t, data.teams[t] || {}));
  state.locks = Object.fromEntries((Array.isArray(data.locks) ? data.locks : []).map(n => [n, true]));
  saveLocal(); update();
}
const hasContent = (d) => ["a", "b"].some(t => d.teams[t] && (d.teams[t].name != null || Object.keys(d.teams[t].scores || {}).length || (d.teams[t].powers || []).length || (d.teams[t].penalties || []).length));
async function pull(first) {
  if (busy()) return;
  try {
    const r = await fetch(API, { cache: "no-store" });
    if (!r.ok) throw new Error(await failReason(r));
    const data = await r.json();
    setOnline(true);
    if (busy()) return;
    if (first && !hasContent(data) && localHasContent()) seedServer();   // empty server, scores already on this device
    else applyServer(data);
  } catch (e) { setOnline(false, whyOffline(e)); }
}
const localHasContent = () => ["a", "b"].some(t => Object.keys(state[t].scores).length || state[t].powers.length || state[t].pens.length ||
  ["name", "p1", "p2"].some(k => state[t][k] !== DEFAULT_TEAMS[t][k]));
function seedServer() {
  ["a", "b"].forEach(t => {
    push({ op: "team", team: t, name: state[t].name, p1: state[t].p1, p2: state[t].p2 });
    Object.keys(state[t].scores).forEach(n => pushScore(t, +n));
    pushPowers(t);
    state[t].pens.forEach(p => pushPenalty(t, p));
  });
  Object.keys(state.locks).forEach(n => push({ op: "lock", hole: +n }));   // after the scores, so they are not refused
}

/* ---------- Scoring ---------- */
function total(t, list) { let s = 0; list.forEach(h => { const v = state[t].scores[h.n]; if (v) s += v; }); return s; }
function played(t) { return PLAY.filter(h => state[t].scores[h.n]); }
/* Penalty points (and minigame results, which can be negative) count towards to-par and the total. */
const penTotal = t => state[t].pens.reduce((s, p) => s + p.points, 0);
function toPar(t) { return played(t).reduce((s, h) => s + state[t].scores[h.n] - h.par, 0) + penTotal(t); }
const fmtPar = v => v === 0 ? "E" : v > 0 ? "+" + v : "−" + Math.abs(v);
const teamName = t => state[t].name.trim() || (t === "a" ? "Team A" : "Team B");
function markClass(v, par) {
  if (!v) return "mark empty";
  const d = v - par;
  return "mark " + (d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "" : d === 1 ? "bogey" : "double");
}
function step(t, n, delta) {
  if (isLocked(n)) return;
  const h = PLAY.find(x => x.n === n), cur = state[t].scores[n];
  let next = cur ? cur + delta : h.par + (delta > 0 ? 0 : -1);
  if (!cur && delta < 0 && next < 1) next = 1;
  if (next < 1) delete state[t].scores[n]; else state[t].scores[n] = Math.min(next, 30);
  save(t); update(); pushScore(t, n);
}

/* Locking a row takes two taps (the second within 3 seconds) so it can't happen by accident, and it can't be undone. */
let armedLock = null, armedLockTimer = 0;
function lockHole(n) {
  if (isLocked(n) || !(state.a.scores[n] || state.b.scores[n])) return;
  if (armedLock !== n) {
    armedLock = n; clearTimeout(armedLockTimer);
    armedLockTimer = setTimeout(() => { armedLock = null; update(); }, 3000);
    update(); return;
  }
  clearTimeout(armedLockTimer); armedLock = null;
  state.locks[n] = true; save(); update(); push({ op: "lock", hole: n });
}

/* ---------- Build ---------- */
function mapsLink(h) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(h.name + ", " + h.addr + ", " + CITY) + "&query_place_id=" + h.pid;
}
function buildTeams() {
  const box = $("teams");
  ["a", "b"].forEach(t => {
    const c = el("div", "team");
    c.innerHTML = '<label for="name-' + t + '"><span class="lab">Team name</span><input class="tn" id="name-' + t + '" maxlength="24"></label>' +
      '<div class="row"><label for="p1-' + t + '"><span class="lab">Player 1</span><input id="p1-' + t + '" maxlength="20" placeholder="Player 1"></label>' +
      '<label for="p2-' + t + '"><span class="lab">Player 2</span><input id="p2-' + t + '" maxlength="20" placeholder="Player 2"></label></div>' +
      '<div class="board"><span class="total" id="tot-' + t + '"></span><span class="vs" id="vs-' + t + '"></span></div>';
    const pen = el("button", "btn penbtn", "+ Penalty"); pen.type = "button";
    pen.addEventListener("click", () => openPenalties(t));
    c.append(pen);
    box.append(c);
    [["name-", "name"], ["p1-", "p1"], ["p2-", "p2"]].forEach(([pre, key]) => {
      c.querySelector("#" + pre + t).addEventListener("input", e => { state[t][key] = e.target.value; save(t); update(); pushTeam(t); });
    });
  });
}
function stepperCell(t, h) {
  const td = el("td", "score c");
  td.append(el("span", "who"));
  const s = el("div", "stepper");
  const minus = el("button", "", "−"), plus = el("button", "", "+"), m = el("span", "mark empty", "–");
  minus.type = plus.type = "button"; minus.dataset.t = plus.dataset.t = t; minus.dataset.n = plus.dataset.n = h.n;
  minus.dataset.d = "-1"; plus.dataset.d = "1"; m.id = "m-" + t + "-" + h.n;
  minus.className = plus.className = "st";
  s.append(minus, m, plus); td.append(s);
  return td;
}
function subRow(label, list) {
  const tr = el("tr", "sub");
  tr.append(el("td", "lab", label));
  tr.append(el("td", "empty-col"));
  ["a", "b"].forEach(t => { const td = el("td", "score c", "–"); td.id = "sub-" + label + "-" + t; tr.append(td); });
  tr.append(el("td", "empty-col"));   // under the Lock column
  return tr;
}
function buildCard() {
  const tb = $("tbody");
  HOLES.forEach(h => {
    const tr = el("tr", h.kind === "ah" ? "ah" : "");
    tr.append(el("td", "no c", String(h.n)));
    const pub = el("td", "pub");
    const a = el("a", "", h.name); a.href = mapsLink(h); a.target = "_blank"; a.rel = "noopener";
    const top = el("div", "pubname"); top.append(a);
    if (h.kind === "ah") top.append(el("span", "tag", "AH"));
    const d = el("div"); const dr = el("span", h.water ? "water" : "", h.drink); d.append(dr);
    if (h.unit === "bite") d.append(el("span", "unit", ", strokes are bites"));
    pub.append(top, d); tr.append(pub);
    tr.append(stepperCell("a", h), stepperCell("b", h));
    const lockTd = el("td", "lockcell c"), lockBtn = el("button", "lockbtn", "Lock");
    lockBtn.type = "button"; lockBtn.dataset.n = h.n; lockTd.append(lockBtn); tr.append(lockTd);
    tb.append(tr);
    if (h.n === 9) tb.append(subRow("OUT", FRONT));
    if (h.breakAfter) {
      const br = el("tr", "turn");
      const txt = el("td", "", h.breakAfter); txt.colSpan = 5; br.append(txt);
      tb.append(br);
    }
  });
  tb.append(subRow("IN", BACK), subRow("PEN", []), subRow("TOTAL", PLAY));
  tb.addEventListener("click", e => {
    const lk = e.target.closest("button.lockbtn");
    if (lk) { lockHole(+lk.dataset.n); return; }
    const b = e.target.closest("button.st"); if (!b) return;
    step(b.dataset.t, +b.dataset.n, +b.dataset.d);
  });
}
function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r * Math.cos(a.lat * r);
  return R * Math.hypot(dLat, dLng);
}
const WALK_FACTOR = 1.3, M_PER_MIN = 75;
const legMeters = i => i ? dist(HOLES[i - 1], HOLES[i]) * WALK_FACTOR : 0;
function buildDistFact() {
  const tot = HOLES.reduce((s, h, i) => s + legMeters(i), 0);
  $("dist-fact").innerHTML = "<b>" + (tot / 1000).toFixed(1).replace(".", ",") + " km</b> walk";
}
function buildRoute() {
  const legs = $("legs");
  HOLES.forEach((h, i) => {
    const d = legMeters(i);
    const li = el("li", (h.n > 9 ? "back" : "") + (h.kind === "ah" ? " ah" : ""));
    li.append(el("b", "", String(h.n)), el("span", "", h.name),
      el("small", "", i ? Math.max(1, Math.round(d / M_PER_MIN)) + " min" : "start"));
    legs.append(li);
  });

  const q = h => encodeURIComponent(h.name + ", " + h.addr + ", " + CITY);
  const dir = list => "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + q(list[0]) + "&destination=" + q(list[list.length - 1]) +
    "&waypoints=" + list.slice(1, -1).map(q).join("%7C");
  [["Front nine", HOLES.slice(0, 9)], ["Back nine", HOLES.slice(9)]].forEach(([label, list]) => {
    const a = el("a", "btn", label); a.href = dir(list); a.target = "_blank"; a.rel = "noopener"; $("dirs").append(a);
  });
  buildMap();
}
function buildMap() {
  const NS = "http://www.w3.org/2000/svg", W = 800, pad = 40;
  const lats = HOLES.map(h => h.lat), lngs = HOLES.map(h => h.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const c = Math.cos(minLat * Math.PI / 180), k = (W - 2 * pad) / ((maxLng - minLng) * c), H = Math.round((maxLat - minLat) * k + 2 * pad);
  const X = lng => pad + (lng - minLng) * c * k, Y = lat => H - pad - (lat - minLat) * k;
  const pts = HOLES.map(h => ({ h, x: X(h.lng), y: Y(h.lat) }));
  const minD = 46;
  for (let it = 0; it < 300; it++) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    let dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy);
    if (d < minD) {
      if (d < .01) { dx = j - i; dy = 1; d = Math.hypot(dx, dy); }
      const push = (minD - d) / 2 * .6, ux = dx / d, uy = dy / d;
      pts[i].x -= ux * push; pts[i].y -= uy * push; pts[j].x += ux * push; pts[j].y += uy * push;
    }
  }
  pts.forEach(p => { p.x = Math.min(W - 24, Math.max(24, p.x)); p.y = Math.min(H - 24, Math.max(24, p.y)); });
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Map of the 18 holes through central Utrecht: from the top of the Oudegracht past the Neude to the station, then down the Oudegracht to the Twijnstraat, across to the Biltstraat and finishing on the Nobelstraat. Albert Heijn holes are drawn as squares.");
  const add = (tag, attrs, text, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; (parent || svg).append(e); return e; };
  add("rect", { x: 0, y: 0, width: W, height: H, style: "fill:var(--surface)" });
  add("polyline", { points: CANAL.points.map(([la, ln]) => X(ln).toFixed(1) + "," + Y(la).toFixed(1)).join(" "), fill: "none", "stroke-width": 16, "stroke-linecap": "round", "stroke-linejoin": "round", style: "stroke:var(--river)" });
  add("text", { x: X(CANAL.label[1]), y: Y(CANAL.label[0]), "text-anchor": "middle", "font-size": 20, "font-style": "italic", style: "fill:var(--river-ink)" }, CANAL.name);
  STREETS.forEach(([t, la, ln]) => add("text", { x: X(ln), y: Y(la), "text-anchor": "middle", "font-size": 17, "letter-spacing": ".04em", style: "fill:var(--muted)" }, t));
  const line = (list, css, dash) => add("polyline", { points: list.map(p => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "), fill: "none", "stroke-width": 3.5, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": dash || "none", style: "stroke:" + css });
  line(pts.slice(0, 9), "var(--red)");
  line(pts.slice(8), "var(--amber)", "9 7");
  pts.forEach(p => {
    const a = add("a", { href: mapsLink(p.h), target: "_blank", rel: "noopener" });
    add("title", {}, "Hole " + p.h.n + ": " + p.h.name, a);
    const css = p.h.n > 9 ? "var(--amber)" : "var(--red)", ring = "stroke:var(--surface);stroke-width:3";
    if (p.h.kind === "ah") add("rect", { x: p.x - 19, y: p.y - 19, width: 38, height: 38, rx: 6, style: "fill:var(--shop);" + ring }, null, a);
    else add("circle", { cx: p.x, cy: p.y, r: 20, style: "fill:" + css + ";" + ring }, null, a);
    add("text", { x: p.x, y: p.y + 7, "text-anchor": "middle", "font-size": 20, "font-weight": 700, style: "fill:#fff;font-family:var(--display)" }, String(p.h.n), a);
  });
  $("map").append(svg);
}
function buildDeck() {
  POWERS.forEach(([, name, when, text]) => {
    const d = el("div"), dt = el("dt", "", name), dd = el("dd", "", text);
    dt.append(el("span", "", when)); d.append(dt, dd); $("deck").append(d);
  });
}
let armedRemove = null, armedTimer = 0;   // which card's Remove button is waiting for its second tap
function renderHands() {
  const box = $("hands"); box.textContent = "";
  ["a", "b"].forEach(t => {
    const c = el("div", "hand"); c.append(el("h3", "", teamName(t)));
    const hand = state[t].powers;
    if (!hand.length) c.append(el("p", "nohand", "No cards yet"));
    else {
      const ul = el("ul", "chips");
      hand.forEach((p, i) => {
        const li = el("li", p.used ? "used" : ""), n = el("span", "pn", POWER_BY_ID[p.id][1]);
        n.title = POWER_BY_ID[p.id][3];
        const b = el("button", "", p.used ? "Undo" : "Used"); b.type = "button";
        b.addEventListener("click", () => { p.used = !p.used; save(t); renderHands(); pushPowers(t); });
        // Remove takes two taps (the second within 3 seconds) so a card isn't dropped by accident.
        // The card goes back into the deck, and the change is saved to the database like any other.
        const key = t + ":" + p.id, armed = armedRemove === key;
        const del = el("button", armed ? "del armed" : "del", armed ? "Sure?" : "Remove"); del.type = "button";
        del.addEventListener("click", () => {
          if (armedRemove !== key) {
            armedRemove = key; clearTimeout(armedTimer);
            armedTimer = setTimeout(() => { armedRemove = null; renderHands(); }, 3000);
            renderHands(); return;
          }
          clearTimeout(armedTimer); armedRemove = null;
          state[t].powers = state[t].powers.filter(x => x.id !== p.id);
          save(t); renderHands(); pushPowers(t);
        });
        const acts = el("div", "acts"); acts.append(b, del);
        li.append(n, acts); ul.append(li);
      });
      c.append(ul);
    }
    const held = new Set([...state.a.powers, ...state.b.powers].map(p => p.id));
    const left = POWERS.filter(p => !held.has(p[0]));
    const b = el("button", "btn", left.length ? "Draw" : "Deck empty"); b.type = "button"; b.disabled = !left.length;
    b.addEventListener("click", () => spinWheel(t, left));
    const wrap = el("div"); wrap.append(b); c.append(wrap);
    box.append(c);
  });
}
/* ---------- Fortune wheel ----------
   Drawing a power-up opens a wheel with every card still in the deck. It spins clockwise and lands on
   the card the pointer ends up over, and that card is added to the team's hand.
   Hidden control: the invisible square in the top-right corner of the wheel window. Tap it while the
   wheel is spinning or showing its result and the wheel winds back (counter-clockwise) and lands on a
   different random card instead. Nothing on screen says it exists. */
const WHEEL_COLORS = ["#c8102e", "#1c2333", "#e09a1a", "#0072b8", "#7a3b8f", "#d4552b", "#3d4a66", "#b8862a", "#2f6fa3", "#9a2747"];
const TWO_PI = Math.PI * 2;
const modTwoPi = a => ((a % TWO_PI) + TWO_PI) % TWO_PI;
function spinWheel(t, left) {
  if (document.querySelector(".wheel-overlay") || !left.length) return;
  const n = left.length, seg = TWO_PI / n, calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const opener = document.activeElement;

  const ov = el("div", "wheel-overlay"), panel = el("div", "wheel-panel");
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Power-up wheel");
  const title = el("h3", "", teamName(t));
  const cv = el("canvas", "wheel-canvas"), result = el("div", "wheel-result"); result.setAttribute("aria-live", "polite");
  const close = el("button", "btn", "Close"); close.type = "button"; close.disabled = true;
  const secret = el("button", "wheel-secret"); secret.type = "button"; secret.tabIndex = -1; secret.setAttribute("aria-hidden", "true");
  panel.append(title, cv, result, close, secret); ov.append(panel); document.body.append(ov);

  const size = Math.round(cv.getBoundingClientRect().width) || 300, dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext("2d"), R = size / 2 - 14;
  let rot = Math.random() * TWO_PI, anim = null, drawn = null, target = 0, closed = false, raf = 0;

  const indexAt = r => Math.floor(modTwoPi(-Math.PI / 2 - r) / seg) % n;   // wedge under the pointer (top)
  function go(dir, idx) {
    target = idx;
    const jitter = (Math.random() - .5) * seg * .6, end = modTwoPi(-Math.PI / 2 - (idx + .5) * seg - jitter);
    const delta = dir > 0 ? modTwoPi(end - rot) + TWO_PI * (5 + Math.floor(Math.random() * 2))
                          : -(modTwoPi(rot - end) + TWO_PI * 2);
    anim = { from: rot, delta, start: performance.now(), dir, dur: (dir > 0 ? 4800 : 3200) * (calm ? .15 : 1) };
    result.textContent = ""; close.disabled = true;
  }
  function land() {
    const pick = left[indexAt(rot)];
    if (drawn) state[t].powers = state[t].powers.filter(p => p.id !== drawn);   // replaces an earlier landing
    state[t].powers.push({ id: pick[0], used: false }); drawn = pick[0];
    save(t); renderHands(); pushPowers(t);
    const name = el("strong", "", pick[1]), when = el("span", "", pick[2]);
    result.textContent = ""; result.append(name, when, el("p", "", pick[3]));
    close.disabled = false; close.focus();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.save(); ctx.rotate(rot);
    left.forEach((p, i) => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, i * seg, (i + 1) * seg); ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length]; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
      ctx.save(); ctx.rotate((i + .5) * seg); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
      let fs = (n > 8 ? 12 : 14) * size / 320; ctx.font = "700 " + fs + "px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      const room = R * .66, w = ctx.measureText(p[1]).width;
      if (w > room) { fs *= room / w; ctx.font = "700 " + fs + "px 'Barlow Condensed', 'Arial Narrow', sans-serif"; }
      ctx.fillText(p[1], R - 12, 0); ctx.restore();
    });
    if (!anim && drawn) {   // glow on the landed wedge
      const i = indexAt(rot);
      ctx.beginPath(); ctx.arc(0, 0, R - 3, i * seg + .02, (i + 1) * seg - .02); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TWO_PI); ctx.lineWidth = 6; ctx.strokeStyle = "#1c2333"; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TWO_PI); ctx.fillStyle = "#f5f6f8"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#1c2333"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, -R - 12); ctx.lineTo(13, -R - 12); ctx.lineTo(0, -R + 12); ctx.closePath();   // pointer
    ctx.fillStyle = "#c8102e"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke();
  }
  function frame() {
    if (closed) return;
    if (anim) {
      const p = Math.min(1, (performance.now() - anim.start) / anim.dur);   // same clock as anim.start
      const e = anim.dir > 0 ? 1 - Math.pow(1 - p, 4) : (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
      rot = anim.from + anim.delta * e;
      if (p >= 1) { rot = modTwoPi(rot); anim = null; land(); }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  function shut() {
    closed = true; cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); ov.remove();
    if (opener && opener.isConnected) opener.focus();
  }
  const onKey = e => { if (e.key === "Escape" && !close.disabled) shut(); };

  secret.addEventListener("click", () => {
    if (closed || (anim && anim.dir < 0)) return;
    const others = left.map((_, i) => i).filter(i => i !== (anim ? target : indexAt(rot)));
    go(-1, others.length ? others[Math.floor(Math.random() * others.length)] : target);
  });
  close.addEventListener("click", shut);
  document.addEventListener("keydown", onKey);
  go(1, Math.floor(Math.random() * n));
  raf = requestAnimationFrame(frame);
}
/* ---------- Penalties ----------
   "+ Penalty" on a team card opens a sheet with every penalty and minigame result, plus a custom amount.
   One tap adds it to that team. The log under the card lists them, and each can be taken off with two taps. */
const penId = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
function addPenalty(t, reason, points) {
  const p = { id: penId(), reason, points };
  state[t].pens.push(p); save(); update(); pushPenalty(t, p);
}
function openPenalties(t) {
  if (document.querySelector(".sheet-overlay")) return;
  const opener = document.activeElement;
  const ov = el("div", "sheet-overlay"), sheet = el("div", "sheet");
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Add a penalty for " + teamName(t));
  const head = el("div", "sheet-head"), title = el("h3", "", teamName(t)), x = el("button", "sheet-x", "×");
  x.type = "button"; x.setAttribute("aria-label", "Close");
  head.append(title, x); sheet.append(head);
  const shut = () => { document.removeEventListener("keydown", onKey); ov.remove(); if (opener && opener.isConnected) opener.focus(); };
  const onKey = e => { if (e.key === "Escape") shut(); };
  const pick = (reason, pts) => { addPenalty(t, reason, pts); shut(); };

  // Custom amount first, for anything not on the list.
  const custom = el("div", "pen-custom"); let amt = 1;
  const minus = el("button", "", "−"), val = el("span", "pen-amt", "+1"), plus = el("button", "", "+"), add = el("button", "btn", "Add");
  [minus, plus, add].forEach(b => b.type = "button");
  const show = () => { val.textContent = fmtPar(amt).replace("E", "0"); add.disabled = amt === 0; };
  minus.addEventListener("click", () => { amt = Math.max(-10, amt - 1); show(); });
  plus.addEventListener("click", () => { amt = Math.min(10, amt + 1); show(); });
  add.addEventListener("click", () => { if (amt) pick("Other", amt); });
  custom.append(el("span", "pen-lab", "Other"), minus, val, plus, add); sheet.append(custom);

  PENALTIES.forEach(([group, list]) => {
    sheet.append(el("h4", "", group));
    const ul = el("div", "pen-list");
    list.forEach(([reason, pts]) => {
      const b = el("button", "pen-pick" + (pts < 0 ? " good" : "")); b.type = "button";
      b.append(el("span", "", reason), el("b", "", fmtPar(pts)));
      b.addEventListener("click", () => pick(reason, pts));
      ul.append(b);
    });
    sheet.append(ul);
  });
  ov.append(sheet); document.body.append(ov);
  ov.addEventListener("click", e => { if (e.target === ov) shut(); });
  x.addEventListener("click", shut);
  document.addEventListener("keydown", onKey);
  x.focus();
}
let armedPen = null, armedPenTimer = 0;
function renderPenLog() {
  const box = $("penlog"); if (!box) return;
  box.textContent = "";
  const all = ["a", "b"].flatMap(t => state[t].pens.map(p => ({ t, p })));
  if (!all.length) return;
  box.append(el("h3", "", "Penalties"));
  const ul = el("ul", "penlog");
  all.slice().reverse().forEach(({ t, p }) => {
    const li = el("li"), armed = armedPen === p.id;
    li.append(el("span", "who-t", teamName(t)), el("span", "why", p.reason), el("b", p.points < 0 ? "good" : "", fmtPar(p.points)));
    const del = el("button", armed ? "armed" : "", armed ? "Sure?" : "Undo"); del.type = "button";
    del.addEventListener("click", () => {
      if (armedPen !== p.id) {
        armedPen = p.id; clearTimeout(armedPenTimer);
        armedPenTimer = setTimeout(() => { armedPen = null; renderPenLog(); }, 3000);
        renderPenLog(); return;
      }
      clearTimeout(armedPenTimer); armedPen = null;
      state[t].pens = state[t].pens.filter(x => x.id !== p.id);
      save(); update(); push({ op: "unpenalty", id: p.id });
    });
    li.append(del); ul.append(li);
  });
  box.append(ul);
}
function renderReset(asking) {
  const box = $("reset"); box.textContent = "";
  if (!asking) {
    const b = el("button", "btn ghost", "New game"); b.type = "button"; b.addEventListener("click", () => renderReset(true)); box.append(b);
  } else {
    box.append(el("span", "", "Erase everything?"));
    const y = el("button", "btn", "Erase"), n = el("button", "btn ghost", "Cancel"); y.type = n.type = "button";
    y.addEventListener("click", () => {
      state.a = blank("a"); state.b = blank("b"); state.locks = {}; save(); update(); renderReset(false); push({ op: "reset" });
    });
    n.addEventListener("click", () => renderReset(false));
    box.append(y, n);
  }
}
function update() {
  if ($("teams")) updateCard();
  if ($("hands")) renderHands();
}
function updateCard() {
  ["a", "b"].forEach(t => {
    [["name-", "name"], ["p1-", "p1"], ["p2-", "p2"]].forEach(([pre, key]) => { const i = $(pre + t); if (document.activeElement !== i && i.value !== state[t][key]) i.value = state[t][key]; });
    const n = played(t).length;
    const pens = state[t].pens.length;
    $("tot-" + t).textContent = n || pens ? total(t, PLAY) + penTotal(t) : "–";
    const v = $("vs-" + t), tp = toPar(t);
    v.textContent = n || pens ? fmtPar(tp) + (n ? " thru " + n : "") : "";
    v.className = "vs" + ((n || pens) && tp < 0 ? " under" : "");
    $("th-" + t).textContent = teamName(t);
    PLAY.forEach(h => {
      const m = $("m-" + t + "-" + h.n), val = state[t].scores[h.n];
      m.textContent = val || "–"; m.className = markClass(val, h.par);
      const locked = isLocked(h.n);   // row locked: buttons off, score fixed
      m.title = locked ? "Locked in" : "";
      m.closest("td").classList.toggle("locked", locked);
      m.closest("td").querySelectorAll("button.st").forEach(b => { b.disabled = locked; });
      const who = m.closest("td").querySelector(".who"); who.textContent = teamName(t);
    });
    [["OUT", FRONT], ["IN", BACK], ["TOTAL", PLAY]].forEach(([lab, list]) => {
      const any = list.some(h => state[t].scores[h.n]);
      $("sub-" + lab + "-" + t).textContent = any ? total(t, list) : "–";
    });
    $("sub-PEN-" + t).textContent = pens ? fmtPar(penTotal(t)).replace("E", "0") : "–";
    if (n || pens) $("sub-TOTAL-" + t).textContent = total(t, PLAY) + penTotal(t);
  });
  PLAY.forEach(h => {
    const b = document.querySelector('.lockbtn[data-n="' + h.n + '"]'); if (!b) return;
    const locked = isLocked(h.n), armed = armedLock === h.n && !locked;
    b.disabled = locked || !(state.a.scores[h.n] || state.b.scores[h.n]);
    b.textContent = locked ? "🔒" : armed ? "Sure?" : "Lock";
    b.className = "lockbtn" + (locked ? " done" : armed ? " armed" : "");
    b.title = locked ? "This row is locked in" : "Lock this hole for both teams";
  });
  renderPenLog();
  const na = played("a").length + state.a.pens.length, nb = played("b").length + state.b.pens.length, L = $("leader");
  if (!na && !nb) L.textContent = "Not started";
  else {
    const pa = toPar("a"), pb = toPar("b");
    if (pa === pb) L.textContent = "All square, " + fmtPar(pa);
    else {
      const lead = pa < pb ? "a" : "b", gap = Math.abs(pa - pb);
      L.textContent = teamName(lead) + " lead by " + gap;
    }
  }
}

/* Every page loads this file, so only build what the current page has. */
loadLocal();
if ($("teams")) { buildTeams(); buildCard(); }
if ($("legs")) buildRoute();
if ($("dist-fact")) buildDistFact();
if ($("deck")) buildDeck();
if ($("reset")) renderReset(false);
update();

/* Load the shared game, then keep it fresh while the page is open. */
if ($("teams") || $("hands")) {
  pull(true);
  setInterval(() => { if (!document.hidden) pull(false); }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(false); });
}
