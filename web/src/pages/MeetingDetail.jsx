import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

function Section({ title, children }) {
  return <section className="mb-5"><h2 className="text-sm uppercase tracking-wide text-muted mb-2">{title}</h2>{children}</section>;
}

export default function MeetingDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [showTranscript, setShow] = useState(false);
  useEffect(() => { api.meeting(id).then(setData); }, [id]);
  if (!data) return <div className="text-muted">Loading…</div>;
  const notes = data.summary?.notes;
  const maxMs = Math.max(1, ...(data.summary?.talktime || []).map((t) => t.ms));
  return (
    <div>
      <Link to="/meetings" className="text-muted text-sm">← back</Link>
      <h1 className="text-xl mt-2 mb-4">#{data.meeting.channel_name}</h1>
      {!notes && <p className="text-muted">No summary yet (status: {data.meeting.status}).</p>}
      {notes && <>
        <Section title="TL;DR"><p className="text-ink">{notes.tldr}</p></Section>
        {notes.topics?.length > 0 && <Section title="Topics">
          {notes.topics.map((t, i) => <div key={i} className="mb-2">
            <div className="text-ink">{t.title}</div>
            <ul className="list-disc ml-5 text-muted">{(t.points || []).map((p, j) => <li key={j}>{p}</li>)}</ul>
          </div>)}
        </Section>}
        {notes.decisions?.length > 0 && <Section title="Decisions">
          <ul className="list-disc ml-5 text-ink">{notes.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></Section>}
        {notes.openQuestions?.length > 0 && <Section title="Open Questions">
          <ul className="list-disc ml-5 text-ink">{notes.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></Section>}
        {notes.actionItems?.length > 0 && <Section title="Action Items">
          <ul className="list-disc ml-5 text-ink">{notes.actionItems.map((a, i) => <li key={i}>{a.assignee ? <b>{a.assignee}: </b> : ''}{a.task}</li>)}</ul></Section>}
      </>}
      {(data.summary?.talktime || []).length > 0 && <Section title="Talk time">
        {data.summary.talktime.map((t, i) => <div key={i} className="mb-1">
          <div className="flex justify-between text-sm"><span className="text-ink">{t.displayName}</span><span className="text-muted">{t.pct}%</span></div>
          <div className="h-2 bg-panel-2 rounded"><div className="h-2 bg-primary rounded" style={{ width: `${(t.ms / maxMs) * 100}%` }} /></div>
        </div>)}
      </Section>}
      <button onClick={() => setShow((s) => !s)} className="text-sm text-primary">{showTranscript ? 'Hide' : 'Show'} transcript</button>
      {showTranscript && <div className="mt-3 space-y-1 font-mono text-sm">
        {data.utterances.map((u) => <div key={u.id}><span className="text-accent">{u.display_name}: </span><span className="text-muted">{u.text}</span></div>)}
      </div>}
    </div>
  );
}
