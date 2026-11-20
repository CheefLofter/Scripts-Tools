import { afterAll, describe, expect, mock, test } from "bun:test";
import type { Env } from "../src/env";
import { GuideOutputError } from "../src/errors";
import type { PaperInput } from "../src/inputs";
import fixture from "./fixtures/guide.json";

let responseText = JSON.stringify(fixture);
let lastParams: Record<string, unknown> | undefined;

mock.module("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = {
      create: async (params: Record<string, unknown>) => {
        lastParams = params;
        return {
          output_text: responseText,
          usage: { total_input_tokens: 10, total_output_tokens: 20 },
        };
      },
    };
  },
}));

const { generateGuide } = await import("../src/gemini");

const env: Env = {
  apiKey: "test-key",
  model: "gemini-2.5-flash",
  thinkingLevel: "medium",
  maxOutputTokens: 8192,
  outputDir: "/tmp",
  maxPapers: 10,
  maxTotalBytes: 12 * 1024 * 1024,
  debug: false,
};

const papers: PaperInput[] = [
  {
    kind: "document",
    name: "paper.pdf",
    source: "/tmp/paper.pdf",
    bytes: 10,
    mimeType: "application/pdf",
    data: "JVBERi0=",
  },
  {
    kind: "text",
    name: "notes.md",
    source: "/tmp/notes.md",
    bytes: 20,
    text: "# Notes\n\nSome text.",
  },
];

afterAll(() => {
  mock.restore();
});

describe("generateGuide", () => {
  test("makes one structured-output call with native document parts", async () => {
    responseText = JSON.stringify(fixture);

    const result = await generateGuide(env, papers, "data leakage");

    expect(result.guide.meta.papers).toHaveLength(2);
    expect(result.usage?.total_input_tokens).toBe(10);
    expect(lastParams?.model).toBe("gemini-2.5-flash");
    expect(lastParams?.store).toBe(false);
    expect(lastParams?.response_format).toMatchObject({
      type: "text",
      mime_type: "application/json",
    });
    expect(lastParams?.generation_config).toMatchObject({
      thinking_level: "medium",
      max_output_tokens: 8192,
    });

    const input = lastParams?.input as Array<Record<string, unknown>>;
    expect(input.some((part) => part.type === "document")).toBe(true);
    expect(input.filter((part) => part.type === "text").length).toBeGreaterThanOrEqual(3);
    expect(input[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Paper 1"),
    });
  });

  test("keeps the raw output when the JSON is invalid", async () => {
    responseText = "not json";

    try {
      await generateGuide(env, papers, undefined);
      throw new Error("expected generateGuide to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GuideOutputError);
      expect((error as GuideOutputError).raw).toBe("not json");
    }
  });

  test("rejects JSON that does not match the schema", async () => {
    responseText = JSON.stringify({ meta: {} });

    await expect(generateGuide(env, papers, undefined)).rejects.toBeInstanceOf(
      GuideOutputError,
    );
  });
});
