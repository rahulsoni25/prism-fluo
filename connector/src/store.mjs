/**
 * store.mjs — tiny JSON file persistence for scheduled tasks. Lives in
 * connector/.data/ (gitignored). Good enough for a local connector; swap for a
 * DB/queue when hosting it as a shared service.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, '..', '.data');
const FILE = join(DATA_DIR, 'schedule.json');

function load() {
  try {
    if (!existsSync(FILE)) return { tasks: [] };
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return { tasks: [] };
  }
}

function save(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export const store = {
  list() { return load().tasks; },
  add(task) {
    const state = load();
    state.tasks.push(task);
    save(state);
    return task;
  },
  remove(id) {
    const state = load();
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    save(state);
    return before !== state.tasks.length;
  },
};
