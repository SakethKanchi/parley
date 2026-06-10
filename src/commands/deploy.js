import { REST, Routes } from 'discord.js';
import { commandsJSON } from './definitions.js';
import { config } from '../config/env.js';

// Register to a specific guild (instant) when guildId is given, else globally
// (slow propagation, ~1h, with flaky cached visibility). We register per-guild
// so command changes like /post appear immediately.
export async function deployCommands(clientId = config.discordClientId, token = config.discordToken, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commandsJSON() });
}

// Clear the global command set. Used once on boot so commands left over from the
// old global registration don't shadow/duplicate the per-guild ones.
export async function clearGlobalCommands(clientId = config.discordClientId, token = config.discordToken) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
}
