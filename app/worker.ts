// app/worker.ts
import { pipeline, env } from "@huggingface/transformers";

// Disable local model searches and enable browser caching
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
  static task = "feature-extraction" as const;
  static model = "Xenova/all-MiniLM-L6-v2";
  static instance: any = null;

  static async getInstance(progress_callback?: Function) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
      });
    }
    return this.instance;
  }
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, text, id } = event.data;

  if (type === "INIT") {
    try {
      await PipelineSingleton.getInstance((data: any) => {
        self.postMessage({ type: "PROGRESS", data });
      });
      self.postMessage({ type: "READY" });
    } catch (err: any) {
      console.error("Worker Init Error:", err);
      self.postMessage({ type: "ERROR", error: err.message });
    }
  } else if (type === "EMBED") {
    try {
      const extractor = await PipelineSingleton.getInstance();
      const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      const embedding = Array.from(output.data as Float32Array);
      self.postMessage({ type: "EMBED_COMPLETE", id, embedding });
    } catch (err: any) {
      console.error("Worker Embedding Error:", err);
    }
  }
});