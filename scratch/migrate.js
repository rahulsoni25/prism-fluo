const sqlite3 = require('sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'prism.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  console.log('Migrating database...');
  
  // 1. Create sessions table
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Sessions table error:', err.message);
    else console.log('✅ Sessions table ready');
  });

  // 2. Add session_id to uploads
  db.run(`ALTER TABLE uploads ADD COLUMN session_id TEXT REFERENCES sessions(id)`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('ℹ️ session_id column already exists');
      } else {
        console.error('❌ Alter table error:', err.message);
      }
    } else {
      console.log('✅ session_id column added to uploads');
    }
  });
});

db.close();
