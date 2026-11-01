/**
 * Jednorazowe uzyskanie refresh tokena dla konta Spotify, na którym będzie playlista.
 * 1. W Spotify Developer Dashboard dodaj Redirect URI: http://127.0.0.1:8888/callback
 * 2. npm run spotify:auth  → otwórz wypisany link, zaloguj się, zaakceptuj
 * 3. Skopiuj SPOTIFY_REFRESH_TOKEN do .env
 */
import http from 'node:http';
import crypto from 'node:crypto';
import 'dotenv/config';

const clientId = process.env.SPOTIFY_CLIENT_ID!;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
const redirect = 'http://127.0.0.1:8888/callback';
const scopes = 'playlist-modify-public playlist-modify-private playlist-read-private';
const stateParam = crypto.randomBytes(8).toString('hex');

if (!clientId || !clientSecret) {
  console.error('Uzupełnij SPOTIFY_CLIENT_ID i SPOTIFY_CLIENT_SECRET w .env');
  process.exit(1);
}

const url =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({ response_type: 'code', client_id: clientId, scope: scopes, redirect_uri: redirect, state: stateParam });

console.log('\nOtwórz w przeglądarce:\n\n' + url + '\n');

http
  .createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', redirect);
    if (u.pathname !== '/callback') return void res.end();
    if (u.searchParams.get('state') !== stateParam) return void res.end('Zły state');
    const code = u.searchParams.get('code');
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code ?? '', redirect_uri: redirect }),
    });
    const json = (await r.json()) as { refresh_token?: string; error?: string };
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (!json.refresh_token) {
      res.end('Błąd: ' + JSON.stringify(json));
      console.error(json);
    } else {
      res.end('Gotowe, wróć do terminala.');
      console.log('\nSPOTIFY_REFRESH_TOKEN=' + json.refresh_token + '\n');
    }
    process.exit(0);
  })
  .listen(8888, '127.0.0.1');
