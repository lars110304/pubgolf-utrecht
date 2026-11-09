// Builds dist/index.html: one self-contained page with the CSS, markup and
// scripts from src/ inlined. No dependencies; needs Node 18 or newer.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => join(root, "src", f);
const dist = join(root, "dist");

// 1. Check the course before building.
const course = await readFile(src("course.js"), "utf8");
const ctx = {};
vm.runInNewContext(course + "\nthis.HOLES = HOLES; this.CITY = CITY;", ctx);
const holes = ctx.HOLES.filter((h) => !h.turn);
const problems = [];
if (holes.length !== 18) problems.push(`expected 18 holes, found ${holes.length}`);
holes.forEach((h, i) => { if (h.n !== i + 1) problems.push(`hole at position ${i + 1} is numbered ${h.n}`); });
const par = (list) => list.reduce((s, h) => s + h.par, 0);
const front = par(holes.slice(0, 9)), back = par(holes.slice(9));
if (front !== 36 || back !== 36) problems.push(`par should be 36 out and 36 in, got ${front} and ${back}`);
const ah = holes.filter((h) => h.kind === "ah").length;
if (ah !== 8) problems.push(`expected 8 Albert Heijn holes, found ${ah}`);
for (const h of ctx.HOLES) {
  for (const k of ["name", "addr", "lat", "lng", "t", "drink", "kind"]) if (h[k] == null) problems.push(`${h.name || "a stop"} is missing ${k}`);
  if (h.kind && !["pub", "ah"].includes(h.kind)) problems.push(`${h.name} has kind "${h.kind}"; use "pub" or "ah"`);
}
if (problems.length) {
  console.error("Course check failed:\n- " + problems.join("\n- "));
  process.exit(1);
}

// 2. Inline the sources into the template.
let html = await readFile(src("index.html"), "utf8");
const marker = /(?:\/\*|<!--) @inline ([\w.-]+) (?:\*\/|-->)/g;
const files = [...new Set([...html.matchAll(marker)].map((m) => m[1]))];
const contents = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(src(f), "utf8")])));
html = html.replace(marker, (_, f) => contents[f].trimEnd());

// 3. Make sure the script parses.
const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
new vm.Script(script, { filename: "index.html <script>" });

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(join(dist, "index.html"), html);
console.log(`Built dist/index.html for ${ctx.CITY}: 18 holes (${18 - ah} pubs, ${ah} Albert Heijns), par ${front + back}, ${(html.length / 1024).toFixed(1)} KB`);
