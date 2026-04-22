import { GoogleGenerativeAI } from "@google/generative-ai";

async function list() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // There is no direct listModels on genAI in this SDK version usually, 
    // but we can try to fetch it via the REST endpoint or check the docs.
    // Actually, let's just try common names.
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Hi");
            console.log(`Success with ${m}`);
            return;
        } catch (e) {
            console.log(`Failed with ${m}: ${e.message}`);
        }
    }
  } catch (e) {
    console.error(e);
  }
}
list();
