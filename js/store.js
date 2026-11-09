// Everything is stored only on this device, in the browser's localStorage. Nothing is ever sent anywhere.
import { addDays, localTodayISO } from './dates.js';

const KEY = 'ibd-diet-trial.v1';

export function emptyState() {
  return { settings: null, entries: {}, weekly: [], labs: [], weights: [], experiences: [], feedback: [], clockOffsetDays: 0 };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = { ...emptyState(), ...JSON.parse(raw) };
    for (const k of ['weekly', 'labs', 'weights', 'experiences', 'feedback']) if (!Array.isArray(s[k])) s[k] = [];
    if (!s.entries || typeof s.entries !== 'object' || Array.isArray(s.entries)) s.entries = {};
    if (s.settings && typeof s.settings !== 'object') s.settings = null;
    return s;
  } catch {
    return emptyState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  return emptyState();
}

// "Today" can be shifted for demonstrations (About > Demo tools). Real use keeps the offset at 0.
export function today(state) {
  return addDays(localTodayISO(), state.clockOffsetDays || 0);
}
