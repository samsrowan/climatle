// game.js — Game state machine (new game, guess, win, lose, share)

import {
  getCountries, getCountryByIso,
  getGhgSimilarity, getEnergySimilarity, getTrajectorySimilarity,
  getCentroid,
} from './data.js';
import { haversineDistance, compassArrow, formatDistance } from './geo.js';

const MAX_GUESSES = 6;
const STORAGE_KEY = 'climatle-state';
const HARD_MODE_PREF_KEY = 'climatle-hardmode-pref';

// Marker palettes for buildShareText. Each guess produces a 3-emoji row
// (sector sim, elec sim, GHG sim — order matches the in-game hint columns).
// Normal mode uses circles, hard mode squares. Same color thresholds as the
// in-game text: <50% red, 50-80% yellow, 80%+ green.
//   - Correct guess: row is overridden with three location pins (normal) or
//     three gemstones (hard) instead of color tiles.
//   - On loss (no correct guess after MAX_GUESSES), a trailing row of three
//     skunks is appended.
const MARKERS = {
  normal: { high: '🟢', mid: '🟡', low: '🔴', correct: '📍' },
  hard:   { high: '🟩', mid: '🟨', low: '🟥', correct: '💎' },
};
const LOSS_MARKER = '🦨';

let state = null;
let practiceMode = false;

function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPuzzleNumber() {
  // Epoch set to the day before launch so today's puzzle is #1.
  // (months are 0-indexed: 5 = June)
  const epoch = new Date(2026, 5, 18);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - epoch) / 86400000);
}

// cyrb53 hash — good avalanche properties for similar inputs
function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function getTodayTarget(countries) {
  return countries[hashString(dateKey()) % countries.length];
}

function readHardModePref() {
  return localStorage.getItem(HARD_MODE_PREF_KEY) === '1';
}
function writeHardModePref(value) {
  localStorage.setItem(HARD_MODE_PREF_KEY, value ? '1' : '0');
}

export function isPractice() { return practiceMode; }

export function initGame() {
  const countries = getCountries();
  const params = new URLSearchParams(window.location.search);
  practiceMode = params.has('practice');

  if (practiceMode) {
    // Practice mode: random country each time, no localStorage persistence
    const target = countries[Math.floor(Math.random() * countries.length)];
    state = {
      date: 'practice-' + Date.now(),
      puzzleNumber: 0,
      targetIso: target.iso3c,
      targetName: target.name,
      guesses: [],
      guessDetails: [],
      hardMode: readHardModePref(),
      status: 'playing',
    };
    return state;
  }

  const today = dateKey();

  // Try to restore from localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) {
        // Older states may not have hardMode; default to false for resumed games.
        if (typeof parsed.hardMode !== 'boolean') parsed.hardMode = false;
        state = parsed;
        return state;
      }
    } catch (_) { /* ignore corrupt state */ }
  }

  const target = getTodayTarget(countries);

  state = {
    date: today,
    puzzleNumber: getPuzzleNumber(),
    targetIso: target.iso3c,
    targetName: target.name,
    guesses: [],       // array of iso3c strings
    guessDetails: [],  // array of detail objects for the table
    hardMode: readHardModePref(),  // default from persisted preference
    status: 'playing', // 'playing' | 'won' | 'lost'
  };

  saveState();
  return state;
}

// Hard mode can only be toggled before the first guess. Returns true if the
// state actually changed.
export function setHardMode(value) {
  if (!state || state.status !== 'playing' || state.guesses.length > 0) return false;
  const next = !!value;
  if (state.hardMode === next) return false;
  state.hardMode = next;
  writeHardModePref(next);
  saveState();
  return true;
}
export function isHardMode() { return state?.hardMode === true; }
export function canToggleHardMode() {
  return state?.status === 'playing' && state.guesses.length === 0;
}

export function getState() { return state; }

export function makeGuess(guessIso) {
  if (state.status !== 'playing') return null;
  if (state.guesses.includes(guessIso)) return null; // no duplicates

  const target = getCountryByIso(state.targetIso);
  const guess = getCountryByIso(guessIso);
  if (!target || !guess) return null;

  // Three similarity scores (no longer GDP/cap):
  //   sectorSim    — sectoral GHG (cosine on subsector shares)
  //   energySim    — electricity mix (cosine on source shares)
  //   trajectorySim — GHG-trajectory shape (centered cosine of indexed series)
  const sectorSim     = getGhgSimilarity(state.targetIso, guessIso);
  const energySim     = getEnergySimilarity(state.targetIso, guessIso);
  const trajectorySim = getTrajectorySimilarity(state.targetIso, guessIso);

  // Geographic hints are hidden in hard mode.
  let dist = null;
  let arrow = null;
  let distanceStr = '—';
  if (!state.hardMode) {
    const targetCentroid = getCentroid(state.targetIso);
    const guessCentroid = getCentroid(guessIso);
    if (targetCentroid && guessCentroid) {
      dist = haversineDistance(
        guessCentroid.lat, guessCentroid.lon,
        targetCentroid.lat, targetCentroid.lon
      );
      arrow = compassArrow(
        guessCentroid.lat, guessCentroid.lon,
        targetCentroid.lat, targetCentroid.lon
      );
      distanceStr = formatDistance(dist);
    }
  }

  const ghgCapComp = compareIndicator(target.ghg_pc, guess.ghg_pc);

  const detail = {
    num: state.guesses.length + 1,
    iso3c: guessIso,
    name: guess.name,
    sectorSim,
    energySim,
    trajectorySim,
    distance: dist,
    distanceStr,
    arrow: arrow || '—',
    ghgCapComp,
    correct: guessIso === state.targetIso,
  };

  state.guesses.push(guessIso);
  state.guessDetails.push(detail);

  if (detail.correct) {
    state.status = 'won';
  } else if (state.guesses.length >= MAX_GUESSES) {
    state.status = 'lost';
  }

  saveState();
  return detail;
}

function compareIndicator(targetVal, guessVal) {
  if (targetVal == null || guessVal == null) return '?';
  if (Math.abs(targetVal - guessVal) / Math.max(targetVal, guessVal, 1) < 0.02) return '=';
  return targetVal > guessVal ? '↑ Higher' : '↓ Lower';
}

function saveState() {
  if (!practiceMode) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function buildShareText() {
  const s = state;
  const result = s.status === 'won' ? `${s.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const palette = s.hardMode ? MARKERS.hard : MARKERS.normal;

  // Same color thresholds as the in-game text: <50% red, 50-80% yellow, 80%+ green.
  const tile = (v) => v >= 0.8 ? palette.high : v >= 0.5 ? palette.mid : palette.low;

  // One row per guess: three emojis (sector | elec | GHG trajectory). On the
  // correct guess, the whole row is replaced by three correct-markers.
  const rows = s.guessDetails.map(d =>
    d.correct
      ? palette.correct.repeat(3)
      : tile(d.sectorSim) + tile(d.energySim) + tile(d.trajectorySim)
  );

  // On a loss, append a row of three skunks.
  if (s.status === 'lost') rows.push(LOSS_MARKER.repeat(3));

  return [
    `🌍 Climatle #${s.puzzleNumber}`,
    ...rows,
    result,
    '',
    `climatle.xyz`,
  ].join('\n');
}
