'use strict';

const crypto = require('node:crypto');
const WORDS = require('./words');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COLORS = ['#9e2a1c', '#2f4b7c', '#3f6b4f', '#a07423', '#6b3a6b', '#3d2b18', '#b5562a', '#2f6a6e', '#7a2f4f', '#55613a'];
const ROUND_CHOICES = [5, 7, 9];
const WRITE_CHOICES = [45, 60, 90];
const DEFAULT_SETTINGS = { rounds: 7, writeSeconds: 60 };
const VOTE_SECONDS = 35;
const ACTIVE_MS = 10_000;
const HOST_HANDOVER_MS = 20_000;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;
const MAX_ROOMS = 200;
const MAX_PLAYERS = 20;
const MAX_NAME = 24;
const MAX_PASSWORD = 40;
const MAX_DEFINITION = 140;
const POINTS_FOR_TRUTH = 2;
const POINTS_PER_FOOLED = 1;

class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Fakes are styled like the real meanings so punctuation never gives them away.
function asDefinition(value) {
  const text = cleanText(value, MAX_DEFINITION).replace(/[.\s]+$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortId() {
  return crypto.randomBytes(6).toString('base64url');
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickSetting(value, choices, fallback) {
  const number = Number(value);
  return choices.includes(number) ? number : fallback;
}

function emptyStats() {
  return { fooled: 0, truths: 0, fooledBy: 0 };
}

class Room {
  constructor(code, password, farewell, now) {
    this.code = code;
    this.password = cleanText(password, MAX_PASSWORD);
    this.farewell = farewell;
    this.settings = { ...DEFAULT_SETTINGS };
    this.players = new Map();
    this.tokens = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.game = 0;
    this.round = 0;
    this.words = [];
    this.usedWords = new Set();
    this.current = null;
    this.deadline = null;
    this.phaseMs = null;
    this.version = 0;
    this.touchedAt = now;
  }

  changed(now) {
    this.version++;
    this.touchedAt = now;
  }

  isActive(player, now) {
    return now - player.lastSeen < ACTIVE_MS;
  }

  activePlayers(now) {
    return [...this.players.values()].filter(player => this.isActive(player, now));
  }

  join(name, password, now) {
    if (this.password && cleanText(password, MAX_PASSWORD) !== this.password) {
      throw new GameError(403, 'Wrong room password.');
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError(409, 'This room is full.');
    const cleanName = cleanText(name, MAX_NAME);
    if (!cleanName) throw new GameError(400, 'Please type your name.');

    const player = {
      id: shortId(),
      token: crypto.randomUUID(),
      name: this.uniqueName(cleanName),
      color: COLORS[this.players.size % COLORS.length],
      score: 0,
      stats: emptyStats(),
      joinedAt: now,
      lastSeen: now
    };
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    this.hostId ??= player.id;
    this.changed(now);
    return player;
  }

  uniqueName(name) {
    const taken = new Set([...this.players.values()].map(player => player.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, MAX_NAME - 3)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  playerByToken(token) {
    return this.players.get(this.tokens.get(token)) ?? null;
  }

  seen(player, now) {
    player.lastSeen = now;
    this.touchedAt = now;
  }

  act(player, action, now) {
    const isHost = player.id === this.hostId;
    const requireHost = () => { if (!isHost) throw new GameError(403, 'Only the host can do that.'); };
    const requirePhase = (...phases) => {
      if (!phases.includes(this.phase)) throw new GameError(409, 'That is no longer possible. The game has moved on.');
    };

    switch (action.type) {
      case 'settings':
        requireHost(); requirePhase('lobby', 'final');
        this.applySettings(action);
        break;
      case 'start':
        requireHost(); requirePhase('lobby', 'final');
        this.applySettings(action);
        this.start(now);
        break;
      case 'submit': {
        requirePhase('write');
        const text = asDefinition(action.text);
        if (!text) throw new GameError(400, 'Write something first.');
        this.current.submissions.set(player.id, text);
        break;
      }
      case 'vote': {
        requirePhase('vote');
        const option = this.current.options.find(candidate => candidate.id === action.optionId);
        if (!option) throw new GameError(400, 'Pick one of the meanings.');
        if (option.authorId === player.id) throw new GameError(400, 'Nice try, but you cannot vote for your own fake.');
        this.current.votes.set(player.id, option.id);
        break;
      }
      case 'skip':
        requireHost(); requirePhase('write', 'vote');
        this.deadline = now;
        break;
      case 'next':
        requireHost(); requirePhase('reveal');
        this.next(now);
        break;
      case 'lobby':
        requireHost(); requirePhase('final');
        this.phase = 'lobby';
        break;
      default:
        throw new GameError(400, 'Unknown action.');
    }
    this.changed(now);
    this.tick(now);
  }

  applySettings({ rounds, writeSeconds }) {
    this.settings = {
      rounds: pickSetting(rounds ?? this.settings.rounds, ROUND_CHOICES, this.settings.rounds),
      writeSeconds: pickSetting(writeSeconds ?? this.settings.writeSeconds, WRITE_CHOICES, this.settings.writeSeconds)
    };
  }

  start(now) {
    const active = this.activePlayers(now);
    if (active.length < 2) throw new GameError(409, 'You need at least 2 players to start.');
    for (const player of this.players.values()) {
      player.score = 0;
      player.stats = emptyStats();
    }
    this.game++;
    this.words = this.pickWords(this.settings.rounds);
    this.round = 0;
    this.beginRound(now);
  }

  pickWords(count) {
    let available = WORDS.filter(entry => !this.usedWords.has(entry.word));
    if (available.length < count) {
      this.usedWords.clear();
      available = WORDS;
    }
    const picked = shuffle(available).slice(0, count);
    for (const entry of picked) this.usedWords.add(entry.word);
    return picked;
  }

  beginRound(now) {
    this.round++;
    this.current = {
      word: this.words[this.round - 1],
      submissions: new Map(),
      options: [],
      votes: new Map(),
      results: null,
      deltas: {}
    };
    this.setPhase('write', this.settings.writeSeconds * 1000, now);
  }

  setPhase(phase, durationMs, now) {
    this.phase = phase;
    this.phaseMs = durationMs;
    this.deadline = durationMs ? now + durationMs : null;
  }

  endWrite(now) {
    const fakes = [...this.current.submissions].map(([authorId, text]) => ({ id: shortId(), text, authorId }));
    const real = { id: shortId(), text: this.current.word.meaning, authorId: null };
    this.current.options = shuffle([...fakes, real]);
    this.setPhase('vote', VOTE_SECONDS * 1000, now);
  }

  endVote(now) {
    const deltas = new Map();
    const award = (playerId, points) => deltas.set(playerId, (deltas.get(playerId) ?? 0) + points);
    const votes = [...this.current.votes];

    this.current.results = this.current.options.map(option => {
      const voterIds = votes.filter(([, optionId]) => optionId === option.id).map(([voterId]) => voterId);
      const author = this.players.get(option.authorId);
      for (const voterId of voterIds) {
        const voter = this.players.get(voterId);
        if (option.authorId === null) {
          award(voterId, POINTS_FOR_TRUTH);
          voter.stats.truths++;
        } else {
          award(option.authorId, POINTS_PER_FOOLED);
          voter.stats.fooledBy++;
          if (author) author.stats.fooled++;
        }
      }
      return { ...option, voterIds };
    });

    for (const [playerId, points] of deltas) this.players.get(playerId).score += points;
    this.current.deltas = Object.fromEntries(deltas);
    this.setPhase('reveal', null, now);
  }

  next(now) {
    if (this.round < this.words.length) {
      this.beginRound(now);
    } else {
      this.setPhase('final', null, now);
    }
  }

  everyoneDone(now, doneMap) {
    const active = this.activePlayers(now);
    return active.length > 0 && active.every(player => doneMap.has(player.id));
  }

  tick(now) {
    if (this.phase === 'write' && (now >= this.deadline || this.everyoneDone(now, this.current.submissions))) {
      this.endWrite(now);
      this.changed(now);
    } else if (this.phase === 'vote' && (now >= this.deadline || this.everyoneDone(now, this.current.votes))) {
      this.endVote(now);
      this.changed(now);
    }
    this.handOverHost(now);
  }

  handOverHost(now) {
    const host = this.players.get(this.hostId);
    if (host && now - host.lastSeen < HOST_HANDOVER_MS) return;
    const successor = this.activePlayers(now).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (successor && successor.id !== this.hostId) {
      this.hostId = successor.id;
      this.changed(now);
    }
  }

  awards() {
    const players = [...this.players.values()];
    const best = (stat) => {
      const top = players.reduce((leader, player) => (player.stats[stat] > (leader?.stats[stat] ?? 0) ? player : leader), null);
      return top ? { playerId: top.id, value: top.stats[stat] } : null;
    };
    const times = count => ({ 1: 'once', 2: 'twice' })[count] ?? `${count} times`;
    return [
      { emoji: '✒️', title: 'Master Forger', stat: 'fooled', note: count => `fooled colleagues ${times(count)}` },
      { emoji: '🗝️', title: 'Keeper of Truth', stat: 'truths', note: count => `found the real meaning ${times(count)}` },
      { emoji: '🐑', title: 'Most Credulous Pilgrim', stat: 'fooledBy', note: count => `fell for ${count} ${count === 1 ? 'fake' : 'fakes'}` }
    ].map(({ emoji, title, stat, note }) => {
      const winner = best(stat);
      return winner && { emoji, title, playerId: winner.playerId, note: note(winner.value) };
    }).filter(Boolean);
  }

  view(player, now) {
    const progress = this.phase === 'write' ? this.current.submissions : this.phase === 'vote' ? this.current.votes : null;
    const view = {
      code: this.code,
      version: this.version,
      game: this.game,
      phase: this.phase,
      round: this.round,
      rounds: this.words.length || this.settings.rounds,
      settings: this.settings,
      hasPassword: Boolean(this.password),
      you: player.id,
      hostId: this.hostId,
      players: [...this.players.values()].map(entry => ({
        id: entry.id,
        name: entry.name,
        color: entry.color,
        score: entry.score,
        online: this.isActive(entry, now),
        done: progress ? progress.has(entry.id) : false
      })),
      remainingMs: this.deadline ? Math.max(0, this.deadline - now) : null,
      phaseMs: this.phaseMs
    };

    if (['write', 'vote', 'reveal'].includes(this.phase)) {
      view.word = { word: this.current.word.word, language: this.current.word.language };
    }
    if (this.phase === 'write') {
      view.yourSubmission = this.current.submissions.get(player.id) ?? '';
    }
    if (this.phase === 'vote') {
      view.options = this.current.options.map(option => ({ id: option.id, text: option.text, mine: option.authorId === player.id }));
      view.yourVote = this.current.votes.get(player.id) ?? null;
    }
    if (this.phase === 'reveal') {
      view.reveal = {
        results: this.current.results.map(({ id, text, authorId, voterIds }) => ({ id, text, real: authorId === null, authorId, voterIds })),
        deltas: this.current.deltas
      };
    }
    if (this.phase === 'final') {
      view.awards = this.awards();
    }
    return view;
  }
}

class RoomRegistry {
  constructor(farewell) {
    this.farewell = farewell;
    this.rooms = new Map();
  }

  create({ name, password, rounds, writeSeconds }, now) {
    if (this.rooms.size >= MAX_ROOMS) throw new GameError(503, 'Too many rooms are open right now. Please try again later.');
    const room = new Room(this.newCode(), password, this.farewell, now);
    room.applySettings({ rounds, writeSeconds });
    const player = room.join(name, password, now);
    this.rooms.set(room.code, room);
    return { room, player };
  }

  get(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase());
    if (!room) throw new GameError(404, 'Room not found. It may have expired.');
    return room;
  }

  newCode() {
    for (;;) {
      const code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  tick(now) {
    for (const [code, room] of this.rooms) {
      if (now - room.touchedAt > ROOM_IDLE_MS) {
        this.rooms.delete(code);
      } else {
        room.tick(now);
      }
    }
  }
}

module.exports = { RoomRegistry, GameError };
