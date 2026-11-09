// Dev server: builds the site, serves dist/, rebuilds when anything in src/ changes and reloads open browsers.
//   npm run dev            -> http://localhost:5173 (or the next free port)
//   PORT=3000 npm run dev  -> custom port
// Listens on all interfaces so a phone on the same Wi-Fi can open the Network URL. No dependencies.
// The score API is PHP: when `php` is on the PATH, its built-in server runs on a side port and /api/ is forwarded to it.
import { createServer, request, get } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { build } from "./build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const wantedPort = Number(process.env.PORT) || 5173;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const clients = new Set();
const reloadSnippet = `<script>new EventSource("/__reload").onmessage=function(){location.reload()};</script>`;
const stamp = () => new Date().toLocaleTimeString();

async function rebuild() {
  try { console.log(`[${stamp()}] ${await build()}`); return true; }
  catch (e) { console.error(`[${stamp()}] Build failed:\n${e.message}`); return false; }
}

await rebuild();

let php = null, phpPort = 0, phpUp = false;
function startPhp(port) {
  phpPort = port + 1000;
  if (spawnSync("php", ["-v"], { stdio: "ignore" }).status !== 0) {
    console.log("php was not found on your PATH, so /api/ is unavailable: the scorecard will save on each device only.");
    return;
  }
  php = spawn("php", ["-S", `127.0.0.1:${phpPort}`, "-t", dist], { stdio: ["ignore", "ignore", "inherit"] });
  php.on("exit", (code) => { phpUp = false; if (code) console.error(`PHP server stopped (exit ${code}). Is port ${phpPort} already in use? /api/ is unavailable.`); });
  const stopPhp = () => php.kill();
  process.on("exit", stopPhp);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopPhp(); process.exit(0); });
  phpUp = true;
  setTimeout(checkApi, 1200);
}

/** Say right away whether the database behind /api/ works, instead of leaving phones to fail quietly. */
function checkApi() {
  get({ host: "127.0.0.1", port: phpPort, path: "/api/" }, (r) => {
    let body = "";
    r.on("data", (d) => (body += d)).on("end", () => {
      let why = ""; try { why = JSON.parse(body).error || ""; } catch { why = "unexpected reply"; }
      if (r.statusCode === 200) console.log("API check: OK, the database answered.");
      else if (why === "not configured") console.log("API check: the database is not configured. Fill in the DB_ values in .env, then run `npm run migrate`. Until then scores save per device.");
      else console.log(`API check: HTTP ${r.statusCode} (${why}). Check the DB_ values in .env and the PHP log above.`);
    });
  }).on("error", () => console.log("API check: PHP server did not answer."));
}

function proxyApi(req, res) {
  const fail = (code, msg) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify({ error: msg }));
  if (!php || !phpUp) { fail(503, "php not available"); return; }
  const up = request({ host: "127.0.0.1", port: phpPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${phpPort}` } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", () => fail(502, "php server not reachable"));
  req.pipe(up);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");

  if (pathname === "/api" || pathname.startsWith("/api/")) { proxyApi(req, res); return; }

  if (pathname === "/__reload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "") || "index.html";
  if (!extname(rel)) rel += ".html"; // /scorecard -> scorecard.html
  const file = join(dist, rel);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    if (rel.endsWith(".html")) body = body.toString("utf8").replace("</body>", `${reloadSnippet}\n</body>`);
    res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

// If the port is taken (often an older dev server that is still running), use the next free one and say so.
let tries = 10, port = wantedPort;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && tries-- > 0) {
    console.log(`Port ${port} is already in use (another dev server still running?). Trying ${port + 1}...`);
    server.listen(++port, "0.0.0.0");
  } else { console.error(err.code === "EADDRINUSE" ? "No free port found." : err); process.exit(1); }
});
server.on("listening", () => {
  console.log("\nPubgolf Utrecht dev server");
  console.log(`  Local:   http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) console.log(`  Network: http://${i.address}:${port}   <- open this on your phone (same Wi-Fi)`);
    }
  }
  console.log("\nWatching src/ for changes...\n");
  startPhp(port);
});
server.listen(port, "0.0.0.0");

let timer;
watch(join(root, "src"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (await rebuild()) for (const res of clients) res.write("data: reload\n\n");
  }, 80);
});
