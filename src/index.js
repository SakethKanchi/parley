import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { join } from 'node:path';
import { config, validateEnv } from './config/env.js';
import { openDb } from './store/db.js';
import { getGuildConfig, setGuildConfig } from './store/config.js';
import { deployCommands } from './commands/deploy.js';
import { MeetingManager } from './voice/meeting-manager.js';
import { TrackRegistry, attachCapture } from './voice/capture.js';
import { processMeeting } from './pipeline/orchestrator.js';
import { getSummarizer } from './adapters/summarizer/index.js';
import { shouldAutoJoin, shouldAutoLeave } from './voice/decisions.js';
import { validateSetup } from './commands/setup-logic.js';
import { renderNotes, chunk } from './delivery/discord-notes.js';
import { postNotes } from './delivery/post.js';

validateEnv();
const db = openDb(join(config.dataDir, 'meetings.db'));
const audioRoot = join(config.dataDir, 'audio');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const manager = new MeetingManager({
  db, audioRoot,
  startCapture: ({ meetingId, connection, guild, audioDir }) => {
    const registry = new TrackRegistry();
    attachCapture({ connection, guild, audioDir, registry });
    return { registry };
  },
  finalize: async (meetingId, tracks, session) => {
    const meeting = db.getMeeting(meetingId);
    const cfg = getGuildConfig(db, meeting.guild_id);
    try {
      await processMeeting(db, meetingId, {
        tracks,
        cfg,
        summarizer: getSummarizer(cfg),
        deliver: async (notes, talktime) => postNotes({ client, meeting, cfg, notes, talktime }),
      });
    } catch (err) {
      console.error(`Meeting ${meetingId} failed:`, err.message);
      const ch = await client.channels.fetch(cfg.notesChannelId || meeting.channel_id).catch(() => null);
      if (ch) await ch.send(`⚠️ Meeting ${meetingId} processing failed (${db.getMeeting(meetingId).status}). Transcript is saved if available.`).catch(() => {});
    }
  },
});

function humanCount(channel) {
  return channel.members.filter((m) => !m.user.bot).size;
}
function setRecIndicator(guild, on) {
  guild.members.me?.setNickname(on ? '[REC] Meeting Bot' : null).catch(() => {});
}
async function joinAndStart(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id, guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  const attendees = channel.members.filter((m) => !m.user.bot).map((m) => ({ id: m.id, displayName: m.displayName }));
  manager.start({ guildId: channel.guild.id, channelId: channel.id, channelName: channel.name, connection, guild: channel.guild, attendees });
  setRecIndicator(channel.guild, true);
}
async function stopAndLeave(guildId, channelId) {
  await manager.stop(guildId, channelId);
  const conn = getVoiceConnection(guildId);
  if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
  const guild = client.guilds.cache.get(guildId);
  if (guild) setRecIndicator(guild, false);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await deployCommands();
  for (const m of db.findOrphanedMeetings()) {
    db.setMeetingStatus(m.id, 'transcription_failed');
    console.warn(`Orphaned meeting ${m.id} marked transcription_failed on boot.`);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const channel = newState.channel || oldState.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const cfg = getGuildConfig(db, guild.id);
  const connected = manager.isActive(guild.id, channel.id);
  const count = humanCount(channel);

  if (shouldAutoJoin({ humanCount: count, autoJoin: cfg.autoJoin, connected })) {
    await joinAndStart(channel).catch((e) => console.error('auto-join failed:', e.message));
  } else if (shouldAutoLeave({ humanCount: count, connected })) {
    await stopAndLeave(guild.id, channel.id).catch((e) => console.error('auto-leave failed:', e.message));
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;
  try {
    if (commandName === 'join') {
      const vc = member.voice?.channel;
      if (!vc) return interaction.reply({ content: '❌ Join a voice channel first.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await joinAndStart(vc);
      return interaction.editReply('✅ Recording started.');
    }
    if (commandName === 'leave') {
      const vc = member.voice?.channel;
      const channelId = vc?.id;
      if (!channelId || !manager.isActive(guild.id, channelId)) return interaction.reply({ content: "❌ I'm not recording here.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await stopAndLeave(guild.id, channelId);
      return interaction.editReply('✅ Stopped. Notes will post shortly.');
    }
    if (commandName === 'summary') {
      const id = interaction.options.getInteger('meeting') ?? db.listRecent(guild.id, 1)[0]?.id;
      const s = id ? db.getSummary(id) : null;
      if (!s) return interaction.reply({ content: '❌ No summary found.', ephemeral: true });
      const m = db.getMeeting(id);
      const parts = chunk(renderNotes(s.notes, s.talktime, { channelName: m.channel_name, date: m.started_at }));
      await interaction.reply({ content: parts[0], ephemeral: true });
      for (const p of parts.slice(1)) await interaction.followUp({ content: p, ephemeral: true });
      return;
    }
    if (commandName === 'history') {
      const rows = db.listRecent(guild.id, 10);
      const text = rows.length ? rows.map((m) => `#${m.id} • ${m.channel_name} • ${m.started_at} • ${m.status}`).join('\n') : 'No meetings yet.';
      return interaction.reply({ content: text, ephemeral: true });
    }
    if (commandName === 'search') {
      const kw = interaction.options.getString('keyword');
      const hits = db.searchUtterances(guild.id, kw);
      if (!hits.length) return interaction.reply({ content: `No matches for "${kw}".`, ephemeral: true });
      const text = hits.slice(0, 10).map((h) => `#${h.meeting_id} ${h.display_name}: ${h.text}`).join('\n');
      return interaction.reply({ content: chunk(text)[0], ephemeral: true });
    }
    if (commandName === 'setup') {
      const input = {
        provider: interaction.options.getString('provider') ?? undefined,
        model: interaction.options.getString('model') ?? undefined,
        whisperModel: interaction.options.getString('whisper_model') ?? undefined,
        notesChannelId: interaction.options.getChannel('notes_channel')?.id,
        useThread: interaction.options.getBoolean('thread') ?? undefined,
        autoJoin: interaction.options.getBoolean('autojoin') ?? undefined,
        language: interaction.options.getString('language') ?? undefined,
      };
      const result = validateSetup(input, config);
      if (!result.ok) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      const merged = setGuildConfig(db, guild.id, result.patch);
      return interaction.reply({ content: `✅ Config updated:\n\`\`\`json\n${JSON.stringify(merged, null, 2)}\n\`\`\``, ephemeral: true });
    }
  } catch (err) {
    console.error('interaction error:', err);
    const msg = `❌ Error: ${err.message}`;
    if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
    else interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.login(config.discordToken);
