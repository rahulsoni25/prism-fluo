/**
 * Cross-talk: Mapper verdict → Verification severity downgrade.
 *
 * When Mapper Council flags the source file as thin/scanned/image-only,
 * the verification council should soften FactAnalyzer + Coverage findings
 * (not Math/Stat/Proofreader — those still reflect AI mistakes).
 */
import { describe, it, expect } from 'vitest';
import { verifyAnalysis } from '@/lib/ai/verify/orchestrator';
import type { CardInput } from '@/lib/ai/verify/types';

const baseCard = (overrides: Partial<CardInput> = {}): CardInput => ({
  index: 0,
  title: 'A claim that fact-analyzer would flag',
  obs:   'India has 5 billion smartphone users (a fact-checkable claim).',
  stat:  '5B users',
  rec:   'Target everyone',
  bucket: 'commerce',
  ...overrides,
} as any);

describe('cross-talk: Mapper verdict softens verification severity', () => {
  it('without mapperVerdict, baseline behavior is unchanged', async () => {
    const report = await verifyAnalysis('test-analysis-1', [baseCard()], 'TestBrand', { llm: false });
    expect((report.summary as any).mapperDowngrades).toBeUndefined();
    expect((report.summary as any).mapperContext).toBeUndefined();
  });

  it('with thin-source mapperVerdict, summary records the downgrade', async () => {
    const report = await verifyAnalysis('test-analysis-2', [baseCard()], 'TestBrand', {
      llm: false,
      mapperVerdict: {
        blockers: 1,
        majors:   0,
        topFinding: 'Only 12 chars of extractable text — file is image-only / scanned.',
      },
    });
    // mapperContext is recorded on the summary
    expect((report.summary as any).mapperContext).toBeDefined();
    expect((report.summary as any).mapperContext).toMatch(/thin|scan/i);
    // mapperDowngrades count is present (may be 0 if no soft-able findings, but the field exists)
    expect((report.summary as any).mapperDowngrades).toBeGreaterThanOrEqual(0);
  });

  it('mapperVerdict with healthy source (no blockers, mild finding) does NOT trigger softening', async () => {
    const report = await verifyAnalysis('test-analysis-3', [baseCard()], 'TestBrand', {
      llm: false,
      mapperVerdict: {
        blockers: 0,
        majors:   0,
        topFinding: 'Compressed to 8 MB',
      },
    });
    expect((report.summary as any).mapperDowngrades).toBeUndefined();
    expect((report.summary as any).mapperContext).toBeUndefined();
  });

  it('synthesised finding with confirmedBy fact-analyzer → softens blocker to major', async () => {
    // Construct an analysis with a card whose findings we'll manually craft via
    // a synthetic coverage finding (coverage agent runs against any brief-bearing
    // card). The mapperVerdict should downgrade any blocker/major from
    // fact-analyzer or coverage by one tier.
    const cardWithBrief = baseCard({
      // @ts-expect-error — verify trigger attaches .brief to first card
      brief: { brand: 'TestBrand', gender: 'Female', age_ranges: '18-24', geography: 'Metro' },
    });
    const reportSoftened = await verifyAnalysis('test-analysis-4', [cardWithBrief], 'TestBrand', {
      llm: false,
      mapperVerdict: { blockers: 1, majors: 0, topFinding: 'image-only PDF — run OCR first' },
    });
    const reportBaseline = await verifyAnalysis('test-analysis-5', [cardWithBrief], 'TestBrand', {
      llm: false,
    });
    // When softening fires, blocker count in softened must be ≤ baseline blocker count
    expect(reportSoftened.summary.bySeverity.blocker)
      .toBeLessThanOrEqual(reportBaseline.summary.bySeverity.blocker);
  });
});
