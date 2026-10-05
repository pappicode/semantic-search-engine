// lib/chunker.ts

export interface DocumentChunk {
  chunkId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
}

/**
 * Buffered Semantic Chunker
 * Merges small orphan fragments into larger structural blocks so chunks
 * remain complete, readable, and equal in context size.
 */
export function chunkText(
  text: string,
  fileName: string,
  targetChunkSize: number = 500,
  minChunkSize: number = 250
): DocumentChunk[] {
  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) return [];

  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let currentBlock: string[] = [];
  let currentLength = 0;
  let chunkIndex = 0;

  for (const line of lines) {
    // Detect major section headers (e.g. MONDAY, TUESDAY, EDUCATION, SUMMARY)
    const isMajorHeader = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|EXPERIENCE|EDUCATION|SUMMARY)/i.test(line);

    // Only split IF we hit a header AND our current buffer meets the minimum chunk size
    const shouldSplitOnHeader = isMajorHeader && currentLength >= minChunkSize;
    const shouldSplitOnLength = currentLength + line.length > targetChunkSize;

    if (shouldSplitOnHeader || shouldSplitOnLength) {
      if (currentBlock.length > 0) {
        chunks.push({
          chunkId: `${fileName}-${chunkIndex}-${Date.now()}`,
          fileName,
          chunkIndex,
          text: currentBlock.join("\n"),
        });
        chunkIndex++;
        currentBlock = [line];
        currentLength = line.length;
      }
    } else {
      currentBlock.push(line);
      currentLength += line.length + 1;
    }
  }

  // Flush remaining buffer
  if (currentBlock.length > 0) {
    // If the final fragment is too small, merge it into the last existing chunk
    if (currentLength < minChunkSize && chunks.length > 0) {
      chunks[chunks.length - 1].text += "\n" + currentBlock.join("\n");
    } else {
      chunks.push({
        chunkId: `${fileName}-${chunkIndex}-${Date.now()}`,
        fileName,
        chunkIndex,
        text: currentBlock.join("\n"),
      });
    }
  }

  return chunks;
}