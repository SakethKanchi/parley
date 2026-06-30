// test/auth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { installUsers } from '../src/store/users.js';
import { authRouter, attachUser, requireAuth } from '../src/web/auth.js';

// Mount the auth router exactly like the real server: attachUser resolves the
// cookie, the auth routes are public, and a protected probe stands in for the
// rest of the API.
function appWith(db) {
  const users = installUsers(db);
  const app = express();
  app.use(express.json());
  app.use(attachUser(users));
  app.use('/api', authRouter({ users }));
  app.use('/api', requireAuth(users), (req, res) => res.json({ ok: true, user: req.user }));
  return { app, users };
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

const jpost = (base, path, body, cookie) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body || {}),
});

function cookieOf(res) {
  const sc = res.headers.get('set-cookie');
  return sc ? sc.split(';')[0] : null;
}

test('login with the seeded admin issues a session cookie; logout clears it', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db).app);
  try {
    const bad = await jpost(base, '/api/auth/login', { username: 'admin', password: 'wrong' });
    assert.equal(bad.status, 401);

    const ok = await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' });
    assert.equal(ok.status, 200);
    const cookie = cookieOf(ok);
    assert.ok(cookie);
    assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);

    // me reflects the session.
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    assert.equal(me.user.username, 'admin');

    // protected probe works with the cookie, fails without.
    assert.equal((await fetch(`${base}/api/anything`)).status, 401);
    assert.equal((await fetch(`${base}/api/anything`, { headers: { cookie } })).status, 200);

    // logout invalidates the session.
    await jpost(base, '/api/auth/logout', {}, cookie);
    assert.equal((await fetch(`${base}/api/anything`, { headers: { cookie } })).status, 401);
  } finally { close(); }
});

test('me returns null when unauthenticated (never 401)', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db).app);
  try {
    const me = await fetch(`${base}/api/auth/me`);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user, null);
  } finally { close(); }
});

test('the seeded admin can change its own password without the current one', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db).app);
  try {
    const login = await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' });
    const cookie = cookieOf(login);
    // mustChangePassword is set, so currentPassword is not required.
    const changed = await jpost(base, '/api/auth/password', { newPassword: 'longerpass' }, cookie);
    assert.equal(changed.status, 200);
    // Old password no longer works; new one does.
    assert.equal((await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' })).status, 401);
    assert.equal((await jpost(base, '/api/auth/login', { username: 'admin', password: 'longerpass' })).status, 200);
  } finally { close(); }
});

test('admin can create a user who can then log in', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db).app);
  try {
    const cookie = cookieOf(await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' }));
    const created = await jpost(base, '/api/users', { username: 'jane', email: 'jane@x.com', password: 'pw1234' }, cookie);
    assert.equal(created.status, 201);

    const list = await (await fetch(`${base}/api/users`, { headers: { cookie } })).json();
    assert.equal(list.users.length, 2);

    // The new user can authenticate and is not an admin.
    const janeLogin = await jpost(base, '/api/auth/login', { username: 'jane', password: 'pw1234' });
    assert.equal(janeLogin.status, 200);
    assert.equal((await janeLogin.json()).user.isAdmin, false);
  } finally { close(); }
});

test('non-admins cannot manage users', async () => {
  const db = openDb(':memory:');
  const { app, users } = appWith(db);
  users.createUser({ username: 'jane', password: 'pw1234' });
  const { base, close } = await listen(app);
  try {
    const cookie = cookieOf(await jpost(base, '/api/auth/login', { username: 'jane', password: 'pw1234' }));
    assert.equal((await fetch(`${base}/api/users`, { headers: { cookie } })).status, 403);
    assert.equal((await jpost(base, '/api/users', { username: 'x', password: 'pw1234' }, cookie)).status, 403);
  } finally { close(); }
});

test('the last admin cannot be demoted or deleted', async () => {
  const db = openDb(':memory:');
  const { app, users } = appWith(db);
  const admin = users.getUserByUsername('admin');
  const { base, close } = await listen(app);
  try {
    const cookie = cookieOf(await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' }));
    const demote = await fetch(`${base}/api/users/${admin.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ isAdmin: false }),
    });
    assert.equal(demote.status, 400);
    const del = await fetch(`${base}/api/users/${admin.id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(del.status, 400); // also self-delete guarded
  } finally { close(); }
});

test('admin password reset for another user revokes their sessions', async () => {
  const db = openDb(':memory:');
  const { app, users } = appWith(db);
  const jane = users.createUser({ username: 'jane', password: 'pw1234' });
  const { base, close } = await listen(app);
  try {
    const janeCookie = cookieOf(await jpost(base, '/api/auth/login', { username: 'jane', password: 'pw1234' }));
    // Jane is logged in.
    assert.equal((await fetch(`${base}/api/anything`, { headers: { cookie: janeCookie } })).status, 200);

    const adminCookie = cookieOf(await jpost(base, '/api/auth/login', { username: 'admin', password: 'admin' }));
    const reset = await jpost(base, `/api/users/${jane.id}/password`, { password: 'fresh1' }, adminCookie);
    assert.equal(reset.status, 200);

    // Jane's old session is dead; her old password no longer works; the new one does.
    assert.equal((await fetch(`${base}/api/anything`, { headers: { cookie: janeCookie } })).status, 401);
    assert.equal((await jpost(base, '/api/auth/login', { username: 'jane', password: 'pw1234' })).status, 401);
    assert.equal((await jpost(base, '/api/auth/login', { username: 'jane', password: 'fresh1' })).status, 200);
  } finally { close(); }
});
