import MarkdownIt from "markdown-it";
import { displayTimestamp } from "./output";
import type { Chart, Diagram, Guide, PaperMeta } from "./schema";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

const PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return String(text ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const escapeXml = escapeHtml;

export function renderMarkdown(guide: Guide, options: { generatedAt?: Date } = {}): string {
  const generated = displayTimestamp(options.generatedAt);
  const title = guideTitle(guide);
  const topic = guide.meta.topic.trim();
  const topicMissing = Boolean(topic) && !guide.meta.topic_found;
  const multi = guide.meta.papers.length > 1;
  const blocks: string[] = [];

  blocks.push(`# Study Guide: ${title}`);

  const header: string[] = [];
  if (topic) header.push(`> **Topic:** ${topic}`);
  header.push(`> **Generated:** ${generated}`);
  blocks.push(header.join("\n"));

  if (guide.meta.papers.length) {
    const papers = ["## Papers", ""];
    guide.meta.papers.forEach((paper, index) => {
      const meta = metaLine(paper);
      papers.push(
        `${index + 1}. **${paper.title || "Untitled paper"}**${meta ? ` — ${meta}` : ""}`,
      );
      if (paper.one_liner) papers.push(`   ${oneLine(paper.one_liner)}`);
    });
    blocks.push(papers.join("\n"));
  }

  if (topicMissing) {
    blocks.push(
      `> **Nothing found on this topic.**\n>\n> ${oneLine(
        guide.meta.topic_note || "The supplied papers do not discuss this topic.",
      )}`,
    );
    blocks.push("The guide is intentionally empty instead of falling back to a general summary.");
    blocks.push(markdownFooter(generated));
    return blocks.join("\n\n");
  }

  let hasBody = false;

  if (guide.summary.trim()) {
    blocks.push(`## Summary\n\n${guide.summary.trim()}`);
    hasBody = true;
  }

  if (hasBigPicture(guide.big_picture)) {
    const big: string[] = ["## The big picture", ""];
    if (guide.big_picture.explanation.trim()) {
      big.push(guide.big_picture.explanation.trim(), "");
    }
    if (guide.big_picture.analogy.trim()) {
      big.push(`**Analogy:** ${oneLine(guide.big_picture.analogy)}`, "");
    }
    if (guide.big_picture.why_it_matters.trim()) {
      big.push(`**Why it matters:** ${oneLine(guide.big_picture.why_it_matters)}`, "");
    }
    blocks.push(big.join("\n").trim());
    hasBody = true;
  }

  if (guide.method.steps.length || guide.method.diagrams.length) {
    const method: string[] = ["## How it works", ""];

    guide.method.steps.forEach((step, index) => {
      const paper = multi && step.paper ? ` *(${step.paper})*` : "";
      method.push(`${index + 1}. **${step.title}**${paper} — ${oneLine(step.explanation)}`);
    });
    if (guide.method.steps.length) method.push("");

    for (const diagram of guide.method.diagrams) {
      method.push(`### ${diagram.caption || "Method flow"}`, "");
      if (multi && diagram.paper) method.push(`*${diagram.paper}*`, "");
      method.push("```mermaid", toMermaid(diagram), "```", "");
    }

    blocks.push(method.join("\n").trim());
    hasBody = true;
  }

  if (guide.jargon.length) {
    const jargon = [
      "## Jargon decoder",
      "",
      "| Term | What it means | Why it matters |",
      "| --- | --- | --- |",
    ];
    for (const item of guide.jargon) {
      jargon.push(
        `| ${cell(item.term)} | ${cell(item.definition)} | ${cell(item.why_it_matters)} |`,
      );
    }
    blocks.push(jargon.join("\n"));
    hasBody = true;
  }

  if (guide.key_numbers.length) {
    const numbers: string[] = ["## Key numbers", ""];
    for (const item of guide.key_numbers) {
      const where = [item.paper, item.location].filter(Boolean).join(" · ");
      const context = item.context ? ` — ${oneLine(item.context)}` : "";
      const meta = where ? ` *(${where})*` : "";
      numbers.push(
        `- **${item.label || "Result"}:** ${item.value}${context}${meta} · confidence: ${item.confidence}`,
      );
      if (item.quote) numbers.push(`  > ${oneLine(item.quote)}`);
    }
    blocks.push(numbers.join("\n"));
    hasBody = true;
  }

  if (guide.charts.length) {
    const charts: string[] = ["## Charts", ""];
    for (const chart of guide.charts) {
      charts.push(`### ${chart.title || chart.caption || "Chart"}`, "");

      const headers = ["Category", ...chart.series.map((series) => series.label || "Value")];
      charts.push(`| ${headers.map(cell).join(" | ")} |`);
      charts.push(`| ${headers.map(() => "---").join(" | ")} |`);
      chart.categories.forEach((category, index) => {
        const values = chart.series.map((series) => formatNumber(series.values[index]));
        charts.push(`| ${cell(category)} | ${values.join(" | ")} |`);
      });
      charts.push("");

      if (chart.caption) charts.push(`*${oneLine(chart.caption)}*`, "");
      const where = [chart.paper, chart.location].filter(Boolean).join(" · ");
      if (where) charts.push(`Source: ${where}`, "");
      if (chart.source_quote) charts.push(`> ${oneLine(chart.source_quote)}`, "");
    }
    blocks.push(charts.join("\n").trim());
    hasBody = true;
  }

  if (guide.limitations.length) {
    const limitations = ["## Limitations", ""];
    for (const item of guide.limitations) {
      limitations.push(`- **${item.paper || "Paper"}:** ${oneLine(item.limitation)}`);
    }
    blocks.push(limitations.join("\n"));
    hasBody = true;
  }

  if (guide.skip_guide.read_closely.length || guide.skip_guide.safe_to_skip.length) {
    const skip: string[] = ["## Skip guide", ""];
    if (guide.skip_guide.read_closely.length) {
      skip.push("### Read closely", "");
      for (const item of guide.skip_guide.read_closely) {
        skip.push(`- **${item.section}** — ${oneLine(item.reason)}`);
      }
      skip.push("");
    }
    if (guide.skip_guide.safe_to_skip.length) {
      skip.push("### Safe to skip", "");
      for (const item of guide.skip_guide.safe_to_skip) {
        skip.push(`- **${item.section}** — ${oneLine(item.reason)}`);
      }
      skip.push("");
    }
    blocks.push(skip.join("\n").trim());
    hasBody = true;
  }

  if (guide.topic_connections.length) {
    const connections = ["## Topic connections", ""];
    for (const item of guide.topic_connections) {
      const where = [item.paper, item.location].filter(Boolean).join(" · ");
      connections.push(`- ${oneLine(item.connection)}${where ? ` *(${where})*` : ""}`);
      if (item.quote) connections.push(`  > ${oneLine(item.quote)}`);
    }
    blocks.push(connections.join("\n"));
    hasBody = true;
  }

  if (guide.comparison.columns.length && guide.comparison.rows.length) {
    const comparison: string[] = ["## Comparison", ""];
    comparison.push(`| ${guide.comparison.columns.map(cell).join(" | ")} |`);
    comparison.push(`| ${guide.comparison.columns.map(() => "---").join(" | ")} |`);
    for (const row of guide.comparison.rows) {
      const cells = guide.comparison.columns.map((_, index) => cell(row[index] ?? ""));
      comparison.push(`| ${cells.join(" | ")} |`);
    }
    comparison.push("");
    if (guide.comparison.takeaway.trim()) {
      comparison.push(`**Takeaway:** ${oneLine(guide.comparison.takeaway)}`);
    }
    blocks.push(comparison.join("\n").trim());
    hasBody = true;
  }

  if (!hasBody) {
    blocks.push("> The model returned no guide content.");
  }

  blocks.push(markdownFooter(generated));
  return blocks.join("\n\n");
}

export function renderHtml(guide: Guide, options: { generatedAt?: Date } = {}): string {
  const title = guideTitle(guide);
  const topic = guide.meta.topic.trim();
  const topicMissing = Boolean(topic) && !guide.meta.topic_found;
  const generated = displayTimestamp(options.generatedAt);
  const multi = guide.meta.papers.length > 1;
  const sections: string[] = [];

  if (guide.meta.papers.length) {
    const items = guide.meta.papers
      .map((paper) => {
        const meta = metaLine(paper);
        const oneLiner = paper.one_liner ? `<br><span>${inline(paper.one_liner)}</span>` : "";
        return `<li><strong>${inline(paper.title || "Untitled paper")}</strong>${
          meta ? `<span class="muted"> — ${escapeHtml(meta)}</span>` : ""
        }${oneLiner}</li>`;
      })
      .join("");
    sections.push(section("Papers", `<ol class="papers">${items}</ol>`));
  }

  if (topicMissing) {
    sections.push(
      section(
        "Nothing found on this topic",
        `<p>${inline(
          guide.meta.topic_note || "The supplied papers do not discuss this topic.",
        )}</p><p class="muted">The guide is intentionally empty instead of falling back to a general summary.</p>`,
        "notice",
      ),
    );
    return htmlDocument(
      title,
      headerHtml(title, topic, generated) + sections.join("") + footerHtml(generated),
    );
  }

  if (guide.summary.trim()) {
    sections.push(section("Summary", prose(guide.summary)));
  }

  if (hasBigPicture(guide.big_picture)) {
    let body = "";
    if (guide.big_picture.explanation.trim()) {
      body += prose(guide.big_picture.explanation);
    }
    if (guide.big_picture.analogy.trim()) {
      body += `<p><strong>Analogy:</strong> ${inline(guide.big_picture.analogy)}</p>`;
    }
    if (guide.big_picture.why_it_matters.trim()) {
      body += `<p><strong>Why it matters:</strong> ${inline(guide.big_picture.why_it_matters)}</p>`;
    }
    sections.push(section("The big picture", body));
  }

  if (guide.method.steps.length || guide.method.diagrams.length) {
    let body = "";
    if (guide.method.steps.length) {
      const items = guide.method.steps
        .map((step) => {
          const tag =
            multi && step.paper ? ` <span class="tag">${escapeHtml(step.paper)}</span>` : "";
          return `<li><strong>${inline(step.title)}</strong>${tag} — ${inline(
            step.explanation,
          )}</li>`;
        })
        .join("");
      body += `<ol class="steps">${items}</ol>`;
    }

    for (const diagram of guide.method.diagrams) {
      const caption = diagram.caption || "Method flow";
      const tag = multi && diagram.paper ? ` — ${escapeHtml(diagram.paper)}` : "";
      body += `<figure class="figure">${diagramSvg(
        diagram,
      )}<figcaption>${escapeHtml(caption)}${tag}</figcaption></figure>`;
    }

    sections.push(section("How it works", body));
  }

  if (guide.jargon.length) {
    sections.push(
      section(
        "Jargon decoder",
        table(
          ["Term", "What it means", "Why it matters"],
          guide.jargon.map((item) => [item.term, item.definition, item.why_it_matters]),
        ),
      ),
    );
  }

  if (guide.key_numbers.length) {
    const body = guide.key_numbers
      .map((item) => {
        const meta = [item.context, item.paper, item.location]
          .filter((value) => value.trim())
          .map(escapeHtml)
          .join(" · ");
        return `<div class="number"><div class="number-head"><strong>${inline(
          item.label || "Result",
        )}:</strong> <span class="value">${escapeHtml(
          item.value,
        )}</span> <span class="badge">${escapeHtml(
          item.confidence,
        )}</span></div>${meta ? `<div class="muted">${meta}</div>` : ""}<blockquote>${escapeHtml(
          item.quote,
        )}</blockquote></div>`;
      })
      .join("");
    sections.push(section("Key numbers", body));
  }

  if (guide.charts.length) {
    const body = guide.charts
      .map((chart) => {
        const caption = [chart.caption, chart.paper, chart.location]
          .filter((value) => value.trim())
          .map(escapeHtml)
          .join(" · ");
        const quote = chart.source_quote
          ? `<blockquote>${escapeHtml(chart.source_quote)}</blockquote>`
          : "";
        return `<figure class="figure">${chartSvg(chart)}<figcaption><strong>${inline(
          chart.title || "Chart",
        )}</strong>${caption ? `<br><span class="muted">${caption}</span>` : ""}</figcaption>${quote}</figure>`;
      })
      .join("");
    sections.push(section("Charts", body));
  }

  if (guide.limitations.length) {
    const items = guide.limitations
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.paper || "Paper")}:</strong> ${inline(
            item.limitation,
          )}</li>`,
      )
      .join("");
    sections.push(section("Limitations", `<ul>${items}</ul>`));
  }

  if (guide.skip_guide.read_closely.length || guide.skip_guide.safe_to_skip.length) {
    let body = "";
    if (guide.skip_guide.read_closely.length) {
      body += `<h3>Read closely</h3><ul>${guide.skip_guide.read_closely
        .map((item) => `<li><strong>${inline(item.section)}</strong> — ${inline(item.reason)}</li>`)
        .join("")}</ul>`;
    }
    if (guide.skip_guide.safe_to_skip.length) {
      body += `<h3>Safe to skip</h3><ul>${guide.skip_guide.safe_to_skip
        .map((item) => `<li><strong>${inline(item.section)}</strong> — ${inline(item.reason)}</li>`)
        .join("")}</ul>`;
    }
    sections.push(section("Skip guide", body));
  }

  if (guide.topic_connections.length) {
    const items = guide.topic_connections
      .map((item) => {
        const where = [item.paper, item.location]
          .filter((value) => value.trim())
          .map(escapeHtml)
          .join(" · ");
        const quote = item.quote ? `<blockquote>${escapeHtml(item.quote)}</blockquote>` : "";
        return `<li>${inline(item.connection)}${
          where ? `<span class="muted"> — ${where}</span>` : ""
        }${quote}</li>`;
      })
      .join("");
    sections.push(section("Topic connections", `<ul>${items}</ul>`));
  }

  if (guide.comparison.columns.length && guide.comparison.rows.length) {
    let body = table(guide.comparison.columns, guide.comparison.rows);
    if (guide.comparison.takeaway.trim()) {
      body += `<p><strong>Takeaway:</strong> ${inline(guide.comparison.takeaway)}</p>`;
    }
    sections.push(section("Comparison", body));
  }

  if (!sections.length) {
    sections.push('<p class="muted">The model returned no guide content.</p>');
  }

  return htmlDocument(
    title,
    headerHtml(title, topic, generated) + sections.join("") + footerHtml(generated),
  );
}

export function toMermaid(diagram: Diagram): string {
  const lines = ["flowchart TD"];
  const ids = new Map<string, string>();

  diagram.nodes.forEach((node, index) => {
    const id = `n${index}`;
    ids.set(node.id, id);
    lines.push(`  ${id}["${mermaidText(node.label || node.id)}"]`);
  });

  for (const edge of diagram.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (!from || !to || from === to) continue;
    const label = edge.label.trim() ? `|"${mermaidText(edge.label)}"|` : "";
    lines.push(`  ${from} -->${label} ${to}`);
  }

  return lines.join("\n");
}

export function diagramSvg(diagram: Diagram): string {
  const nodes = diagram.nodes.slice(0, 12);
  if (!nodes.length) return "";

  const ids = new Map<string, number>();
  nodes.forEach((node, index) => {
    ids.set(node.id, index);
  });

  const width = 880;
  const nodeWidth = 560;
  const nodeX = (width - nodeWidth) / 2;
  const nodeHeight = 58;
  const gap = 54;
  const top = 30;
  const height = top * 2 + nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * gap;
  const nodeY = (index: number) => top + index * (nodeHeight + gap);
  const centerX = nodeX + nodeWidth / 2;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
      diagram.caption || "Method diagram",
    )}">`,
  );
  parts.push(`<title>${escapeXml(diagram.caption || "Method diagram")}</title>`);
  parts.push(
    '<defs><marker id="paperlens-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>',
  );

  diagram.edges.forEach((edge, index) => {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from === undefined || to === undefined || from === to) return;

    const offset = ((index % 3) - 1) * 26;
    let path: string;
    let labelX: number;
    let labelY: number;

    if (to === from + 1) {
      const x = centerX + offset;
      const y1 = nodeY(from) + nodeHeight;
      const y2 = nodeY(to);
      path = `M ${x} ${y1} L ${x} ${y2}`;
      labelX = x + 10;
      labelY = (y1 + y2) / 2 + 4;
    } else {
      const y1 = nodeY(from) + nodeHeight / 2;
      const y2 = nodeY(to) + nodeHeight / 2;
      const bendX = nodeX + nodeWidth + 36 + Math.abs(offset);
      path = `M ${nodeX + nodeWidth} ${y1} C ${bendX} ${y1}, ${bendX} ${y2}, ${
        nodeX + nodeWidth
      } ${y2}`;
      labelX = bendX + 6;
      labelY = (y1 + y2) / 2 + 4;
    }

    parts.push(
      `<path d="${path}" fill="none" stroke="#64748b" stroke-width="1.6" marker-end="url(#paperlens-arrow)"/>`,
    );

    if (edge.label.trim()) {
      const label = truncate(edge.label.trim(), 20);
      const labelWidth = Math.max(20, label.length * 6.2);
      parts.push(
        `<rect x="${labelX - 3}" y="${labelY - 12}" width="${
          labelWidth + 6
        }" height="16" rx="3" fill="#ffffff" opacity="0.9"/>`,
      );
      parts.push(
        `<text x="${labelX}" y="${labelY}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(
          label,
        )}</text>`,
      );
    }
  });

  nodes.forEach((node, index) => {
    const y = nodeY(index);
    const label = node.label || node.id;
    const lines = wrapText(label, 52).slice(0, 2);

    parts.push(`<g><title>${escapeXml(label)}</title>`);
    parts.push(
      `<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>`,
    );
    parts.push(
      `<rect x="${nodeX}" y="${y}" width="4" height="${nodeHeight}" rx="2" fill="#2563eb"/>`,
    );

    if (lines.length === 1) {
      parts.push(
        `<text x="${centerX}" y="${
          y + nodeHeight / 2 + 5
        }" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" fill="#0f172a" text-anchor="middle">${escapeXml(
          lines[0],
        )}</text>`,
      );
    } else {
      parts.push(
        `<text x="${centerX}" y="${
          y + 24
        }" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" fill="#0f172a" text-anchor="middle">${escapeXml(
          lines[0],
        )}</text>`,
      );
      parts.push(
        `<text x="${centerX}" y="${
          y + 42
        }" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" fill="#0f172a" text-anchor="middle">${escapeXml(
          lines[1],
        )}</text>`,
      );
    }

    parts.push("</g>");
  });

  parts.push("</svg>");
  return parts.join("");
}

export function chartSvg(chart: Chart): string {
  const values = chart.series.flatMap((series) => series.values).filter(Number.isFinite);
  if (!values.length || !chart.categories.length || !chart.series.length) return "";

  const width = 760;
  const height = 380;
  const padL = 72;
  const padR = 24;
  const padT = 78;
  const padB = 94;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const [min, max, step] = niceScale(rawMin, rawMax, 5);
  const y = (value: number) => padT + (plotH * (max - value)) / (max - min);
  const parts: string[] = [];
  const title = chart.title || chart.caption || "Chart";

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
      title,
    )}">`,
  );
  parts.push(`<title>${escapeXml(title)}</title>`);
  parts.push(
    `<text x="${width / 2}" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15" font-weight="600" fill="#0f172a">${escapeXml(
      truncate(title, 70),
    )}</text>`,
  );

  let legendX = padL;
  chart.series.forEach((series, index) => {
    const color = PALETTE[index % PALETTE.length];
    const label = truncate(series.label || `Series ${index + 1}`, 20);
    parts.push(`<rect x="${legendX}" y="42" width="10" height="10" rx="2" fill="${color}"/>`);
    parts.push(
      `<text x="${
        legendX + 15
      }" y="51" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(
        label,
      )}</text>`,
    );
    legendX += 15 + label.length * 6.2 + 20;
  });

  if (chart.y_label.trim()) {
    const centerY = padT + plotH / 2;
    parts.push(
      `<text x="18" y="${centerY}" transform="rotate(-90 18 ${centerY})" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(
        chart.y_label,
      )}</text>`,
    );
  }

  const tickCount = Math.round((max - min) / step);
  for (let index = 0; index <= tickCount; index += 1) {
    const value = min + index * step;
    const yPos = y(value);
    parts.push(
      `<line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" stroke="#e2e8f0" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${padL - 8}" y="${
        yPos + 4
      }" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">${escapeXml(
        formatNumber(value),
      )}</text>`,
    );
  }

  if (min <= 0 && max >= 0) {
    const zero = y(0);
    parts.push(
      `<line x1="${padL}" y1="${zero}" x2="${width - padR}" y2="${zero}" stroke="#94a3b8" stroke-width="1.2"/>`,
    );
  }

  if (chart.x_label.trim()) {
    parts.push(
      `<text x="${padL + plotW / 2}" y="${
        height - 14
      }" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(
        chart.x_label,
      )}</text>`,
    );
  }

  const count = chart.categories.length;
  const seriesCount = chart.series.length;

  if (chart.type === "line") {
    const xAt = (index: number) =>
      count === 1 ? padL + plotW / 2 : padL + (plotW * index) / (count - 1);

    chart.series.forEach((series, seriesIndex) => {
      const color = PALETTE[seriesIndex % PALETTE.length];
      const points = series.values.map((value, index) => `${xAt(index)},${y(value)}`).join(" ");
      parts.push(
        `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      series.values.forEach((value, index) => {
        parts.push(
          `<circle cx="${xAt(index)}" cy="${y(value)}" r="3.5" fill="#ffffff" stroke="${color}" stroke-width="2"><title>${escapeXml(
            `${chart.categories[index]}: ${formatNumber(value)}`,
          )}</title></circle>`,
        );
      });
    });
  } else {
    const groupWidth = plotW / count;
    const barWidth = Math.min(52, (groupWidth * 0.72) / seriesCount);
    const showValues = count * seriesCount <= 12 && barWidth >= 18;

    chart.categories.forEach((category, index) => {
      const groupCenter = padL + groupWidth * (index + 0.5);
      const start = groupCenter - (barWidth * seriesCount) / 2;

      chart.series.forEach((series, seriesIndex) => {
        const value = series.values[index];
        const color = PALETTE[seriesIndex % PALETTE.length];
        const zero = y(0);
        const top = Math.min(zero, y(value));
        const barHeight = Math.max(1, Math.abs(y(value) - zero));
        const x = start + seriesIndex * barWidth;

        parts.push(
          `<rect x="${x}" y="${top}" width="${Math.max(
            1,
            barWidth - 2,
          )}" height="${barHeight}" rx="2" fill="${color}"><title>${escapeXml(
            `${category}: ${formatNumber(value)}`,
          )}</title></rect>`,
        );

        if (showValues) {
          const labelY = value >= 0 ? y(value) - 5 : y(value) + 13;
          parts.push(
            `<text x="${
              x + barWidth / 2
            }" y="${labelY}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="#334155">${escapeXml(
              formatNumber(value),
            )}</text>`,
          );
        }
      });
    });
  }

  const labelEvery = count > 8 ? 2 : 1;
  const maxChars = count > 8 ? 10 : 16;
  chart.categories.forEach((category, index) => {
    if (index % labelEvery !== 0 && index !== count - 1) return;

    const x =
      chart.type === "line"
        ? count === 1
          ? padL + plotW / 2
          : padL + (plotW * index) / (count - 1)
        : padL + (plotW / count) * (index + 0.5);

    parts.push(
      `<text x="${x}" y="${
        height - padB + 20
      }" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${
        count > 8 ? 10 : 11
      }" fill="#475569"><title>${escapeXml(category)}</title>${escapeXml(
        truncate(category, maxChars),
      )}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("");
}

function guideTitle(guide: Guide): string {
  const papers = guide.meta.papers;
  if (papers.length === 1) return papers[0].title.trim() || "Paper";
  if (papers.length > 1) return `${papers.length} papers`;
  return "Paper";
}

function metaLine(paper: PaperMeta): string {
  const parts: string[] = [];
  if (paper.authors.trim()) parts.push(paper.authors.trim());
  if (paper.year.trim()) parts.push(`(${paper.year.trim()})`);

  const first = parts.join(" ");
  const rest = [paper.venue.trim(), paper.source.trim()].filter(Boolean).join(" · ");
  return [first, rest].filter(Boolean).join(" · ");
}

function hasBigPicture(bigPicture: Guide["big_picture"]): boolean {
  return Boolean(
    bigPicture.explanation.trim() || bigPicture.analogy.trim() || bigPicture.why_it_matters.trim(),
  );
}

function markdownFooter(generated: string): string {
  return `---\n\n*Generated by paperlens on ${generated}. Numbers are quoted from the papers; spot-check before citing.*`;
}

function headerHtml(title: string, topic: string, generated: string): string {
  const meta = [topic ? `Topic: ${topic}` : "", `Generated ${generated}`]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  return `<header><h1>Study Guide: ${escapeHtml(title)}</h1><p class="meta">${meta}</p></header>`;
}

function footerHtml(generated: string): string {
  return `<footer>Generated by paperlens on ${escapeHtml(
    generated,
  )}. Numbers are quoted from the papers; spot-check before citing.</footer>`;
}

function section(title: string, body: string, className = ""): string {
  return `<section${className ? ` class="${className}"` : ""}><h2>${escapeHtml(
    title,
  )}</h2>${body}</section>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${inline(header)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${Array.from(
          { length: headers.length },
          (_, index) => `<td>${inline(row[index] ?? "")}</td>`,
        ).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function prose(text: string): string {
  return `<div class="prose">${md.render(String(text ?? ""))}</div>`;
}

function inline(text: string): string {
  return md.renderInline(String(text ?? ""));
}

function oneLine(text: string): string {
  return String(text ?? "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function cell(text: string): string {
  return oneLine(text).replace(/\|/g, "\\|");
}

function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function niceScale(
  minValue: number,
  maxValue: number,
  tickCount: number,
): [number, number, number] {
  let min = minValue;
  let max = maxValue;

  if (min === max) {
    if (min === 0) return [0, 1, 0.2];
    if (min > 0) {
      min = 0;
      max = maxValue * 1.1;
    } else {
      min = minValue * 1.1;
      max = 0;
    }
  }

  const rough = (max - min) / tickCount;
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  return [niceMin, niceMax === niceMin ? niceMin + step : niceMax, step];
}

function wrapText(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > max ? `${word.slice(0, max - 1)}…` : word;
  }

  if (current) lines.push(current);
  if (!lines.length) return [""];
  if (lines.length <= 2) return lines;

  const second = truncate(`${lines[1]} ${lines.slice(2).join(" ")}`, max - 1);
  return [lines[0], `${second}…`];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function mermaidText(text: string): string {
  return text
    .replace(/["`]/g, "'")
    .replace(/[[\]{}()<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`Study Guide: ${title}`)}</title>
<style>${CSS}</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #ffffff; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; }
main { max-width: 860px; margin: 0 auto; padding: 48px 28px 80px; }
header { border-bottom: 2px solid #e2e8f0; padding-bottom: 1.2rem; margin-bottom: 1.8rem; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 0.4rem; letter-spacing: -0.02em; }
h2 { font-size: 1.3rem; margin: 2.2rem 0 0.8rem; padding-bottom: 0.3rem; border-bottom: 1px solid #e2e8f0; }
h3 { font-size: 1.05rem; margin: 1.4rem 0 0.5rem; }
p { margin: 0.6rem 0; }
.meta, .muted { color: #64748b; font-size: 0.9rem; }
.papers { padding-left: 1.2rem; }
.papers li { margin: 0.6rem 0; }
.tag { display: inline-block; font-size: 0.72rem; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 999px; padding: 0.05rem 0.45rem; vertical-align: middle; }
blockquote { margin: 0.5rem 0; padding: 0.35rem 0 0.35rem 0.8rem; border-left: 3px solid #cbd5e1; color: #475569; font-size: 0.92rem; }
table { width: 100%; border-collapse: collapse; margin: 0.8rem 0; font-size: 0.9rem; }
th, td { border: 1px solid #e2e8f0; padding: 0.45rem 0.55rem; text-align: left; vertical-align: top; }
th { background: #f8fafc; font-weight: 600; }
.figure { margin: 1.4rem 0; }
.figure svg { width: 100%; height: auto; display: block; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; }
figcaption { font-size: 0.85rem; color: #64748b; margin-top: 0.45rem; }
.number { border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.8rem 0.9rem; margin: 0.7rem 0; }
.number-head { display: flex; gap: 0.45rem; align-items: baseline; flex-wrap: wrap; }
.number .value { font-weight: 600; }
.badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; background: #f1f5f9; color: #475569; border-radius: 999px; padding: 0.08rem 0.45rem; }
.notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 1rem 1.1rem; }
.notice h2 { border: 0; margin-top: 0; }
ul, ol { padding-left: 1.4rem; }
li { margin: 0.35rem 0; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; }
@media print {
  main { max-width: none; padding: 0; }
  h2 { break-after: avoid; }
  .figure, .number, table, blockquote { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;
