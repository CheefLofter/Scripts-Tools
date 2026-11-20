# paperlens

Turn one or more research papers into a focused, roughly 10-minute study guide with one Gemini
request. Guides can be written as Markdown, self-contained HTML, or PDF.

## Install

Requires [Bun](https://bun.sh/) 1.4 or newer.

```sh
git clone <repository-url>
cd rp-sumarizer
bun install
bun run build
bun install --global .
```

This installs the `paperlens` command globally. Set `GEMINI_API_KEY` in your environment, or
create a `.env` in the directory where you run the command:

```sh
cp .env.example .env
# Add your key from https://aistudio.google.com/apikey to .env
```

## Usage

```sh
paperlens paper.pdf
paperlens paper.pdf --topic "How do they avoid data leakage?"
paperlens ./papers/ --topic "evaluation methodology"
paperlens ./papers/ --format pdf
paperlens https://arxiv.org/abs/2401.12345 --format html
```

Inputs can be PDFs, DOCX, Markdown, TXT, HTML, folders, or arXiv/DOI/HTTP links. A folder
produces one combined guide; unsupported files are skipped with a note. The default limits are
10 papers and 12 MB total input.

Options:

- `--topic TEXT` focuses the guide on a topic. If none of the papers discuss it, the output says
  so instead of falling back to a general summary.
- `--format md|html|pdf` selects the output format; defaults to `md`.
- `-h, --help` displays help.

Output defaults to `~/Downloads`. PDF output requires Chromium:

```sh
bunx playwright install chromium
```

## Configuration

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `GEMINI_THINKING_LEVEL` | `medium` | `minimal`, `low`, `medium`, `high`, or `xhigh`; empty uses the model default |
| `GEMINI_MAX_OUTPUT_TOKENS` | `8192` | Maximum response tokens |
| `PAPERLENS_OUTPUT_DIR` | `~/Downloads` | Output directory |
| `PAPERLENS_MAX_PAPERS` | `10` | Maximum papers per request |
| `PAPERLENS_MAX_TOTAL_MB` | `12` | Maximum combined input size in MB |
| `PAPERLENS_DEBUG` | `0` | Set to `1` to print stack traces |

Paper contents are sent to Gemini as a single request. Invalid model output is saved as a raw
text file so it can be inspected; there are no retries or additional model calls.
