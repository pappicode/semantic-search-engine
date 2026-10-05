// app/actions/generateAnswer.ts
"use server";

import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export async function generateAnswer(query: string, contextChunks: string[]): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (!query.trim() || contextChunks.length === 0) {
    return "No matching document excerpts found for this query.";
  }

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

  // 1. Try Primary Provider: Gemini
  if (geminiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash"];

    for (const model of geminiModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (response.text) return response.text;
      } catch (err: any) {
        console.warn(`[Gemini] ${model} failed, attempting next...`, err.message || err);
      }
    }
  }

  // 2. Fallback Provider: Groq (Llama 3.3 70B)
  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
      });
      const response = completion.choices[0]?.message?.content;
      if (response) return response;
    } catch (groqErr: any) {
      console.error("[Groq Fallback Failed]:", groqErr.message || groqErr);
    }
  }

  return "AI services are temporarily overloaded. Please try again in a few seconds.";
}