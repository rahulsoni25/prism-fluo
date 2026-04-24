/**
 * scripts/init_db.mjs
 * Initialises the database schema (idempotent — uses IF NOT EXISTS).
 * Run automatically on Railway startup: node scripts/init_db.mjs && npm start
 */

import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set. Set it in Railway dashboard → Variables.');
    process.exit(1);
  }

  const sslConfig = process.env.NODE_ENV === 'production'
    ? { ssl: { rejectUnauthorized: false } }
    : {};

  const client = new Client({ connectionString, ...sslConfig });

  try {
    await client.connect();
    console.log('✅ Connected to Postgres');

    const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('⏳ Applying schema.sql…');
    await client.query(sql);
    console.log('✨ Database schema initialised successfully.');
  } catch (err) {
    console.error('❌ Database initialisation failed:', err.message);
    // Exit with non-zero code so Railway knows startup failed and retries
    process.exit(1);
  } finally {
    await client.end();
  }
}

init();
