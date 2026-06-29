const json = (r) => { if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.error || r.statusText))); return r.json(); };

export const api = {
  guilds: () => fetch('/api/guilds').then(json),
  meetings: (g) => fetch(`/api/guilds/${g}/meetings`).then(json),
  meeting: (id) => fetch(`/api/meetings/${id}`).then(json),
  todos: (g, { open, assignee } = {}) => {
    const p = new URLSearchParams();
    if (open) p.set('open', '1');
    if (assignee !== undefined) p.set('assignee', assignee === null ? '__unassigned__' : assignee);
    const qs = p.toString();
    return fetch(`/api/guilds/${g}/todos${qs ? `?${qs}` : ''}`).then(json);
  },
  assignees: (g) => fetch(`/api/guilds/${g}/assignees`).then(json),
  ask: (g, id, question) => fetch(`/api/guilds/${g}/meetings/${id}/ask`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }),
  }).then(json),
  setTodoDone: (id, done) => fetch(`/api/todos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done }) }).then(json),
  search: (g, q) => fetch(`/api/guilds/${g}/search?q=${encodeURIComponent(q)}`).then(json),
  config: (g) => fetch(`/api/guilds/${g}/config`).then(json),
  saveConfig: (g, patch) => fetch(`/api/guilds/${g}/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(json),
};
