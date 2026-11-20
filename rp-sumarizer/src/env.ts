import { UserError } from "./errors";
import { resolveOutputDir } from "./output";

export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type Env = {
  apiKey: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens: number;
  outputDir: string;
  maxPapers: number;
  maxTotalBytes: number;
  debug: boolean;
};

export function loadEnv(): Env {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new UserError(
      "GEMINI_API_KEY is not set. Copy .env.example to .env and add a key from https://aistudio.google.com/apikey.",
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const rawLevel = process.env.GEMINI_THINKING_LEVEL?.trim() ?? "medium";
  let thinkingLevel: ThinkingLevel | undefined;

  if (rawLevel) {
    if (!THINKING_LEVELS.includes(rawLevel as ThinkingLevel)) {
      throw new UserError(
        `GEMINI_THINKING_LEVEL must be one of ${THINKING_LEVELS.join(", ")}, or empty to use the model default.`,
      );
    }
    thinkingLevel = rawLevel as ThinkingLevel;
  }

  const maxPapers = intEnv("PAPERLENS_MAX_PAPERS", 10, 1, 50);
  const maxTotalMb = intEnv("PAPERLENS_MAX_TOTAL_MB", 12, 1, 100);

  return {
    apiKey,
    model,
    thinkingLevel,
    maxOutputTokens: intEnv("GEMINI_MAX_OUTPUT_TOKENS", 8192, 256, 65536),
    outputDir: resolveOutputDir(process.env.PAPERLENS_OUTPUT_DIR),
    maxPapers,
    maxTotalBytes: maxTotalMb * 1024 * 1024,
    debug: process.env.PAPERLENS_DEBUG === "1" || process.env.PAPERLENS_DEBUG === "true",
  };
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new UserError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}
