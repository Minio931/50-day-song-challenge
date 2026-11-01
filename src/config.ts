import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Brak zmiennej środowiskowej ${name} (patrz .env.example)`);
  return v;
}

export const config = {
  discordToken: req('DISCORD_TOKEN'),
  discordClientId: req('DISCORD_CLIENT_ID'),
  guildId: req('DISCORD_GUILD_ID'),
  spotifyClientId: req('SPOTIFY_CLIENT_ID'),
  spotifyClientSecret: req('SPOTIFY_CLIENT_SECRET'),
  spotifyRefreshToken: process.env.SPOTIFY_REFRESH_TOKEN ?? '',
  timezone: process.env.TZ_CHALLENGE ?? 'Europe/Warsaw',
  dataFile: process.env.DATA_FILE ?? './data/state.json',
};
