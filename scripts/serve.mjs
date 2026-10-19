// Zero-dependency static server for local previews and Playwright runs.
// Serves the repo root at http://localhost:4173 (PORT env to override), with Range
// support so <video> behaves like it does on a real host.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';

const ROOT = resolve(process.argv[2] || '.');
const PORT = +(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

// The request handler on its own, so other dev servers can serve the same files.
export function staticHandler(root = ROOT) {
  return (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let st;
    try {
      st = statSync(file);
      if (st.isDirectory()) {
        if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }).end(); return; }
        file = join(file, 'index.html');
        st = statSync(file);
      }
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : st.size - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    // Compress text like GitHub Pages / Cloudflare do, so local Lighthouse runs match production.
    if (/^(text\/|application\/json|image\/svg)/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(createGzip()).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };
}

export function serve(port = PORT, root = ROOT) {
  const server = createServer(staticHandler(root));
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve().then(() => console.log(`Serving ${ROOT} at http://localhost:${PORT}/ (documents app: http://localhost:${PORT}/invoices/)`));
}
