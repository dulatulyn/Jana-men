import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "kb")) && fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const ROOT = findRoot();

export const config = {
  port: Number(process.env.PORT ?? 8001),
  backendMode: (process.env.BACKEND_MODE === "real" ? "real" : "mock") as "mock" | "real",
  backendUrl: (process.env.BACKEND_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, ""),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.AI_MODEL || "claude-sonnet-5-5",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  kbDir: process.env.KB_DIR ?? path.join(ROOT, "kb"),
  profilesFile: process.env.MOCK_PROFILES ?? path.join(ROOT, "mock", "profiles.json"),
};
