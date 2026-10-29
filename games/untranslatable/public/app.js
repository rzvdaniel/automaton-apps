'use strict';

const POLL_MS = 1000;
const RETRY_MS = 2000;
const REVEAL_STEP_MS = 1100;
const SEAL_PAUSE_MS = 900;
const FAREWELL_DELAY_MS = 2800;
const THANKS = ['Tak', 'Mulțumesc', 'Danke', 'Merci', 'Gracias', 'Obrigado', 'Grazie', 'Dziękuję', 'Kiitos', 'ありがとう',
  '谢谢', 'Köszönöm', 'Takk', 'Tack', 'Dank je', 'Děkuji', 'Ευχαριστώ', 'Teşekkürler', 'Спасибо', 'شكرا', 'Asante',
  'Terima kasih', '감사합니다', 'Diolch', 'Hvala', 'Aitäh', 'Paldies', 'Ačiū', 'Mahalo', 'Thank you'];

const app = document.getElementById('app');
const badge = document.getElementById('room-badge');
const toastEl = document.getElementById('toast');

const session = {
  code: null,
  token: null,
  state: null,
  screen: null,
  deadlineAt: null,
  revealDoneAt: 0,
  farewellShown: false,
  pollTimer: null
};

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
};
const tokenKey = code => `untranslatable:token:${code}`;
const NAME_KEY = 'untranslatable:name';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// Escapes text, then turns *phrase* into <strong>phrase</strong>.
function emphasis(value) {
  return esc(value).replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(session.token ? { 'X-Player-Token': session.token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: response.status });
  return data;
}

function shareLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

// ---------- Drawings ----------

function waxSeal(letter, className = 'seal') {
  const points = [];
  for (let i = 0; i < 44; i++) {
    const angle = (i / 44) * Math.PI * 2;
    const radius = 52 + Math.sin(i * 2.3) * 2.6 + Math.cos(i * 5.1) * 1.8;
    points.push(`${(60 + radius * Math.cos(angle)).toFixed(1)},${(60 + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `
    <svg class="${className}" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="wax-${className}" cx="38%" cy="32%" r="75%">
          <stop offset="0" stop-color="#d4503f"/><stop offset=".55" stop-color="#a02a1b"/><stop offset="1" stop-color="#5e140b"/>
        </radialGradient>
      </defs>
      <polygon points="${points.join(' ')}" fill="url(#wax-${className})" stroke="#5e140b" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="60" cy="60" r="33" fill="none" stroke="#5e140b" stroke-width="3.5" opacity=".55"/>
      <circle cx="60" cy="60" r="27" fill="none" stroke="#f0a090" stroke-width="1" opacity=".35"/>
      <text x="60" y="75" text-anchor="middle" font-family="'Almendra', serif" font-weight="700" font-size="40" fill="#5e140b" opacity=".9">${esc(letter)}</text>
      <ellipse cx="44" cy="38" rx="14" ry="7" fill="#fff" opacity=".14" transform="rotate(-30 44 38)"/>
    </svg>`;
}

const QUILL = `
  <svg class="quill" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M57 4C39 8 24 22 17 41l-5 16 3 1 6-13c14-4 30-17 36-41z" fill="#f7efd9" stroke="#2b1d0e" stroke-width="2" stroke-linejoin="round"/>
    <path d="M17 41C26 30 36 19 49 11M24 34l-5-2M29 28l-5-3M35 22l-4-4M41 17l-3-4" stroke="#2b1d0e" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  </svg>`;

const BOOK = `
  <svg class="book" viewBox="0 0 340 230" aria-hidden="true">
    <ellipse cx="170" cy="212" rx="150" ry="12" fill="#000" opacity=".35"/>
    <path d="M14 62Q170 36 326 62L326 200Q170 178 14 200Z" fill="#5e140b"/>
    <path d="M14 62Q170 36 326 62" fill="none" stroke="#d9b25a" stroke-width="2" opacity=".6"/>
    <path d="M26 58Q98 40 168 60L168 192Q98 174 26 190Z" fill="#f2e6c8" stroke="#b9a274"/>
    <path d="M172 60Q242 40 314 58L314 190Q242 174 172 192Z" fill="#ead9b0" stroke="#b9a274"/>
    <path d="M168 60Q170 120 168 192M172 60Q170 120 172 192" stroke="#b9a274" fill="none"/>
    <rect x="40" y="72" width="30" height="30" rx="2" fill="#9e2a1c" stroke="#d9b25a" stroke-width="2"/>
    <text x="55" y="95" text-anchor="middle" font-family="'Cinzel Decorative', serif" font-size="22" fill="#f2d48a">U</text>
    <g stroke="#5e4a33" stroke-width="2" stroke-linecap="round" opacity=".55">
      <path d="M78 78h74M78 88h70M78 98h74M40 112h112M40 122h106M40 132h112M40 142h96M40 152h110M40 162h84"/>
      <path d="M188 74h110M188 84h104M188 94h110M188 104h80"/>
      <path d="M188 136h110M188 146h100M188 156h108M188 166h70"/>
    </g>
    <path d="M226 112c8-6 18-6 26 0" stroke="#9e2a1c" stroke-width="2" fill="none"/>
    <text x="240" y="128" text-anchor="middle" font-family="serif" font-size="14" fill="#9e2a1c">❦</text>
    <path d="M296 196c-4-18 2-30 14-30s18 12 14 30z" fill="#2b1d0e"/>
    <rect x="300" y="160" width="20" height="8" rx="2" fill="#3d2b18"/>
    <path d="M330 18C300 40 280 80 307 168" stroke="#2b1d0e" stroke-width="2" fill="none"/>
    <path d="M330 18c-22 4-40 30-38 70 0 22 8 50 15 80 2-36 8-64 18-92 8-22 8-42 5-58z" fill="#f7efd9" stroke="#2b1d0e" stroke-width="1.6"/>
    <path d="M318 40l-14 6M314 60l-16 6M310 80l-16 6M306 100l-12 6" stroke="#2b1d0e" stroke-width="1" opacity=".6"/>
  </svg>`;

function laurel() {
  const leaves = [];
  // Leaves run from the bottom of the wreath up the left side; the right side mirrors them.
  for (let i = 0; i < 8; i++) {
    const degrees = 105 + i * 20;
    const angle = degrees * Math.PI / 180;
    const x = 60 + 48 * Math.cos(angle);
    const y = 60 + 48 * Math.sin(angle);
    const rotation = degrees + 90 + 25;
    leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4" transform="rotate(${rotation} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    const mirrorX = 120 - x;
    leaves.push(`<ellipse cx="${mirrorX.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4" transform="rotate(${180 - rotation} ${mirrorX.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  return `<svg class="laurel" viewBox="0 0 120 120" aria-hidden="true"><g fill="#b8892b" stroke="#7a5a18" stroke-width=".8">${leaves.join('')}</g></svg>`;
}

function candle() {
  return `
    <span class="candle" aria-hidden="true">
      <span class="wax" data-wax><span class="flame"></span><span class="wick"></span></span>
      <span class="holder"></span>
    </span>`;
}

// ---------- Entry screens ----------

function howToPlay() {
  return `
    <section class="how">
      <h2 class="ornament">How to play</h2>
      <ol>
        <li><span class="numeral">I</span><p><strong>A real word appears</strong>, one that has no neat English translation.</p></li>
        <li><span class="numeral">II</span><p><strong>Everyone invents a fake meaning</strong> that sounds convincing.</p></li>
        <li><span class="numeral">III</span><p><strong>Find the truth</strong> among the fakes. Correct guess: <b>+2</b>. Each colleague you fool: <b>+1</b>.</p></li>
      </ol>
    </section>`;
}

function nameField() {
  return `<label><span>Your name</span><input name="name" maxlength="24" required autocomplete="nickname" value="${esc(storage.get(NAME_KEY) ?? '')}"></label>`;
}

function renderHome() {
  session.screen = 'home';
  badge.innerHTML = '';
  app.innerHTML = `
    <div class="home">
      <section class="hero">
        ${BOOK}
        <p class="eyebrow">A bluffing game for word lovers</p>
        <h1>Some words refuse <em>to be translated.</em></h1>
        <p class="lead">Invent a meaning convincing enough to fool your colleagues, then find the truth among the fakes.</p>
      </section>
      <section class="panels">
        <form class="parchment form" id="create-form">
          <h2>Host a room</h2>
          ${nameField()}
          <label><span>Room password <span class="hint">optional</span></span><input name="password" maxlength="40" autocomplete="off"></label>
          <button class="btn primary">Create room</button>
        </form>
        <form class="parchment form" id="join-form">
          <h2>Join a room</h2>
          <label><span>Room code</span><input name="code" maxlength="4" required autocomplete="off" class="code-input" placeholder="ABCD"></label>
          ${nameField()}
          <label><span>Room password <span class="hint">if the host set one</span></span><input name="password" maxlength="40" autocomplete="off"></label>
          <button class="btn">Join room</button>
        </form>
      </section>
    </div>
    ${howToPlay()}`;

  bindForm('create-form', data => api('POST', '/api/rooms', data));
  bindForm('join-form', data => api('POST', `/api/rooms/${encodeURIComponent(data.code.trim().toUpperCase())}/join`, data));
}

async function renderJoin(code) {
  session.screen = 'join';
  badge.innerHTML = '';
  let info;
  try {
    info = await api('GET', `/api/rooms/${encodeURIComponent(code)}`);
  } catch (error) {
    toast(error.message);
    history.replaceState(null, '', location.pathname);
    return renderHome();
  }
  app.innerHTML = `
    <div class="home">
      <section class="hero">
        ${BOOK}
        <p class="eyebrow">You're invited</p>
        <h1>Join room <em>${esc(info.code)}</em></h1>
        <p class="lead">${info.players} ${info.players === 1 ? 'player is' : 'players are'} already gathered in the scriptorium.</p>
      </section>
      <section class="panels single">
        <form class="parchment form" id="join-form">
          <h2>Take your seat</h2>
          <input type="hidden" name="code" value="${esc(info.code)}">
          ${nameField()}
          ${info.hasPassword ? '<label><span>Room password</span><input name="password" maxlength="40" required autocomplete="off"></label>' : ''}
          <button class="btn primary">Join the game</button>
        </form>
      </section>
    </div>
    ${howToPlay()}`;
  bindForm('join-form', data => api('POST', `/api/rooms/${encodeURIComponent(info.code)}/join`, data));
  app.querySelector('input[name="name"]').focus();
}

function bindForm(id, submit) {
  const form = document.getElementById(id);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      storage.set(NAME_KEY, data.name.trim());
      const { code, token } = await submit(data);
      storage.set(tokenKey(code), token);
      enterRoom(code, token);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });
}

function enterRoom(code, token) {
  session.code = code;
  session.token = token;
  session.screen = null;
  history.replaceState(null, '', `?room=${code}`);
  poll();
}

// ---------- Polling ----------

async function poll() {
  clearTimeout(session.pollTimer);
  try {
    const state = await api('GET', `/api/rooms/${session.code}/state`);
    document.body.classList.remove('offline');
    apply(state);
    session.pollTimer = setTimeout(poll, POLL_MS);
  } catch (error) {
    if (error.status === 401 || error.status === 404) {
      storage.remove(tokenKey(session.code));
      session.token = null;
      if (error.status === 404) {
        toast('That room has closed. Start a new one!');
        history.replaceState(null, '', location.pathname);
        return renderHome();
      }
      return renderJoin(session.code);
    }
    document.body.classList.add('offline');
    session.pollTimer = setTimeout(poll, RETRY_MS);
  }
}

async function act(type, extra = {}) {
  try {
    apply(await api('POST', `/api/rooms/${session.code}/actions`, { type, ...extra }));
  } catch (error) {
    toast(error.message);
  }
}

function apply(state) {
  session.state = state;
  const screen = `${state.phase}:${state.game}:${state.round}`;

  if (state.remainingMs === null) {
    session.deadlineAt = null;
  } else {
    const deadline = performance.now() + state.remainingMs;
    // Ignore small network jitter so the countdown does not jump around.
    if (session.deadlineAt === null || Math.abs(deadline - session.deadlineAt) > 1500 || screen !== session.screen) {
      session.deadlineAt = deadline;
    }
  }

  renderBadge(state);
  if (screen !== session.screen) {
    session.screen = screen;
    RENDERERS[state.phase](state);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    update(state);
  }
  tickTimer();
}

// ---------- Shared pieces ----------

function playerMap(state) {
  return new Map(state.players.map(player => [player.id, player]));
}

function isHost(state) {
  return state.you === state.hostId;
}

function hostName(state) {
  return playerMap(state).get(state.hostId)?.name ?? 'the host';
}

function avatar(player) {
  const initial = [...(player?.name ?? '?')][0].toUpperCase();
  return `<span class="shield" style="--c:${esc(player?.color ?? '#5e4a33')}" aria-hidden="true">${esc(initial)}</span>`;
}

function chip(player) {
  return `<span class="chip">${avatar(player)}${esc(player?.name ?? 'Someone')}</span>`;
}

function renderBadge(state) {
  badge.innerHTML = `<span class="room-code" title="Room code">Room <strong>${esc(state.code)}</strong>${state.hasPassword ? ' 🔒' : ''}</span>`;
}

// While the reveal animation runs, scores show their pre-round values so the
// sidebar does not spoil who found the truth.
function displayedScore(state, player) {
  const hidden = state.phase === 'reveal' && performance.now() < session.revealDoneAt;
  return hidden ? player.score - (state.reveal.deltas[player.id] ?? 0) : player.score;
}

function rosterHtml(state) {
  const scored = state.phase === 'reveal' || state.phase === 'final';
  const revealing = state.phase === 'reveal' && performance.now() < session.revealDoneAt;
  const players = scored
    ? [...state.players].sort((a, b) => displayedScore(state, b) - displayedScore(state, a))
    : state.players;
  const deltas = state.reveal?.deltas ?? {};
  return players.map(player => {
    let right = '';
    if (state.phase === 'write' || state.phase === 'vote') {
      right = player.done ? '<span class="tick" title="Done">✓</span>' : '<span class="dots" title="Thinking">···</span>';
    } else if (scored) {
      const delta = deltas[player.id];
      right = `${state.phase === 'reveal' && delta && !revealing ? `<span class="delta">+${delta}</span>` : ''}<span class="score">${displayedScore(state, player)}</span>`;
    }
    return `
      <li class="${player.online ? '' : 'offline'} ${player.done ? 'done' : ''}">
        ${avatar(player)}
        <span class="name">${esc(player.name)}${player.id === state.you ? ' <span class="you">you</span>' : ''}${player.id === state.hostId ? ' <span class="crown" title="Host">♛</span>' : ''}</span>
        ${right}
      </li>`;
  }).join('');
}

function progressText(state) {
  const online = state.players.filter(player => player.online);
  if (state.phase !== 'write' && state.phase !== 'vote') return `${online.length} online`;
  return `${online.filter(player => player.done).length} of ${online.length} ready`;
}

function sidebar(state, title) {
  return `
    <aside class="margin parchment">
      <div class="margin-head">
        <h3>${title}</h3>
        <span id="progress-text">${progressText(state)}</span>
      </div>
      <ul class="roster" id="roster">${rosterHtml(state)}</ul>
    </aside>`;
}

function layout(state, page, sidebarTitle) {
  return `
    <div class="layout">
      <section class="page parchment">${page}</section>
      ${sidebar(state, sidebarTitle)}
    </div>`;
}

function roundBar(state, timed = true) {
  return `
    <div class="roundbar">
      <span class="pill">Word ${state.round} of ${state.rounds}</span>
      ${timed ? `<span class="clock">${candle()}<span class="timer" data-timer></span></span>` : ''}
    </div>`;
}

function wordCard(word, compact = false) {
  const letters = [...word.word];
  return `
    <div class="word ${compact ? 'compact' : ''}">
      <span class="lang">~ ${esc(word.language)} ~</span>
      <h2 class="the-word"><span class="initial">${esc(letters[0])}</span>${esc(letters.slice(1).join(''))}</h2>
    </div>`;
}

function hostSkip(state) {
  return isHost(state) ? '<button class="btn ghost small" data-act="skip">Stop waiting and move on</button>' : '';
}

function update(state) {
  const roster = document.getElementById('roster');
  if (roster) roster.innerHTML = rosterHtml(state);
  const progress = document.getElementById('progress-text');
  if (progress) progress.textContent = progressText(state);
  if (state.phase === 'lobby') renderLobbyControls(state);
  if (state.phase === 'vote') markVote(state.yourVote);
}

// ---------- Phases ----------

function renderLobby(state) {
  app.innerHTML = `
    ${layout(state, `
      <p class="eyebrow">Lobby</p>
      <h2 class="title">The Scriptorium</h2>
      <p class="muted">Share this link with your team. Everyone joins with their name${state.hasPassword ? ' and the room password' : ''}.</p>
      <div class="share">
        <code>${esc(shareLink(state.code))}</code>
        <button class="btn small" data-copy>Copy link</button>
      </div>
      <div id="lobby-controls"></div>
    `, 'Players')}
    ${howToPlay()}`;
  session.lobbyControls = null;
  renderLobbyControls(state);
}

function renderLobbyControls(state) {
  const container = document.getElementById('lobby-controls');
  const online = state.players.filter(player => player.online).length;
  const key = `${isHost(state)}:${state.settings.rounds}:${state.settings.writeSeconds}:${online}:${state.hostId}`;
  if (!container || session.lobbyControls === key) return;
  session.lobbyControls = key;

  if (!isHost(state)) {
    container.innerHTML = `<p class="waiting">Waiting for ${esc(hostName(state))} to start: ${state.settings.rounds} words, ${state.settings.writeSeconds} seconds to write.</p>`;
    return;
  }
  container.innerHTML = `
    ${settingsHtml(state)}
    <button class="btn primary big" data-act="start" ${online < 2 ? 'disabled' : ''}>Start the game</button>
    ${online < 2 ? '<p class="muted center">You need at least 2 players. 3 or more is best.</p>' : ''}`;
}

function settingsHtml(state) {
  const option = (value, current, label) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
  return `
    <div class="settings">
      <label><span>Words</span>
        <select data-setting="rounds">${[5, 7, 9].map(v => option(v, state.settings.rounds, `${v} words`)).join('')}</select>
      </label>
      <label><span>Time to write</span>
        <select data-setting="writeSeconds">${[45, 60, 90].map(v => option(v, state.settings.writeSeconds, `${v} seconds`)).join('')}</select>
      </label>
    </div>`;
}

function renderWrite(state) {
  app.innerHTML = layout(state, `
    ${roundBar(state)}
    ${wordCard(state.word)}
    <form id="write-form" class="write">
      <label for="definition" class="prompt">${QUILL}<span>What could it mean? <span class="muted">Write a fake meaning that sounds real.</span></span></label>
      <textarea id="definition" maxlength="140" rows="3" placeholder="The quiet joy of…">${esc(state.yourSubmission)}</textarea>
      <div class="row">
        <span class="counter" id="counter"></span>
        <button class="btn primary" id="submit-button">${state.yourSubmission ? 'Update my fake' : 'Submit my fake'}</button>
      </div>
      <p class="status" id="submit-status">${state.yourSubmission ? '✓ Submitted. You can still edit it until time runs out.' : ''}</p>
    </form>
    <p class="tip">Already know this word? Keep it to yourself and write a decoy anyway.</p>
    ${hostSkip(state)}
  `, 'Players');

  const form = document.getElementById('write-form');
  const textarea = document.getElementById('definition');
  const counter = document.getElementById('counter');
  const updateCounter = () => { counter.textContent = `${textarea.value.length}/140`; };
  updateCounter();
  textarea.addEventListener('input', updateCounter);
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!textarea.value.trim()) return toast('Write something first.');
    await act('submit', { text: textarea.value });
    if (session.state?.phase === 'write') {
      document.getElementById('submit-status').textContent = '✓ Submitted. You can still edit it until time runs out.';
      document.getElementById('submit-button').textContent = 'Update my fake';
    }
  });
  if (!state.yourSubmission) textarea.focus();
}

function renderVote(state) {
  app.innerHTML = layout(state, `
    ${roundBar(state)}
    ${wordCard(state.word, true)}
    <p class="prompt center">Which one is the <em>real</em> meaning?</p>
    <div class="options">
      ${state.options.map((option, index) => `
        <button class="option ${option.mine ? 'mine' : ''}" data-vote="${esc(option.id)}" ${option.mine ? 'disabled' : ''} style="animation-delay:${index * 60}ms">
          <span class="letter">${String.fromCharCode(65 + index)}</span>
          <span class="text">${esc(option.text)}</span>
          ${option.mine ? '<span class="tag">your fake</span>' : ''}
        </button>`).join('')}
    </div>
    ${hostSkip(state)}
  `, 'Votes');
  markVote(state.yourVote);
}

function markVote(optionId) {
  for (const button of app.querySelectorAll('[data-vote]')) {
    button.classList.toggle('chosen', button.dataset.vote === optionId);
  }
}

function votersHtml(result, players) {
  if (!result.voterIds.length) return `<span class="muted">${result.real ? 'Nobody found it' : 'Fooled nobody'}</span>`;
  return `<span class="muted">${result.real ? 'Found by' : 'Fooled'}</span> ${result.voterIds.map(id => chip(players.get(id))).join('')}`;
}

function renderReveal(state) {
  const players = playerMap(state);
  const truth = state.reveal.results.find(result => result.real);
  const fakes = state.reveal.results
    .filter(result => !result.real)
    .sort((a, b) => a.voterIds.length - b.voterIds.length);
  const sealBreaksAt = fakes.length * REVEAL_STEP_MS + SEAL_PAUSE_MS;
  const last = state.round >= state.rounds;
  session.revealDoneAt = performance.now() + sealBreaksAt + 600;
  setTimeout(() => { if (session.state?.phase === 'reveal') update(session.state); }, sealBreaksAt + 700);

  app.innerHTML = layout(state, `
    ${roundBar(state, false)}
    ${wordCard(state.word, true)}
    <div class="truth" style="--break:${sealBreaksAt}ms">
      <div class="sealed">
        ${waxSeal('V', 'seal-big')}
        <p>The true meaning is sealed…</p>
      </div>
      <div class="truth-body">
        <p class="truth-label">✠ The true meaning</p>
        <p class="def">${esc(truth.text)}</p>
        <div class="meta">
          <span class="voters">${votersHtml(truth, players)}</span>
          ${truth.voterIds.length ? '<span class="points">+2 each</span>' : ''}
        </div>
      </div>
    </div>
    ${fakes.length ? `<h3 class="section ornament">The fakes</h3>` : ''}
    <ol class="fakes">
      ${fakes.map((result, index) => `
        <li class="slip" style="animation-delay:${index * REVEAL_STEP_MS}ms">
          <p class="def">${esc(result.text)}</p>
          <div class="meta">
            <span class="by">Fake by ${chip(players.get(result.authorId))}</span>
            <span class="voters">${votersHtml(result, players)}</span>
            ${result.voterIds.length ? `<span class="points">+${result.voterIds.length}</span>` : ''}
          </div>
        </li>`).join('')}
    </ol>
    <div class="actions fade-in" style="animation-delay:${sealBreaksAt + 900}ms">
      ${isHost(state)
        ? `<button class="btn primary big" data-act="next">${last ? 'See the final results' : 'Next word'}</button>`
        : `<p class="waiting">Waiting for ${esc(hostName(state))} to continue…</p>`}
    </div>
  `, 'Scores');

  if (state.farewell && !session.farewellShown) {
    session.farewellShown = true;
    setTimeout(() => showFarewell(state.farewell), sealBreaksAt + FAREWELL_DELAY_MS);
  }
}

function renderFinal(state) {
  const players = playerMap(state);
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const podium = ranking.slice(0, 3);
  const places = ['first', 'second', 'third'];
  const tie = podium[1] && podium[1].score === podium[0].score;

  app.innerHTML = layout(state, `
    <p class="eyebrow center">Game over</p>
    <h2 class="title center">${tie ? 'A tie at the top!' : `${esc(podium[0]?.name ?? 'Nobody')} wins!`}</h2>
    <div class="podium">
      ${[podium[1], podium[0], podium[2]].map(player => player ? `
        <div class="step ${places[ranking.indexOf(player)]}">
          <div class="crest">${ranking.indexOf(player) === 0 ? laurel() : ''}${avatar(player)}</div>
          <span class="name">${esc(player.name)}</span>
          <span class="score">${player.score} points</span>
          <div class="block">${['I', 'II', 'III'][ranking.indexOf(player)]}</div>
        </div>` : '').join('')}
    </div>
    ${state.awards.length ? `
      <div class="awards">
        ${state.awards.map(award => `
          <div class="award">
            <span class="emoji" aria-hidden="true">${award.emoji}</span>
            <div><strong>${esc(award.title)}</strong><p>${chip(players.get(award.playerId))} ${esc(award.note)}</p></div>
          </div>`).join('')}
      </div>` : ''}
    <div class="actions">
      ${isHost(state)
        ? `${settingsHtml(state)}<button class="btn primary big" data-act="start">Play again with new words</button>`
        : `<p class="waiting">${esc(hostName(state))} can start another game with new words.</p>`}
    </div>
  `, 'Final scores');
}

const RENDERERS = { lobby: renderLobby, write: renderWrite, vote: renderVote, reveal: renderReveal, final: renderFinal };

// ---------- Timer ----------

function tickTimer() {
  const state = session.state;
  if (!state || session.deadlineAt === null) return;
  const remaining = Math.max(0, session.deadlineAt - performance.now());
  const seconds = Math.ceil(remaining / 1000);
  for (const el of document.querySelectorAll('[data-timer]')) {
    el.textContent = `${seconds}s`;
    el.classList.toggle('urgent', seconds <= 10);
  }
  for (const el of document.querySelectorAll('[data-wax]')) {
    el.style.height = `${state.phaseMs ? 12 + (remaining / state.phaseMs) * 88 : 0}%`;
  }
}
setInterval(tickTimer, 250);

// ---------- Farewell ----------

function showFarewell(message) {
  if (document.querySelector('.farewell')) return;
  const random = (min, max) => min + Math.random() * (max - min);
  const overlay = document.createElement('div');
  overlay.className = 'farewell';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `A message from ${message.signature}`);
  const lineStart = 3.2;
  const lineStep = 1.7;
  const end = lineStart + message.lines.length * lineStep;
  overlay.innerHTML = `
    <div class="thanks" aria-hidden="true">
      ${THANKS.map(word => `<span style="left:${random(2, 88)}%;top:${random(2, 92)}%;font-size:${random(1, 2.2).toFixed(2)}rem;animation-delay:-${random(0, 24).toFixed(1)}s;animation-duration:${random(18, 30).toFixed(1)}s">${esc(word)}</span>`).join('')}
    </div>
    <div class="scroll">
      <span class="rod top"></span>
      <div class="scroll-paper">
        <p class="kicker">${esc(message.kicker)}</p>
        <h2 class="the-word"><span class="initial">${esc([...message.word][0])}</span>${esc([...message.word].slice(1).join(''))}</h2>
        <p class="def-line"><em>(n.)</em> ${esc(message.definitionLabel)} <strong>${esc(message.definition)}</strong></p>
        <p class="divider" aria-hidden="true">❦</p>
        <div class="lines">
          ${message.lines.map((line, index) => `<p class="line" style="animation-delay:${lineStart + index * lineStep}s">${emphasis(line)}</p>`).join('')}
        </div>
        <div class="sign-off" style="animation-delay:${end}s">
          <p class="signature">${esc(message.signature)}</p>
          ${waxSeal([...message.signature][0], 'seal-small')}
        </div>
        <button class="btn" style="animation-delay:${end + 1.4}s">Continue</button>
      </div>
      <span class="rod bottom"></span>
    </div>`;
  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 600);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = event => { if (event.key === 'Escape') close(); };
  overlay.querySelector('button').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
}

// ---------- Events ----------

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-act], [data-vote], [data-copy]');
  if (!target || target.disabled) return;
  if (target.dataset.copy !== undefined) {
    try {
      await navigator.clipboard.writeText(shareLink(session.code));
      toast('Link copied. Paste it in your team chat!');
    } catch {
      toast('Copy failed. Select the link and copy it manually.');
    }
  } else if (target.dataset.vote) {
    markVote(target.dataset.vote);
    act('vote', { optionId: target.dataset.vote });
  } else {
    const settings = {};
    for (const select of app.querySelectorAll('[data-setting]')) settings[select.dataset.setting] = Number(select.value);
    target.disabled = true;
    await act(target.dataset.act, settings);
    target.disabled = false;
  }
});

app.addEventListener('change', event => {
  const select = event.target.closest('[data-setting]');
  if (select && session.state?.phase === 'lobby') act('settings', { [select.dataset.setting]: Number(select.value) });
});

// ---------- Boot ----------

async function boot() {
  const params = new URLSearchParams(location.search);
  const previewKey = params.get('preview');
  if (previewKey) {
    renderHome();
    try {
      const { message } = await api('GET', `/api/farewell-preview?key=${encodeURIComponent(previewKey)}`);
      showFarewell(message);
    } catch {
      history.replaceState(null, '', location.pathname);
    }
    return;
  }

  const code = params.get('room')?.trim().toUpperCase();
  if (!code) return renderHome();
  const token = storage.get(tokenKey(code));
  if (token) return enterRoom(code, token);
  return renderJoin(code);
}

boot();
