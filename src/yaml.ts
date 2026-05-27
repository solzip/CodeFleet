interface ParsedLine {
  indent: number;
  content: string;
  lineNumber: number;
}

export class YamlParseError extends Error {
  readonly lineNumber?: number;

  constructor(message: string, lineNumber?: number) {
    super(lineNumber === undefined ? message : `Line ${lineNumber}: ${message}`);
    this.name = "YamlParseError";
    this.lineNumber = lineNumber;
  }
}

export function parseYaml(input: string): unknown {
  const lines = toParsedLines(input);
  if (lines.length === 0) {
    return {};
  }

  const state = { index: 0 };
  const result = parseBlock(lines, state, lines[0].indent);

  if (state.index < lines.length) {
    const line = lines[state.index];
    throw new YamlParseError("Unexpected content", line.lineNumber);
  }

  return result;
}

function toParsedLines(input: string): ParsedLine[] {
  return input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((raw, index) => {
      if (raw.includes("\t")) {
        throw new YamlParseError("Tabs are not supported for indentation", index + 1);
      }

      const withoutComment = stripComment(raw);
      const trimmed = withoutComment.trim();
      if (trimmed.length === 0) {
        return null;
      }

      return {
        indent: withoutComment.length - withoutComment.trimStart().length,
        content: trimmed,
        lineNumber: index + 1
      };
    })
    .filter((line): line is ParsedLine => line !== null);
}

function parseBlock(lines: ParsedLine[], state: { index: number }, indent: number): unknown {
  const line = lines[state.index];
  if (!line || line.indent < indent) {
    return {};
  }

  if (line.content.startsWith("- ")) {
    return parseArray(lines, state, indent);
  }

  return parseObject(lines, state, indent);
}

function parseObject(lines: ParsedLine[], state: { index: number }, indent: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  while (state.index < lines.length) {
    const line = lines[state.index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new YamlParseError("Unexpected indentation", line.lineNumber);
    }
    if (line.content.startsWith("- ")) {
      break;
    }

    const { key, value } = splitKeyValue(line.content, line.lineNumber);
    state.index += 1;

    if (value.length > 0) {
      result[key] = parseScalar(value, line.lineNumber);
      continue;
    }

    const next = lines[state.index];
    if (!next || next.indent <= line.indent) {
      result[key] = {};
      continue;
    }

    result[key] = parseBlock(lines, state, next.indent);
  }

  return result;
}

function parseArray(lines: ParsedLine[], state: { index: number }, indent: number): unknown[] {
  const result: unknown[] = [];

  while (state.index < lines.length) {
    const line = lines[state.index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new YamlParseError("Unexpected indentation", line.lineNumber);
    }
    if (!line.content.startsWith("- ")) {
      break;
    }

    const value = line.content.slice(2).trim();
    state.index += 1;

    if (value.length > 0) {
      result.push(parseScalar(value, line.lineNumber));
      continue;
    }

    const next = lines[state.index];
    if (!next || next.indent <= line.indent) {
      result.push(null);
      continue;
    }

    result.push(parseBlock(lines, state, next.indent));
  }

  return result;
}

function splitKeyValue(content: string, lineNumber: number): { key: string; value: string } {
  const colon = content.indexOf(":");
  if (colon <= 0) {
    throw new YamlParseError("Expected key: value", lineNumber);
  }

  const key = content.slice(0, colon).trim();
  const value = content.slice(colon + 1).trim();
  if (!key) {
    throw new YamlParseError("Missing key", lineNumber);
  }

  return { key, value };
}

function parseScalar(value: string, lineNumber: number): unknown {
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (body.length === 0) {
      return [];
    }

    return splitInlineArray(body).map((item) => parseScalar(item.trim(), lineNumber));
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new YamlParseError("Invalid double-quoted string", lineNumber);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null" || value === "~") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function splitInlineArray(body: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if ((char === '"' || char === "'") && body[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }

    if (char === "," && quote === null) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function stripComment(raw: string): string {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if ((char === '"' || char === "'") && raw[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }

    if (char === "#" && quote === null && (index === 0 || /\s/.test(raw[index - 1]))) {
      return raw.slice(0, index).trimEnd();
    }
  }

  return raw.trimEnd();
}
