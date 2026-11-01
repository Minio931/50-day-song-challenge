import { EmbedBuilder, type Client, type SendableChannels } from 'discord.js';
import { currentDay, themeFor } from './days.js';
import type { TrackInfo } from './spotify.js';
import { getState } from './store.js';

const GREEN = 0x1ed760;

export interface Added {
  day: number;
  replaced: boolean;
  track: TrackInfo | null; // null gdy Spotify nie oddał szczegółów
  trackUri: string;
  trackName: string;
}

export interface Who {
  name: string;
  avatar: string;
}

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września',
  'października', 'listopada', 'grudnia'];
const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień',
  'październik', 'listopad', 'grudzień'];

function formatRelease(date?: string, precision?: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  let text = String(y);
  if (precision === 'day' && d) text = `${d} ${MONTHS[m - 1]} ${y}`;
  else if (precision === 'month' && m) text = `${MONTHS_NOM[m - 1]} ${y}`;

  const now = new Date();
  let age = now.getFullYear() - y;
  if (m && (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && d && now.getDate() < d))) age--;
  if (age >= 1) text += ` · ${age} ${plural(age, 'rok', 'lata', 'lat')} temu`;
  else text += ' · świeżynka 🆕';
  return text;
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const l = n % 10, l2 = n % 100;
  return l >= 2 && l <= 4 && (l2 < 12 || l2 > 14) ? few : many;
}

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ALBUM_TYPE: Record<string, string> = { single: 'singiel', compilation: 'składanka' };

export function songEmbed(who: Who, a: Added): EmbedBuilder {
  const s = getState();
  const t = a.track;
  const count = s.submissions.filter((x) => x.day === a.day).length;
  const today = currentDay();
  const late = today !== null && a.day < Math.min(today, s.totalDays);

  const e = new EmbedBuilder()
    .setColor(GREEN)
    .setAuthor({ name: `${who.name} ${a.replaced ? 'podmienił(a) piosenkę' : 'dodał(a) piosenkę'}`, iconURL: who.avatar })
    .setTimestamp();

  if (!t) {
    const id = a.trackUri.split(':').pop();
    return e
      .setTitle(a.trackName)
      .setURL(`https://open.spotify.com/track/${id}`)
      .addFields({ name: `📅 Dzień ${a.day}/${s.totalDays}`, value: themeFor(a.day) });
  }

  e.setTitle(`${t.explicit ? '🅴 ' : ''}${t.name}`.slice(0, 256))
    .setURL(t.url)
    .setDescription(`**${t.artistLinks}**`.slice(0, 4096))
    .addFields({ name: `📅 Dzień ${a.day}/${s.totalDays}`, value: themeFor(a.day) });
  if (t.cover) e.setThumbnail(t.cover);

  if (t.album) {
    const type = t.albumType && ALBUM_TYPE[t.albumType] ? ` (${ALBUM_TYPE[t.albumType]})` : '';
    e.addFields({ name: '💿 Album', value: (t.albumUrl ? `[${t.album}](${t.albumUrl})` : t.album).slice(0, 1000) + type, inline: true });
  }
  const release = formatRelease(t.releaseDate, t.releasePrecision);
  if (release) e.addFields({ name: '🗓️ Wydano', value: release, inline: true });
  const dur = formatDuration(t.durationMs);
  if (dur) e.addFields({ name: '⏱️ Długość', value: dur, inline: true });

  const footer = [`${count}. piosenka tego dnia`];
  if (late) footer.push('zaległy dzień');
  return e.setFooter({ text: footer.join(' · ') });
}

/** Jedna wiadomość: do 5 pełnych embedów, powyżej – zbiorcze podsumowanie (żeby /bulk nie spamował). */
export async function announce(client: Client, who: Who, items: Added[]): Promise<void> {
  const s = getState();
  const channelId = s.feedChannelId ?? s.reminderChannelId;
  if (!s.feedEnabled || !channelId || !items.length) return;
  const channel = (await client.channels.fetch(channelId).catch(() => null)) as SendableChannels | null;
  if (!channel?.isSendable()) return;

  if (items.length <= 5) {
    await channel.send({ embeds: items.map((a) => songEmbed(who, a)) });
    return;
  }

  const sorted = [...items].sort((a, b) => a.day - b.day);
  const lines = sorted.map((a) => {
    const label = a.track ? `${a.track.artists} – ${a.track.name}` : a.trackName;
    const url = a.track?.url ?? `https://open.spotify.com/track/${a.trackUri.split(':').pop()}`;
    return `\`${String(a.day).padStart(2, '0')}\` [${label}](${url})`;
  });
  let desc = '';
  for (const l of lines) {
    if (desc.length + l.length > 3900) {
      desc += `\n… i ${lines.length - desc.split('\n').length} więcej`;
      break;
    }
    desc += (desc ? '\n' : '') + l;
  }
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: `${who.name} nadrobił(a) ${items.length} ${plural(items.length, 'dzień', 'dni', 'dni')}`, iconURL: who.avatar })
        .setDescription(desc)
        .setThumbnail(sorted.find((a) => a.track?.cover)?.track?.cover ?? null)
        .setTimestamp(),
    ],
  });
}
