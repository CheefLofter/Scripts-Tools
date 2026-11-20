# paperlens v1 — implementation plan

> Turn one or more research papers into a 10-minute study guide with **one Gemini call**.
> Saved so the project can be picked up again without re-deriving the design.

## Principle

Gemini does the heavy lifting: it reads the paper(s), decides what matters, and returns the
whole guide as structured JSON. The machine only resolves inputs, validates the JSON, renders
it, and writes **one** output file.

No agent loop, no tools, no planner/critic pass, no local PDF parsing, no retry, no second call.

## CLI

```bash
paperlens paper.pdf
paperlens paper.pdf --topic "how do they avoid data leakage?"
paperlens ./papers/ --topic "evaluation methodology"
paperlens ./papers/ --format pdf
paperlens https://arxiv.org/abs/2401.12345 --format md
```

| Flag                     | Meaning                                                                                                                                                          | Default |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `--topic "text"`         | Focus the whole guide on this topic across all papers. Include direct and indirect relevance. If nothing is relevant, say so instead of writing a general guide. | none    |
| `--format md\|html\|pdf` | Output format                                                                                                                                                    | `md`    |
| `-h`, `--help`           | Usage                                                                                                                                                            | —       |

- No `--model`; model and thinking level live in `.env`.
- No `ask`, `config`, `--level`, `--depth`, `--compare`, `--max-cost`.
- A folder produces **one combined guide**. Two or more papers include a comparison table.
- Supported: PDF, DOCX, Markdown, TXT, HTML, folders, arXiv and DOI/HTTP links.
- Unsupported files are skipped with a note.
- Limits: 10 papers / 12 MB total by default, so the request stays inline and one-call.

## Environment

`.env.example` is committed; `.env` is gitignored. Bun loads `.env` automatically.

| Variable                   | Default            | Purpose                                                                |
| -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `GEMINI_API_KEY`           | required           | API key from AI Studio (`GOOGLE_API_KEY` also accepted)                |
| `GEMINI_MODEL`             | `gemini-2.5-flash` | Free-tier-friendly Flash model; change to any model the key can access |
| `GEMINI_THINKING_LEVEL`    | `medium`           | `minimal`, `low`, `medium`, `high`, `xhigh`; empty omits the field     |
| `GEMINI_MAX_OUTPUT_TOKENS` | `8192`             | Keeps free-tier requests modest                                        |
| `PAPERLENS_OUTPUT_DIR`     | `~/Downloads`      | Where the guide is written                                             |
| `PAPERLENS_MAX_PAPERS`     | `10`               | One-call input cap                                                     |
| `PAPERLENS_MAX_TOTAL_MB`   | `12`               | One-call size cap                                                      |
| `PAPERLENS_DEBUG`          | `0`                | `1` prints stack traces                                                |

The default is **not** the highest thinking level. `gemini-2.5-flash` supports `low`, `medium`
and `high`; `medium` is the default.

## The one call

```ts
const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
  httpOptions: { apiVersion: "v1beta" },
});

const response = await ai.interactions.create({
  model: env.GEMINI_MODEL,
  system_instruction: SYSTEM_PROMPT,
  input: [...paperParts, { type: "text", text: userPrompt }],
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: GUIDE_SCHEMA,
  },
  generation_config: {
    thinking_level: env.GEMINI_THINKING_LEVEL || undefined,
    max_output_tokens: env.GEMINI_MAX_OUTPUT_TOKENS,
  },
  store: false,
});
```

- PDFs and DOCX go in natively as base64 `document` parts.
- Markdown, TXT and HTML-derived text go in as labelled `text` parts.
- No File API in v1; the size cap keeps the request inline.
- If the JSON is invalid, save the raw response and stop with the path.
- Array length bounds are omitted from the API schema for serving compatibility; local schema
  validation still enforces them.
- Text is read from `interaction.output_text`, falling back to the `model_output` steps.

## Prompt and JSON contract

The system prompt is the main quality lever. Its rules:

1. Use only the supplied documents; no outside knowledge.
2. With `--topic`, make the whole guide about it; include methods, assumptions, metrics,
   results, definitions and limitations that affect it. If nothing is relevant, set
   `topic_found=false`, explain briefly, and leave the guide empty. Never fall back to a
   general summary.
3. Every number needs a short verbatim quote and a page/section. If it cannot be quoted, omit
   it. Never estimate, calculate, average or infer.
4. Explain for a smart reader outside the field; define jargon; use one analogy; roughly
   1,200–1,800 words for one paper, 2,000–2,500 for several.
5. Method steps and diagrams only from the paper; no invented steps.
6. Limitations only if stated or directly implied.
7. For several papers, compare methods/results and note disagreements.
8. Charts: data only, never chart code; only explicit numbers; at most three.
9. Diagrams: nodes and edges only, never Mermaid code; at most 12 nodes.
10. Include a skip guide: read closely / safe to skip, with reasons.
11. Self-check every number against its quote; output only JSON.

| JSON field            | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `meta`                | `topic`, `topic_found`, `topic_note`, papers (title, authors, year, venue, source, one-liner) |
| `summary`             | One-paragraph synthesis, focused on the topic when given                                      |
| `big_picture`         | Explanation, analogy, why it matters                                                          |
| `method`              | Steps and diagrams                                                                            |
| `jargon[]`            | Term, definition, why it matters                                                              |
| `key_numbers[]`       | Paper, label, value, context, location, quote, confidence                                     |
| `charts[]`            | Paper, type, title, labels, categories, series values, source quote/location, caption         |
| `limitations[]`       | Paper, limitation                                                                             |
| `skip_guide`          | Read closely / safe to skip                                                                   |
| `comparison`          | Columns, rows, takeaway (empty for one paper)                                                 |
| `topic_connections[]` | Paper, connection, location, quote                                                            |

Charts and diagrams are data, not code. The machine builds the visuals.

## Rendering

- **Markdown:** Mermaid code block for diagrams; chart data as a table; quotes as blockquotes.
  No Chromium needed.
- **HTML:** one self-contained file with embedded CSS and static inline SVG diagrams/charts.
  Works offline.
- **PDF:** Playwright prints the static HTML to A4 PDF. Chromium is needed only for PDF.

No `assets/` folder. Every run writes one output file.

## Output naming

Original paper name + date/time + topic when given:

```text
attention-is-all-you-need_2026-11-20_153045.md
attention-is-all-you-need_data-leakage_2026-11-20_153045.md
papers_evaluation-methodology_2026-11-20_153045.md
```

- Single file: file stem.
- Folder: folder name.
- Multiple separate files: first file stem plus `-set`.
- Single link: paper title from Gemini, falling back to the arXiv/DOI id.
- Topic slug: first words, max 40 characters.
- Date/time: local `YYYY-MM-DD_HHmmss`.
- Written directly to `~/Downloads` (or `PAPERLENS_OUTPUT_DIR`).
- A collision gets `-2`, `-3`, ... before the extension.

## Errors

| Situation                  | Behavior                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| No inputs                  | Usage, exit 2                                                       |
| Unsupported files          | List skipped files, continue                                        |
| No supported files         | Clear message, exit 2                                               |
| Missing API key            | Point to `.env.example` and AI Studio, exit 1                       |
| Model unavailable (404)    | “Set `GEMINI_MODEL` in `.env` to a model your key can access.”      |
| Quota reached (429)        | “Free-tier quota reached; wait and retry, or reduce input size.”    |
| Invalid JSON / schema      | Save raw output to `~/Downloads/<name>.raw.txt`, print path, exit 1 |
| PDF requested, no Chromium | `bunx playwright install chromium`                                  |
| DOI/paywall                | “Download the PDF and pass the file instead.”                       |
| Output write failure       | Print the path and the OS error                                     |

Exit codes: `0` success, `1` runtime failure, `2` usage. Stack traces only with
`PAPERLENS_DEBUG=1`.

## Local trust checks (not a second model call)

- Drop `key_numbers` whose numeric value does not appear in its own quote.
- Drop charts whose category/series lengths disagree, whose values are not finite, or whose
  values do not appear in the chart's source quote.
- Drop diagrams with duplicate/empty node ids, more than 12 nodes, or edges that reference
  missing nodes.
- If a topic was given and `topic_found` is false, clear the guide body so the output is an
  honest “nothing found” result, not a general summary.
- If no topic was given, clear topic-only fields.

## Structure

```text
src/
  cli.ts        # args, orchestration, errors
  env.ts        # read and validate env
  inputs.ts     # files, folders, arXiv/DOI/HTTP, HTML-to-text
  prompt.ts     # system and user prompts
  schema.ts     # JSON schema, types, validation, trust checks
  gemini.ts     # the single call
  render.ts     # JSON -> Markdown and HTML (inline SVG visuals)
  pdf.ts        # HTML -> PDF via Playwright
  output.ts     # naming, Downloads path, writing
tests/
  fixtures/guide.json
  schema.test.ts
  render.test.ts
  naming.test.ts
  inputs.test.ts
```

Dependencies: `@google/genai`, `ajv`, `markdown-it`, `playwright`.
Dev: `typescript`, `@types/bun`, `@types/markdown-it`, `@biomejs/biome`.

Bun built-ins: `util.parseArgs`, `Bun.file`, `Bun.write`, `Bun.Glob`, `HTMLRewriter`, `fetch`.

No `commander`, `zod`, `unpdf`, `mammoth`, `eta`, `mmdc`, `matplotlib`, `chart.js` or
`mermaid` dependency.

## Build phases

1. **Spike:** one PDF through one free-tier Gemini call with the schema; confirm
   `thinking_level` and inline size; generate Markdown and PDF.
2. **Core:** CLI, env, inputs, prompt/schema, Gemini call, Markdown to Downloads, errors.
3. **Finish:** `--topic`, folder/combined guide, arXiv/DOI, HTML/PDF, inline SVG visuals,
   naming, tests, README, global install.

Checks:

- One PDF produces a guide in one call.
- `--topic` focuses the guide and says “nothing on this topic” when true.
- A folder produces one combined guide with a comparison.
- All three formats open.
- A clean global install works with only `.env`.

## Not included

Agent loop, tools, planner/critic, local PDF layout, OCR, cache, resume, trace, `ask`,
`config`, model override flag, cost cap, comparison agent, eval harness, asset folders,
image files in Markdown.

## Notes / open items

- The live API path cannot be smoke-tested until a `GEMINI_API_KEY` is available.
- Playwright's postinstall was blocked in this environment; run
  `bunx playwright install chromium` before testing PDF output.
- Gemini 2.5 Flash supports `thinking_level` `low|medium|high`. If a chosen model rejects
  `thinking_level`, set `GEMINI_THINKING_LEVEL=` (empty) in `.env`.
