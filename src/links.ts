/**
 * Wyciąga ID utworu ze wszystkich popularnych form linków Spotify:
 *  - https://open.spotify.com/track/ID?si=...
 *  - https://open.spotify.com/intl-pl/track/ID
 *  - spotify:track:ID
 *  - https://spotify.link/xxxx (krótki link z aplikacji – rozwijany przez przekierowanie)
 */
const TRACK_RE = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/;
const SHORT_RE = /^https?:\/\/(?:spotify\.link|spotify\.app\.link)\/\S+$/i;

export function parseTrackId(input: string): string | null {
  const m = input.match(TRACK_RE);
  return m ? m[1] : null;
}

export async function resolveTrackId(input: string): Promise<string | null> {
  const direct = parseTrackId(input);
  if (direct) return direct;
  if (SHORT_RE.test(input.trim())) {
    try {
      const res = await fetch(input.trim(), { redirect: 'follow' });
      const fromUrl = parseTrackId(res.url);
      if (fromUrl) return fromUrl;
      // spotify.link czasem zwraca stronę z przekierowaniem w HTML
      const html = await res.text();
      return parseTrackId(html);
    } catch {
      return null;
    }
  }
  return null;
}

export interface BulkLine {
  line: number;
  day: number;
  link: string;
}

/**
 * Parsuje masowe wklejki, jedna para na linię, np.:
 *   1 https://open.spotify.com/track/...
 *   dzień 2: https://...
 *   Day 3 - https://...
 *   4) https://...
 */
export function parseBulk(text: string): { ok: BulkLine[]; bad: { line: number; raw: string }[] } {
  const ok: BulkLine[] = [];
  const bad: { line: number; raw: string }[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(?:dzie[ńn]|day|d)?\s*#?(\d{1,3})\s*[:.\-)–]?\s*(\S+)/i);
    if (!m) return void bad.push({ line: idx + 1, raw: line });
    ok.push({ line: idx + 1, day: Number(m[1]), link: m[2] });
  });
  return { ok, bad };
}
