import { REST, Routes } from 'discord.js';
import { commandsJSON } from './definitions.js';
import { config } from '../config/env.js';

export async function deployCommands(clientId = config.discordClientId, token = config.discordToken) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commandsJSON() });
}
