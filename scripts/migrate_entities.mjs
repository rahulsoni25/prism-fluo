import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('prism.db');

console.log('🚀 Running database migration: Adding "entities" to datasets table...');

db.run('ALTER TABLE datasets ADD COLUMN entities TEXT', (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ Column "entities" already exists.');
    } else {
      console.error('❌ Migration failed:', err.message);
    }
  } else {
    console.log('✅ Column "entities" added successfully.');
  }
  db.close();
});
