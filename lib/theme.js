// Per-user theme preference. Persisted in profiles.theme; mirrored in
// localStorage so the pre-hydration script in app/layout.jsx can paint the
// correct palette before React mounts.

export const THEMES = ['light', 'dark', 'cosmic'];

export const THEME_LABELS = {
  light: 'Светлая',
  dark: 'Тёмная',
  cosmic: 'Космос',
};

export const THEME_DESCRIPTIONS = {
  light: 'Классический светлый вид, как было изначально.',
  dark: 'Тёмно-синие панели и индиго-акцент — меньше бьёт по глазам вечером.',
  cosmic: 'Глубокий фиолетовый с неоновыми бликами — для любителей ночного неба.',
};

export function isValidTheme(theme) {
  return THEMES.includes(theme);
}

// Imperatively apply a theme to <html> and cache it in localStorage.
// Safe to call before hydration (no-ops on the server).
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const next = isValidTheme(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { window.localStorage.setItem('theme', next); } catch {}
}
