// lib/vectorUtils.ts

// Calculate cosine similarity between two equal-length numeric vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function calculateHybridScore(
  query: string,
  chunkText: string,
  vectorScore: number
): number {
  if (!query.trim()) return vectorScore;

  // Extract key search terms (e.g. "monday", "breakfast")
  const queryTerms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryTerms.length === 0) return vectorScore;

  const textLower = chunkText.toLowerCase();
  let matchCount = 0;

  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      matchCount++;
    }
  }

  // Calculate keyword match ratio (0.0 to 1.0)
  const keywordRatio = matchCount / queryTerms.length;

  // Hybrid Formula: 60% Vector Semantic Similarity + 40% Exact Keyword Match
  return vectorScore * 0.6 + keywordRatio * 0.4;
}