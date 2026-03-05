const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(result.rows.map((row) => String(row.id || '').trim()).filter(Boolean));
}

async function applyMigrations(pool, options = {}) {
  const verbose = options.verbose !== false;
  const client = await pool.connect();
  const appliedNow = [];

  try {
    await ensureMigrationsTable(client);
    const files = await listMigrationFiles();
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) continue;
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedNow.push(file);
        if (verbose) {
          // eslint-disable-next-line no-console
          console.log(`Applied migration: ${file}`);
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed (${file}): ${error.message}`);
      }
    }

    return appliedNow;
  } finally {
    client.release();
  }
}

async function getMigrationStatus(pool) {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrationFiles();
    const applied = await getAppliedMigrations(client);
    const pending = files.filter((file) => !applied.has(file));
    return {
      all: files,
      pending,
      appliedCount: files.length - pending.length
    };
  } finally {
    client.release();
  }
}

module.exports = {
  MIGRATIONS_DIR,
  applyMigrations,
  getMigrationStatus
};
