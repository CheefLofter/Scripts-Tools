import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { htmlToText, resolveInputs } from "../src/inputs";

const limits = { maxPapers: 10, maxTotalBytes: 1024 * 1024 };

describe("htmlToText", () => {
  test("keeps article text and drops navigation, scripts and footers", async () => {
    const text = await htmlToText(`<html><head><title>T</title><style>.x{}</style></head>
      <body><nav>Menu</nav><article><h1>Hello &amp; bye</h1><p>First <b>bold</b> para.</p>
      <p>Second</p><script>bad()</script></article><footer>Foot</footer></body></html>`);

    expect(text).toContain("Hello & bye");
    expect(text).toContain("First bold para.");
    expect(text).toContain("Second");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("bad()");
    expect(text).not.toContain("Foot");
  });
});

describe("resolveInputs", () => {
  test("collects supported files in a folder and notes skipped ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperlens-input-"));

    try {
      await Bun.write(join(dir, "paper.md"), "# Title\n\nSome text.");
      await Bun.write(join(dir, "image.png"), "not a paper");

      const bundle = await resolveInputs([dir], limits);

      expect(bundle.papers).toHaveLength(1);
      expect(bundle.papers[0].kind).toBe("text");
      expect(bundle.nameHint).toBe(basename(dir));
      expect(bundle.notes.some((note) => note.includes("image.png"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("sends a PDF as a native document part", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperlens-input-"));

    try {
      const path = join(dir, "paper.pdf");
      await Bun.write(path, "%PDF-1.4\nfake");

      const bundle = await resolveInputs([path], limits);
      const paper = bundle.papers[0];

      expect(paper.kind).toBe("document");
      if (paper.kind === "document") {
        expect(paper.mimeType).toBe("application/pdf");
        expect(paper.data.length).toBeGreaterThan(0);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports a missing input as a usage error", async () => {
    await expect(resolveInputs(["/definitely/not/here"], limits)).rejects.toThrow(
      "Input not found",
    );
  });
});
