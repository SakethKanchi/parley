import { useSystem } from '../SystemContext.jsx';
import { Logo } from '../components/ui.jsx';
import { ConnectionForm, BotStatusBadge } from '../components/Connection.jsx';

const STEPS = [
  ['Create a Discord application', <>Open the <a className="text-primary hover:underline" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Developer Portal</a>, click <b>New Application</b>, then under <b>Bot</b> press <b>Reset Token</b> to reveal your bot token.</>],
  ['Invite the bot to your server', <>Under <b>OAuth2 → URL Generator</b> select scopes <code className="text-ink-2">bot</code> and <code className="text-ink-2">applications.commands</code>, plus Connect, Speak, Use Voice Activity, Send Messages, Create Public Threads, and Embed Links. Open the URL to add it.</>],
  ['Paste your credentials here', <>Drop the bot token and your Application (client) ID into the form. Parley connects instantly, no restart.</>],
];

export default function Onboarding() {
  const { status, refresh } = useSystem();
  const conn = status?.connection;
  const bot = status?.bot;
  const connecting = bot?.state === 'starting';
  const error = bot?.state === 'error' ? bot?.error : null;

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-[920px] grid md:grid-cols-2 gap-8 items-start">
        {/* Left: brand + steps */}
        <div className="md:pt-6">
          <div className="flex items-center gap-3 mb-6">
            <Logo size={40} />
            <span className="font-display text-2xl font-extrabold tracking-tight">Parley</span>
          </div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight mb-2">Connect your Discord bot</h1>
          <p className="text-muted text-sm leading-relaxed mb-7 max-w-[46ch]">
            Parley records voice meetings and posts AI notes. It runs entirely on your machine.
            Connect a Discord bot once to get started.
          </p>
          <ol className="space-y-5">
            {STEPS.map(([title, body], i) => (
              <li key={i} className="flex gap-3.5">
                <span className="shrink-0 mt-0.5 grid place-items-center h-7 w-7 rounded-full bg-primary-soft text-primary text-sm font-bold">{i + 1}</span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{title}</p>
                  <p className="text-[13px] text-muted leading-relaxed mt-0.5">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Right: connection form */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-ink">Credentials</h2>
            {bot && <BotStatusBadge bot={bot} />}
          </div>

          {connecting ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-ink">Connecting to Discord…</p>
              <p className="text-xs text-muted mt-1">Registering slash commands in your servers.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 text-sm text-error bg-error-soft rounded-sm px-3 py-2">
                  {error}
                </div>
              )}
              <ConnectionForm conn={conn} onSaved={refresh} submitLabel="Connect to Discord" />
            </>
          )}

          <p className="text-[11px] text-faint leading-relaxed mt-5">
            Credentials are written to your local <code className="text-muted">.env</code> and never leave this machine.
            The dashboard binds to localhost only.
          </p>
        </div>
      </div>
    </div>
  );
}
