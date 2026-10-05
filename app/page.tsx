// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cosineSimilarity } from "@/lib/vectorUtils";
import { chunkText, DocumentChunk } from "@/lib/chunker";
import { extractTextFromFile } from "@/lib/fileParser";
import { getAllChunksFromDB, saveChunksToDB, clearDB } from "@/lib/db";
import { generateAnswer } from "./actions/generateAnswer";

// Exact Keyword + Vector Semantic Hybrid Scoring
function calculateHybridScore(query: string, chunkText: string, vectorScore: number): number {
  if (!query.trim()) return vectorScore;

  const queryTerms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryTerms.length === 0) return vectorScore;

  const textLower = chunkText.toLowerCase();
  let matchCount = 0;

  for (const term of queryTerms) {
    if (textLower.includes(term)) matchCount++;
  }

  const keywordRatio = matchCount / queryTerms.length;
  // 60% Vector Semantic Similarity + 40% Exact Keyword Match
  return vectorScore * 0.6 + keywordRatio * 0.4;
}

export default function DocumentSearchApp() {
  const worker = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Loading embedding engine...");
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Search & Debounce States
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);

  // RAG Response State
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // 1. Load DB & Initialize Web Worker
  useEffect(() => {
    getAllChunksFromDB().then((storedChunks) => {
      if (storedChunks.length > 0) setChunks(storedChunks);
    });

    worker.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    const handleMessage = (e: MessageEvent) => {
      const { type, data, id, embedding } = e.data;
      if (type === "PROGRESS" && data.status === "downloading") {
        setStatus(`Downloading model: ${Math.round(data.progress || 0)}%`);
      } else if (type === "READY") {
        setIsReady(true);
        setStatus("Client-Side Engine Active (WASM)");
      } else if (type === "EMBED_COMPLETE") {
        if (id === "QUERY") {
          setQueryEmbedding(embedding);
        } else {
          setChunks((prev) => {
            const updated = prev.map((c) => (c.chunkId === id ? { ...c, embedding } : c));
            saveChunksToDB(updated);
            return updated;
          });
        }
      }
    };

    worker.current.addEventListener("message", handleMessage);
    worker.current.postMessage({ type: "INIT" });

    return () => worker.current?.terminate();
  }, []);

  // 2. Debounce Search Input (Waits 400ms after typing stops)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 3. Request Vector Embedding only when debounced query updates
  useEffect(() => {
    setAiAnswer("");
    if (!debouncedQuery.trim() || !worker.current) {
      setQueryEmbedding(null);
      return;
    }
    worker.current.postMessage({ type: "EMBED", text: debouncedQuery, id: "QUERY" });
  }, [debouncedQuery]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !worker.current) return;

    setIsProcessing(true);
    setStatus("Parsing document text...");

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rawText = await extractTextFromFile(file);
        const newChunks = chunkText(rawText, file.name);

        setChunks((prev) => [...prev, ...newChunks]);

        setStatus(`Vectorizing ${newChunks.length} chunks...`);
        for (const chunk of newChunks) {
          worker.current.postMessage({ type: "EMBED", text: chunk.text, id: chunk.chunkId });
        }
      }
      setStatus("Document indexing complete!");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rank chunks using Hybrid Scoring
  const rankedChunks = chunks
    .filter((c) => c.embedding !== undefined)
    .map((chunk) => {
      const rawVectorScore = queryEmbedding ? cosineSimilarity(queryEmbedding, chunk.embedding!) : 0;
      const hybridScore = calculateHybridScore(debouncedQuery, chunk.text, rawVectorScore);
      return { ...chunk, score: hybridScore };
    })
    .sort((a, b) => (queryEmbedding ? b.score - a.score : 0));

  // Async Handler for RAG Answer Generation
  const handleGenerateAnswer = async () => {
    if (!debouncedQuery.trim() || rankedChunks.length === 0) return;

    setIsGeneratingAi(true);

    const relevantChunks = rankedChunks
      .slice(0, 2)
      .map((c) => c.text);

    if (relevantChunks.length === 0) {
      setAiAnswer("No relevant information found in the document context.");
      setIsGeneratingAi(false);
      return;
    }

    const answer = await generateAnswer(debouncedQuery, relevantChunks);
    setAiAnswer(answer);
    setIsGeneratingAi(false);
  };

  const handleClear = async () => {
    await clearDB();
    setChunks([]);
    setQueryEmbedding(null);
    setSearchQuery("");
    setDebouncedQuery("");
    setAiAnswer("");
  };

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6 font-sans text-gray-900">
      <header className="border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Client-Side RAG Search Engine</h1>
          <p className="text-xs font-mono text-gray-500 mt-1">{status}</p>
        </div>
        {chunks.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-md font-medium"
          >
            Clear Data
          </button>
        )}
      </header>

      {/* Upload Dropzone */}
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50/50">
        <input
          type="file"
          accept=".pdf,.txt,.md,.json,.js,.py"
          onChange={handleFileUpload}
          disabled={!isReady || isProcessing}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer inline-flex flex-col items-center gap-2">
          <div className="p-3 bg-white rounded-full shadow-sm border border-gray-100 text-lg">📄</div>
          <span className="text-sm font-semibold text-gray-700">
            {isProcessing ? "Processing & Vectorizing..." : "Upload document (PDF, TXT, MD)"}
          </span>
          <span className="text-xs text-gray-400">Indexed locally via WebAssembly</span>
        </label>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ask a question or search by concept..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={!isReady || chunks.length === 0}
          className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-black/5 text-sm"
        />
        {queryEmbedding && (
          <button
            onClick={handleGenerateAnswer}
            disabled={isGeneratingAi}
            className="px-5 py-3 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 disabled:bg-gray-300 transition-colors"
          >
            {isGeneratingAi ? "Synthesizing..." : "Synthesize AI Answer"}
          </button>
        )}
      </div>

      {/* AI Synthesized Answer Card */}
      {aiAnswer && (
        <div className="p-6 border border-emerald-200 bg-emerald-50/40 rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <span>✨</span> AI Synthesized RAG Answer
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
            {aiAnswer}
          </div>
        </div>
      )}

      {/* Retrieved Context Chunks */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {queryEmbedding ? "Retrieved Source Context Chunks" : `Indexed Chunks (${chunks.length})`}
        </h2>

        {rankedChunks.slice(0, 3).map((chunk) => (
          <div key={chunk.chunkId} className="p-4 border rounded-xl bg-white space-y-2 shadow-sm text-xs">
            <div className="flex justify-between font-mono text-gray-500">
              <span>📄 {chunk.fileName} (Chunk #{chunk.chunkIndex + 1})</span>
              {queryEmbedding && (
                <span className="font-bold text-emerald-700">
                  {(chunk.score * 100).toFixed(1)}% match
                </span>
              )}
            </div>
            <p className="text-gray-800 font-sans leading-normal whitespace-pre-line">{chunk.text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}