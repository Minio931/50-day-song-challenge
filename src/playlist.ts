import { getState } from './store.js';
import { replacePlaylist, searchTracks, type TrackInfo } from './spotify.js';

/**
 * Kolejność playlisty jest zawsze budowana od zera ze stanu bota:
 *   [marker Dnia 1] [piosenki dnia 1 wg czasu dodania] [marker Dnia 2] ...
 * Dzięki temu zaległe dni dodane później lądują we właściwym miejscu,
 * a na koniec playlista ma jedną spójną formę.
 */
export function buildOrder(): string[] {
  const s = getState();
  const uris: string[] = [];
  for (let day = 1; day <= s.totalDays; day++) {
    const subs = s.submissions
      .filter((x) => x.day === day)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    if (!subs.length) continue; // pusty dzień – bez markera, żeby nie zaśmiecać
    const marker = s.markers[String(day)];
    if (marker) uris.push(marker);
    uris.push(...subs.map((x) => x.trackUri));
  }
  return uris;
}

let pending: Promise<void> | null = null;
let again = false;

/** Synchronizacja z kolejką – równoległe dodania nie nadpisują sobie playlisty. */
export async function syncPlaylist(): Promise<number> {
  const s = getState();
  if (!s.playlistId) throw new Error('Brak playlisty – użyj /admin playlist.');
  if (pending) {
    again = true;
    await pending;
    return buildOrder().length;
  }
  pending = (async () => {
    do {
      again = false;
      await replacePlaylist(s.playlistId!, buildOrder());
    } while (again);
  })();
  try {
    await pending;
  } finally {
    pending = null;
  }
  return buildOrder().length;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Szuka na Spotify utworu, którego tytuł to dokładnie "Day N" (albo "Day N" + dopisek w nawiasie).
 * Spotify zwraca max 10 wyników na zapytanie, więc robimy 2 warianty zapytania.
 */
export async function findDayMarker(day: number): Promise<TrackInfo | null> {
  const wanted = [`day ${day}`, `day ${numberWord(day)}`].filter(Boolean);
  for (const q of [`track:"Day ${day}"`, `Day ${day}`]) {
    const results = await searchTracks(q);
    const hit = results.find((t) => wanted.includes(norm(t.name)));
    if (hit) return hit;
  }
  return null;
}

function numberWord(n: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
  if (n < 20) return ones[n];
  return (tens[Math.floor(n / 10)] + ' ' + ones[n % 10]).trim();
}
