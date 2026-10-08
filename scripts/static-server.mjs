import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url)).replace(/[\\/]+$/, '');
const port = Number(process.env.PORT || 4173);
const host = '0.0.0.0';
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  return candidate === root || candidate.startsWith(root + sep) ? candidate : null;
}

function headers(type, cacheControl) {
  return {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  };
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  let filePath;
  try { filePath = safePath(req.url); } catch {
    res.writeHead(400, headers('text/plain; charset=utf-8', 'no-store'));
    res.end('Bad Request');
    return;
  }
  if (!filePath) {
    res.writeHead(400, headers('text/plain; charset=utf-8', 'no-store'));
    res.end('Bad Request');
    return;
  }

  // SPA fallback only for extensionless application routes.
  if (!(await fileExists(filePath)) && !extname(filePath)) filePath = join(root, 'index.html');
  if (!(await fileExists(filePath))) {
    res.writeHead(404, headers('text/plain; charset=utf-8', 'no-store'));
    res.end('Not Found');
    return;
  }

  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  const cache = extname(filePath) === '.html' || filePath.endsWith('env-config.js')
    ? 'no-store'
    : 'public, max-age=31536000, immutable';
  const info = await stat(filePath);
  res.writeHead(200, { ...headers(type, cache), 'Content-Length': info.size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => console.log(`[qaddaha] static server listening on http://${host}:${port}`));
