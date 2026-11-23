import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { transaction } from './database.js';

const derive = promisify(scrypt);
const scryptOptions = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, scryptOptions);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Verify a password using the same scrypt parameters as demo account provisioning. */
export async function verifyPassword(password, passwordHash) {
  const match = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(passwordHash);
  if (!match) return false;
  const hash = await derive(password, Buffer.from(match[1], 'hex'), 64, scryptOptions);
  return timingSafeEqual(hash, Buffer.from(match[2], 'hex'));
}

/** Provision the two demo roles atomically. Existing accounts keep their hashes and IDs. */
export async function seedDemoAccounts(database, env, now = Date.now) {
  const accounts = [
    { email: env.DEMO_ADMIN_EMAIL ?? 'admin@example.test', password: env.DEMO_ADMIN_PASSWORD, role: 'admin' },
    { email: env.DEMO_USER_EMAIL ?? 'user@example.test', password: env.DEMO_USER_PASSWORD, role: 'user' },
  ];
  for (const account of accounts) {
    account.email = account.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) throw new Error('Invalid demo email');
    if (typeof account.password !== 'string' || account.password.length < 12 || account.password.length > 128) {
      throw new Error(`Set a demo ${account.role} password of 12 to 128 characters`);
    }
  }
  if (accounts[0].email === accounts[1].email) throw new Error('Demo accounts require distinct emails');
  for (const account of accounts) {
    account.passwordHash = await hashPassword(account.password);
  }
  transaction(database, () => {
    const roleForEmail = database.prepare('SELECT role FROM users WHERE email = ?');
    const insert = database.prepare('INSERT INTO users (email, password_hash, role, created_at_ms) VALUES (?, ?, ?, ?)');
    for (const { email, passwordHash, role } of accounts) {
      const existing = roleForEmail.get(email);
      if (!existing) insert.run(email, passwordHash, role, now());
      else if (existing.role !== role) throw new Error(`Demo ${role} email belongs to a different role`);
    }
  });
}
