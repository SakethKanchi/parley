const json = (r) => { if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.error || r.statusText))); return r.json(); };

export const api = {
  guilds: () => fetch('/api/guilds').then(json),
  meetings: (g) => fetch(`/api/guilds/${g}/meetings`).then(json),
  stats: (g) => fetch(`/api/guilds/${g}/stats`).then(json),
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
  deleteMeeting: (id) => fetch(`/api/meetings/${id}`, { method: 'DELETE' }).then(json),
  mergeMeetings: (id, sourceIds) => fetch(`/api/meetings/${id}/merge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceIds }) }).then(json),
  search: (g, q) => fetch(`/api/guilds/${g}/search?q=${encodeURIComponent(q)}`).then(json),
  retryMeeting: (id) => fetch(`/api/meetings/${id}/retry`, { method: 'POST' }).then(json),
  commands: () => fetch('/api/commands').then(json),
  config: (g) => fetch(`/api/guilds/${g}/config`).then(json),
  saveConfig: (g, patch) => fetch(`/api/guilds/${g}/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(json),
  providerModels: (provider) => fetch(`/api/providers/${provider}/models`).then(json),
  setProviderKey: (provider, key) => fetch(`/api/providers/${provider}/key`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).then(json),
  systemStatus: () => fetch('/api/system/status').then(json),
  setConnection: (patch) => fetch('/api/system/connection', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(json),
  botAction: (action) => fetch(`/api/system/bot/${action}`, { method: 'POST' }).then(json),
  sidecarAction: (action) => fetch(`/api/system/sidecar/${action}`, { method: 'POST' }).then(json),
};
