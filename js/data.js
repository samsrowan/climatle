// data.js — Load all JSON files and expose data access functions

const DATA_BASE = 'json/';

let countries = [];
let ghgSectors = {};
let energyMix = {};
let emissionsTrajectory = {};
let simGhg = {};
let simEnergy = {};
let centroids = {};

export async function loadAllData() {
  const [c, g, e, t, sg, se, cent] = await Promise.all([
    fetchJSON('countries.json'),
    fetchJSON('ghg_sectors.json'),
    fetchJSON('energy_mix.json'),
    fetchJSON('emissions_trajectory.json'),
    fetchJSON('sim_ghg.json'),
    fetchJSON('sim_energy.json'),
    fetchJSON('centroids.json'),
  ]);

  countries = c;
  ghgSectors = g;
  energyMix = e;
  emissionsTrajectory = t;
  simGhg = sg;
  simEnergy = se;
  centroids = cent;
}

async function fetchJSON(file) {
  const resp = await fetch(DATA_BASE + file);
  if (!resp.ok) throw new Error(`Failed to load ${file}: ${resp.status}`);
  return resp.json();
}

export function getCountries() { return countries; }
export function getCountryByIso(iso) { return countries.find(c => c.iso3c === iso); }
export function getGhgSectors(iso) { return ghgSectors[iso]; }
export function getEnergyMix(iso) { return energyMix[iso]; }
export function getTrajectory(iso) { return emissionsTrajectory[iso]; }
export function getGhgSimilarity(a, b) { return a === b ? 1 : (simGhg[a]?.[b] ?? 0); }
export function getEnergySimilarity(a, b) { return a === b ? 1 : (simEnergy[a]?.[b] ?? 0); }
export function getCentroid(iso) { return centroids[iso]; }
