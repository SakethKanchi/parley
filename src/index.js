import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
client.on('raw', (packet) => {
  if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
    console.log(`[gateway] ${packet.t}:`, JSON.stringify(packet.d).substring(0, 200));
  }
});

const manager = new MeetingManager({
  db, audioRoot,
  startCapture: ({ meetingId, connection, guild, audioDir }) => {
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({ connection, guild, audioDir, registry });
    return { registry, stopAll };
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
      // Success: delete the meeting's audio. On failure we keep the PCM for manual retry.
      await rm(session.audioDir, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
      console.error(`Meeting ${meetingId} failed:`, err.message);
      const reason = err.userMessage || err.message;
      const ch = await client.channels.fetch(cfg.notesChannelId || meeting.channel_id).catch(() => null);
      if (ch) await ch.send(`⚠️ Meeting ${meetingId} failed: ${reason}\nThe transcript is saved — an admin can retry with \`node scripts/reprocess-meeting.mjs ${meetingId}\`.`).catch(() => {});
    }
  },
});
const joiningInProgress = new Set(); // "guildId:channelId" strings
function humanCount(channel) {
  return channel.members.filter((m) => !m.user.bot).size;
}
function setRecIndicator(guild, on) {
  guild.members.me?.setNickname(on ? '[REC] Meeting Bot' : null).catch((e) => {
    console.warn('Nickname change failed:', e.message);
  });
}
function logVoiceStates(connection, label) {
  connection.on('stateChange', (oldState, newState) => {
    console.log(`[voice:${label}] ${oldState.status} -> ${newState.status}`);
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.warn(`[voice:${label}] disconnected — likely missing Connect/Speak permission or network issue`);
    }
  });
  connection.on('error', (err) => {
    console.error(`[voice:${label}] connection error:`, err.message);
  });
  connection.on('debug', (msg) => {
    console.log(`[voice:${label}] debug:`, msg);
  });
}
function hasVoicePermissions(channel) {
  const perms = channel.guild.members.me?.permissionsIn(channel);
  return {
    connect: perms?.has('Connect') ?? false,
    speak: perms?.has('Speak') ?? false,
    useVoiceActivity: perms?.has('UseVAD') ?? false,
  };
}
async function joinAndStart(channel) {
  const joinKey = `${channel.guild.id}:${channel.id}`;
  if (joiningInProgress.has(joinKey)) {
    console.log(`[join] Skipping duplicate join for ${joinKey}`);
    return;
  }
  joiningInProgress.add(joinKey);
  const permCheck = hasVoicePermissions(channel);
  if (!permCheck.connect) {
    joiningInProgress.delete(joinKey);
    throw new Error('Bot lacks **Connect** permission in this voice channel. Check server roles / channel overrides.');
  }
  if (!permCheck.speak) {
    joiningInProgress.delete(joinKey);
    throw new Error('Bot lacks **Speak** permission in this voice channel. Check server roles / channel overrides.');
  }
  console.log(`[voice] joinVoiceChannel guild=${channel.guild.id} channel=${channel.id}`);
  const connection = joinVoiceChannel({
    channelId: channel.id, guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: true,
  });
  console.log(`[voice] connection initial state: ${connection.state.status}`);
  connection.on('stateChange', (oldState, newState) => {
    console.log(`[voice] stateChange: ${oldState.status} -> ${newState.status}`);
  });
  connection.on('error', (err) => {
    console.error(`[voice] connection error:`, err.message);
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
    console.log(`[voice] connection reached Ready`);
  } catch (err) {
    console.error(`[voice] entersState failed after 25s. Final state: ${connection.state.status}`);
    connection.destroy();
    joiningInProgress.delete(joinKey);
    throw new Error(
      `Voice connection failed: ${err.message}. Final state was ${connection.state.status}. ` +
      `Common causes: missing Connect/Speak permission, bot role below channel restrictions, ` +
      `or Discord voice region issues. Try moving the bot role higher in Server Settings → Roles.`
    );
  }
  if (manager.isActive(channel.guild.id, channel.id)) {
    connection.destroy();
    joiningInProgress.delete(joinKey);
    return;
  }
  const attendees = channel.members.filter((m) => !m.user.bot).map((m) => ({ id: m.id, displayName: m.displayName }));
  const meetingId = manager.start({ guildId: channel.guild.id, channelId: channel.id, channelName: channel.name, connection, guild: channel.guild, attendees });
  joiningInProgress.delete(joinKey);
  console.log(`[meeting] Started #${meetingId} in ${channel.name} with ${attendees.length} attendee(s)`);
  setRecIndicator(channel.guild, true);
}
async function stopAndLeave(guildId, channelId) {
  console.log(`[meeting] Stopping meeting in guild:${guildId} channel:${channelId}`);
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
  console.log(`[vSU] guild=${guild.id} channel=${channel.id} user=${newState.id} old=${oldState.channelId} new=${newState.channelId} humans=${count} connected=${connected} autoJoin=${cfg.autoJoin}`);
  if (shouldAutoJoin({ humanCount: count, autoJoin: cfg.autoJoin, connected })) {
    console.log(`[vSU] auto-join triggered for ${channel.id}`);
    await joinAndStart(channel).catch((e) => console.error('auto-join failed:', e.message));
  } else if (shouldAutoLeave({ humanCount: count, connected })) {
    console.log(`[vSU] auto-leave triggered for ${channel.id}`);
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
      if (manager.isActive(guild.id, vc.id)) return interaction.reply({ content: '✅ Already recording this channel.', ephemeral: true });
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
    if (commandName === 'post') {
      const id = interaction.options.getInteger('meeting') ?? db.listRecent(guild.id, 1)[0]?.id;
      const s = id ? db.getSummary(id) : null;
      if (!s) return interaction.reply({ content: '❌ No summary found.', ephemeral: true });
      const m = db.getMeeting(id);
      const cfg = getGuildConfig(db, guild.id);
      const parts = chunk(renderNotes(s.notes, s.talktime, { channelName: m.channel_name, date: m.started_at }));
      await interaction.deferReply({ ephemeral: true });

      let target = interaction.channel;
      if (cfg.useThread && interaction.channel?.type === ChannelType.GuildText) {
        // Fall back to the channel itself if thread creation fails (e.g. missing perms).
        target = await interaction.channel.threads
          .create({ name: `Notes — ${m.channel_name} ${m.started_at.slice(0, 10)}` })
          .catch(() => interaction.channel);
      }
      for (const p of parts) await target.send(p);
      const where = target === interaction.channel ? 'this channel' : `thread <#${target.id}>`;
      return interaction.editReply(`✅ Posted summary for meeting #${id} in ${where}.`);
    }
    if (commandName === 'history') {
      const rows = db.listRecent(guild.id, 10);
      const text = rows.length ? rows.map((m) => `#${m.id} • ${m.channel_name} • ${m.started_at} • ${m.status}`).join('\n') : 'No meetings yet.';
      return interaction.reply({ content: text, ephemeral: true });
    }
    if (commandName === 'status') {
      const sessions = [...manager.active.entries()];
      const activeText = sessions.length
        ? sessions.map(([k, s]) => `🔴 Recording in <#${s.channelId}> (meeting #${s.meetingId})`).join('\n')
        : '🟢 Not currently recording.';
      const recent = db.listRecent(guild.id, 5);
      const recentText = recent.length
        ? '\n\n**Recent meetings:**\n' + recent.map((m) => `#${m.id} • ${m.channel_name} • ${m.started_at} • ${m.status}`).join('\n')
        : '';
      return interaction.reply({ content: activeText + recentText, ephemeral: true });
    }
    if (commandName === 'raw') {
      const id = interaction.options.getInteger('meeting') ?? db.listRecent(guild.id, 1)[0]?.id;
      const m = id ? db.getMeeting(id) : null;
      if (!m) return interaction.reply({ content: '❌ No meeting found.', ephemeral: true });
      const attendees = db.listAttendees(id);
      const utterances = db.listUtterances(id);
      const summary = db.getSummary(id);
      const payload = {
        meeting: m,
        attendees: attendees.map((a) => ({ user_id: a.user_id, display_name: a.display_name })),
        utteranceCount: utterances.length,
        utterances: utterances.slice(0, 20).map((u) => ({ speaker: u.display_name, start_ms: u.start_ms, end_ms: u.end_ms, text: u.text })),
        summary: summary ? { model: summary.model_used, created: summary.created_at } : null,
      };
      const json = JSON.stringify(payload, null, 2);
      const parts = chunk(json, 1900);
      await interaction.reply({ content: '```json\n' + parts[0] + '\n```', ephemeral: true });
      for (const p of parts.slice(1)) await interaction.followUp({ content: '```json\n' + p + '\n```', ephemeral: true });
      return;
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
