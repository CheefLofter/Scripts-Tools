import { describe, expect, test } from "bun:test";
import {
  applyTopicPolicy,
  type Guide,
  numberAppearsInQuote,
  sanitizeGuide,
  validateGuide,
} from "../src/schema";
import fixture from "./fixtures/guide.json";

function sample(): Guide {
  return structuredClone(fixture) as unknown as Guide;
}

describe("guide schema", () => {
  test("accepts the sample guide", () => {
    expect(() => validateGuide(sample())).not.toThrow();
  });

  test("rejects a guide missing required fields", () => {
    expect(() => validateGuide({ meta: {} })).toThrow();
  });
});

describe("number trust check", () => {
  test("matches a quoted number", () => {
    expect(numberAppearsInQuote("28.4", "Our model achieves 28.4 BLEU.")).toBe(true);
  });

  test("ignores thousands separators", () => {
    expect(numberAppearsInQuote("1,234", "We used 1,234 examples.")).toBe(true);
  });

  test("rejects a number absent from the quote", () => {
    expect(numberAppearsInQuote("28.4", "Our model achieves 28.5 BLEU.")).toBe(false);
  });

  test("keeps values without numbers", () => {
    expect(numberAppearsInQuote("not reported", "No value is reported.")).toBe(true);
  });
});

describe("sanitizeGuide", () => {
  test("drops a key number whose quote does not contain it", () => {
    const guide = sample();
    guide.key_numbers.push({
      paper: "Paper 1",
      label: "Made up",
      value: "99.9",
      context: "nowhere",
      location: "p. 1",
      quote: "Our model achieves 28.4 BLEU.",
      confidence: "high",
    });

    expect(sanitizeGuide(guide).key_numbers).toHaveLength(1);
  });

  test("drops a chart with a value absent from its quote", () => {
    const guide = sample();
    guide.charts[0].series[0].values = [26.0, 99.9];
    expect(sanitizeGuide(guide).charts).toHaveLength(0);
  });

  test("drops a chart whose series length does not match categories", () => {
    const guide = sample();
    guide.charts[0].series[0].values = [28.4];
    expect(sanitizeGuide(guide).charts).toHaveLength(0);
  });

  test("drops a diagram with an edge to a missing node", () => {
    const guide = sample();
    guide.method.diagrams[0].edges.push({
      from: "encoder",
      to: "missing",
      label: "bad",
    });
    expect(sanitizeGuide(guide).method.diagrams).toHaveLength(0);
  });
});

describe("topic policy", () => {
  test("clears the body when the topic was not found", () => {
    const guide = sample();
    guide.meta.topic_found = false;
    guide.meta.topic_note = "No relevant discussion.";

    const clean = applyTopicPolicy(guide, "quantum computing");

    expect(clean.meta.topic).toBe("quantum computing");
    expect(clean.meta.papers).toHaveLength(2);
    expect(clean.summary).toBe("");
    expect(clean.charts).toHaveLength(0);
    expect(clean.topic_connections).toHaveLength(0);
  });

  test("clears topic-only fields when no topic was given", () => {
    const clean = applyTopicPolicy(sample(), undefined);

    expect(clean.meta.topic).toBe("");
    expect(clean.meta.topic_found).toBe(true);
    expect(clean.topic_connections).toHaveLength(0);
  });
});
