'use strict';

// A farewell from Razvan. Throughout the FAREWELL_DATES, everyone sees the
// message as soon as they open the game, on every page load. On any other day
// it never appears.

// 2026-10-29 is the rehearsal day; 2026-10-30 is the real farewell.
const FAREWELL_DATES = (process.env.FAREWELL_DATES || '2026-10-29,2026-10-30').split(',');
const TIME_ZONE = 'Europe/Copenhagen';
const PREVIEW_KEY = 'obrigado-razvan-7f3k';

const message = {
  kicker: 'One last thing…',
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

function localDate(now) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

function isFarewellDay(now) {
  return FAREWELL_DATES.includes(localDate(now));
}

function preview(key) {
  return key === PREVIEW_KEY ? message : null;
}

console.log(`Farewell scheduled for ${FAREWELL_DATES.join(', ')} (${TIME_ZONE}).`);

module.exports = { message, isFarewellDay, preview };
