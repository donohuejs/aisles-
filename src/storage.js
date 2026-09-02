export function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function readText(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function writeText(key, value) { try { localStorage.setItem(key, value); } catch { /* Session remains usable. */ } }
