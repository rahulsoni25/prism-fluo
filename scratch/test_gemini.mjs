import { GoogleGenerativeAI } from "@google/generative-ai";

async function test() {
  const key = process.env.GEMINI_API_KEY;
  console.log("Using key starting with:", key?.substring(0, 8));
  const genAI = new GoogleGenerativeAI(key);
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hi");
    console.log("Response:", await result.response.text());
  } catch (e) {
    console.error("Test Error:", e.message);
  }
}
test();

