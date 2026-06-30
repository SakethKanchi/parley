import { useGuild } from '../GuildContext.jsx';
import { useLive } from '../LiveContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { LiveCard } from '../components/Live.jsx';
import { Icon, Empty } from '../components/ui.jsx';

export default function Live() {
  const { guildId } = useGuild();
  const { live, error } = useLive();

  if (!guildId) return <Page><Empty icon={Icon.Radio} title="No server selected" body="Pick a Discord server to see its live recordings." /></Page>;

  return (
    <Page>
      <PageHead
        title="Live"
        subtitle={live.length ? `${live.length} recording${live.length === 1 ? '' : 's'} in progress` : 'Real-time view of in-progress recordings'}
      />
      {error && (
        <div className="mb-5 text-sm text-error bg-error-soft rounded-sm px-3 py-2">{error}</div>
      )}
      {live.length === 0 ? (
        <div className="card">
          <Empty
            icon={Icon.Radio}
            title="Nothing recording right now"
            body="When Parley joins a voice channel, the live session shows up here with a timer and a one-click stop. Use /join in Discord or join a voice channel with auto-join on."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {live.map((s) => <LiveCard key={`${s.guildId}:${s.channelId}`} session={s} />)}
        </div>
      )}
    </Page>
  );
}
