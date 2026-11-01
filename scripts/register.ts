import { REST, Routes } from 'discord.js';
import { config } from '../src/config.js';
import { commands } from '../src/commands.js';

const rest = new REST().setToken(config.discordToken);
await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.guildId), { body: commands });
console.log(`Zarejestrowano ${commands.length} komend na serwerze ${config.guildId}.`);
