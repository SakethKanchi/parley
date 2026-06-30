// test/users.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { installUsers, hashPassword, verifyPassword } from '../src/store/users.js';

test('hashPassword + verifyPassword round-trips and rejects wrong passwords', () => {
  const h = hashPassword('hunter2');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('hunter2', h), true);
  assert.equal(verifyPassword('nope', h), false);
  assert.equal(verifyPassword('hunter2', 'garbage'), false);
});

test('installUsers seeds a default admin / admin on first run', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  assert.equal(users.countUsers(), 1);
  const admin = users.authenticate('admin', 'admin');
  assert.ok(admin);
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.mustChangePassword, true);
  // Wrong password fails.
  assert.equal(users.authenticate('admin', 'wrong'), null);
});

test('installUsers does not duplicate the admin on re-install', () => {
  const db = openDb(':memory:');
  installUsers(db);
  installUsers(db);
  const users = installUsers(db);
  assert.equal(users.countUsers(), 1);
});

test('username lookup is case-insensitive', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  assert.ok(users.authenticate('ADMIN', 'admin'));
});

test('createUser enforces unique usernames', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  users.createUser({ username: 'jane', email: 'jane@x.com', password: 'pw1234' });
  assert.throws(() => users.createUser({ username: 'Jane', password: 'other' }), /taken/i);
});

test('setPassword clears must_change_password and changes the credential', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  const admin = users.getUserByUsername('admin');
  users.setPassword(admin.id, 'newsecret');
  assert.equal(users.authenticate('admin', 'admin'), null);
  const after = users.authenticate('admin', 'newsecret');
  assert.ok(after);
  assert.equal(after.mustChangePassword, false);
});

test('sessions resolve to a user and expire', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  const admin = users.getUserByUsername('admin');
  const { token } = users.createSession(admin.id);
  assert.equal(users.getSessionUser(token).username, 'admin');
  users.deleteSession(token);
  assert.equal(users.getSessionUser(token), null);
  // An already-expired session is rejected and cleaned up.
  const { token: t2 } = users.createSession(admin.id, -1000);
  assert.equal(users.getSessionUser(t2), null);
});

test('admin counting protects against locking everyone out', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  assert.equal(users.countAdmins(), 1);
  const u = users.createUser({ username: 'bob', password: 'pw1234', isAdmin: true });
  assert.equal(users.countAdmins(), 2);
  users.updateUser(u.id, { isAdmin: false });
  assert.equal(users.countAdmins(), 1);
});

test('createUser stores email and is queryable via listUsers', () => {
  const db = openDb(':memory:');
  const users = installUsers(db);
  users.createUser({ username: 'kim', email: 'kim@example.com', password: 'pw1234' });
  const list = users.listUsers();
  const kim = list.find((u) => u.username === 'kim');
  assert.equal(kim.email, 'kim@example.com');
  assert.equal(kim.isAdmin, false);
  // Public shape never leaks the hash.
  assert.equal('password_hash' in kim, false);
});
