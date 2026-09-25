// Parses Osmoscan (LoRRca) ektacytometry CSV exports entirely in the browser.
// Port of the lab's Shiny app: metadata key/value lines, 7 summary lines just
// before the "#" header row, then O (osmolality) / EI columns.

export type CsvFormat = "EU" | "US";

export interface OsmoscanFile {
  fileName: string;
  sampleName: string;
  date: string;
  info: { parameter: string; value: string }[];
  params: { parameter: string; value: number | null }[];
  points: { o: number; ei: number }[];
}

const num = (s: string | undefined, fmt: CsvFormat) => {
  if (s == null) return null;
  const t = s.trim().replace(/^"|"$/g, "");
  const v = Number(fmt === "EU" ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : null;
};

function splitLine(line: string, fmt: CsvFormat) {
  return line.split(fmt === "EU" ? ";" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

function parseWith(text: string, fmt: CsvFormat, fileName: string): OsmoscanFile | null {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => l.includes("#"));
  if (h < 0) return null;
  const header = splitLine(lines[h]!, fmt).map((c) => c.replace(/#/g, "").trim());
  const oIdx = header.findIndex((c) => /^o\.?$/i.test(c) || /^o[\s(.]/i.test(c) || /osmol/i.test(c));
  const eiIdx = header.findIndex((c) => /^ei\b/i.test(c));
  if (oIdx < 0 || eiIdx < 0) return null;

  const points: { o: number; ei: number }[] = [];
  for (const l of lines.slice(h + 1)) {
    if (!l.trim()) continue;
    const cells = splitLine(l, fmt);
    const o = num(cells[oIdx], fmt);
    const ei = num(cells[eiIdx], fmt);
    if (o == null || ei == null || o < 100 || o > 600) continue;
    points.push({ o, ei });
  }
  if (points.length < 3) return null;
  points.sort((a, b) => a.o - b.o);

  const info = lines.slice(0, h).map((l) => {
    const [parameter = "", ...rest] = splitLine(l, fmt);
    return { parameter, value: rest.join(" ").trim() };
  });
  const params = lines.slice(Math.max(0, h - 7), h).map((l) => {
    const [parameter = "", value] = splitLine(l, fmt);
    return { parameter, value: num(value, fmt) };
  });

  return {
    fileName,
    sampleName: info[13]?.value || fileName,
    date: info[12]?.value || "",
    info,
    params,
    points,
  };
}

/** Tries the chosen CSV style first, then the other one. */
export function parseOsmoscan(text: string, fmt: CsvFormat, fileName: string) {
  return (
    parseWith(text, fmt, fileName) ??
    parseWith(text, fmt === "EU" ? "US" : "EU", fileName)
  );
}

/** EImin, Omin, EImax, Omax, EIhyper, Ohyper, Area — in file order. */
export function keyParams(f: OsmoscanFile) {
  const v = f.params.map((p) => p.value);
  return {
    eiMin: v[0], oMin: v[1], eiMax: v[2], oMax: v[3],
    eiHyper: v[4], oHyper: v[5], area: v[6],
  };
}
