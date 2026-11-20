import type { GoogleGenAIInteraction, Interactions } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import type { Env } from "./env";
import { GuideOutputError, UserError } from "./errors";
import type { PaperInput } from "./inputs";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { applyTopicPolicy, GUIDE_SCHEMA, type Guide, sanitizeGuide, validateGuide } from "./schema";

export type GuideResult = {
  guide: Guide;
  raw: string;
  usage?: Interactions.Usage;
};

export async function generateGuide(
  env: Env,
  papers: PaperInput[],
  topic: string | undefined,
): Promise<GuideResult> {
  const ai = new GoogleGenAI({
    apiKey: env.apiKey,
    httpOptions: { apiVersion: "v1beta" },
  });

  let interaction: GoogleGenAIInteraction;
  try {
    interaction = await ai.interactions.create({
      model: env.model,
      system_instruction: SYSTEM_PROMPT,
      input: buildParts(papers, topic),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: withoutArrayBounds(GUIDE_SCHEMA),
      },
      generation_config: {
        ...(env.thinkingLevel ? { thinking_level: env.thinkingLevel } : {}),
        max_output_tokens: env.maxOutputTokens,
      },
      store: false,
    });
  } catch (error) {
    throw mapApiError(error, env);
  }

  const raw = extractText(interaction).trim();
  if (!raw) throw new GuideOutputError("Gemini returned an empty response.", raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch (error) {
    throw new GuideOutputError(
      "Gemini returned invalid JSON.",
      raw,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }

  let guide: Guide;
  try {
    guide = sanitizeGuide(applyTopicPolicy(validateGuide(parsed), topic));
  } catch (error) {
    throw new GuideOutputError(
      "Gemini returned JSON that does not match the guide schema.",
      raw,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }

  return { guide, raw, usage: interaction.usage };
}

function withoutArrayBounds(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutArrayBounds);
  if (!schema || typeof schema !== "object") return schema;

  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== "minItems" && key !== "maxItems")
      .map(([key, value]) => [key, withoutArrayBounds(value)]),
  );
}

function buildParts(papers: PaperInput[], topic: string | undefined): Interactions.Content[] {
  const parts: Interactions.Content[] = [];

  papers.forEach((paper, index) => {
    const source = paper.source && paper.source !== paper.name ? ` (source: ${paper.source})` : "";
    const label = `Paper ${index + 1}: ${paper.name}${source}`;

    if (paper.kind === "document") {
      parts.push({ type: "text", text: label });
      parts.push({
        type: "document",
        mime_type: paper.mimeType,
        data: paper.data,
      });
    } else {
      parts.push({ type: "text", text: `${label}\n\n${paper.text}` });
    }
  });

  parts.push({ type: "text", text: buildUserPrompt(papers, topic) });
  return parts;
}

function extractText(interaction: GoogleGenAIInteraction): string {
  if (interaction.output_text?.trim()) return interaction.output_text;

  const chunks: string[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "text") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function stripFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

function mapApiError(error: unknown, env: Env): UserError {
  const value = error as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; message?: string };
  };
  const status = value.status ?? value.code ?? value.error?.code;
  const message = value.error?.message ?? value.message ?? String(error);

  if (status === 401 || status === 403) {
    return new UserError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.", 1, {
      cause: error,
    });
  }
  if (status === 404) {
    return new UserError(
      `Gemini model "${env.model}" is not available to this key. Set GEMINI_MODEL in .env to a model your key can access.`,
      1,
      { cause: error },
    );
  }
  if (status === 429) {
    return new UserError(
      "Gemini free-tier quota reached. Wait and retry, or send fewer/smaller papers.",
      1,
      { cause: error },
    );
  }
  if (status === 400) {
    return new UserError(
      `Gemini rejected the request: ${message}. Check GEMINI_MODEL and GEMINI_THINKING_LEVEL in .env.`,
      1,
      { cause: error },
    );
  }

  return new UserError(`Gemini request failed${status ? ` (HTTP ${status})` : ""}: ${message}`, 1, {
    cause: error,
  });
}
