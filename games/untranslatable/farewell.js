'use strict';

// A farewell from Razvan. Throughout FAREWELL_DATE, everyone sees the message
// as a surprise when they enter a room, whoever plays and however often.
// On any other day it never appears.

const FAREWELL_DATE = process.env.FAREWELL_DATE || '2026-10-30';
const TIME_ZONE = 'Europe/Copenhagen';
const PREVIEW_KEY = 'obrigado-razvan-7f3k';

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

function localDate(now) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

function isFarewellDay(now) {
  return localDate(now) === FAREWELL_DATE;
}

function preview(key) {
  return key === PREVIEW_KEY ? message : null;
}

console.log(`Farewell scheduled for ${FAREWELL_DATE} (${TIME_ZONE}).`);

module.exports = { message, isFarewellDay, preview };
