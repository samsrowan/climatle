// router.js — Minimal hash router for the three top-level views:
//   ""                    -> { view: 'game' }
//   "#/countries"         -> { view: 'index' }
//   "#/country/ISO3"      -> { view: 'profile', iso: 'ISO3' }
// Unrecognized hashes (including unknown iso codes, checked by the caller)
// fall back to the countries index.

export function parseHash() {
  const hash = window.location.hash;

  const countryMatch = hash.match(/^#\/country\/([A-Za-z]{3})$/);
  if (countryMatch) {
    return { view: 'profile', iso: countryMatch[1].toUpperCase() };
  }

  if (hash === '#/countries') {
    return { view: 'index' };
  }

  if (hash === '' || hash === '#' || hash === '#/') {
    return { view: 'game' };
  }

  return { view: 'index' };
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', () => callback(parseHash()));
}

export function navigate(hash) {
  window.location.hash = hash;
}
