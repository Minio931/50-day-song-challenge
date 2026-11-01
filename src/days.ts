import { config } from './config.js';
import { getState } from './store.js';

/** Dzisiejsza data (YYYY-MM-DD) w strefie czasowej challenge'u. */
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Numer bieżącego dnia (1..totalDays).
 * 0 = challenge jeszcze nie wystartował, > totalDays = zakończony, null = brak daty startu.
 */
export function currentDay(now = new Date()): number | null {
  const s = getState();
  if (!s.startDate) return null;
  return daysBetween(s.startDate, todayLocal(now)) + 1;
}

export function themeFor(day: number): string {
  return getState().themes[day - 1]?.trim() || '(brak tematu)';
}

export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
}
