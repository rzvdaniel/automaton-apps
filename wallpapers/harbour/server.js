'use strict';

// Serves the wallpaper page. Nothing is stored.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.AUTOMATON_PORT || process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let relative;
  try { relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { relative = '\0'; }
  const file = path.resolve(PUBLIC_DIR, relative);
  try {
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new Error('outside');
    const body = await fs.readFile(file);
    // no-cache: the wallpaper picks up a new version the next time it loads
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Harbour wallpaper listening on port ${PORT}`));
