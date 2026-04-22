import { GoogleGenerativeAI } from "@google/generative-ai";

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // Force v1 API
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });
    const result = await model.generateContent("Hi");
    console.log("Success with v1");
    console.log(await result.response.text());
  } catch (e) {
    console.log(`Failed with v1: ${e.message}`);
  }
}
test();
