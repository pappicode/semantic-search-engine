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

  // Fallback model list: Tries models in sequential order
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      if (response.text) {
        return response.text;
      }
    } catch (error: any) {
      console.warn(`Model ${model} failed (${error.status || "Error"}). Trying next fallback...`);
    }
  }

  return "All model endpoints are currently experiencing high demand (503) or rate limits. Please try again in a few seconds.";
}