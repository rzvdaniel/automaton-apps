'use strict';

// A one-time farewell from Razvan. It is armed only on FAREWELL_DATE, in a game
// with at least three players that includes Razvan. The final word of that game
// becomes "Saudade", and the message is shown to everyone after its reveal.
// Once shown, a flag in the durable app data directory keeps it from ever
// appearing again, including after redeploys.

const fs = require('node:fs');
const path = require('node:path');

const FAREWELL_DATE = process.env.FAREWELL_DATE || '2026-10-30';
const TIME_ZONE = 'Europe/Copenhagen';
const MIN_PLAYERS = 3;
const REQUIRED_PLAYER = 'razvan';
const PREVIEW_KEY = 'obrigado-razvan-7f3k';

const word = {
  word: 'Saudade',
  language: 'Portuguese',
  meaning: 'A deep, bittersweet longing for someone or something you love that is no longer with you'
};

const message = {
  kicker: 'One more thing…',
  word: 'Saudade',
  definitionLabel: 'new meaning, as of today:',
  definition: 'what I\'ll feel every Friday at game time.',
  lines: [
    'Guys, thank you for everything.',
    'In translation-memory terms, you were a *100% match*.',
    'This game is yours: no ads, no pop-ups. Keep playing.'
  ],
  signature: 'Razvan'
};

const dataDir = process.env.AUTOMATON_APP_DATA_DIR || path.join(__dirname, 'data');
const flagFile = path.join(dataDir, 'farewell-shown.json');
let shown = fs.existsSync(flagFile);

function localDate(now) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

function simplify(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function canArm(playerNames, now) {
  return !shown
    && localDate(now) === FAREWELL_DATE
    && playerNames.length >= MIN_PLAYERS
    && playerNames.some(name => simplify(name).includes(REQUIRED_PLAYER));
}

function consume() {
  if (shown) return null;
  shown = true;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(flagFile, JSON.stringify({ shownAt: new Date().toISOString() }));
  } catch (error) {
    console.error('Could not persist the farewell flag; it stays consumed until restart.', error);
  }
  console.log('Farewell shown.');
  return message;
}

function preview(key) {
  return key === PREVIEW_KEY ? message : null;
}

console.log(`Farewell ${shown ? 'already shown' : `armed for ${FAREWELL_DATE} (${TIME_ZONE})`}; data directory: ${dataDir}`);

module.exports = { word, canArm, consume, preview };
