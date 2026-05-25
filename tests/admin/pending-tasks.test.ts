import { describe, it, expect } from 'vitest';
import { PENDING_TASKS, sortedTasks, taskStats, type PendingTask } from '@/lib/admin/pending-tasks-data';

describe('pending tasks registry — data integrity', () => {
  it('every task has a unique id', () => {
    const ids = PENDING_TASKS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every task has all required fields populated', () => {
    for (const t of PENDING_TASKS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);   // kebab-case
      expect(t.title.length).toBeGreaterThan(5);
      expect(t.context.length).toBeGreaterThan(20);
      expect(['high', 'medium', 'low']).toContain(t.criticality);
      expect(['hidden-feature', 'decision', 'deferred-improvement', 'technical-debt']).toContain(t.category);
      expect(['open', 'parked', 'in-progress', 'awaiting-confirmation']).toContain(t.status);
    }
  });

  it('dateDiscussed is ISO format or "pre-session"', () => {
    for (const t of PENDING_TASKS) {
      const isIso = /^\d{4}-\d{2}-\d{2}$/.test(t.dateDiscussed);
      expect(isIso || t.dateDiscussed === 'pre-session').toBe(true);
    }
  });
});

describe('sortedTasks ordering', () => {
  it('puts HIGH criticality before MEDIUM before LOW', () => {
    const order = sortedTasks().map(t => t.criticality);
    const critRank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < order.length; i++) {
      expect(critRank[order[i] as keyof typeof critRank])
        .toBeGreaterThanOrEqual(critRank[order[i - 1] as keyof typeof critRank]);
    }
  });

  it('within the same criticality, newer dates come first', () => {
    const sorted = sortedTasks();
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].criticality === sorted[i - 1].criticality
        && sorted[i].dateDiscussed !== 'pre-session'
        && sorted[i - 1].dateDiscussed !== 'pre-session') {
        expect(sorted[i].dateDiscussed <= sorted[i - 1].dateDiscussed).toBe(true);
      }
    }
  });

  it('returns a NEW array (does not mutate PENDING_TASKS)', () => {
    const before = [...PENDING_TASKS];
    sortedTasks();
    expect(PENDING_TASKS).toEqual(before);
  });
});

describe('taskStats counts', () => {
  it('sums match the total task count', () => {
    const s = taskStats();
    expect(s.total).toBe(PENDING_TASKS.length);
    const critSum = s.byCriticality.high + s.byCriticality.medium + s.byCriticality.low;
    expect(critSum).toBe(s.total);
    const catSum = Object.values(s.byCategory).reduce((a, b) => a + b, 0);
    expect(catSum).toBe(s.total);
    const statusSum = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    expect(statusSum).toBe(s.total);
  });

  it('every category bucket is initialized (even if zero)', () => {
    const s = taskStats();
    expect(s.byCategory['hidden-feature']).toBeGreaterThanOrEqual(0);
    expect(s.byCategory['decision']).toBeGreaterThanOrEqual(0);
    expect(s.byCategory['deferred-improvement']).toBeGreaterThanOrEqual(0);
    expect(s.byCategory['technical-debt']).toBeGreaterThanOrEqual(0);
  });
});
