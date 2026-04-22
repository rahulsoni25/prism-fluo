import { NextRequest, NextResponse } from 'next/server';
import { groupDatasetsForUnifiedView } from '@/lib/insights/grouping';
import { buildInsightCardsForGroup } from '@/lib/insights/builder';

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) => {
  try {
    const { uploadId } = await params;

    // 1. Group datasets by Geo + Topic
    const groups = await groupDatasetsForUnifiedView(uploadId);

    if (!groups || groups.length === 0) {
      return NextResponse.json({ uploadId, insightCards: [], message: 'No valid data groups found for synthesis.' });
    }

    // 2. Build synthesis cards for each group in PARALLEL
    console.log(`🚀 Starting parallel AI synthesis for ${groups.length} groups...`);
    const { getGroundedContext } = await import('@/lib/insights/context');
    const { llmBuildInsightCards } = await import('@/lib/insights/llm_builder');

    const groupPromises = groups.map(async (group) => {
      try {
        const context = await getGroundedContext(group);
        // Request 6 high-quality cards instead of 10 to speed up response
        const aiCards = await llmBuildInsightCards(context, 6);
        
        if (aiCards && aiCards.length > 0) {
          return aiCards;
        } else {
          const { buildInsightCardsForGroup } = await import('@/lib/insights/builder');
          return await buildInsightCardsForGroup(group);
        }
      } catch (err) {
        console.warn(`⚠️ AI Synthesis failed for group ${group.geography}, falling back:`, err.message);
        const { buildInsightCardsForGroup } = await import('@/lib/insights/builder');
        return await buildInsightCardsForGroup(group);
      }
    });

    const results = await Promise.all(groupPromises);
    const allCards = results.flat();

    return NextResponse.json({
      uploadId,
      insightCards: allCards
    });

  } catch (error: any) {
    console.error('Insights API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
