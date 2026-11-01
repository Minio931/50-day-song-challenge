import { config } from './config.js';

/**
 * Minimalny klient Spotify Web API pod zasady Development Mode z 2026:
 *  - wszystko idzie przez JEDNO konto właściciela (Premium) z refresh tokenem,
 *    więc limit 5 użytkowników aplikacji nie dotyczy uczestników z Discorda,
 *  - endpointy playlist używają /items (stare /tracks zwraca 403),
 *  - wyszukiwarka zwraca max 10 wyników.
 */
const API = 'https://api.spotify.com/v1';
let accessToken = '';
let expiresAt = 0;

async function token(): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  if (!config.spotifyRefreshToken) {
    throw new Error('Brak SPOTIFY_REFRESH_TOKEN – uruchom `npm run spotify:auth`.');
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.spotifyRefreshToken }),
  });
  if (!res.ok) throw new Error(`Spotify token: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = json.access_token;
  expiresAt = Date.now() + json.expires_in * 1000;
  return accessToken;
}

async function api<T>(method: string, path: string, body?: unknown, retry = 3): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429 && retry > 0) {
    const wait = Number(res.headers.get('retry-after') ?? '2') * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return api(method, path, body, retry - 1);
  }
  if (res.status === 401 && retry > 0) {
    accessToken = '';
    return api(method, path, body, retry - 1);
  }
  if (!res.ok) throw new Error(`Spotify ${method} ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface TrackInfo {
  id: string;
  uri: string;
  name: string;
  artists: string;
}

interface RawTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
}

const toInfo = (t: RawTrack): TrackInfo => ({
  id: t.id,
  uri: t.uri,
  name: t.name,
  artists: t.artists.map((a) => a.name).join(', '),
});

export async function getTrack(id: string): Promise<TrackInfo> {
  return toInfo(await api<RawTrack>('GET', `/tracks/${id}`));
}

export async function searchTracks(q: string): Promise<TrackInfo[]> {
  const r = await api<{ tracks: { items: RawTrack[] } }>(
    'GET',
    `/search?type=track&limit=10&q=${encodeURIComponent(q)}`,
  );
  return r.tracks.items.map(toInfo);
}

export async function createPlaylist(name: string, description: string): Promise<{ id: string; url: string }> {
  const p = await api<{ id: string; external_urls: { spotify: string } }>('POST', '/me/playlists', {
    name,
    description,
    public: true,
  });
  return { id: p.id, url: p.external_urls.spotify };
}

export function playlistUrl(id: string): string {
  return `https://open.spotify.com/playlist/${id}`;
}

/** Podmienia całą zawartość playlisty (pierwsze 100 przez PUT, reszta dopisywana partiami). */
export async function replacePlaylist(playlistId: string, uris: string[]): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < uris.length; i += 100) chunks.push(uris.slice(i, i + 100));
  await api('PUT', `/playlists/${playlistId}/items`, { uris: chunks[0] ?? [] });
  for (const chunk of chunks.slice(1)) {
    await api('POST', `/playlists/${playlistId}/items`, { uris: chunk });
  }
}
