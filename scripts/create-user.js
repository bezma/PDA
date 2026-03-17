require('dotenv').config();

const { createPool } = require('../lib/db-config');
const { applyMigrations } = require('../lib/migrations');
const { hashPassword, normalizeUsername } = require('../lib/auth');

function readArgument(name) {
  const args = process.argv.slice(2);
  const index = args.findIndex((entry) => entry === `--${name}`);
  if (index === -1) return '';
  return String(args[index + 1] || '').trim();
}

async function run() {
  const username = normalizeUsername(readArgument('username'));
  const password = readArgument('password');
  const displayName = readArgument('display-name') || readArgument('name');

  if (!username) {
    throw new Error('Missing required argument: --username');
  }
  if (!password) {
    throw new Error('Missing required argument: --password');
  }

  const passwordHash = hashPassword(password);
  const pool = createPool();

  try {
    await applyMigrations(pool, { verbose: true });
    await pool.query(
      `
        INSERT INTO pda_users (username, display_name, password_hash, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (username) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          is_active = TRUE,
          updated_at = NOW()
      `,
      [username, displayName, passwordHash]
    );

    // eslint-disable-next-line no-console
    console.log(`User ready: ${username}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message || error);
  process.exit(1);
});
