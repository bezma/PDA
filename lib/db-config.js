const { Pool } = require('pg');

function buildPgConfig() {
  const hasDatabaseUrl = String(process.env.DATABASE_URL || '').trim() !== '';
  const config = hasDatabaseUrl
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'pda_capris'
      };

  const sslEnabled = String(process.env.PGSSL || '').toLowerCase() === 'true';
  if (sslEnabled) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function createPool() {
  return new Pool(buildPgConfig());
}

module.exports = {
  buildPgConfig,
  createPool
};
