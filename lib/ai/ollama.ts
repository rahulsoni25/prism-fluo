/**
 * lib/ai/ollama.ts
 * Ollama client — works with Ollama Cloud (Bearer key) and self-hosted endpoints.
 *
 * Env:
 *   OLLAMA_API_KEY   Bearer token. Required for Ollama Cloud, optional for self-hosted.
 *   OLLAMA_BASE_URL  Default: https://ollama.com
 *   OLLAMA_MODEL     Default: gpt-oss:120b   (Ollama Cloud); use llama3.2 for self-hosted small.
 */

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE  = 'https://ollama.com';
const DEFAULT_MODEL = 'gpt-oss:120b';

export function ollamaConfigured(): boolean {
  // Self-hosted Ollama may need no key, so only require the base URL or the key.
  return Boolean(process.env.OLLAMA_API_KEY || process.env.OLLAMA_BASE_URL);
}

export async function chat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const base    = (process.env.OLLAMA_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model   = opts.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const apiKey  = process.env.OLLAMA_API_KEY;
  const timeout = opts.timeoutMs ?? 30_000;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), timeout);

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.4 },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    // Ollama returns { message: { role, content } } for non-streamed chat
    const content = json?.message?.content ?? json?.response ?? '';
    if (!content) throw new Error('Ollama returned empty content');
    return String(content).trim();
  } finally {
    clearTimeout(t);
  }
}
