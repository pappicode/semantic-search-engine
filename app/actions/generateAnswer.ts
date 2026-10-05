// app/actions/generateAnswer.ts
"use server";

import { GoogleGenAI } from "@google/genai";

export async function generateAnswer(query: string, contextChunks: string[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return "Error: GEMINI_API_KEY is not configured in .env.local. Please add it and restart your dev server.";
  }

  if (!query.trim() || contextChunks.length === 0) {
    return "No matching document excerpts found for this query.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const contextText = contextChunks
    .map((chunk, idx) => `[EXCERPT ${idx + 1}]:\n${chunk}`)
    .join("\n\n");

  const prompt = `
You are a strict document extraction assistant.

STRICT GROUNDING RULES:
1. Answer the query EXCLUSIVELY using the facts present in the Context Excerpts below.
2. Do NOT use outside general knowledge, guess, or add information not explicitly found in the excerpts.
3. If the answer is NOT stated in the context, reply EXACTLY: "The requested information is not available in the provided document context."
4. Format your response cleanly using Markdown (bullet points or clean text).

User Query: "${query}"

Context Excerpts:
${contextText}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash", // Updated to recommended model endpoint
      contents: prompt,
    });

    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `API Error: ${error.message || "Failed to call Gemini API"}. Ensure your key in .env.local is correct and restart 'npm run dev'.`;
  }
}