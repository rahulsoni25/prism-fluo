import { GoogleGenerativeAI } from '@google/generative-ai';

export async function callLLM(prompt: string, systemPrompt: string = '', model: string = 'gemini-2.5-flash') {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3';

  // 1. Try Gemini first if API key exists
  if (GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const modelInstance = genAI.getGenerativeModel({ model });
      const result = await modelInstance.generateContent(`${systemPrompt}\n\n${prompt}`);
      return result.response.text();
    } catch (e: any) {
      console.warn('⚠️ Gemini call failed, falling back to Ollama:', e.message);
    }
  }

  // 2. Fallback to Ollama (Local)
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${systemPrompt}\n\n${prompt}`,
        stream: false
      })
    });
    const data = await response.json();
    return data.response;
  } catch (e: any) {
    console.error('❌ Both Gemini and Ollama failed:', e.message);
    throw new Error('AI Service Unavailable');
  }
}
