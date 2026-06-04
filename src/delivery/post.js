import { ChannelType } from 'discord.js';
import { renderNotes, chunk } from './discord-notes.js';

export async function postNotes({ client, meeting, cfg, notes, talktime }) {
  const channelId = cfg.notesChannelId || meeting.channel_id;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const md = renderNotes(notes, talktime, { channelName: meeting.channel_name, date: meeting.started_at });
  const parts = chunk(md);

  let target = channel;
  if (cfg.useThread && channel.type === ChannelType.GuildText) {
    // Fall back to the channel itself if thread creation fails (e.g. missing perms)
    // so the notes are never silently lost.
    target = await channel.threads
      .create({ name: `Notes — ${meeting.channel_name} ${meeting.started_at.slice(0, 10)}` })
      .catch(() => channel);
  }
  for (const part of parts) await target.send(part);
}
