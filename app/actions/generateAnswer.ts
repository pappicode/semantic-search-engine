// app/actions/generateAnswer.ts
"use server";

import { GoogleGenAI } from "@google/genai";

export async function generateAnswer(query: string, contextChunks: string[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return "Error: GEMINI_API_KEY is not configured in .env.local / Vercel Environment Variables.";
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

  // Standard verified Gemini Flash & Pro model endpoints
  const modelsToTry = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];

  let lastErrorDetail = "";

  for (const model of modelsToTry) {
    // Retry up to 2 times per model with a brief delay for transient 503/429 spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });

        if (response.text) {
          return response.text;
        }
      } catch (error: any) {
        lastErrorDetail = error.message || String(error);
        console.warn(`[Gemini RAG] Attempt ${attempt} failed for ${model}:`, lastErrorDetail);

        // If high demand (503) or rate limit (429), pause 1 second before retrying
        if (lastErrorDetail.includes("503") || lastErrorDetail.includes("429") || lastErrorDetail.includes("UNAVAILABLE")) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // If 404 or non-transient, skip to next model
          break;
        }
      }
    }
  }

  return `Gemini API Temporary Error: ${lastErrorDetail || "High demand on Google AI servers"}. Please click "Synthesize AI Answer" again in a few seconds.`;
}