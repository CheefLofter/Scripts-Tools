import { stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { UserError } from "./errors";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type FileKind = "pdf" | "docx" | "html" | "text";

const SUPPORTED = new Map<string, FileKind>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".md", "text"],
  [".markdown", "text"],
  [".txt", "text"],
  [".html", "html"],
  [".htm", "html"],
]);

export type PaperInput =
  | {
      kind: "document";
      name: string;
      source: string;
      bytes: number;
      mimeType: string;
      data: string;
    }
  | {
      kind: "text";
      name: string;
      source: string;
      bytes: number;
      text: string;
    };

export type InputLimits = {
  maxPapers: number;
  maxTotalBytes: number;
};

export type InputBundle = {
  papers: PaperInput[];
  notes: string[];
  nameHint?: string;
};

export async function resolveInputs(args: string[], limits: InputLimits): Promise<InputBundle> {
  const papers: PaperInput[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  let firstHint: string | undefined;
  let singleUrl = false;

  const add = (paper: PaperInput) => {
    papers.push(paper);
    totalBytes += paper.bytes;

    if (papers.length > limits.maxPapers) {
      throw new UserError(
        `Too many papers: ${papers.length}. The one-call limit is ${limits.maxPapers}. Raise PAPERLENS_MAX_PAPERS or split the run.`,
        2,
      );
    }
    if (totalBytes > limits.maxTotalBytes) {
      throw new UserError(
        `Input is too large: ${formatMb(totalBytes)}. The one-call limit is ${formatMb(limits.maxTotalBytes)}. Raise PAPERLENS_MAX_TOTAL_MB or send fewer papers.`,
        2,
      );
    }
  };

  for (const arg of args) {
    if (isUrl(arg)) {
      if (args.length === 1) singleUrl = true;
      const url = /^https?:\/\//i.test(arg) ? arg : `https://${arg}`;
      const paper = await fetchPaper(url, notes);
      if (!firstHint) firstHint = paper.name;
      add(paper);
      continue;
    }

    const absolute = resolve(arg);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(absolute);
    } catch {
      throw new UserError(`Input not found: ${arg}`, 2);
    }

    if (info.isDirectory()) {
      if (!firstHint) firstHint = basename(absolute);
      const files = await scanFolder(absolute, notes);
      for (const file of files) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        add(await readLocal(file.path, file.name));
      }
    } else if (info.isFile()) {
      if (!firstHint) firstHint = basename(absolute, extname(absolute));
      if (seen.has(absolute)) continue;
      seen.add(absolute);

      if (!SUPPORTED.has(extname(absolute).toLowerCase())) {
        notes.push(`Skipped ${arg} (unsupported format).`);
        continue;
      }
      add(await readLocal(absolute, basename(absolute)));
    } else {
      throw new UserError(`Unsupported input: ${arg}`, 2);
    }
  }

  if (!papers.length) {
    throw new UserError(
      "No supported papers found. Supported inputs: PDF, DOCX, Markdown, TXT, HTML, folders, and arXiv/DOI links.",
      2,
    );
  }

  let nameHint: string | undefined;
  if (singleUrl) {
    nameHint = undefined;
  } else if (args.length > 1 && firstHint) {
    nameHint = `${firstHint}-set`;
  } else {
    nameHint = firstHint;
  }

  return { papers, notes, nameHint };
}

export async function htmlToText(html: string): Promise<string> {
  const removable = [
    "head",
    "script",
    "style",
    "noscript",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "svg",
    "iframe",
    "canvas",
    "button",
  ];

  let remover = new HTMLRewriter();
  for (const selector of removable) {
    remover = remover.on(selector, {
      element(element) {
        element.remove();
      },
    });
  }

  const cleaned = await remover.transform(new Response(html)).text();

  const chunks: string[] = [];
  const textRewriter = new HTMLRewriter().on("*", {
    text(text) {
      chunks.push(text.text);
    },
  });
  await textRewriter.transform(new Response(cleaned)).text();

  return decodeEntities(chunks.join(" ")).replace(/\s+/g, " ").trim();
}

async function scanFolder(
  dir: string,
  notes: string[],
): Promise<Array<{ path: string; name: string }>> {
  const glob = new Bun.Glob("**/*");
  const relatives: string[] = [];

  for await (const relative of glob.scan({ cwd: dir, onlyFiles: true, dot: false })) {
    const parts = relative.split("/");
    if (parts.some((part) => part === "node_modules" || part === ".git")) continue;
    relatives.push(relative);
  }

  relatives.sort();

  const files: Array<{ path: string; name: string }> = [];
  for (const relative of relatives) {
    if (!SUPPORTED.has(extname(relative).toLowerCase())) {
      notes.push(`Skipped ${relative} (unsupported format).`);
      continue;
    }
    files.push({ path: join(dir, relative), name: basename(relative) });
  }

  if (!files.length) {
    throw new UserError(`No supported papers in ${dir}. Supported: PDF, DOCX, MD, TXT, HTML.`, 2);
  }

  return files;
}

async function readLocal(path: string, name: string): Promise<PaperInput> {
  const kind = SUPPORTED.get(extname(path).toLowerCase());
  if (!kind) throw new UserError(`Unsupported file: ${path}`, 2);

  const file = Bun.file(path);

  if (kind === "pdf" || kind === "docx") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      kind: "document",
      name,
      source: path,
      bytes: bytes.byteLength,
      mimeType: kind === "pdf" ? "application/pdf" : DOCX_MIME,
      data: Buffer.from(bytes).toString("base64"),
    };
  }

  const raw = await file.text();
  const text = kind === "html" ? await htmlToText(raw) : raw;

  if (!text.trim()) throw new UserError(`No readable text in ${path}.`, 2);

  return {
    kind: "text",
    name,
    source: path,
    bytes: Buffer.byteLength(text),
    text,
  };
}

async function fetchPaper(rawUrl: string, notes: string[]): Promise<PaperInput> {
  const url = normalizeUrl(rawUrl);
  const name = nameFromUrl(new URL(url));

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "paperlens/0.1 (research paper study guide)",
        accept: "application/pdf,text/html;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UserError(`Could not fetch ${rawUrl}: ${detail}`, 1, { cause: error });
  }

  if (!response.ok) {
    throw new UserError(
      `Could not fetch ${rawUrl} (HTTP ${response.status}). If this is a paywalled paper, download the PDF and pass the file instead.`,
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isPdf =
    contentType.includes("application/pdf") ||
    (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  const isDocx = contentType.includes("wordprocessingml") || url.toLowerCase().endsWith(".docx");

  if (isPdf || isDocx) {
    if (!bytes.length) throw new UserError(`The document at ${rawUrl} is empty.`);
    return {
      kind: "document",
      name,
      source: rawUrl,
      bytes: bytes.byteLength,
      mimeType: isPdf ? "application/pdf" : DOCX_MIME,
      data: Buffer.from(bytes).toString("base64"),
    };
  }

  const raw = new TextDecoder().decode(bytes);
  const looksHtml = contentType.includes("html") || /^\s*</.test(raw);
  const text = looksHtml ? await htmlToText(raw) : raw;

  if (text.trim().length < 500) {
    throw new UserError(
      `Could not read a paper from ${rawUrl}. The page may be paywalled or JavaScript-only; download the PDF and pass the file instead.`,
    );
  }

  notes.push(`Fetched ${rawUrl}`);
  return {
    kind: "text",
    name,
    source: rawUrl,
    bytes: Buffer.byteLength(text),
    text,
  };
}

function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  if (/(^|\.)arxiv\.org$/i.test(url.hostname) && url.pathname.startsWith("/abs/")) {
    return `https://arxiv.org/pdf/${url.pathname.slice("/abs/".length)}`;
  }
  return url.toString();
}

function nameFromUrl(url: URL): string {
  if (/(^|\.)arxiv\.org$/i.test(url.hostname)) {
    const id = url.pathname
      .replace(/^\/pdf\//, "")
      .replace(/^\/abs\//, "")
      .replace(/\.pdf$/i, "");
    return `arxiv-${id.replace(/\//g, "-")}`;
  }

  if (/(^|\.)doi\.org$/i.test(url.hostname)) {
    return `doi-${url.pathname.replace(/^\//, "").replace(/\//g, "-")}`;
  }

  const last = url.pathname.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last).replace(/\.(pdf|html?)$/i, "") : url.hostname;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^(www\.)?(arxiv\.org|doi\.org)\//i.test(value);
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&amp;/gi, "&");
}
