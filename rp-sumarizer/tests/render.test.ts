import { describe, expect, test } from "bun:test";
import {
  chartSvg,
  diagramSvg,
  escapeHtml,
  renderHtml,
  renderMarkdown,
  toMermaid,
} from "../src/render";
import type { Guide } from "../src/schema";
import fixture from "./fixtures/guide.json";

function sample(): Guide {
  return structuredClone(fixture) as unknown as Guide;
}

describe("markdown output", () => {
  const markdown = renderMarkdown(sample(), {
    generatedAt: new Date(2026, 10, 20, 15, 30, 45),
  });

  test("includes the main sections", () => {
    expect(markdown).toContain("# Study Guide: 2 papers");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Key numbers");
    expect(markdown).toContain("## Comparison");
    expect(markdown).toContain("## Topic connections");
  });

  test("includes a mermaid diagram and a chart data table", () => {
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("flowchart TD");
    expect(markdown).toContain("| Category | BLEU |");
    expect(markdown).toContain("28.4");
  });

  test("stops at a topic-not-found notice", () => {
    const guide = sample();
    guide.meta.topic_found = false;
    guide.meta.topic_note = "No relevant discussion.";

    const output = renderMarkdown(guide);

    expect(output).toContain("Nothing found on this topic");
    expect(output).toContain("No relevant discussion.");
    expect(output).not.toContain("## Summary");
  });
});

describe("html output", () => {
  test("is self-contained and contains inline svg visuals", () => {
    const html = renderHtml(sample());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<svg");
    expect(html).toContain("</html>");
    expect(html).not.toContain("mermaid");
  });

  test("escapes model-supplied html", () => {
    const guide = sample();
    guide.summary = '<script>alert("x")</script>';

    const html = renderHtml(guide);

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("visuals", () => {
  test("builds mermaid from nodes and edges", () => {
    const mermaid = toMermaid(sample().method.diagrams[0]);

    expect(mermaid).toContain('n0["Input tokens"]');
    expect(mermaid).toContain('n0 -->|"embeddings"| n1');
  });

  test("builds a diagram svg", () => {
    const svg = diagramSvg(sample().method.diagrams[0]);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Input tokens");
    expect(svg).toContain("</svg>");
  });

  test("builds a chart svg", () => {
    const svg = chartSvg(sample().charts[0]);

    expect(svg).toContain("<svg");
    expect(svg).toContain("28.4");
    expect(svg).toContain("</svg>");
  });

  test("escapes html characters", () => {
    expect(escapeHtml('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });
});
