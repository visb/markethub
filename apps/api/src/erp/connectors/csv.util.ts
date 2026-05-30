/** Parser CSV mínimo com suporte a campos entre aspas. Cabeçalho na 1ª linha. */
export function parseCsv(content: string): Record<string, string>[] {
  const rows = splitRows(content);
  if (rows.length === 0) return [];
  const header = parseLine(rows[0]!);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i]!;
    if (line.trim() === "") continue;
    const cells = parseLine(line);
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = (cells[idx] ?? "").trim();
    });
    out.push(record);
  }
  return out;
}

function splitRows(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function toInt(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function toIntOrNull(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toBool(v: string | undefined, fallback = true): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "sim", "yes", "y"].includes(v.toLowerCase());
}
