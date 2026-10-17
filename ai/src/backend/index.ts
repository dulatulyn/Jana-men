import { config } from "../config.js";
import type { BackendClient } from "./BackendClient.js";
import { MockBackend } from "./MockBackend.js";
import { RealBackend } from "./RealBackend.js";

export * from "./BackendClient.js";
export { MockBackend, RealBackend };

export function createBackend(): BackendClient {
  return config.backendMode === "real"
    ? new RealBackend(config.backendUrl)
    : new MockBackend({ kbDir: config.kbDir, profilesFile: config.profilesFile });
}
