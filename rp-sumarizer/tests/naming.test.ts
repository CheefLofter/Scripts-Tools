import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildBaseName,
  fileTimestamp,
  resolveOutputDir,
  slugify,
  writeOutput,
} from "../src/output";

describe("slugify", () => {
  test("turns a paper title into a filename-safe slug", () => {
    expect(slugify("Attention Is All You Need")).toBe("attention-is-all-you-need");
  });

  test("removes punctuation and collapses separators", () => {
    expect(slugify("C++ & Rust: A Study")).toBe("c-rust-a-study");
  });

  test("respects the length cap without a trailing dash", () => {
    expect(slugify("data leakage", 5)).toBe("data");
  });
});

describe("buildBaseName", () => {
  const date = new Date(2026, 10, 20, 15, 30, 45);

  test("uses the paper name and timestamp", () => {
    expect(buildBaseName({ nameHint: "attention-is-all-you-need", date })).toBe(
      "attention-is-all-you-need_2026-11-20_153045",
    );
  });

  test("inserts the topic before the timestamp", () => {
    expect(
      buildBaseName({
        nameHint: "attention-is-all-you-need",
        topic: "Data Leakage",
        date,
      }),
    ).toBe("attention-is-all-you-need_data-leakage_2026-11-20_153045");
  });

  test("falls back to the guide title for links", () => {
    expect(
      buildBaseName({
        guideTitle: "A Study of Data Leakage",
        date,
      }),
    ).toBe("a-study-of-data-leakage_2026-11-20_153045");
  });

  test("formats the timestamp with seconds", () => {
    expect(fileTimestamp(date)).toBe("2026-11-20_153045");
  });
});

describe("output directory", () => {
  test("defaults to Downloads", () => {
    expect(resolveOutputDir()).toBe(join(homedir(), "Downloads"));
  });

  test("expands a home-relative path", () => {
    expect(resolveOutputDir("~/guides")).toBe(join(homedir(), "guides"));
  });
});

describe("writeOutput", () => {
  test("writes a file and avoids overwriting an existing one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperlens-output-"));

    try {
      const first = await writeOutput(dir, "guide", "md", "one");
      const second = await writeOutput(dir, "guide", "md", "two");

      expect(first).toBe(join(dir, "guide.md"));
      expect(second).toBe(join(dir, "guide-2.md"));
      expect(await Bun.file(first).text()).toBe("one");
      expect(await Bun.file(second).text()).toBe("two");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
