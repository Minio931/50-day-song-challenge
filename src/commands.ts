import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const dayOpt = (o: any, required: boolean, desc = 'Numer dnia (1–50)') =>
  o.setName('day').setDescription(desc).setMinValue(1).setMaxValue(99).setRequired(required);

export const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Dodaj piosenkę ze Spotify na dziś (albo zaległy dzień)')
    .addStringOption((o) => o.setName('link').setDescription('Link do utworu ze Spotify').setRequired(true))
    .addIntegerOption((o) => dayOpt(o, false, 'Zaległy dzień (domyślnie dzisiejszy)')),

  new SlashCommandBuilder()
    .setName('bulk')
    .setDescription('Masowo dodaj zaległe dni (okno do wklejenia albo plik .txt)')
    .addAttachmentOption((o) =>
      o.setName('file').setDescription('Plik .txt: w każdej linii "numer_dnia link"').setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Usuń swoją piosenkę z danego dnia')
    .addIntegerOption((o) => dayOpt(o, true)),

  new SlashCommandBuilder().setName('today').setDescription('Dzisiejszy temat'),
  new SlashCommandBuilder().setName('me').setDescription('Twój postęp i brakujące dni'),
  new SlashCommandBuilder().setName('stats').setDescription('Ranking uczestników'),
  new SlashCommandBuilder().setName('playlist').setDescription('Link do wspólnej playlisty'),
  new SlashCommandBuilder().setName('graphic').setDescription('Grafika ze wszystkimi tematami'),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Konfiguracja challenge’u')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Data startu, kanał i godzina przypomnień')
        .addStringOption((o) => o.setName('start_date').setDescription('Dzień 1, format RRRR-MM-DD').setRequired(true))
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Kanał przypomnień')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((o) => o.setName('time').setDescription('Godzina przypomnienia HH:mm (domyślnie 09:00)'))
        .addIntegerOption((o) => o.setName('days').setDescription('Liczba dni (domyślnie 50)').setMinValue(1).setMaxValue(99))
        .addStringOption((o) => o.setName('title').setDescription('Tytuł na grafice')),
    )
    .addSubcommand((s) =>
      s
        .setName('themes')
        .setDescription('Wgraj tematy z pliku .txt (jedna linia = jeden dzień)')
        .addAttachmentOption((o) => o.setName('file').setDescription('Plik .txt').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('theme')
        .setDescription('Ustaw/zmień temat jednego dnia')
        .addIntegerOption((o) => dayOpt(o, true))
        .addStringOption((o) => o.setName('text').setDescription('Temat').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('playlist')
        .setDescription('Utwórz nową playlistę albo podepnij istniejącą (musi należeć do konta bota)')
        .addStringOption((o) => o.setName('url').setDescription('Link do istniejącej playlisty (puste = nowa)')),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('marker')
        .setDescription('Piosenki oddzielające dni')
        .addSubcommand((s) =>
          s.setName('auto').setDescription('Znajdź na Spotify utwory o tytule "Day N" dla wszystkich dni'),
        )
        .addSubcommand((s) =>
          s
            .setName('set')
            .setDescription('Ustaw ręcznie marker dnia')
            .addIntegerOption((o) => dayOpt(o, true))
            .addStringOption((o) => o.setName('link').setDescription('Link do utworu').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('list').setDescription('Pokaż markery i brakujące dni')),
    )
    .addSubcommand((s) =>
      s
        .setName('add-for')
        .setDescription('Dodaj piosenkę w imieniu uczestnika')
        .addUserOption((o) => o.setName('user').setDescription('Uczestnik').setRequired(true))
        .addIntegerOption((o) => dayOpt(o, true))
        .addStringOption((o) => o.setName('link').setDescription('Link').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('feed')
        .setDescription('Kanał z powiadomieniami o dodanych piosenkach')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Puste = ten sam co przypomnienia')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addBooleanOption((o) => o.setName('off').setDescription('Wyłącz powiadomienia')),
    )
    .addSubcommand((s) => s.setName('sync').setDescription('Przebuduj playlistę od zera'))
    .addSubcommand((s) => s.setName('remind').setDescription('Wyślij dzisiejsze przypomnienie teraz')),
].map((c) => c.toJSON());
