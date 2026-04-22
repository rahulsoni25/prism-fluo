import { NextResponse } from 'next/server';
import { ID as staticData } from '@/lib/data';

// Detect build-time environment: during `next build` the database file is
// unavailable, so we skip all DB operations and return static fallback data.
// We check for the absence of a runtime-only signal (NEXT_PHASE) as well as
// whether the DB path env var is set, so the check is reliable across hosts.
function isDatabaseAvailable() {
  // NEXT_PHASE is set to 'phase-production-build' during `next build`
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  // If neither a custom DB path nor a database URL is configured, assume
  // the database is not available (e.g. CI / build containers).
  if (!process.env.PRISM_DB_PATH && !process.env.DATABASE_URL) return false;
  return true;
}

export async function GET(request) {
  // Parse search params outside the try-catch so the catch block can use them.
  let bucket = null;
  try {
    const { searchParams } = new URL(request.url);
    bucket = searchParams.get('bucket'); // content, commerce, etc.
  } catch (_) {
    // Malformed URL — return full static dataset
    return NextResponse.json(staticData);
  }

  // Short-circuit immediately during build or when DB is not configured.
  if (!isDatabaseAvailable()) {
    console.log('ℹ️  Insights: database unavailable (build phase), returning static data');
    return NextResponse.json(bucket && staticData[bucket] ? staticData[bucket] : staticData);
  }

  try {
    // Lazy-import the DB client so the module is never evaluated during build,
    // which prevents the SQLite connection attempt from running at import time.
    const { db } = await import('@/lib/db/client');

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    let uploadIds = [];
    let activeSessionName = '';

    if (sessionId) {
      const res = await db.query('SELECT id FROM uploads WHERE session_id = $1', [sessionId]);
      uploadIds = res.rows.map(r => r.id);
      activeSessionName = `Session: ${sessionId.slice(0, 8)}`;
    } else {
      // Get the absolute latest session
      const latestSessionRes = await db.query('SELECT id, name FROM sessions ORDER BY created_at DESC LIMIT 1');
      if (latestSessionRes.rows[0]) {
        const sid = latestSessionRes.rows[0].id;
        const res = await db.query('SELECT id FROM uploads WHERE session_id = $1', [sid]);
        uploadIds = res.rows.map(r => r.id);
        activeSessionName = latestSessionRes.rows[0].name;
      }
    }

    if (uploadIds.length === 0) {
      return NextResponse.json(bucket && staticData[bucket] ? staticData[bucket] : staticData);
    }

    const joinedUploadIds = uploadIds.join(',');

    // Check for cached insights
    const cachedRes = await db.query(
      'SELECT content FROM generated_insights WHERE upload_id = $1' + (bucket ? ' AND topic = $2' : ''),
      bucket ? [joinedUploadIds, bucket] : [joinedUploadIds]
    );

    if (cachedRes.rows.length > 0) {
      const cards = cachedRes.rows.map(r => JSON.parse(r.content));
      return NextResponse.json(cards);
    }

    // Trigger Synthesis if not cached (Dynamic Insight Engine)
    console.log(`🧠 Insight Engine: Synthesizing latest batch ${joinedUploadIds}...`);
    const { groupDatasetsForUnifiedView } = await import('@/lib/insights/grouping');
    const groups = await groupDatasetsForUnifiedView(joinedUploadIds);
    let allCards = [];

    for (const group of groups) {
      const { getGroundedContext } = await import('@/lib/insights/context');
      const context = await getGroundedContext(group);
      const { llmBuildInsightCards } = await import('@/lib/insights/llm_builder');
      const aiCards = await llmBuildInsightCards(context);

      if (aiCards && aiCards.length > 0) {
        // Cache the cards
        for (const card of aiCards) {
          await db.query(
            'INSERT INTO generated_insights (id, upload_id, topic, content) VALUES ($1, $2, $3, $4)',
            [card.id || crypto.randomUUID(), joinedUploadIds, card.topic || 'content', JSON.stringify(card)]
          );
        }
        allCards = [...allCards, ...aiCards];
      }
    }

    // Return filtered or full cards
    const finalCards = bucket ? allCards.filter(c => c.topic === bucket) : allCards;
    return NextResponse.json(finalCards);

  } catch (error) {
    console.error('❌ Insight Engine Error:', error.message);
    // Silent fallback to static data on any runtime error to keep the UI alive.
    return NextResponse.json(bucket && staticData[bucket] ? staticData[bucket] : staticData);
  }
}

