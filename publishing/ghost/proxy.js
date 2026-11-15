// Runs Ghost on a private port and forwards the app port to it with X-Forwarded-Proto: https.
// Ghost redirects every plain-http request to its https url; Automaton's health probe and its proxy reach the
// container over http, so without the header Ghost answers 301 forever. Exits when Ghost exits.
const http = require('http');
const { spawn } = require('child_process');

const publicPort = Number(process.env.AUTOMATON_PORT);
const ghostPort = Number(process.env.GHOST_INTERNAL_PORT || 2369);
const secure = (process.env.url || '').startsWith('https://');

const ghost = spawn('docker-entrypoint.sh', ['node', 'current/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, server__port: String(ghostPort), server__host: '127.0.0.1' },
});
ghost.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => ghost.kill(sig));

http.createServer((req, res) => {
  const headers = { ...req.headers };
  if (secure) headers['x-forwarded-proto'] = 'https';
  const up = http.request({ host: '127.0.0.1', port: ghostPort, path: req.url, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end('Ghost is starting'); });
  req.pipe(up);
}).listen(publicPort, '0.0.0.0');
