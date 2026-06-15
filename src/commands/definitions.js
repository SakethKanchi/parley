import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { SUPPORTED_PROVIDERS } from '../adapters/summarizer/index.js';
import { WHISPER_MODELS } from './setup-logic.js';
import { LANGUAGES } from '../adapters/summarizer/languages.js';

export function buildCommands() {
  return [
    new SlashCommandBuilder().setName('join').setDescription('Join your voice channel and start recording'),
    new SlashCommandBuilder().setName('leave').setDescription('Stop recording and leave'),
    new SlashCommandBuilder().setName('summary').setDescription('Show notes for a meeting')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('post').setDescription('Post a meeting summary publicly in this channel')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('history').setDescription('List recent meetings'),
    new SlashCommandBuilder().setName('status').setDescription('Check bot status and current recording'),
    new SlashCommandBuilder().setName('raw').setDescription('Dump raw meeting data')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('search').setDescription('Search past meetings')
      .addStringOption((o) => o.setName('keyword').setDescription('Word or phrase').setRequired(true)),
    new SlashCommandBuilder().setName('setup').setDescription('Configure the bot (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('provider').setDescription('Summarizer provider')
        .addChoices(...SUPPORTED_PROVIDERS.map((p) => ({ name: p, value: p }))))
      .addStringOption((o) => o.setName('model').setDescription('Summarizer model name'))
      .addStringOption((o) => o.setName('whisper_model').setDescription('Whisper model size')
        .addChoices(...WHISPER_MODELS.map((m) => ({ name: m, value: m }))))
      .addChannelOption((o) => o.setName('notes_channel').setDescription('Where to post notes').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('thread').setDescription('Post notes in a thread'))
      .addBooleanOption((o) => o.setName('autojoin').setDescription('Auto-join when 2+ people are in voice'))
      .addStringOption((o) => o.setName('language').setDescription('Spoken language (pick German to fix DE/EN mixing)')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Auto-detect', value: 'auto' }))
      .addStringOption((o) => o.setName('summary_language').setDescription('Language for the notes/summary')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Match transcription', value: 'match' })),
  ];
}

export function commandsJSON() {
  return buildCommands().map((c) => c.toJSON());
}
