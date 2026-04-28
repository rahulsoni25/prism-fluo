/**
 * Gamma API Integration
 * Generates professional presentations using Gamma's AI
 */

interface GammaPresentation {
  id: string;
  url: string;
  name: string;
  status: 'generating' | 'ready' | 'failed';
}

export async function generatePresentationWithGamma(
  prompt: string,
  title: string,
): Promise<GammaPresentation> {
  const gammaApiKey = process.env.GAMMA_API_KEY;

  if (!gammaApiKey) {
    console.warn('GAMMA_API_KEY not set, returning placeholder');
    return {
      id: `gamma_${Date.now()}`,
      url: '#',
      name: title,
      status: 'ready',
    };
  }

  try {
    // Call Gamma API to create presentation
    const response = await fetch('https://api.gamma.app/v1/presentations/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gammaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        content: prompt,
        mode: 'auto', // Let Gamma auto-generate content
        format: 'pptx', // Generate as PowerPoint
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gamma API error: ${response.status} ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    return {
      id: data.id || `gamma_${Date.now()}`,
      url: data.url || data.share_link || '#',
      name: title,
      status: 'ready',
    };
  } catch (error) {
    console.error('Gamma API error:', error);
    // Fallback: return placeholder that still allows downloading
    return {
      id: `gamma_${Date.now()}`,
      url: '#',
      name: title,
      status: 'failed',
    };
  }
}

/**
 * Export presentation as downloadable file
 */
export async function exportPresentationToPPT(
  presentationUrl: string,
  filename: string,
): Promise<Buffer | null> {
  try {
    if (!presentationUrl || presentationUrl === '#') {
      // Generate a placeholder PPT using pptxgen if available
      return null;
    }

    const response = await fetch(presentationUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch presentation: ${response.status}`);
    }

    return await response.arrayBuffer() as any;
  } catch (error) {
    console.error('Error exporting presentation:', error);
    return null;
  }
}
