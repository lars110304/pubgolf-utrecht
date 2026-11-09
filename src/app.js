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

const blank = (name) => ({ name, p1: "", p2: "", scores: {}, powers: [] });
const state = { a: blank("Team Fairway"), b: blank("Team Bunker") };
const KEY = "pubgolf-" + CITY.toLowerCase() + "-v1";
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- Saving (this device only) ---------- */
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.a && s.b) { accept("a", s.a); accept("b", s.b); }
  } catch (e) {}
}
function accept(t, d) {
  state[t] = { name: typeof d.name === "string" ? d.name : state[t].name, p1: String(d.p1 || ""), p2: String(d.p2 || ""),
    scores: (d.scores && typeof d.scores === "object") ? { ...d.scores } : {},
    powers: Array.isArray(d.powers) ? d.powers.filter(p => p && POWER_BY_ID[p.id]).map(p => ({ id: p.id, used: !!p.used })) : [] };
}
function save() { saveLocal(); }
window.addEventListener("storage", e => { if (e.key === KEY) { loadLocal(); update(); } });

/* ---------- Scoring ---------- */
function total(t, list) { let s = 0; list.forEach(h => { const v = state[t].scores[h.n]; if (v) s += v; }); return s; }
function played(t) { return PLAY.filter(h => state[t].scores[h.n]); }
function toPar(t) { return played(t).reduce((s, h) => s + state[t].scores[h.n] - h.par, 0); }
const fmtPar = v => v === 0 ? "E" : v > 0 ? "+" + v : "−" + Math.abs(v);
const teamName = t => state[t].name.trim() || (t === "a" ? "Team A" : "Team B");
function markClass(v, par) {
  if (!v) return "mark empty";
  const d = v - par;
  return "mark " + (d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "" : d === 1 ? "bogey" : "double");
}
function step(t, n, delta) {
  const h = PLAY.find(x => x.n === n), cur = state[t].scores[n];
  let next = cur ? cur + delta : h.par + (delta > 0 ? 0 : -1);
  if (!cur && delta < 0 && next < 1) next = 1;
  if (next < 1) delete state[t].scores[n]; else state[t].scores[n] = Math.min(next, 30);
  save(t); update();
}

/* ---------- Build ---------- */
function mapsLink(h) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(h.name + ", " + h.addr + ", " + CITY) + "&query_place_id=" + h.pid;
}
function buildTeams() {
  const box = $("teams");
  ["a", "b"].forEach(t => {
    const c = el("div", "team");
    c.innerHTML = '<label for="name-' + t + '">Team<input class="tn" id="name-' + t + '" maxlength="24"></label>' +
      '<div class="row"><label for="p1-' + t + '">Player 1<input id="p1-' + t + '" maxlength="20" placeholder="Name"></label>' +
      '<label for="p2-' + t + '">Player 2<input id="p2-' + t + '" maxlength="20" placeholder="Name"></label></div>' +
      '<div class="board"><span class="total" id="tot-' + t + '"></span><span class="vs" id="vs-' + t + '"></span></div>';
    box.append(c);
    [["name-", "name"], ["p1-", "p1"], ["p2-", "p2"]].forEach(([pre, key]) => {
      c.querySelector("#" + pre + t).addEventListener("input", e => { state[t][key] = e.target.value; save(t); update(); });
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
  const spacer = el("td", "empty-col"); tr.append(spacer);
  const p = el("td", "par c", String(parOf(list))); tr.append(p);
  ["a", "b"].forEach(t => { const td = el("td", "score c", "–"); td.id = "sub-" + label + "-" + t; tr.append(td); });
  return tr;
}
function buildCard() {
  const tb = $("tbody");
  HOLES.forEach(h => {
    const tr = el("tr", h.kind === "ah" ? "ah" : "");
    const no = el("td", "no"); no.innerHTML = h.n + "<small>" + h.t + "</small>"; tr.append(no);
    const pub = el("td", "pub");
    const a = el("a", "", h.name); a.href = mapsLink(h); a.target = "_blank"; a.rel = "noopener";
    const top = el("div", "pubname"); top.append(a);
    if (h.kind === "ah") top.append(el("span", "tag", "Albert Heijn"));
    const d = el("div"); const dr = el("span", h.water ? "water" : "", h.drink); d.append(dr);
    if (h.unit === "bite") d.append(el("span", "unit", " · strokes are bites"));
    d.append(" · " + h.addr);
    pub.append(top, d); tr.append(pub);
    tr.append(el("td", "par c", String(h.par)));
    tr.append(stepperCell("a", h), stepperCell("b", h));
    tb.append(tr);
    if (h.n === 9) tb.append(subRow("OUT", FRONT));
    if (h.breakAfter) {
      const br = el("tr", "turn");
      const bno = el("td", "no"); bno.innerHTML = "⛳<small>break</small>"; br.append(bno);
      const txt = el("td", "pub"); txt.colSpan = 4; txt.append(el("div", "", h.breakAfter)); br.append(txt);
      tb.append(br);
    }
  });
  tb.append(subRow("IN", BACK), subRow("TOTAL", PLAY));
  tb.addEventListener("click", e => {
    const b = e.target.closest("button.st"); if (!b) return;
    step(b.dataset.t, +b.dataset.n, +b.dataset.d);
  });
}
function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r * Math.cos(a.lat * r);
  return R * Math.hypot(dLat, dLng);
}
function buildRoute() {
  const walkFactor = 1.3, mPerMin = 75;
  let tot = 0; const legs = $("legs");
  HOLES.forEach((h, i) => {
    const d = i ? dist(HOLES[i - 1], h) * walkFactor : 0; tot += d;
    const li = el("li", (h.n > 9 ? "back" : "") + (h.kind === "ah" ? " ah" : ""));
    li.append(el("b", "", String(h.n)), el("span", "", h.name),
      el("small", "", i ? Math.max(1, Math.round(d / mPerMin)) + " min walk" : "start"));
    legs.append(li);
  });
  $("dist-fact").innerHTML = "About <b>" + (tot / 1000).toFixed(1).replace(".", ",") + " km</b> on foot";

  const q = h => encodeURIComponent(h.name + ", " + h.addr + ", " + CITY);
  const dir = list => "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + q(list[0]) + "&destination=" + q(list[list.length - 1]) +
    "&waypoints=" + list.slice(1, -1).map(q).join("%7C");
  [["Front nine in Google Maps", HOLES.slice(0, 9)], ["Back nine in Google Maps", HOLES.slice(9)]].forEach(([label, list]) => {
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
  line(pts.slice(0, 9), "var(--fairway)");
  line(pts.slice(8), "var(--beer)", "9 7");
  pts.forEach(p => {
    const a = add("a", { href: mapsLink(p.h), target: "_blank", rel: "noopener" });
    add("title", {}, "Hole " + p.h.n + ": " + p.h.name, a);
    const css = p.h.n > 9 ? "var(--beer)" : "var(--fairway)", ring = "stroke:var(--surface);stroke-width:3";
    if (p.h.kind === "ah") add("rect", { x: p.x - 19, y: p.y - 19, width: 38, height: 38, rx: 6, style: "fill:var(--shop);" + ring }, null, a);
    else add("circle", { cx: p.x, cy: p.y, r: 20, style: "fill:" + css + ";" + ring }, null, a);
    add("text", { x: p.x, y: p.y + 7, "text-anchor": "middle", "font-size": 20, "font-weight": 700, style: "fill:var(--surface);font-family:var(--mono)" }, String(p.h.n), a);
  });
  $("map").append(svg);
}
function buildDeck() {
  POWERS.forEach(([, name, when, text]) => {
    const d = el("div"), dt = el("dt", "", name), dd = el("dd", "", text);
    dt.append(el("span", "", when)); d.append(dt, dd); $("deck").append(d);
  });
}
function renderHands() {
  const box = $("hands"); box.textContent = "";
  ["a", "b"].forEach(t => {
    const c = el("div", "hand"); c.append(el("h3", "", teamName(t)));
    const hand = state[t].powers;
    if (!hand.length) c.append(el("p", "nohand", "No cards yet. Draw two before hole 1."));
    else {
      const ul = el("ul", "chips");
      hand.forEach((p, i) => {
        const li = el("li", p.used ? "used" : ""), n = el("span", "pn", POWER_BY_ID[p.id][1]);
        n.title = POWER_BY_ID[p.id][3];
        const b = el("button", "", p.used ? "Undo" : "Mark used"); b.type = "button";
        b.addEventListener("click", () => { p.used = !p.used; save(t); renderHands(); });
        li.append(n, b); ul.append(li);
      });
      c.append(ul);
    }
    const held = new Set([...state.a.powers, ...state.b.powers].map(p => p.id));
    const left = POWERS.filter(p => !held.has(p[0]));
    const b = el("button", "btn", left.length ? "Draw a power-up" : "The deck is empty"); b.type = "button"; b.disabled = !left.length;
    b.addEventListener("click", () => {
      const pick = left[Math.floor(Math.random() * left.length)];
      state[t].powers.push({ id: pick[0], used: false }); save(t); renderHands();
    });
    const wrap = el("div"); wrap.append(b); c.append(wrap);
    box.append(c);
  });
}
function renderReset(asking) {
  const box = $("reset"); box.textContent = "";
  if (!asking) {
    const b = el("button", "btn", "Start a new game"); b.type = "button"; b.addEventListener("click", () => renderReset(true)); box.append(b);
  } else {
    box.append(el("span", "", "Erase all scores, names and power-ups?"));
    const y = el("button", "btn", "Erase and start over"), n = el("button", "btn", "Keep the game"); y.type = n.type = "button";
    y.addEventListener("click", () => {
      state.a = blank("Team Fairway"); state.b = blank("Team Bunker"); save("a"); save("b"); update(); renderReset(false);
    });
    n.addEventListener("click", () => renderReset(false));
    box.append(y, n);
  }
}
function update() {
  ["a", "b"].forEach(t => {
    [["name-", "name"], ["p1-", "p1"], ["p2-", "p2"]].forEach(([pre, key]) => { const i = $(pre + t); if (document.activeElement !== i && i.value !== state[t][key]) i.value = state[t][key]; });
    const n = played(t).length;
    $("tot-" + t).textContent = n ? total(t, PLAY) : "–";
    const v = $("vs-" + t), tp = toPar(t);
    v.textContent = n ? fmtPar(tp) + " thru " + n : "Par 72";
    v.className = "vs" + (n && tp < 0 ? " under" : "");
    $("th-" + t).textContent = teamName(t);
    PLAY.forEach(h => {
      const m = $("m-" + t + "-" + h.n), val = state[t].scores[h.n];
      m.textContent = val || "–"; m.className = markClass(val, h.par);
      const who = m.closest("td").querySelector(".who"); who.textContent = teamName(t);
    });
    [["OUT", FRONT], ["IN", BACK], ["TOTAL", PLAY]].forEach(([lab, list]) => {
      const any = list.some(h => state[t].scores[h.n]);
      $("sub-" + lab + "-" + t).textContent = any ? total(t, list) : "–";
    });
  });
  const na = played("a").length, nb = played("b").length, L = $("leader");
  if (!na && !nb) L.textContent = "Nobody has teed off yet.";
  else {
    const pa = toPar("a"), pb = toPar("b");
    if (pa === pb) L.textContent = "All square at " + fmtPar(pa) + ".";
    else {
      const lead = pa < pb ? "a" : "b", gap = Math.abs(pa - pb);
      L.textContent = teamName(lead) + " leads by " + gap + (gap === 1 ? " stroke." : " strokes.");
    }
  }
  renderHands();
}

loadLocal();
buildTeams(); buildCard(); buildRoute(); buildDeck(); renderReset(false); update();
