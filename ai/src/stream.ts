export interface PacingOptions {
  minDelayMs: number;
  maxDelayMs: number;
  maxTotalMs: number;
  random?: () => number;
}

export const DEFAULT_PACING: PacingOptions = { minDelayMs: 20, maxDelayMs: 35, maxTotalMs: 2500 };

export function splitWords(text: string): string[] {
  return text.match(/^\s+|\S+\s*/g) ?? [];
}

export function planDeltas(text: string, opts: PacingOptions = DEFAULT_PACING): { chunks: string[]; delays: number[] } {
  const words = splitWords(text);
  const maxChunks = opts.maxDelayMs > 0 ? Math.max(1, Math.floor(opts.maxTotalMs / opts.maxDelayMs) + 1) : words.length;
  const size = Math.max(1, Math.ceil(words.length / Math.max(1, maxChunks)));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(""));
  const random = opts.random ?? Math.random;
  const span = Math.max(0, opts.maxDelayMs - opts.minDelayMs);
  const delays = chunks.map((_, i) => (i === chunks.length - 1 ? 0 : Math.round(opts.minDelayMs + random() * span)));
  return { chunks, delays };
}
