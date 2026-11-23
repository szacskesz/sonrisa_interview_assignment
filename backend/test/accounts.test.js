import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemoAccounts, verifyPassword } from '../src/accounts.js';
import { migrateDatabase, openDatabase } from '../src/database.js';

const env = { DEMO_ADMIN_PASSWORD: 'admin-test-password', DEMO_USER_PASSWORD: 'user-test-password' };

test('provisions each role with a salted password hash and preserves existing accounts', async () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  await seedDemoAccounts(database, env);
  const accounts = database.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(accounts.map(({ email, role }) => [email, role]), [
    ['admin@example.test', 'admin'],
    ['user@example.test', 'user'],
  ]);
  assert.equal(await verifyPassword(env.DEMO_ADMIN_PASSWORD, accounts[0].password_hash), true);
  assert.equal(await verifyPassword(env.DEMO_USER_PASSWORD, accounts[0].password_hash), false);
  assert.equal(await verifyPassword(env.DEMO_USER_PASSWORD, accounts[1].password_hash), true);
  assert.equal(await verifyPassword('any-password', 'bad-format'), false);
  await seedDemoAccounts(database, env);
  assert.deepEqual(database.prepare('SELECT * FROM users ORDER BY id').all(), accounts);
});

test('rejects bad settings and rolls back the seed if an email belongs to a different role', async () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  await assert.rejects(seedDemoAccounts(database, {}), /demo admin password/);
  database.exec("INSERT INTO users VALUES (1, 'user@example.test', 'hash', 'admin', 0)");
  await assert.rejects(seedDemoAccounts(database, env), /different role/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
});
