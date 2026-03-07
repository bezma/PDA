require('dotenv').config();

const { createPool } = require('../lib/db-config');
const { applyMigrations, getMigrationStatus } = require('../lib/migrations');

async function run() {
  const command = String(process.argv[2] || 'up').trim().toLowerCase();
  const pool = createPool();

  try {
    if (command === 'status') {
      const status = await getMigrationStatus(pool);
      // eslint-disable-next-line no-console
      console.log(`Migrations: ${status.appliedCount}/${status.all.length} applied`);
      if (status.pending.length) {
        // eslint-disable-next-line no-console
        console.log('Pending migrations:');
        status.pending.forEach((file) => {
          // eslint-disable-next-line no-console
          console.log(`- ${file}`);
        });
      } else {
        // eslint-disable-next-line no-console
        console.log('No pending migrations.');
      }
      return;
    }

    if (command !== 'up') {
      // eslint-disable-next-line no-console
      console.error(`Unsupported migration command: ${command}`);
      process.exitCode = 1;
      return;
    }

    const applied = await applyMigrations(pool, { verbose: true });
    if (!applied.length) {
      // eslint-disable-next-line no-console
      console.log('No migrations to apply.');
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message || error);
  process.exit(1);
});
