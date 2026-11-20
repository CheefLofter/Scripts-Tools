#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { loadEnv } from "./env";
import { GuideOutputError, UserError } from "./errors";
import { generateGuide } from "./gemini";
import { resolveInputs } from "./inputs";
import { buildBaseName, writeOutput, writeRawOutput } from "./output";
import { htmlToPdf } from "./pdf";
import { renderHtml, renderMarkdown } from "./render";

const HELP = `paperlens — turn research papers into a 10-minute study guide

Usage:
  paperlens <file-or-folder...> [--topic "..."] [--format md|html|pdf]

Inputs:
  PDF, DOCX, Markdown, TXT, HTML, a folder, or an arXiv/DOI/HTTP link.
  Unsupported files in a folder are skipped with a note.

Options:
  --topic TEXT     Focus the entire guide on this topic. Direct and indirect
                   relevance is included; if nothing is found, the guide says so.
  --format FORMAT  md (default), html, or pdf.
  -h, --help       Show this help.

Environment (.env):
  GEMINI_API_KEY           required (or GOOGLE_API_KEY)
  GEMINI_MODEL             default gemini-2.5-flash
  GEMINI_THINKING_LEVEL    default medium; empty uses the model default
  GEMINI_MAX_OUTPUT_TOKENS default 8192
  PAPERLENS_OUTPUT_DIR     default ~/Downloads
  PAPERLENS_MAX_PAPERS     default 10
  PAPERLENS_MAX_TOTAL_MB   default 12
  PAPERLENS_DEBUG          set to 1 for stack traces

PDF output needs Chromium: bunx playwright install chromium
`;

async function main(): Promise<void> {
  let values: { topic?: string; format?: string; help?: boolean };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        topic: { type: "string" },
        format: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserError(`${message}\n\n${HELP}`, 2);
  }
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (!positionals.length) throw new UserError(`No inputs given.\n\n${HELP}`, 2);

  const format = (values.format ?? "md").toLowerCase();
  if (format !== "md" && format !== "html" && format !== "pdf") {
    throw new UserError(`Unknown format "${values.format}". Use md, html, or pdf.`, 2);
  }

  const topic = values.topic?.trim() || undefined;
  const env = loadEnv();
  const bundle = await resolveInputs(positionals, {
    maxPapers: env.maxPapers,
    maxTotalBytes: env.maxTotalBytes,
  });

  printNotes(bundle.notes);

  const paperWord = bundle.papers.length === 1 ? "paper" : "papers";
  const thinking = env.thinkingLevel ?? "model default";
  console.error(
    `paperlens: ${bundle.papers.length} ${paperWord} · ${env.model} · thinking ${thinking}${
      topic ? ` · topic "${topic}"` : ""
    }`,
  );

  let result: Awaited<ReturnType<typeof generateGuide>>;
  try {
    result = await generateGuide(env, bundle.papers, topic);
  } catch (error) {
    if (error instanceof GuideOutputError) {
      const base = buildBaseName({
        nameHint: bundle.nameHint ?? bundle.papers[0]?.name,
        topic,
        date: new Date(),
      });
      const rawPath = await writeRawOutput(env.outputDir, base, error.raw);
      const details = error.details ? ` ${error.details}` : "";
      throw new UserError(`${error.message}${details}\nRaw model output saved to ${rawPath}`, 1, {
        cause: error,
      });
    }
    throw error;
  }

  const generatedAt = new Date();
  const base = buildBaseName({
    nameHint: bundle.nameHint,
    guideTitle: result.guide.meta.papers[0]?.title,
    topic,
    date: generatedAt,
  });

  let data: string | Uint8Array;
  if (format === "md") {
    data = renderMarkdown(result.guide, { generatedAt });
  } else if (format === "html") {
    data = renderHtml(result.guide, { generatedAt });
  } else {
    data = await htmlToPdf(renderHtml(result.guide, { generatedAt }));
  }

  const path = await writeOutput(env.outputDir, base, format, data);

  if (result.usage) {
    const usage = result.usage;
    const thinkingTokens = usage.total_thought_tokens
      ? ` / ${usage.total_thought_tokens} thinking`
      : "";
    console.error(
      `paperlens: tokens ${usage.total_input_tokens ?? "?"} in / ${
        usage.total_output_tokens ?? "?"
      } out${thinkingTokens}`,
    );
  }

  console.log(path);
}

function printNotes(notes: string[]): void {
  const limit = 8;
  for (const note of notes.slice(0, limit)) console.error(`paperlens: ${note}`);
  if (notes.length > limit) {
    console.error(`paperlens: ...and ${notes.length - limit} more notes.`);
  }
}

try {
  await main();
} catch (error) {
  const debug = process.env.PAPERLENS_DEBUG === "1" || process.env.PAPERLENS_DEBUG === "true";

  if (error instanceof UserError) {
    console.error(`paperlens: ${error.message}`);
    if (debug && error.cause instanceof Error) console.error(error.cause.stack);
    process.exitCode = error.exitCode;
  } else {
    const value = error as Error;
    console.error(`paperlens: ${value.message || String(error)}`);
    if (debug) console.error(value.stack);
    process.exitCode = 1;
  }
}
