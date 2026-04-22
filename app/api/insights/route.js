import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { ID as staticData } from '@/lib/data';
import { groupDatasetsForUnifiedView } from '@/lib/insights/grouping';
import { llmBuildInsightCards } from '@/lib/insights/llm_builder';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get('bucket'); // content, commerce, etc.

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
    const cacheKey = joinedUploadIds; 



    // 2. Check for cached insights
    const cachedRes = await db.query(
      'SELECT content FROM generated_insights WHERE upload_id = $1' + (bucket ? ' AND topic = $2' : ''),
      bucket ? [joinedUploadIds, bucket] : [joinedUploadIds]
    );

    if (cachedRes.rows.length > 0) {
      const cards = cachedRes.rows.map(r => JSON.parse(r.content));
      return NextResponse.json(bucket ? cards : cards); // Bucket filtering is handled by the query
    }

    // 3. Trigger Synthesis if not cached (Dynamic Insight Engine)
    console.log(`🧠 Insight Engine: Synthesizing latest batch ${joinedUploadIds}...`);
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

    // 4. Return filtered or full cards
    const finalCards = bucket ? allCards.filter(c => c.topic === bucket) : allCards;
    return NextResponse.json(finalCards);

  } catch (error) {
    console.error('❌ Insight Engine Error:', error.message);
    // Silent fallback to static data on error to keep UI "alive"
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get('bucket');
    return NextResponse.json(bucket && staticData[bucket] ? staticData[bucket] : staticData);
  }
}

