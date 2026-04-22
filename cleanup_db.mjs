import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('prism.db');

console.log('🧹 Clearing stale data from previous broken uploads...');
db.run('DELETE FROM datasets', (err) => {
  if (err) console.error(err);
  else console.log('✅ datasets table cleared');
});
db.run('DELETE FROM generic_data', (err) => {
  if (err) console.error(err);
  else console.log('✅ generic_data table cleared');
  db.close();
});
