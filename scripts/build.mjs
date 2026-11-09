// Builds the site into dist/: one .html file per page plus shared styles.css, nav.css,
// course.js and app.js. No dependencies; needs Node 18 or newer.
// Also imported by scripts/dev.mjs, which rebuilds whenever src/ changes.
import { readFile, writeFile, mkdir, rm, cp, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => join(root, "src", f);
const dist = join(root, "dist");

// Every page of the site, in nav order. `nav` is the label in the menu (the first page is the brand link).
// `scripts` lists which shared scripts a page needs; `standalone` pages are complete documents of their own.
const PAGES = [
  { file: "index.html", nav: "Pubgolf", title: "Pubgolf Utrecht", src: "home.html", scripts: ["course.js", "app.js"],
    desc: "An 18-hole, par 18 pubgolf course through central Utrecht for two teams of two, with scorecard, route, power-ups, rules and a plan for the day." },
  { file: "scorecard.html", nav: "Scorecard", title: "Scorecard · Pubgolf Utrecht", src: "scorecard.html", scripts: ["course.js", "app.js"],
    desc: "Count each team's sips hole by hole. Scores are saved on this device." },
  { file: "route.html", nav: "Route", title: "Route · Pubgolf Utrecht", src: "route.html", scripts: ["course.js", "app.js"],
    desc: "The map, the 18 stops in order and walking directions through central Utrecht." },
  { file: "powerups.html", nav: "Power-ups", title: "Power-ups · Pubgolf Utrecht", src: "powerups.html", scripts: ["course.js", "app.js"],
    desc: "Draw power-up cards and mark them used." },
  { file: "minigames.html", nav: "Minigames", title: "Minigames · Pubgolf Utrecht", src: "minigames.html", scripts: [],
    desc: "Minigames between the bars, and what they cost in strokes." },
  { file: "rules.html", nav: "Rules", title: "Rules · Pubgolf Utrecht", src: "rules.html", scripts: [],
    desc: "How a hole works, the Albert Heijn holes, free passes and penalties." },
  { file: "plan.html", nav: "Plan", title: "The plan · Pubgolf Utrecht", src: "plan.html", scripts: [],
    desc: "Timings for a Saturday, what to check before you go, pacing and backup pubs." },
  { file: "finger-chooser.html", nav: "Finger Chooser", title: "Finger Chooser · Pubgolf Utrecht", src: "finger-chooser.html", standalone: true,
    desc: "Everybody puts a finger on the screen and it picks one of you." }
];
const SHARED = ["styles.css", "nav.css", "course.js", "app.js"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// On phones the links fold into a menu behind a hamburger button; on wider screens they sit in a row.
const NAV_SCRIPT = `<script>(function(){var n=document.currentScript.previousElementSibling,b=n.querySelector(".nav-toggle");
function set(o){n.classList.toggle("open",o);b.setAttribute("aria-expanded",o);b.setAttribute("aria-label",o?"Close menu":"Open menu");}
b.addEventListener("click",function(){set(!n.classList.contains("open"));});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&n.classList.contains("open")){set(false);b.focus();}});
document.addEventListener("click",function(e){if(!n.contains(e.target))set(false);});})();</script>`;

function navHtml(current) {
  const [home, ...rest] = PAGES;
  const link = (p, cls) => `<a${cls ? ` class="${cls}"` : ""} href="${p.file}"${p.file === current ? ' aria-current="page"' : ""}>${p.nav}</a>`;
  const toggle = `<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu"><span></span><span></span><span></span></button>`;
  return `<nav class="site-nav" aria-label="Main"><div class="nav-in">${link(home, "brand")}${toggle}` +
    `<div class="nav-links" id="nav-links">${rest.map((p) => link(p)).join("")}</div></div></nav>\n${NAV_SCRIPT}`;
}

// 1. Check the course before building.
async function checkCourse() {
  const course = await readFile(src("course.js"), "utf8");
  const ctx = {};
  vm.runInNewContext(course + "\nthis.HOLES = HOLES; this.CITY = CITY;", ctx);
  const holes = ctx.HOLES.filter((h) => !h.turn);
  const problems = [];
  if (holes.length !== 18) problems.push(`expected 18 holes, found ${holes.length}`);
  holes.forEach((h, i) => { if (h.n !== i + 1) problems.push(`hole at position ${i + 1} is numbered ${h.n}`); });
  const par = (list) => list.reduce((s, h) => s + h.par, 0);
  const front = par(holes.slice(0, 9)), back = par(holes.slice(9));
  if (holes.some((h) => h.par !== 1)) problems.push(`every hole should be par 1, found ${holes.filter((h) => h.par !== 1).map((h) => h.n).join(", ")}`);
  if (front !== 9 || back !== 9) problems.push(`par should be 9 out and 9 in, got ${front} and ${back}`);
  const ah = holes.filter((h) => h.kind === "ah").length;
  if (ah !== 8) problems.push(`expected 8 Albert Heijn holes, found ${ah}`);
  for (const h of ctx.HOLES) {
    for (const k of ["name", "addr", "lat", "lng", "drink", "kind"]) if (h[k] == null) problems.push(`${h.name || "a stop"} is missing ${k}`);
    if (h.kind && !["pub", "ah"].includes(h.kind)) problems.push(`${h.name} has kind "${h.kind}"; use "pub" or "ah"`);
  }
  if (problems.length) throw new Error("Course check failed:\n- " + problems.join("\n- "));
  return { city: ctx.CITY, ah, par: front + back };
}

export async function build() {
  const info = await checkCourse();
  const layout = await readFile(src("layout.html"), "utf8");
  const out = new Map();

  // 2. Render every page.
  for (const p of PAGES) {
    const body = await readFile(src(join("pages", p.src)), "utf8");
    let html;
    if (p.standalone) {
      html = body.replace("<!-- @nav -->", navHtml(p.file));
      if (!html.includes('class="site-nav"')) throw new Error(`${p.src} needs a <!-- @nav --> marker`);
    } else {
      const scripts = p.scripts.map((s) => `<script src="${s}"></script>`).join("\n");
      html = layout
        .replace("{{title}}", () => esc(p.title))
        .replace("{{description}}", () => esc(p.desc))
        .replace("{{nav}}", () => navHtml(p.file))
        .replace("{{content}}", () => (body.includes("<main") ? body.trimEnd() : `<main class="wrap">\n${body.trimEnd()}\n</main>`))
        .replace("{{scripts}}", () => scripts);
    }
    out.set(p.file, html);
  }
  for (const f of SHARED) out.set(f, await readFile(src(f), "utf8"));

  // 3. Make sure every script parses and every local link points at a page we built.
  for (const [name, text] of out) {
    if (name.endsWith(".js")) new vm.Script(text, { filename: name });
    if (name.endsWith(".html")) {
      for (const m of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1], { filename: `${name} <script>` });
      for (const m of text.matchAll(/(?:href|src)="([^":#?]+\.(?:html|css|js))"/g)) {
        if (!out.has(m[1])) throw new Error(`${name} links to ${m[1]}, which is not part of the build`);
      }
    }
  }

  // Empty dist/ rather than deleting it: the dev server's PHP process may be sitting in that folder.
  await mkdir(dist, { recursive: true });
  for (const entry of await readdir(dist)) await rm(join(dist, entry), { recursive: true, force: true });
  for (const [name, text] of out) await writeFile(join(dist, name), text);
  // The PHP score API (api/index.php, schema.sql, .htaccess); the same .htaccess also guards a .env placed next to the pages.
  await cp(src("api"), join(dist, "api"), { recursive: true });
  await cp(src(join("api", ".htaccess")), join(dist, ".htaccess"));
  return `Built ${PAGES.length} pages into dist/ for ${info.city}: 18 holes (${18 - info.ah} pubs, ${info.ah} Albert Heijns), par ${info.par}`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(await build()); }
  catch (e) { console.error(e.message); process.exit(1); }
}
