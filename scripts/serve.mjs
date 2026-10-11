// Tiny static file server for local development and the Playwright tests.
// Why not a package: no extra dependency, and students can read every line.
//
// Usage: node scripts/serve.mjs [--port 8080] [--base /typing-form-coach/]
// --base also serves the app under a subpath, the way GitHub Pages serves
// it at /<repo-name>/, so we can prove all asset paths are relative.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const port = Number(readArg("--port", "8080"));
const base = readArg("--base", "/");

// Turn a URL path into a file path inside ROOT, or null if it tries to escape.
function toFilePath(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0]);
  if (base !== "/" && path.startsWith(base)) path = "/" + path.slice(base.length);
  if (path.endsWith("/")) path += "index.html";
  const filePath = normalize(join(ROOT, path));
  return filePath.startsWith(ROOT) ? filePath : null;
}

const server = createServer(async (request, response) => {
  // Caching disabled so an edited file always shows up on reload.
  response.setHeader("Cache-Control", "no-store");
  const filePath = toFilePath(request.url);
  try {
    if (!filePath || !(await stat(filePath)).isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} at http://localhost:${port}${base}`);
});
