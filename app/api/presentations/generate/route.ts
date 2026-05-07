/**
 * POST /api/presentations/generate
 *
 * Generates a single, fully-populated PPTX deck from the analysis stored
 * in results_json.  The deck is organised around the 4 PRISM pillars
 * (Content · Commerce · Communication · Culture) using the chart data
 * that was already generated for the insights dashboard.
 *
 * Returns the file inline as pptxBase64 so the client can download
 * immediately without a separate DB-backed download round-trip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getPool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { generatePresentation } from '@/lib/pptx/generator';
import type { InsightCard, PillarData, PresentationData } from '@/lib/pptx/generator';
import { getTemplate } from '@/lib/pptx/templates';

export const dynamic = 'force-dynamic';

// ── Types ────────────────────────────────────────────────────────────────────
interface GeneratePresentationRequest {
  templateId:  string;
  analysisId:  string;
}

type PrismBucket = 'content' | 'commerce' | 'communication' | 'culture';

interface RawChart {
  bucket?:           string;
  title?:            string;
  lbl?:              string;   // alternate title field used by older analyses
  obs?:              string;
  rec?:              string;
  stat?:             string;
  source?:           string;
  toolLabel?:        string;
  conviction?:       number;
  // Chart rendering data (stored in results_json.charts by the analysis pipeline)
  type?:             string;
  chartLabels?:      string[];
  chartValues?:      number[];
  chartValues2?:     number[];
  // Older analyses store Chart.js-formatted data here instead of raw arrays
  computedChartData?: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract plain labels + values arrays from any chart data format.
 * Handles both the new {chartLabels, chartValues} format AND the older
 * {computedChartData} Chart.js / SVG format stored in the DB.
 */
function extractChartArrays(c: RawChart): {
  labels?: string[]; values?: number[]; values2?: number[];
} {
  // ── New format: raw arrays already present ──────────────────────────────
  if (Array.isArray(c.chartLabels) && Array.isArray(c.chartValues) && c.chartValues.length) {
    return {
      labels:  c.chartLabels,
      values:  c.chartValues.map(Number),
      values2: Array.isArray(c.chartValues2) ? c.chartValues2.map(Number) : undefined,
    };
  }

  // ── Old format: extract from computedChartData ──────────────────────────
  const cd = c.computedChartData;
  if (!cd) return {};

  // SVG-based charts (waterfall / funnel) store {labels, values}
  if (Array.isArray(cd.values) && cd.values.length) {
    return {
      labels: Array.isArray(cd.labels) ? cd.labels.map(String) : [],
      values: cd.values.map(Number),
    };
  }

  // Chart.js format: {labels, datasets: [{data:[...]}, ...]}
  if (Array.isArray(cd.labels) && Array.isArray(cd.datasets) && cd.datasets[0]) {
    const ds0 = cd.datasets[0];
    const ds1 = cd.datasets[1];

    // Scatter datasets store [{x, y}] objects — extract y values
    if (ds0.data && typeof ds0.data[0] === 'object' && 'y' in ds0.data[0]) {
      return {
        labels: cd.labels.map(String),
        values: ds0.data.map((p: any) => Number(p.y ?? p.x ?? 0)),
      };
    }

    const values  = Array.isArray(ds0.data) ? ds0.data.map(Number) : [];
    const values2 = ds1 && Array.isArray(ds1.data) ? ds1.data.map(Number) : undefined;
    return { labels: cd.labels.map(String), values, values2 };
  }

  return {};
}

/** Build PillarData for a given bucket from the raw charts array */
function buildPillar(charts: RawChart[], bucket: PrismBucket): PillarData {
  const insights: InsightCard[] = charts
    .filter(c => c.bucket === bucket)
    .map(c => {
      const { labels, values, values2 } = extractChartArrays(c);
      return {
        title:        (c.title || c.lbl || '').trim(),
        obs:          (c.obs   || '').trim(),
        rec:          (c.rec   || '').trim(),
        stat:         c.stat      ? c.stat.trim()      : undefined,
        source:       c.toolLabel ? c.toolLabel.trim() : (c.source ? c.source.trim() : undefined),
        conviction:   c.conviction ?? undefined,
        // Chart data — works for both old and new analysis formats
        chartType:    c.type    ?? undefined,
        chartLabels:  labels,
        chartValues:  values,
        chartValues2: values2,
      };
    })
    .filter(ins => ins.title || ins.obs || ins.rec);
  return { insights };
}

/**
 * Fall-back: when charts have no bucket tags (e.g. old analyses or demo data),
 * distribute observations and recommendations evenly across the 4 pillars.
 */
function buildPillarsFromFlat(
  observations: string[],
  recommendations: string[],
): Record<PrismBucket, PillarData> {
  const buckets: PrismBucket[] = ['content', 'commerce', 'communication', 'culture'];
  const result = {} as Record<PrismBucket, PillarData>;

  buckets.forEach((bucket, i) => {
    // Distribute by modulo — ensures all obs/recs appear somewhere
    const bucketObs  = observations.filter((_,  idx) => idx % 4 === i);
    const bucketRecs = recommendations.filter((_, idx) => idx % 4 === i);
    const len = Math.max(bucketObs.length, bucketRecs.length);
    const insights: InsightCard[] = Array.from({ length: len }, (_, j) => ({
      title: bucketObs[j] || bucketRecs[j] || '',
      obs:   bucketObs[j]  || '',
      rec:   bucketRecs[j] || '',
    })).filter(ins => ins.title || ins.obs || ins.rec);
    result[bucket] = { insights };
  });

  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    const body: GeneratePresentationRequest = await req.json();
    const { templateId, analysisId } = body;

    // Validate template
    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Fetch analysis (allow NULL user_id for backwards compatibility)
    const { rows } = await db.query(
      `SELECT a.id, a.sheet_name, a.results_json, a.brief_id,
              b.brand, b.objective
       FROM analyses a
       LEFT JOIN briefs b ON a.brief_id = b.id
       WHERE a.id = $1 AND (a.user_id = $2 OR a.user_id IS NULL)`,
      [analysisId, session.userId],
    );

    // Dev fallback with realistic 4-pillar demo data
    const devFallback = process.env.NODE_ENV !== 'production' ? {
      id: analysisId,
      sheet_name: 'Strategic Brand Audit',
      brand: 'Nike India',
      objective: 'Analyze strategic growth opportunities within the 18–34 Indian fitness segment.',
      results_json: {
        meta: {
          headline: 'Nike India: Capturing the Gen Z Fitness Movement',
          objective: 'Analyze strategic growth opportunities within the 18–34 Indian fitness segment.',
          observations: [
            'Short-form video engagement is 4.2× higher than static imagery.',
            'DTC conversion rate lags category peers by 7 points.',
            'Tier 2/3 markets show high aspiration but lower conversion.',
            'Gen Z over-indexes 2.1× on fitness-purpose messaging vs product-led.',
            'Amazon search share grew 34% YoY; Nike trails Adidas by 18 index points.',
            'Marathon-season queries spike 3.4× — Nike calendar does not align.',
            'Football cultural share grew from 11% to 19% among 18–34 urban Indians.',
          ],
          recommendations: [
            'Shift 70% of social budget to vertical short-form video.',
            'Launch an "Accessible Premium" SKU line for ₹2,000–₹4,000 segment.',
            'Hyper-target Bangalore and Mumbai pin code clusters.',
            'Build a marathon-season communication calendar with 6-week lead-up.',
            'Increase Amazon Ads with a keyword-first strategy.',
            'Develop a "Built to Last" product-quality content series.',
            'Build dedicated India football content strategy.',
          ],
        },
        charts: [
          {
            bucket: 'content', conviction: 94,
            toolLabel: 'Instagram / YouTube',
            title: 'Short-form video generates 4.2× higher engagement than static posts',
            obs: 'Among 18–34 sports & fitness enthusiasts, Instagram Reels drives 62% of content consumption. Daily viewing time for short-form video has grown 67% YoY.',
            rec: 'Shift 65–70% of content budget to short-form video. Build a Reels-first weekly content calendar. Prioritise vertical video production.',
            stat: '4.2× engagement lift for short-form vs static content',
          },
          {
            bucket: 'content', conviction: 88,
            toolLabel: 'Brandwatch / Social Listening',
            title: 'Behind-the-scenes athlete content drives 3.8× higher save & share rates',
            obs: 'BTS athlete content drives 3.8× higher save rate and 2.1× higher share rate vs polished campaign content. Indian athletes generate disproportionately high engagement among 18–34 target segments.',
            rec: 'Co-produce BTS content with 3 emerging Indian athletes. Build a monthly behind-the-scenes series across Reels and Shorts.',
            stat: '3.8× higher save rate for BTS content',
          },
          {
            bucket: 'commerce', conviction: 91,
            toolLabel: 'Helium10 / Amazon Intelligence',
            title: 'Amazon search share grew 34% YoY — Nike trails Adidas by 18 index points',
            obs: '73% of 18–34 consumers research on social before converting on Amazon or Myntra. Nike DTC conversion rate sits at 12% vs category average of 19% — a 7-point gap.',
            rec: 'Significantly increase Amazon Ads with keyword-first strategy. Build A+ content for top-selling SKUs. Consider exclusive Amazon launch bundles.',
            stat: '7-point DTC conversion gap vs category peers',
          },
          {
            bucket: 'commerce', conviction: 86,
            toolLabel: 'Google Keyword Planner',
            title: 'Price-sensitive commuters: 45% seek discounts — 1.25× public transport index',
            obs: 'Tier 2/3 markets show high aspiration (top-3 brand recall) but 3× lower conversion due to price-to-value gaps. An "Accessible Premium" SKU would address this segment directly.',
            rec: 'Launch an "Accessible Premium" sub-line at ₹2,000–₹4,000. Pilot in Pune, Jaipur, Lucknow with influencer seeding before national rollout.',
            stat: '3× lower conversion in Tier 2/3 despite high awareness',
          },
          {
            bucket: 'communication', conviction: 89,
            toolLabel: 'GWI Consumer Survey',
            title: 'Purpose-led communication drives 41% higher brand affinity among Gen Z',
            obs: '18–24 year olds show 41% higher brand affinity for purpose-driven messaging. Current Nike India comms are 73% product-led vs category average of 55%.',
            rec: 'Rebalance comms mix to 45% purpose / 55% product. Lead with athlete stories and social impact narratives for the Gen Z segment.',
            stat: '41% higher affinity for purpose-led vs product-led communication',
          },
          {
            bucket: 'communication', conviction: 85,
            toolLabel: 'Google Trends',
            title: 'Marathon-season search queries spike 3.4× — Nike calendar misaligned',
            obs: 'Search data shows a 3.4× spike in running queries during Oct–Dec and Jan–Feb marathon seasons. Asics and New Balance already capitalise on this window.',
            rec: 'Build a marathon-season calendar with 6-week lead-up activations for Mumbai, Delhi, Bengaluru. Create city-specific search-backed messaging.',
            stat: '3.4× search spike during marathon season (Oct–Feb)',
          },
          {
            bucket: 'culture', conviction: 92,
            toolLabel: 'GWI Consumer Survey',
            title: 'Everyday fitness culture is replacing elite sport aspiration',
            obs: '67% of 18–34 Indian consumers identify as "everyday movers" — fitness is part of daily life, not aspirational sport. Nike India over-indexes on elite athlete imagery.',
            rec: 'Reposition key creatives around everyday fitness. Feature commuters, office workers, and students in authentic fitness contexts.',
            stat: '67% of target audience self-identify as everyday movers',
          },
          {
            bucket: 'culture', conviction: 87,
            toolLabel: 'Social Listening / Konnect Insights',
            title: 'Football cultural share grew from 11% to 19% among 18–34 urban Indians',
            obs: 'ISL and global club football (especially Premier League) are key drivers. Nike has global football equity but underinvests in India\'s football culture.',
            rec: 'Build a dedicated India football strategy. Invest in grassroots football content and urban football storytelling. Position Nike as "the football brand that believed in India first."',
            stat: 'Football share: +8 points in 3 years among 18–34 urban segment',
          },
        ],
      },
    } : null;

    const analysis = rows[0] || devFallback;

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found or not owned by user' }, { status: 404 });
    }

    const results = analysis.results_json || {};
    const meta    = results.meta || {};
    const charts: RawChart[] = Array.isArray(results.charts) ? results.charts : [];

    // Build 4 pillars from chart bucket data
    let pillars: Record<PrismBucket, PillarData>;

    const hasBucketedCharts = charts.some(c => c.bucket && ['content','commerce','communication','culture'].includes(c.bucket));

    if (hasBucketedCharts) {
      pillars = {
        content:       buildPillar(charts, 'content'),
        commerce:      buildPillar(charts, 'commerce'),
        communication: buildPillar(charts, 'communication'),
        culture:       buildPillar(charts, 'culture'),
      };
    } else {
      // Fall back to distributing flat observations/recommendations
      const observations = Array.isArray(meta.observations)
        ? meta.observations.filter((o: string) => o?.trim())
        : [];
      const recommendations = Array.isArray(meta.recommendations)
        ? meta.recommendations.filter((r: string) => r?.trim())
        : ['Review findings and schedule next steps.'];

      pillars = buildPillarsFromFlat(
        observations.length > 0 ? observations : ['Market insights extracted from data analysis', 'Strategic opportunities identified', 'Key performance indicators analyzed'],
        recommendations,
      );
    }

    // Flat obs/recs still used for closing slide
    const flatObs  = Array.isArray(meta.observations)    ? meta.observations.filter((o: string) => o?.trim())    : [];
    const flatRecs = Array.isArray(meta.recommendations) ? meta.recommendations.filter((r: string) => r?.trim()) : [];

    // Assemble full PresentationData
    const presentationData: PresentationData = {
      templateId,
      briefName:       analysis.brand || analysis.sheet_name || 'Analysis Report',
      headline:        meta.headline  || analysis.brand || 'Strategic Insights from Analysis',
      objective:       meta.objective || analysis.objective || 'Data-driven analysis with key findings and recommendations',
      date:            new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      content:         pillars.content,
      commerce:        pillars.commerce,
      communication:   pillars.communication,
      culture:         pillars.culture,
      observations:    flatObs.length  > 0 ? flatObs  : charts.map(c => c.obs || '').filter(Boolean),
      recommendations: flatRecs.length > 0 ? flatRecs : charts.map(c => c.rec || '').filter(Boolean),
    };

    console.log('Generating PRISM deck...', {
      templateId,
      analysisId,
      briefName: presentationData.briefName,
      insightCounts: {
        content:       presentationData.content.insights.length,
        commerce:      presentationData.commerce.insights.length,
        communication: presentationData.communication.insights.length,
        culture:       presentationData.culture.insights.length,
      },
    });

    // Generate PPTX buffer
    const pptxBuffer = await generatePresentation(presentationData);

    // Persist to DB (non-fatal if it fails — client uses inline base64 anyway)
    const { randomUUID } = await import('crypto');
    const presentationId = randomUUID();

    try {
      let safeUserId: string | null = session.userId;
      const userCheck = await getPool().query('SELECT id FROM users WHERE id = $1', [session.userId]);
      if (userCheck.rows.length === 0) safeUserId = null;

      await getPool().query(
        `INSERT INTO presentations (
          id, analysis_id, user_id, template_id, template_name,
          brief_name, headline, pptx_data, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          presentationId,
          analysisId,
          safeUserId,
          templateId,
          template.name,
          presentationData.briefName,
          presentationData.headline,
          pptxBuffer,
          'generated',
          new Date(),
        ],
      );
    } catch (dbErr: any) {
      console.warn('Presentation DB insert (non-fatal):', dbErr.message);
    }

    // Return base64 inline — client decodes and triggers browser download
    const pptxBase64 = pptxBuffer.toString('base64');
    const filename = `${presentationData.briefName.replace(/\s+/g, '_')}_${template.name.replace(/\s+/g, '_')}.pptx`;

    return NextResponse.json(
      {
        success: true,
        presentationId,
        templateName:  template.name,
        briefName:     presentationData.briefName,
        headline:      presentationData.headline,
        downloadUrl:  `/api/presentations/${presentationId}/download`,
        pptxBase64,
        filename,
        status: 'generated',
        message: '✨ Your professional presentation is ready!',
      },
      { status: 201 },
    );

  } catch (error) {
    console.error('Error generating presentation:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to generate presentation', details: msg }, { status: 500 });
  }
}
