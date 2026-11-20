import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export function buildBaseName(options: {
  nameHint?: string;
  guideTitle?: string;
  topic?: string;
  date?: Date;
}): string {
  const nameSource = options.nameHint?.trim() || options.guideTitle?.trim() || "paperlens-guide";
  const name = slugify(nameSource, 60) || "paperlens-guide";
  const topic = options.topic?.trim() ? slugify(options.topic, 40) : "";
  const stamp = fileTimestamp(options.date ?? new Date());

  return [name, topic, stamp].filter(Boolean).join("_");
}

export function resolveOutputDir(value?: string): string {
  const raw = value?.trim();
  if (!raw) return join(homedir(), "Downloads");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return resolve(raw);
}

export async function writeOutput(
  dir: string,
  base: string,
  extension: string,
  data: string | Uint8Array,
): Promise<string> {
  await mkdir(dir, { recursive: true });

  let path = join(dir, `${base}.${extension}`);
  let suffix = 2;
  while (await Bun.file(path).exists()) {
    path = join(dir, `${base}-${suffix}.${extension}`);
    suffix += 1;
  }

  await Bun.write(path, data);
  return path;
}

export async function writeRawOutput(dir: string, base: string, raw: string): Promise<string> {
  return writeOutput(dir, base, "raw.txt", raw || "(empty response)\n");
}

export function fileTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function displayTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
