import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to Postgres');

    const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('⏳ Executing schema.sql...');
    await client.query(sql);
    console.log('✨ Database initialized successfully!');
  } catch (err) {
    console.error('❌ Initialization failed:', err);
  } finally {
    await client.end();
  }
}

init();
