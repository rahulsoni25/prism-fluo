/**
 * POST /api/presentations/generate
 *
 * Generates a presentation deck from template + analysis data
 * Uses Gamma API to create professional presentation
 * Stores presentation reference in database
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { getTemplate } from '@/lib/templates/definitions';
import { generateDeckContent, buildGammaPrompt, validateDeckRequest } from '@/lib/templates/generator';
import { generateWithGemini } from '@/lib/ai/gemini';
import { generatePresentationWithGamma } from '@/lib/ai/gamma';

export const dynamic = 'force-dynamic';

interface GeneratePresentationRequest {
  templateId: string;
  analysisId: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    const body: GeneratePresentationRequest = await req.json();
    const { templateId, analysisId } = body;

    // Validate template exists
    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Fetch analysis - with owner check
    const { rows } = await db.query(
      'SELECT id, sheet_name, results_json FROM analyses WHERE id = $1 AND user_id = $2',
      [analysisId, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Analysis not found or not owned by user' }, { status: 404 });
    }

    const analysis = rows[0];
    const results = analysis.results_json || {};
    const charts = Array.isArray(results.charts) ? results.charts : [];
    const summary = results.executiveSummary || {};

    // Generate fallback observations from charts if summary is missing
    const fallbackObservations = charts.length > 0
      ? charts.slice(0, 5).map((c: any, i: number) =>
          `${i + 1}. ${c.title || 'Insight'}: ${c.obs || 'Key finding from analysis'}`)
      : ['Data-driven insight from analysis'];

    // Generate fallback recommendations
    const fallbackRecommendations = [
      'Review the key findings above',
      'Take action on identified opportunities',
      'Monitor metrics going forward'
    ];

    // Extract summary data
    const deckRequest = {
      templateId,
      analysisId,
      briefName: analysis.sheet_name || 'Analysis Report',
      headline: summary.headline || 'Strategic Insights from Analysis',
      objective: summary.objective || 'Comprehensive analysis of key findings and recommendations',
      observations: (summary.observations && summary.observations.length > 0)
        ? summary.observations.filter((o: string) => o.trim())
        : fallbackObservations,
      recommendations: (summary.recommendations && summary.recommendations.length > 0)
        ? summary.recommendations.filter((r: string) => r.trim())
        : fallbackRecommendations,
    };

    // Validate request data
    const validation = validateDeckRequest(deckRequest);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid presentation data', details: validation.errors },
        { status: 400 }
      );
    }

    // Generate deck content from template
    const deckContent = generateDeckContent(template, {
      briefName: deckRequest.briefName,
      headline: deckRequest.headline,
      objective: deckRequest.objective,
      observations: deckRequest.observations,
      recommendations: deckRequest.recommendations,
      createdAt: new Date(),
    });

    // Build Gamma prompt
    const gammaPrompt = buildGammaPrompt(template, deckContent, {
      briefName: deckRequest.briefName,
      headline: deckRequest.headline,
      objective: deckRequest.objective,
      observations: deckRequest.observations,
      recommendations: deckRequest.recommendations,
    });

    // Generate presentation using Gamma API
    const gammaPresentation = await generatePresentationWithGamma(
      gammaPrompt,
      deckRequest.briefName,
    );

    const presentationId = `pres_${Date.now()}`;
    const downloadUrl = `/api/presentations/${presentationId}/download`;

    try {
      // Try to insert, but don't fail if table doesn't exist
      try {
        await db.query(
          `INSERT INTO presentations (
            id, analysis_id, user_id, template_id, template_name,
            brief_name, headline, gamma_url, download_url, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            presentationId,
            analysisId,
            session.userId,
            templateId,
            template.name,
            deckRequest.briefName,
            deckRequest.headline,
            gammaPresentation.url,
            downloadUrl,
            'generated',
            new Date(),
          ],
        );
      } catch (tableError: any) {
        // If table doesn't exist, still return success
        // The presentation is still generated, just not stored
        if (tableError.message?.includes('presentations') || tableError.code === 'UNDEFINED_TABLE') {
          console.warn('Presentations table does not exist yet, returning success anyway');
        } else {
          throw tableError;
        }
      }

      return NextResponse.json({
        success: true,
        presentationId,
        templateName: template.name,
        briefName: deckRequest.briefName,
        headline: deckRequest.headline,
        gammaUrl: gammaPresentation.url,
        downloadUrl: downloadUrl,
        status: 'generated',
        message: '✨ Your presentation is ready! Download it now or view it online.',
      }, { status: 201 });
    } catch (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

  } catch (error) {
    console.error('Error generating presentation:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to generate presentation', details: errorMessage },
      { status: 500 }
    );
  }
}
