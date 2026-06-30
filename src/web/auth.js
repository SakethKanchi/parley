// src/web/auth.js
// Session-cookie auth for the dashboard API. Dependency-free: a single httpOnly
// cookie carries an opaque session token resolved server-side against the
// `sessions` table (see src/store/users.js).
//
//   • requireAuth(users)        — Express middleware; 401s unauthenticated calls
//   • authRouter({ users })     — /api/auth/* (login, logout, me, password) +
//                                  /api/users (admin CRUD)
//
// The web server binds localhost by default, but auth makes the dashboard safe
// to expose (e.g. behind a reverse proxy / Docker port map).

import { Router } from 'express';

const COOKIE = 'parley_session';

// Minimal cookie parser — we only need our one session cookie, so no dep.
function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function setSessionCookie(res, token, expiresAt) {
  const attrs = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  // Secure only over https (so localhost http dev still works). Express sets
  // req.secure from the connection / X-Forwarded-Proto when trust proxy is on.
  res.append('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(0).toUTCString()}`);
}

// Attaches req.user (or null) from the session cookie. Use before requireAuth
// so optional routes can read the user too.
export function attachUser(users) {
  return (req, _res, next) => {
    const token = readCookie(req, COOKIE);
    req.sessionToken = token;
    req.user = token ? users.getSessionUser(token) : null;
    next();
  };
}

export function requireAuth(_users) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

export function authRouter({ users }) {
  const r = Router();

  // ── Session ────────────────────────────────────────────────────────────────
  r.post('/auth/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    const user = users.authenticate(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
    const { token, expiresAt } = users.createSession(user.id);
    setSessionCookie(res, token, expiresAt);
    res.json({ ok: true, user });
  });

  r.post('/auth/logout', (req, res) => {
    if (req.sessionToken) users.deleteSession(req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Current user (or null). Drives the frontend's auth gate; never 401s.
  // `authEnabled: true` tells the client this server enforces login (older
  // servers without this route make the client fall back to open mode).
  r.get('/auth/me', (req, res) => {
    res.json({ authEnabled: true, user: req.user || null });
  });

  // Change your own password. Requires the current password unless the account
  // is flagged must_change_password (the seeded default admin's first change).
  r.post('/auth/password', requireAuth(users), (req, res) => {
    const current = String(req.body?.currentPassword ?? '');
    const next = String(req.body?.newPassword ?? '');
    if (next.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    const row = users.getUserByUsername(req.user.username);
    const mustChange = !!row?.must_change_password;
    if (!mustChange) {
      if (!users.authenticate(req.user.username, current)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }
    users.setPassword(req.user.id, next);
    res.json({ ok: true, user: users.getUser(req.user.id) });
  });

  // ── User management (admin) ─────────────────────────────────────────────────
  r.get('/users', requireAuth(users), requireAdmin, (_req, res) => {
    res.json({ users: users.listUsers() });
  });

  r.post('/users', requireAuth(users), requireAdmin, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const email = req.body?.email ? String(req.body.email).trim() : null;
    const password = String(req.body?.password ?? '');
    const isAdmin = !!req.body?.isAdmin;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    try {
      const user = users.createUser({ username, email, password, isAdmin });
      res.status(201).json({ ok: true, user });
    } catch (e) {
      res.status(409).json({ error: e.message });
    }
  });

  // Admin reset of another user's password.
  r.post('/users/:id/password', requireAuth(users), requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!users.getUser(id)) return res.status(404).json({ error: 'User not found.' });
    const password = String(req.body?.password ?? '');
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    users.setPassword(id, password);
    users.deleteUserSessions(id); // force re-login with the new password
    res.json({ ok: true });
  });

  r.patch('/users/:id', requireAuth(users), requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!users.getUser(id)) return res.status(404).json({ error: 'User not found.' });
    // Guard against demoting the last admin into an admin-less instance.
    if (req.body?.isAdmin === false && users.getUser(id).isAdmin && users.countAdmins() <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin.' });
    }
    const patch = {};
    if (req.body?.email !== undefined) patch.email = req.body.email ? String(req.body.email).trim() : null;
    if (req.body?.isAdmin !== undefined) patch.isAdmin = !!req.body.isAdmin;
    res.json({ ok: true, user: users.updateUser(id, patch) });
  });

  r.delete('/users/:id', requireAuth(users), requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const target = users.getUser(id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    if (target.isAdmin && users.countAdmins() <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin.' });
    }
    users.deleteUser(id);
    res.json({ ok: true });
  });

  return r;
}

export { COOKIE };
