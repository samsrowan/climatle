// app.js — Entry point: init data, wire up DOM events, render

import { loadAllData, getCountries, getCountryByIso, getGhgSectors, getEnergyMix, getTrajectory } from './data.js';
import { renderGhgChart, renderEnergyChart, renderTrajectoryChart, updateChartTitles } from './charts.js';
import {
  initGame, getState, makeGuess, buildShareText,
  setHardMode, isHardMode, canToggleHardMode,
} from './game.js';
import { parseHash, onRouteChange } from './router.js';

// ── DOM elements ─────────────────────────────────────────────────────────────
const $loading = document.getElementById('loading');
const $game = document.getElementById('game');
const $guessInput = document.getElementById('guess-input');
const $guessBtn = document.getElementById('guess-btn');
const $guessCounter = document.getElementById('guess-counter');
const $acList = document.getElementById('autocomplete-list');
const $historyTable = document.getElementById('history-table');
const $historyBody = document.getElementById('history-body');
const $resultPanel = document.getElementById('result-panel');
const $resultReveal = document.getElementById('result-reveal');
const $resultOutcome = document.getElementById('result-outcome');
const $resultSharePreview = document.getElementById('result-share-preview');
const $resultFingerprint = document.getElementById('result-fingerprint');
const $resultFingerprintSection = document.getElementById('result-fingerprint-section');
const $shareBtn = document.getElementById('share-btn');
const $shareCopied = document.getElementById('share-copied');
const $showCountriesBtn = document.getElementById('show-countries-btn');
const $countryListPanel = document.getElementById('country-list-panel');
const $countryListGrid = document.getElementById('country-list-grid');
const $guessArea = document.getElementById('guess-area');
const $modeToggle = document.getElementById('mode-toggle');
const $hardModeCheckbox = document.getElementById('hard-mode-checkbox');
const $countriesIndex = document.getElementById('countries-index');
const $countriesIndexGrid = document.getElementById('countries-index-grid');
const $countriesFilter = document.getElementById('countries-filter');
const $countryProfile = document.getElementById('country-profile');
const $profileName = document.getElementById('profile-name');
const $profileFingerprint = document.getElementById('profile-fingerprint');

let acIndex = -1;
let acFiltered = [];

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  try {
    await loadAllData();
  } catch (e) {
    $loading.innerHTML = `<p style="color:#ff5252;">Failed to load data. Make sure JSON files exist in ../json/</p>`;
    console.error(e);
    return;
  }

  $loading.classList.add('hidden');

  const state = initGame();
  buildCountryList();
  buildCountriesIndexGrid();
  syncModeToggleUI();
  renderCharts(state);
  restoreGuessHistory(state);
  updateUI(state);
  wireEvents();

  renderRoute(parseHash());
  onRouteChange(renderRoute);
})();

// ── Routing ──────────────────────────────────────────────────────────────────
function showView(view) {
  $game.classList.toggle('hidden', view !== 'game');
  $countriesIndex.classList.toggle('hidden', view !== 'index');
  $countryProfile.classList.toggle('hidden', view !== 'profile');
}

function renderRoute(route) {
  if (route.view === 'profile') {
    const country = getCountryByIso(route.iso);
    if (!country) {
      window.location.hash = '#/countries';
      return;
    }
    showView('profile');
    renderCountryProfile(country);
  } else if (route.view === 'index') {
    showView('index');
  } else {
    showView('game');
  }
}

// ── Hard mode toggle UI ──────────────────────────────────────────────────────
function syncModeToggleUI() {
  $hardModeCheckbox.checked = isHardMode();
  $historyTable.classList.toggle('hard-mode', isHardMode());
  if (canToggleHardMode()) {
    $modeToggle.classList.remove('locked');
    $hardModeCheckbox.disabled = false;
  } else {
    $modeToggle.classList.add('locked');
    $hardModeCheckbox.disabled = true;
  }
}

// ── Charts ───────────────────────────────────────────────────────────────────
const renderedTabs = new Set();

function renderCharts(state) {
  renderedTabs.clear();
  renderCurrentTab(state);
}

function renderCurrentTab(state) {
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  if (!activeTab || renderedTabs.has(activeTab)) return;

  const iso = state.targetIso;
  const revealed = (state.status !== 'playing') ? state.targetName : null;

  if (activeTab === 'ghg') {
    const d = getGhgSectors(iso);
    if (d) renderGhgChart(d, revealed);
  } else if (activeTab === 'energy') {
    const d = getEnergyMix(iso);
    if (d) renderEnergyChart(d, revealed);
  } else if (activeTab === 'trajectory') {
    const d = getTrajectory(iso);
    if (d) renderTrajectoryChart(d, revealed);
  }
  renderedTabs.add(activeTab);
}

// ── Country List ─────────────────────────────────────────────────────────────
function buildCountryList() {
  const countries = getCountries();
  $countryListGrid.innerHTML = countries
    .map(c => `<span>${c.name}</span>`)
    .join('');
}

// ── Countries index (browse all countries) ──────────────────────────────────
function buildCountriesIndexGrid() {
  const sorted = [...getCountries()].sort((a, b) => a.name.localeCompare(b.name));
  $countriesIndexGrid.innerHTML = sorted
    .map(c => `<a href="#/country/${c.iso3c}" data-name="${c.name.toLowerCase()}">${c.name}</a>`)
    .join('');
}

// ── Country profile ──────────────────────────────────────────────────────────
function renderCountryProfile(country) {
  $profileName.textContent = country.name;

  if (country.fingerprint) {
    $profileFingerprint.textContent = country.fingerprint;
    $profileFingerprint.classList.remove('hidden');
  } else {
    $profileFingerprint.classList.add('hidden');
  }

  const ghg = getGhgSectors(country.iso3c);
  if (ghg) renderGhgChart(ghg, country.name, 'chart-profile-ghg');

  const energy = getEnergyMix(country.iso3c);
  if (energy) renderEnergyChart(energy, country.name, 'chart-profile-energy');

  const trajectory = getTrajectory(country.iso3c);
  if (trajectory) renderTrajectoryChart(trajectory, country.name, 'chart-profile-trajectory');
}

// ── Restore history from saved state ─────────────────────────────────────────
function restoreGuessHistory(state) {
  if (state.guessDetails.length === 0) return;
  $historyTable.classList.remove('hidden');
  for (const detail of state.guessDetails) {
    appendGuessRow(detail);
  }
}

// ── UI update ────────────────────────────────────────────────────────────────
function updateUI(state) {
  const remaining = 6 - state.guesses.length;

  if (state.status === 'playing') {
    $guessCounter.textContent = `Guess ${state.guesses.length + 1} of 6`;
    $guessInput.disabled = false;
    $guessBtn.disabled = false;
  } else {
    $guessInput.disabled = true;
    $guessBtn.disabled = true;
    $guessArea.classList.add('hidden');
    showResult(state);
  }
}

function showResult(state) {
  $resultPanel.classList.remove('hidden');

  // (1) Reveal line
  if (state.status === 'won') {
    $resultReveal.innerHTML =
      `Correct! The answer is <span class="country-name">${state.targetName}</span>`;
  } else {
    $resultReveal.innerHTML =
      `The answer was <span class="country-name">${state.targetName}</span>`;
  }

  // (2) Fingerprint section — sits between the reveal and the outcome line
  const target = getCountryByIso(state.targetIso);
  if (target && target.fingerprint) {
    $resultFingerprint.textContent = target.fingerprint;
    $resultFingerprintSection.classList.remove('hidden');
  } else {
    $resultFingerprintSection.classList.add('hidden');
  }

  // (3) Outcome line
  if (state.status === 'won') {
    $resultOutcome.textContent =
      `You got it in ${state.guesses.length} guess${state.guesses.length > 1 ? 'es' : ''}!`;
  } else {
    $resultOutcome.textContent = `Better luck tomorrow!`;
  }

  // (4) Render the share grid (emojis + score) directly in the panel so
  // players see their result without having to click 'Copy'.
  $resultSharePreview.textContent = buildShareText();

  // Reveal country name in charts
  updateChartTitles(state.targetName);
}

// ── Guess row ────────────────────────────────────────────────────────────────
function appendGuessRow(detail) {
  const tr = document.createElement('tr');

  // < 50% red, 50–80% yellow, 80%+ green
  const simClass = (v) => {
    if (v >= 0.8) return 'sim-high';
    if (v >= 0.5) return 'sim-mid';
    return 'sim-low';
  };

  const compClass = (v) => {
    if (v.startsWith('↑')) return 'arrow-up';
    if (v.startsWith('↓')) return 'arrow-down';
    return '';
  };

  tr.innerHTML = `
    <td>${detail.num}</td>
    <td>${detail.name}</td>
    <td class="${simClass(detail.sectorSim)}">${(detail.sectorSim * 100).toFixed(0)}%</td>
    <td class="${simClass(detail.energySim)}">${(detail.energySim * 100).toFixed(0)}%</td>
    <td class="${simClass(detail.trajectorySim)}">${(detail.trajectorySim * 100).toFixed(0)}%</td>
    <td class="col-geo">${detail.distanceStr}</td>
    <td class="col-geo">${detail.arrow}</td>
    <td class="${compClass(detail.ghgCapComp)}">${detail.ghgCapComp}</td>
  `;

  $historyBody.appendChild(tr);
}

// ── Events ───────────────────────────────────────────────────────────────────
function wireEvents() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      renderCurrentTab(getState());
    });
  });

  // Autocomplete
  $guessInput.addEventListener('input', onInput);
  $guessInput.addEventListener('keydown', onKeydown);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-wrapper')) hideAC();
  });

  // Hard mode toggle
  $hardModeCheckbox.addEventListener('change', () => {
    setHardMode($hardModeCheckbox.checked);
    syncModeToggleUI();
  });

  // Guess button
  $guessBtn.addEventListener('click', submitGuess);

  // Share button — modern Clipboard API with a textarea fallback for cases
  // where it fails (older browsers, blocked permissions, no user activation).
  $shareBtn.addEventListener('click', async () => {
    const text = buildShareText();
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); ok = true; }
      catch (_) { /* fall through to fallback */ }
    }
    if (!ok) ok = copyViaTextarea(text);
    if (ok) {
      $shareCopied.classList.remove('hidden');
      setTimeout(() => $shareCopied.classList.add('hidden'), 2000);
    } else {
      $shareCopied.textContent = 'Copy failed — select and copy manually';
      $shareCopied.classList.remove('hidden');
    }
  });

  // Country list toggle
  $showCountriesBtn.addEventListener('click', () => {
    $countryListPanel.classList.toggle('hidden');
    $showCountriesBtn.textContent = $countryListPanel.classList.contains('hidden')
      ? 'Show included countries'
      : 'Hide included countries';
  });

  // Countries index filter
  $countriesFilter.addEventListener('input', () => {
    const val = $countriesFilter.value.trim().toLowerCase();
    $countriesIndexGrid.querySelectorAll('a').forEach(a => {
      a.classList.toggle('hidden', val.length > 0 && !a.dataset.name.includes(val));
    });
  });

  // Browse countries button
  document.getElementById('browse-countries-btn').addEventListener('click', () => {
    window.location.hash = '#/countries';
  });

  // About section toggle
  document.getElementById('about-toggle').addEventListener('click', () => {
    const content = document.getElementById('about-content');
    const btn = document.getElementById('about-toggle');
    content.classList.toggle('hidden');
    btn.textContent = content.classList.contains('hidden') ? 'About this game' : 'Hide';
  });
}

// ── Autocomplete logic ───────────────────────────────────────────────────────
function onInput() {
  const val = $guessInput.value.trim().toLowerCase();
  if (val.length < 1) { hideAC(); return; }

  const state = getState();
  const countries = getCountries().filter(c => !state.guesses.includes(c.iso3c));

  acFiltered = countries.filter(c =>
    c.name.toLowerCase().startsWith(val) ||
    c.iso3c.toLowerCase() === val
  ).slice(0, 8);

  // Also add fuzzy matches (contains)
  if (acFiltered.length < 8) {
    const more = countries.filter(c =>
      !acFiltered.includes(c) &&
      c.name.toLowerCase().includes(val)
    ).slice(0, 8 - acFiltered.length);
    acFiltered.push(...more);
  }

  if (acFiltered.length === 0) { hideAC(); return; }

  acIndex = -1;
  $acList.innerHTML = acFiltered.map((c, i) =>
    `<li data-idx="${i}">${c.name}</li>`
  ).join('');
  $acList.classList.remove('hidden');

  $acList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const c = acFiltered[+li.dataset.idx];
      $guessInput.value = c.name;
      $guessInput.dataset.iso = c.iso3c;
      hideAC();
    });
  });
}

function onKeydown(e) {
  const items = $acList.querySelectorAll('li');
  if (items.length === 0 && e.key !== 'Enter') return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    highlightAC(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    highlightAC(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (acIndex >= 0 && acIndex < acFiltered.length) {
      const c = acFiltered[acIndex];
      $guessInput.value = c.name;
      $guessInput.dataset.iso = c.iso3c;
      hideAC();
    }
    submitGuess();
  } else if (e.key === 'Escape') {
    hideAC();
  }
}

function highlightAC(items) {
  items.forEach((li, i) => {
    li.classList.toggle('highlighted', i === acIndex);
  });
  if (acIndex >= 0 && items[acIndex]) {
    items[acIndex].scrollIntoView({ block: 'nearest' });
  }
}

// Fallback clipboard copy via a temporary <textarea> + execCommand('copy').
// Works without the async Clipboard API. Returns true if copy succeeded.
function copyViaTextarea(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  // Off-screen but still focusable/selectable
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

function hideAC() {
  $acList.classList.add('hidden');
  $acList.innerHTML = '';
  acIndex = -1;
  acFiltered = [];
}

// ── Submit guess ─────────────────────────────────────────────────────────────
function submitGuess() {
  const state = getState();
  if (state.status !== 'playing') return;

  // Resolve iso from the input
  let iso = $guessInput.dataset.iso;
  if (!iso) {
    // Try to match by name
    const val = $guessInput.value.trim().toLowerCase();
    const match = getCountries().find(c => c.name.toLowerCase() === val);
    if (match) iso = match.iso3c;
  }

  if (!iso) {
    $guessInput.focus();
    return;
  }

  const detail = makeGuess(iso);
  if (!detail) {
    $guessInput.value = '';
    delete $guessInput.dataset.iso;
    return;
  }

  // Show history table
  $historyTable.classList.remove('hidden');
  appendGuessRow(detail);

  // Clear input
  $guessInput.value = '';
  delete $guessInput.dataset.iso;
  hideAC();

  // First guess locks the hard-mode toggle
  syncModeToggleUI();

  // Update UI
  updateUI(getState());

  // If game ended, re-render charts with revealed name
  if (getState().status !== 'playing') {
    renderCharts(getState());
  }
}
