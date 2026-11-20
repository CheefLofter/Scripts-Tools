import Ajv from "ajv";

export type PaperMeta = {
  title: string;
  authors: string;
  year: string;
  venue: string;
  source: string;
  one_liner: string;
};

export type DiagramNode = { id: string; label: string };
export type DiagramEdge = { from: string; to: string; label: string };
export type Diagram = {
  paper: string;
  caption: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type MethodStep = { paper: string; title: string; explanation: string };

export type ChartSeries = { label: string; values: number[] };
export type Chart = {
  paper: string;
  type: "bar" | "line";
  title: string;
  x_label: string;
  y_label: string;
  categories: string[];
  series: ChartSeries[];
  source_quote: string;
  location: string;
  caption: string;
};

export type KeyNumber = {
  paper: string;
  label: string;
  value: string;
  context: string;
  location: string;
  quote: string;
  confidence: "high" | "medium" | "low";
};

export type JargonItem = { term: string; definition: string; why_it_matters: string };
export type Limitation = { paper: string; limitation: string };
export type SkipItem = { section: string; reason: string };
export type TopicConnection = {
  paper: string;
  connection: string;
  location: string;
  quote: string;
};

export type Guide = {
  meta: {
    topic: string;
    topic_found: boolean;
    topic_note: string;
    papers: PaperMeta[];
  };
  summary: string;
  big_picture: {
    explanation: string;
    analogy: string;
    why_it_matters: string;
  };
  method: {
    steps: MethodStep[];
    diagrams: Diagram[];
  };
  jargon: JargonItem[];
  key_numbers: KeyNumber[];
  charts: Chart[];
  limitations: Limitation[];
  skip_guide: {
    read_closely: SkipItem[];
    safe_to_skip: SkipItem[];
  };
  comparison: {
    columns: string[];
    rows: string[][];
    takeaway: string;
  };
  topic_connections: TopicConnection[];
};

const paperSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    authors: { type: "string" },
    year: { type: "string" },
    venue: { type: "string" },
    source: { type: "string" },
    one_liner: { type: "string" },
  },
  required: ["title", "authors", "year", "venue", "source", "one_liner"],
};

const diagramSchema = {
  type: "object",
  properties: {
    paper: { type: "string" },
    caption: { type: "string" },
    nodes: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string" },
        },
        required: ["from", "to", "label"],
      },
    },
  },
  required: ["paper", "caption", "nodes", "edges"],
};

const chartSchema = {
  type: "object",
  properties: {
    paper: { type: "string" },
    type: { type: "string", enum: ["bar", "line"] },
    title: { type: "string" },
    x_label: { type: "string" },
    y_label: { type: "string" },
    categories: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string" },
    },
    series: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          values: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: { type: "number" },
          },
        },
        required: ["label", "values"],
      },
    },
    source_quote: { type: "string" },
    location: { type: "string" },
    caption: { type: "string" },
  },
  required: [
    "paper",
    "type",
    "title",
    "x_label",
    "y_label",
    "categories",
    "series",
    "source_quote",
    "location",
    "caption",
  ],
};

const skipItemSchema = {
  type: "object",
  properties: {
    section: { type: "string" },
    reason: { type: "string" },
  },
  required: ["section", "reason"],
};

export const GUIDE_SCHEMA = {
  type: "object",
  properties: {
    meta: {
      type: "object",
      properties: {
        topic: { type: "string" },
        topic_found: { type: "boolean" },
        topic_note: { type: "string" },
        papers: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: paperSchema,
        },
      },
      required: ["topic", "topic_found", "topic_note", "papers"],
    },
    summary: { type: "string" },
    big_picture: {
      type: "object",
      properties: {
        explanation: { type: "string" },
        analogy: { type: "string" },
        why_it_matters: { type: "string" },
      },
      required: ["explanation", "analogy", "why_it_matters"],
    },
    method: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              paper: { type: "string" },
              title: { type: "string" },
              explanation: { type: "string" },
            },
            required: ["paper", "title", "explanation"],
          },
        },
        diagrams: {
          type: "array",
          maxItems: 2,
          items: diagramSchema,
        },
      },
      required: ["steps", "diagrams"],
    },
    jargon: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
          why_it_matters: { type: "string" },
        },
        required: ["term", "definition", "why_it_matters"],
      },
    },
    key_numbers: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          paper: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          context: { type: "string" },
          location: { type: "string" },
          quote: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["paper", "label", "value", "context", "location", "quote", "confidence"],
      },
    },
    charts: {
      type: "array",
      maxItems: 3,
      items: chartSchema,
    },
    limitations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          paper: { type: "string" },
          limitation: { type: "string" },
        },
        required: ["paper", "limitation"],
      },
    },
    skip_guide: {
      type: "object",
      properties: {
        read_closely: { type: "array", items: skipItemSchema },
        safe_to_skip: { type: "array", items: skipItemSchema },
      },
      required: ["read_closely", "safe_to_skip"],
    },
    comparison: {
      type: "object",
      properties: {
        columns: { type: "array", items: { type: "string" } },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
        takeaway: { type: "string" },
      },
      required: ["columns", "rows", "takeaway"],
    },
    topic_connections: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          paper: { type: "string" },
          connection: { type: "string" },
          location: { type: "string" },
          quote: { type: "string" },
        },
        required: ["paper", "connection", "location", "quote"],
      },
    },
  },
  required: [
    "meta",
    "summary",
    "big_picture",
    "method",
    "jargon",
    "key_numbers",
    "charts",
    "limitations",
    "skip_guide",
    "comparison",
    "topic_connections",
  ],
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(GUIDE_SCHEMA);

export function validateGuide(data: unknown): Guide {
  if (!validate(data)) {
    const details = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`Guide JSON does not match the schema: ${details}`);
  }
  return data as Guide;
}

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;

/**
 * The only local trust check on numbers: every numeric token in the reported
 * value must appear in the quote the model supplied for it.
 */
export function numberAppearsInQuote(value: string, quote: string): boolean {
  const tokens = value.match(NUMBER_RE) ?? [];
  if (tokens.length === 0) return true;

  const normalizedQuote = normalizeNumberText(quote);
  return tokens.every((token) => normalizedQuote.includes(normalizeNumberText(token)));
}

function normalizeNumberText(text: string): string {
  return text.replace(/\u2212/g, "-").replace(/,/g, "");
}

export function sanitizeGuide(guide: Guide): Guide {
  return {
    ...guide,
    key_numbers: guide.key_numbers.filter(
      (item) => item.quote.trim().length > 0 && numberAppearsInQuote(item.value, item.quote),
    ),
    charts: guide.charts.filter(isValidChart),
    method: {
      ...guide.method,
      diagrams: guide.method.diagrams.filter(isValidDiagram),
    },
  };
}

export function applyTopicPolicy(guide: Guide, topic: string | undefined): Guide {
  if (!topic) {
    return {
      ...guide,
      meta: { ...guide.meta, topic: "", topic_found: true, topic_note: "" },
      topic_connections: [],
    };
  }

  if (guide.meta.topic_found) {
    return { ...guide, meta: { ...guide.meta, topic } };
  }

  return {
    ...guide,
    meta: {
      ...guide.meta,
      topic,
      topic_found: false,
      topic_note: guide.meta.topic_note.trim() || "The supplied papers do not discuss this topic.",
    },
    summary: "",
    big_picture: { explanation: "", analogy: "", why_it_matters: "" },
    method: { steps: [], diagrams: [] },
    jargon: [],
    key_numbers: [],
    charts: [],
    limitations: [],
    skip_guide: { read_closely: [], safe_to_skip: [] },
    comparison: { columns: [], rows: [], takeaway: "" },
    topic_connections: [],
  };
}

function isValidChart(chart: Chart): boolean {
  if (chart.type !== "bar" && chart.type !== "line") return false;
  if (!chart.categories.length || !chart.series.length) return false;
  if (!chart.source_quote.trim()) return false;
  if (chart.categories.length > 12 || chart.series.length > 4) return false;

  return chart.series.every(
    (series) =>
      series.values.length === chart.categories.length &&
      series.values.every(
        (value) =>
          Number.isFinite(value) && numberAppearsInQuote(String(value), chart.source_quote),
      ),
  );
}

function isValidDiagram(diagram: Diagram): boolean {
  if (!diagram.nodes.length || diagram.nodes.length > 12) return false;

  const ids = new Set(diagram.nodes.map((node) => node.id.trim()));
  if (ids.size !== diagram.nodes.length || ids.has("")) return false;
  if (diagram.nodes.some((node) => !node.label.trim())) return false;

  return diagram.edges.every(
    (edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to,
  );
}
