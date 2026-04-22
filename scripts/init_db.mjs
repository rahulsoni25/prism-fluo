import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(process.cwd(), 'prism.db');

async function init() {
  console.log('🚀 Initializing local PRISM SQLite database...');
  
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    // Split SQL by semicolon to execute one by one (SQLite requirement for some drivers)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`⏳ Executing ${statements.length} schema statements...`);
    
    db.serialize(() => {
      statements.forEach(statement => {
        db.run(statement, (err) => {
          if (err) {
            console.error('❌ SQL Error:', err.message);
          }
        });
      });
    });

    console.log('✨ Data layer ready: prism.db created.');
  } catch (err) {
    console.error('❌ Initialization failed:', err);
  } finally {
    setTimeout(() => db.close(), 1000); 
  }
}

init();
