'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const farewell = require('./farewell');
const { RoomRegistry, GameError } = require('./game');

const PORT = Number(process.env.AUTOMATON_PORT || process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 16 * 1024;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const rooms = new RoomRegistry(farewell);
setInterval(() => rooms.tick(Date.now()), 500);

function send(res, status, body, headers) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new GameError(413, 'Request too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new GameError(400, 'Invalid JSON.');
  }
}

function authenticate(req, room) {
  const player = room.playerByToken(req.headers['x-player-token']);
  if (!player) throw new GameError(401, 'You are not in this room yet.');
  return player;
}

async function handleApi(req, res, url) {
  const now = Date.now();
  const [, , resource, code, action] = url.pathname.split('/');

  if (resource === 'farewell-preview' && req.method === 'GET') {
    const message = farewell.preview(url.searchParams.get('key'));
    if (!message) throw new GameError(404, 'Not found.');
    return sendJson(res, 200, { message });
  }
  if (resource !== 'rooms') throw new GameError(404, 'Not found.');

  if (!code && req.method === 'POST') {
    const { room, player } = rooms.create(await readJson(req), now);
    return sendJson(res, 201, { code: room.code, token: player.token });
  }

  const room = rooms.get(code);
  if (!action && req.method === 'GET') {
    return sendJson(res, 200, { code: room.code, hasPassword: Boolean(room.password), players: room.players.size });
  }
  if (action === 'join' && req.method === 'POST') {
    const body = await readJson(req);
    const player = room.join(body.name, body.password, now);
    return sendJson(res, 201, { code: room.code, token: player.token });
  }
  if (action === 'state' && req.method === 'GET') {
    const player = authenticate(req, room);
    room.seen(player, now);
    return sendJson(res, 200, room.view(player, now));
  }
  if (action === 'actions' && req.method === 'POST') {
    const player = authenticate(req, room);
    room.seen(player, now);
    room.act(player, await readJson(req), now);
    return sendJson(res, 200, room.view(player, now));
  }
  throw new GameError(404, 'Not found.');
}

async function serveStatic(req, res, url) {
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new GameError(404, 'Not found.');
  try {
    const body = await fs.readFile(file);
    send(res, 200, req.method === 'HEAD' ? undefined : body, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
  } catch {
    throw new GameError(404, 'Not found.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/health') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new GameError(405, 'Method not allowed.');
    return await serveStatic(req, res, url);
  } catch (error) {
    if (!(error instanceof GameError)) console.error(error);
    const status = error instanceof GameError ? error.status : 500;
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Untranslatable listening on port ${PORT}`));
