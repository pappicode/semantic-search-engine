// lib/fileParser.ts
import * as pdfjsLib from "pdfjs-dist";

// Fail-safe worker configuration for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  // 1. Plain Text / Markdown / Code Files
  if (["txt", "md", "json", "js", "ts", "py", "csv", "html"].includes(extension || "")) {
    return await file.text();
  }

  // 2. PDF Files with Spatial Y-Coordinate Line Reconstruction
  if (extension === "pdf") {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        let lastY: number | null = null;
        let pageText = "";

        const sortedItems = (content.items as any[]).sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 4) return yDiff;
          return a.transform[4] - b.transform[4];
        });

        for (const item of sortedItems) {
          const currentY = item.transform[5];

          if (lastY !== null && Math.abs(currentY - lastY) > 6) {
            pageText += "\n";
          } else if (pageText.length > 0 && !pageText.endsWith("\n") && !pageText.endsWith(" ")) {
            pageText += " ";
          }

          pageText += item.str;
          lastY = currentY;
        }

        fullText += `\n\n${pageText}`;
      }

      return fullText;
    } catch (pdfErr: any) {
      console.error("PDF Parsing Error:", pdfErr);
      throw new Error(`Failed to parse PDF file: ${pdfErr.message}`);
    }
  }

  throw new Error(`Unsupported file type: .${extension}`);
}