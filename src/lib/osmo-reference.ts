// Reference (healthy control) Osmoscan curves, saved in this browser's
// localStorage only — never uploaded. Used to draw a normal range band.
import { keyParams, type OsmoscanFile } from "./osmoscan";

const KEY = "anemia-board:ekta-reference:v1";

export function loadReferences(): OsmoscanFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OsmoscanFile[]) : [];
  } catch {
    return [];
  }
}

export function saveReferences(refs: OsmoscanFile[]) {
  try {
    if (refs.length) localStorage.setItem(KEY, JSON.stringify(refs));
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

function interp(points: { o: number; ei: number }[], o: number) {
  if (!points.length || o < points[0]!.o || o > points[points.length - 1]!.o) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (o <= b.o) return b.o === a.o ? a.ei : a.ei + ((o - a.o) / (b.o - a.o)) * (b.ei - a.ei);
  }
  return null;
}

const stats = (v: number[]) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : 0;
  return { mean: m, sd, lo: m - 2 * sd, hi: m + 2 * sd, n: v.length };
};

export const MIN_REFS = 3;

/** Mean ± 2 SD of EI at each osmolality (5 mOsm/kg steps). */
export function referenceBand(refs: OsmoscanFile[], from = 100, to = 550, step = 5) {
  const band: { o: number; lo: number; hi: number; mean: number }[] = [];
  for (let o = from; o <= to; o += step) {
    const v = refs.map((r) => interp(r.points, o)).filter((x): x is number => x != null);
    if (v.length >= MIN_REFS) {
      const s = stats(v);
      band.push({ o, lo: Math.max(0, s.lo), hi: s.hi, mean: s.mean });
    }
  }
  return band;
}

export type ParamKey = keyof ReturnType<typeof keyParams>;

/** Mean ± 2 SD for each key parameter across the reference controls. */
export function referenceParams(refs: OsmoscanFile[]) {
  const out: Partial<Record<ParamKey, ReturnType<typeof stats>>> = {};
  const keys: ParamKey[] = ["eiMin", "oMin", "eiMax", "oMax", "eiHyper", "oHyper", "area"];
  for (const k of keys) {
    const v = refs.map((r) => keyParams(r)[k]).filter((x): x is number => x != null);
    if (v.length >= MIN_REFS) out[k] = stats(v);
  }
  return out;
}
