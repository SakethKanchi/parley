export class MeetingManager {
  constructor({ db, audioRoot, startCapture, finalize, now = () => new Date().toISOString() }) {
    this.db = db;
    this.audioRoot = audioRoot;
    this.startCapture = startCapture;     // (ctx) -> { registry }
    this.finalize = finalize;             // async (meetingId, tracks, ctx) -> void
    this.now = now;
    this.active = new Map();              // key "guild:channel" -> session
  }

  key(guildId, channelId) { return `${guildId}:${channelId}`; }
  isActive(guildId, channelId) { return this.active.has(this.key(guildId, channelId)); }

  start({ guildId, channelId, channelName, connection, guild, attendees }) {
    const k = this.key(guildId, channelId);
    if (this.active.has(k)) return this.active.get(k).meetingId;

    const startedAt = this.now();
    const meetingId = this.db.createMeeting({ guildId, channelId, channelName, startedAt });
    for (const a of attendees || []) this.db.addAttendee(meetingId, a.id, a.displayName);

    const audioDir = `${this.audioRoot}/${meetingId}`;
    const { registry, stopAll } = this.startCapture({ meetingId, connection, guild, audioDir });
    this.active.set(k, { meetingId, guildId, channelId, channelName, startedAt, connection, guild, registry, stopAll, audioDir });
    return meetingId;
  }

  async stop(guildId, channelId) {
    const k = this.key(guildId, channelId);
    const session = this.active.get(k);
    if (!session) return null;
    this.active.delete(k);
    if (session.stopAll) await session.stopAll();  // flush in-flight speaking turns first
    const tracks = session.registry.list();
    await this.finalize(session.meetingId, tracks, session);
    return session.meetingId;
  }

  // In-progress recordings, as plain data for the web dashboard's live view.
  // No Discord/voice handles leak out — just what the UI needs to render.
  listActive() {
    return [...this.active.values()].map((s) => ({
      meetingId: s.meetingId,
      guildId: s.guildId,
      channelId: s.channelId,
      channelName: s.channelName,
      startedAt: s.startedAt,
    }));
  }
}
