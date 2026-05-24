import { getHealthSnapshot } from '@/lib/ai/model-health';
import { fallbackSummary }   from '@/lib/ai/fallback-monitor';
import { registerCouncil } from '../registry';

registerCouncil({
  id: 'ai-health',
  name: 'AI Health',
  emoji: '🩺',
  stage: 'analyze',
  agentNames: ['Model-Health', 'Fallback-Monitor'],
  description: 'Smart model cascade with quarantine + auto-recovery. Always-on, no per-request invocation.',
  link: '/admin/ai-health',
  // No `run` — always-on monitor, not a per-request council.

  async getSnapshot() {
    const health = getHealthSnapshot();
    let fb: any = null;
    try { fb = await fallbackSummary(24); } catch { /* table may not exist */ }
    return {
      lifetime: {
        totalModels: health.length,
        healthy:     health.filter(s => s.rate === null || s.rate >= 0.95).length,
        quarantined: health.filter(s => s.quarantined).length,
        alerts24h:   fb?.alerts ?? 0,
        fallback24h: fb?.total  ?? 0,
      },
      recent: health.slice(0, 5).map(s => ({
        model: s.model, rate: s.rate, quarantined: s.quarantined,
      })),
    };
  },

  computeGrade(snap) {
    const down = snap.lifetime.quarantined ?? 0;
    if (down > 0) return Math.max(0, 10 - down * 3);
    return 10;
  },
});
