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

  if (!geminiKey && !groqKey) {
    return "Error: No API keys configured in environment.";
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

  const errors: string[] = [];

  // 1. Try Gemini (gemini-3.8-flash)
  if (geminiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const geminiModels = ["gemini-3.8-flash"];

    for (const model of geminiModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (response.text) return response.text;
      } catch (err: any) {
        const msg = err.message || String(err);
        console.error(`[Gemini - ${model} Error]:`, msg);
        errors.push(`Gemini (${model}): ${msg}`);
      }
    }
  } else {
    errors.push("Gemini: GEMINI_API_KEY missing");
  }

  // 2. Try Groq (llama-3.1-8b-instant / llama3-70b-8192)
  if (groqKey) {
    const groq = new Groq({ apiKey: groqKey });
    const groqModels = ["llama-3.1-8b-instant", "llama3-70b-8192"];

    for (const model of groqModels) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model,
        });
        const response = completion.choices[0]?.message?.content;
        if (response) return response;
      } catch (gErr: any) {
        const msg = gErr.message || String(gErr);
        console.error(`[Groq - ${model} Error]:`, msg);
        errors.push(`Groq (${model}): ${msg}`);
      }
    }
  } else {
    errors.push("Groq: GROQ_API_KEY missing");
  }

  return `AI Generation Failed.\n\nDiagnostic Info:\n${errors.map((e) => `• ${e}`).join("\n")}`;
}