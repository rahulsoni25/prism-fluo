/**
 * Skill #6 — Schedule recurring tasks.
 * e.g. "every Monday check budget pacing and alert me if anything is off".
 *
 * The connector persists the schedule; a host runner (cron, the PRISM app, a
 * worker) reads list_scheduled_tasks and executes the named skill on cadence.
 */
import { store } from '../store.mjs';

const CADENCES = ['daily', 'weekly', 'weekdays', 'monthly', 'hourly'];

export default [
  {
    name: 'schedule_task',
    title: 'Schedule a recurring task',
    description:
      'Register a recurring job — e.g. run an account audit every Monday, or check budget pacing daily and alert on anomalies. Stores the schedule so a runner can execute the named skill on cadence. Returns the saved task with its id.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human label, e.g. "Monday budget pacing check".' },
        skill: { type: 'string', description: 'Skill to run, e.g. account_audit, find_wasted_spend, build_report.' },
        args: { type: 'object', description: 'Arguments to pass to that skill when it runs.', additionalProperties: true },
        cadence: { type: 'string', enum: CADENCES, description: 'How often to run.' },
        dayOfWeek: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], description: 'For weekly cadence.' },
        time: { type: 'string', description: 'HH:MM 24h, e.g. "09:00". Default 09:00.' },
        alertIf: { type: 'string', description: 'Optional condition to alert on, e.g. "spend pacing > 110% of budget".' },
      },
      required: ['name', 'skill', 'cadence'],
    },
    async handler(args) {
      if (!CADENCES.includes(args.cadence)) throw new Error(`cadence must be one of ${CADENCES.join(', ')}`);
      const task = {
        id: `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: args.name,
        skill: args.skill,
        args: args.args || {},
        cadence: args.cadence,
        dayOfWeek: args.dayOfWeek,
        time: args.time || '09:00',
        alertIf: args.alertIf,
        createdAt: new Date().toISOString(),
        nextRunHint: describeNext(args),
        status: 'active',
      };
      store.add(task);
      return { created: true, task };
    },
  },
  {
    name: 'list_scheduled_tasks',
    title: 'List scheduled tasks',
    description: 'List every recurring task registered with the connector.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const tasks = store.list();
      return { count: tasks.length, tasks };
    },
  },
  {
    name: 'delete_scheduled_task',
    title: 'Delete a scheduled task',
    description: 'Remove a recurring task by its id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    async handler(args) {
      const removed = store.remove(args.id);
      return { removed, id: args.id };
    },
  },
];

function describeNext(args) {
  if (args.cadence === 'weekly') return `Every ${args.dayOfWeek || 'mon'} at ${args.time || '09:00'}`;
  if (args.cadence === 'weekdays') return `Mon–Fri at ${args.time || '09:00'}`;
  if (args.cadence === 'monthly') return `1st of each month at ${args.time || '09:00'}`;
  if (args.cadence === 'hourly') return 'Every hour';
  return `Daily at ${args.time || '09:00'}`;
}
