import { MockBackend } from "../src/backend/MockBackend.js";
import { config } from "../src/config.js";
import type { ModelClient, ModelOutput, ModelRequest } from "../src/llm.js";

export const NOW = () => new Date("2026-10-16T09:00:00Z");
export const backend = () => new MockBackend({ kbDir: config.kbDir, profilesFile: config.profilesFile });

export class FakeModel implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private reply: ModelOutput | ((r: ModelRequest) => ModelOutput) | Error) {}
  async generate(req: ModelRequest): Promise<ModelOutput> {
    this.calls.push(req);
    if (this.reply instanceof Error) throw this.reply;
    return typeof this.reply === "function" ? this.reply(req) : this.reply;
  }
}

export const out = (o: Partial<ModelOutput>): ModelOutput => ({ status: "answered", answer: "", citations: [], action: null, ...o });
