import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
  type Guild,
  type User,
  type SendableChannels,
} from 'discord.js';
import { announce, type Added, type Who } from './announce.js';
import { config } from './config.js';
import { currentDay, isValidDate, themeFor, todayLocal } from './days.js';
import { renderThemes } from './graphic.js';
import { parseBulk, resolveTrackId } from './links.js';
import { findDayMarker, syncPlaylist } from './playlist.js';
import { createPlaylist, getTrack, playlistUrl, type TrackInfo } from './spotify.js';
import { getState, removeSubmission, save, update, upsertSubmission } from './store.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GREEN = 0x1ed760;
const noPings = { allowedMentions: { parse: [] as never[] } };

// ───────────────────────── logika ─────────────────────────

function clip(s: string, max = 1900): string {
  return s.length > max ? s.slice(0, max - 20) + '\n… (ucięto)' : s;
}

/** Ostatni dzień, który można już uzupełnić (dzisiejszy, ale nie dalej niż koniec). */
function maxOpenDay(): number {
  const s = getState();
  const cur = currentDay();
  if (cur === null) throw new UserError('Challenge nie jest skonfigurowany – admin musi użyć /admin setup.');
  if (cur < 1) throw new UserError(`Challenge startuje ${s.startDate}.`);
  return Math.min(cur, s.totalDays);
}

class UserError extends Error {}

async function addSong(userId: string, day: number, link: string, asAdmin = false): Promise<Added & { text: string }> {
  const s = getState();
  if (day < 1 || day > s.totalDays) throw new UserError(`Dzień musi być w zakresie 1–${s.totalDays}.`);
  if (!asAdmin && day > maxOpenDay()) throw new UserError(`Dzień ${day} jeszcze nie nadszedł.`);

  const id = await resolveTrackId(link);
  if (!id) throw new UserError('To nie wygląda na link do **utworu** Spotify (Udostępnij → Kopiuj link do utworu).');

  let name = id;
  let track: TrackInfo | null = null;
  try {
    track = await getTrack(id);
    name = `${track.artists} – ${track.name}`;
  } catch (e) {
    console.warn('getTrack nie zadziałał, dodaję bez nazwy:', (e as Error).message);
  }

  const result = upsertSubmission({
    userId,
    day,
    trackUri: `spotify:track:${id}`,
    trackName: name,
    addedAt: new Date().toISOString(),
  });
  save();
  const replaced = result === 'replaced';
  return {
    day,
    replaced,
    track,
    trackUri: `spotify:track:${id}`,
    trackName: name,
    text: `${replaced ? '🔁 Podmieniono' : '✅ Dodano'} dzień **${day}** (${themeFor(day)}): ${name}`,
  };
}

async function whoOf(user: User, guild: Guild | null): Promise<Who> {
  const member = await guild?.members.fetch(user.id).catch(() => null);
  return {
    name: member?.displayName ?? user.globalName ?? user.username,
    avatar: (member ?? user).displayAvatarURL({ size: 128 }),
  };
}

function announceSafe(who: Who, items: Added[]): void {
  announce(client, who, items).catch((e) => console.error('Powiadomienie o piosence:', e));
}

async function syncSafe(): Promise<string> {
  try {
    const n = await syncPlaylist();
    return `🎵 Playlista zaktualizowana (${n} utworów).`;
  } catch (e) {
    console.error(e);
    return `⚠️ Zapisane w bocie, ale synchronizacja playlisty nie wyszła: ${(e as Error).message.slice(0, 200)}`;
  }
}

function graphicAttachment(highlight?: number | null) {
  const s = getState();
  const png = renderThemes({ title: s.title, themes: s.themes, totalDays: s.totalDays, currentDay: highlight });
  return new AttachmentBuilder(png, { name: 'tematy.png' });
}

async function readTxt(att: Attachment): Promise<string> {
  if (att.size > 200_000) throw new UserError('Plik jest za duży (max 200 KB).');
  const res = await fetch(att.url);
  return (await res.text()).replace(/^﻿/, '');
}

async function processBulk(userId: string, text: string, who: Who): Promise<string> {
  const { ok, bad } = parseBulk(text);
  if (!ok.length) throw new UserError('Nie znalazłem żadnej linii w formacie `numer_dnia link`.');
  const lines: string[] = [];
  let added = 0;
  const done: Added[] = [];
  for (const item of ok) {
    try {
      const r = await addSong(userId, item.day, item.link);
      lines.push(r.text);
      done.push(r);
      added++;
    } catch (e) {
      lines.push(`❌ Linia ${item.line} (dzień ${item.day}): ${e instanceof UserError ? e.message : 'błąd Spotify'}`);
    }
  }
  for (const b of bad) lines.push(`❌ Linia ${b.line}: nie rozumiem „${b.raw.slice(0, 60)}”`);
  const sync = added ? await syncSafe() : '';
  announceSafe(who, done);
  return clip(`**Dodano ${added}/${ok.length + bad.length}**\n${lines.join('\n')}\n${sync}`);
}

function missingDays(userId: string): number[] {
  const done = new Set(getState().submissions.filter((x) => x.userId === userId).map((x) => x.day));
  const out: number[] = [];
  for (let d = 1; d <= maxOpenDay(); d++) if (!done.has(d)) out.push(d);
  return out;
}

// ───────────────────────── przypomnienia ─────────────────────────

async function sendReminder(force = false): Promise<void> {
  const s = getState();
  const day = currentDay();
  if (!s.reminderChannelId || day === null || day < 1) return;

  const now = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date());
  if (!force && (now < s.reminderTime || s.lastReminderDay >= day)) return;
  if (!force && day > s.totalDays + 1) return;

  const channel = (await client.channels.fetch(s.reminderChannelId)) as SendableChannels | null;
  if (!channel?.isSendable()) return;

  if (day > s.totalDays) {
    const people = new Set(s.submissions.map((x) => x.userId)).size;
    await channel.send({
      content: '@everyone',
      embeds: [
        new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('🏁 Koniec challenge’u!')
          .setDescription(
            `${s.totalDays} dni, ${s.submissions.length} piosenek od ${people} osób.\n` +
              (s.playlistId ? `Cała playlista: ${playlistUrl(s.playlistId)}\n` : '') +
              'Zaległe dni nadal można uzupełniać przez `/bulk`.',
          ),
      ],
    });
  } else {
    const yesterday = day - 1;
    const yCount = yesterday >= 1 ? s.submissions.filter((x) => x.day === yesterday).length : 0;
    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle(`🎧 Dzień ${day}/${s.totalDays}`)
      .setDescription(`## ${themeFor(day)}\nWrzuć utwór: \`/add link:<link ze Spotify>\``)
      .setImage('attachment://tematy.png');
    if (yesterday >= 1) embed.addFields({ name: `Wczoraj (dzień ${yesterday})`, value: `${yCount} piosenek` });
    if (s.playlistId) embed.addFields({ name: 'Playlista', value: playlistUrl(s.playlistId) });
    await channel.send({ embeds: [embed], files: [graphicAttachment(day)] });
  }

  update((st) => (st.lastReminderDay = day));
}

// ───────────────────────── komendy ─────────────────────────

async function handleCommand(i: ChatInputCommandInteraction): Promise<void> {
  const s = getState();

  switch (i.commandName) {
    case 'add': {
      await i.deferReply({ ephemeral: true });
      const day = i.options.getInteger('day') ?? maxOpenDay();
      const r = await addSong(i.user.id, day, i.options.getString('link', true));
      await i.editReply(`${r.text}\n${await syncSafe()}`);
      announceSafe(await whoOf(i.user, i.guild), [r]);
      return;
    }

    case 'bulk': {
      const file = i.options.getAttachment('file');
      if (file) {
        await i.deferReply({ ephemeral: true });
        await i.editReply(await processBulk(i.user.id, await readTxt(file), await whoOf(i.user, i.guild)));
        return;
      }
      const missing = (() => {
        try {
          return missingDays(i.user.id);
        } catch {
          return [];
        }
      })();
      const input = new TextInputBuilder()
        .setCustomId('lines')
        .setLabel('Jedna linia = numer dnia + link')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(true)
        .setPlaceholder('1 https://open.spotify.com/track/...\n2 https://open.spotify.com/track/...');
      if (missing.length) input.setValue(missing.slice(0, 60).map((d) => `${d} `).join('\n'));
      await i.showModal(
        new ModalBuilder()
          .setCustomId('bulk-modal')
          .setTitle('Zaległe dni')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
      );
      return;
    }

    case 'remove': {
      const day = i.options.getInteger('day', true);
      await i.deferReply({ ephemeral: true });
      if (!removeSubmission(i.user.id, day)) return void (await i.editReply(`Nie masz piosenki w dniu ${day}.`));
      save();
      await i.editReply(`🗑️ Usunięto dzień ${day}.\n${await syncSafe()}`);
      return;
    }

    case 'today': {
      const day = maxOpenDay();
      const mine = s.submissions.find((x) => x.userId === i.user.id && x.day === day);
      await i.reply({
        ephemeral: true,
        content: `**Dzień ${day}/${s.totalDays}:** ${themeFor(day)}\n${mine ? `Twój wybór: ${mine.trackName}` : 'Jeszcze nic nie dodałeś – `/add`.'}`,
      });
      return;
    }

    case 'me': {
      const missing = missingDays(i.user.id);
      const done = s.submissions.filter((x) => x.userId === i.user.id).length;
      await i.reply({
        ephemeral: true,
        content: clip(
          `Masz **${done}/${s.totalDays}** dni.\n` +
            (missing.length
              ? `Brakuje: ${missing.map((d) => `**${d}** (${themeFor(d)})`).join(', ')}\nUzupełnij hurtem: \`/bulk\``
              : 'Wszystko na bieżąco 🔥'),
        ),
      });
      return;
    }

    case 'stats': {
      const counts = new Map<string, number>();
      for (const x of s.submissions) counts.set(x.userId, (counts.get(x.userId) ?? 0) + 1);
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      const open = maxOpenDay();
      const lines = sorted.map(([u, c], idx) => `${idx + 1}. <@${u}> – ${c}/${open}${c >= open ? ' ✅' : ''}`);
      await i.reply({ content: clip(`**Ranking (dzień ${open}/${s.totalDays})**\n${lines.join('\n') || 'Brak zgłoszeń.'}`), ...noPings });
      return;
    }

    case 'playlist': {
      await i.reply({ ephemeral: true, content: s.playlistId ? playlistUrl(s.playlistId) : 'Playlista nie jest jeszcze ustawiona.' });
      return;
    }

    case 'graphic': {
      await i.deferReply();
      let day: number | null = null;
      try {
        day = maxOpenDay();
      } catch {}
      await i.editReply({ files: [graphicAttachment(day)] });
      return;
    }

    case 'admin':
      return handleAdmin(i);
  }
}

async function handleAdmin(i: ChatInputCommandInteraction): Promise<void> {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('Brak uprawnień.');
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand();
  await i.deferReply({ ephemeral: true });

  if (group === 'marker') {
    if (sub === 'set') {
      const day = i.options.getInteger('day', true);
      const id = await resolveTrackId(i.options.getString('link', true));
      if (!id) throw new UserError('Niepoprawny link do utworu.');
      update((s) => (s.markers[String(day)] = `spotify:track:${id}`));
      return void (await i.editReply(`Marker dnia ${day} ustawiony.\n${await syncSafe()}`));
    }
    if (sub === 'auto') {
      const s = getState();
      const found: string[] = [];
      const missing: number[] = [];
      for (let d = 1; d <= s.totalDays; d++) {
        const t = await findDayMarker(d);
        if (t) {
          s.markers[String(d)] = t.uri;
          found.push(`${d}: ${t.artists} – ${t.name}`);
        } else missing.push(d);
      }
      save();
      return void (await i.editReply(
        clip(
          `Znaleziono **${found.length}/${s.totalDays}**.\n` +
            (missing.length ? `Brak dokładnego „Day N” dla: ${missing.join(', ')} → ustaw ręcznie \`/admin marker set\`.\n` : '') +
            found.join('\n'),
        ),
      ));
    }
    if (sub === 'list') {
      const s = getState();
      const set = Object.keys(s.markers).map(Number).sort((a, b) => a - b);
      const missing = Array.from({ length: s.totalDays }, (_, k) => k + 1).filter((d) => !s.markers[String(d)]);
      return void (await i.editReply(`Ustawione: ${set.join(', ') || '—'}\nBrakuje: ${missing.join(', ') || '—'}`));
    }
  }

  switch (sub) {
    case 'setup': {
      const start = i.options.getString('start_date', true);
      const time = i.options.getString('time') ?? getState().reminderTime;
      if (!isValidDate(start)) throw new UserError('Data w formacie RRRR-MM-DD, np. 2026-11-01.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UserError('Godzina w formacie HH:mm, np. 09:00.');
      update((s) => {
        s.startDate = start;
        s.reminderChannelId = i.options.getChannel('channel', true).id;
        s.reminderTime = time;
        s.totalDays = i.options.getInteger('days') ?? s.totalDays;
        s.title = i.options.getString('title') ?? s.title;
        s.lastReminderDay = 0;
      });
      const s = getState();
      await i.editReply(
        `✅ Start: **${s.startDate}**, ${s.totalDays} dni, przypomnienia o **${s.reminderTime}** (${config.timezone}) na <#${s.reminderChannelId}>.\n` +
          `Dziś: ${todayLocal()} → dzień ${currentDay()}.\nDalej: \`/admin themes\`, \`/admin playlist\`, \`/admin marker auto\`.`,
      );
      return;
    }
    case 'themes': {
      const text = await readTxt(i.options.getAttachment('file', true));
      const themes = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:dzie[ńn]|day)?\s*\d{1,3}\s*[:.\-)–]\s*/i, '').trim())
        .filter(Boolean);
      const total = getState().totalDays;
      update((s) => (s.themes = themes.slice(0, total)));
      await i.editReply({
        content: `Wczytano ${Math.min(themes.length, total)} tematów${themes.length < total ? ` ⚠️ brakuje ${total - themes.length}` : ''}${themes.length > total ? ` (nadmiarowe ${themes.length - total} pominięto)` : ''}.`,
        files: [graphicAttachment(null)],
      });
      return;
    }
    case 'theme': {
      const day = i.options.getInteger('day', true);
      update((s) => {
        while (s.themes.length < day) s.themes.push('');
        s.themes[day - 1] = i.options.getString('text', true);
      });
      return void (await i.editReply(`Dzień ${day}: ${themeFor(day)}`));
    }
    case 'playlist': {
      const url = i.options.getString('url');
      if (url) {
        const m = url.match(/playlist[/:]([A-Za-z0-9]{22})/);
        if (!m) throw new UserError('Niepoprawny link do playlisty.');
        update((s) => (s.playlistId = m[1]));
      } else {
        const s = getState();
        const p = await createPlaylist(s.title, `${s.title} – piosenki dzień po dniu, dodawane przez Discorda.`);
        update((st) => (st.playlistId = p.id));
      }
      return void (await i.editReply(`Playlista: ${playlistUrl(getState().playlistId!)}\n${await syncSafe()}`));
    }
    case 'add-for': {
      const user = i.options.getUser('user', true);
      const r = await addSong(user.id, i.options.getInteger('day', true), i.options.getString('link', true), true);
      await i.editReply(`${r.text} (dla <@${user.id}>)\n${await syncSafe()}`);
      announceSafe(await whoOf(user, i.guild), [r]);
      return;
    }
    case 'feed': {
      const ch = i.options.getChannel('channel');
      const off = i.options.getBoolean('off') ?? false;
      update((s) => {
        s.feedEnabled = !off;
        if (ch) s.feedChannelId = ch.id;
      });
      const s = getState();
      const target = s.feedChannelId ?? s.reminderChannelId;
      return void (await i.editReply(
        s.feedEnabled ? `🔔 Powiadomienia o piosenkach: ${target ? `<#${target}>` : 'brak kanału – ustaw /admin setup'}` : '🔕 Powiadomienia wyłączone.',
      ));
    }
    case 'sync':
      return void (await i.editReply(await syncSafe()));
    case 'remind':
      await sendReminder(true);
      return void (await i.editReply('Wysłano.'));
  }
}

async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  if (i.customId !== 'bulk-modal') return;
  await i.deferReply({ ephemeral: true });
  // linie z samym numerem (podpowiedź brakujących dni) są ignorowane
  const text = i.fields
    .getTextInputValue('lines')
    .split(/\r?\n/)
    .filter((l) => !/^\s*\d{1,3}\s*$/.test(l))
    .join('\n');
  await i.editReply(await processBulk(i.user.id, text, await whoOf(i.user, i.guild)));
}

// ───────────────────────── start ─────────────────────────

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) await handleCommand(i);
    else if (i.isModalSubmit()) await handleModal(i);
  } catch (e) {
    const msg = e instanceof UserError ? `❌ ${e.message}` : '❌ Coś poszło nie tak – szczegóły w logach bota.';
    if (!(e instanceof UserError)) console.error(e);
    if (!i.isRepliable()) return;
    if (i.deferred || i.replied) await i.editReply({ content: msg, embeds: [], files: [] }).catch(() => {});
    else await i.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`Zalogowano jako ${c.user.tag}`);
  // sprawdzane co minutę – po restarcie bota zaległe przypomnienie wyśle się samo
  const tick = () => sendReminder().catch((e) => console.error('Przypomnienie:', e));
  tick();
  setInterval(tick, 60_000);
});

client.login(config.discordToken);
