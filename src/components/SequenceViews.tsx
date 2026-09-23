import type { TranscriptInfo } from "@/lib/evidence.functions";
import { threeLetter } from "@/lib/evidence.functions";

const CODON: Record<string, string> = (() => {
  const b = "TCAG", aa = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
  const m: Record<string, string> = {};
  let i = 0;
  for (const x of b) for (const y of b) for (const z of b) m[x + y + z] = aa[i++]!;
  return m;
})();

type SyncProps = {
  focus: number | null;
  variant?: number | undefined;
  extra?: number[] | undefined;
  onSelect: (r: number) => void;
};

/* ---------------- Gene schematic ---------------- */
export function GeneSchematic({ tx, focus, variant, extra, onSelect }: SyncProps & { tx: TranscriptInfo }) {
  if (!tx.exons.length) return null;
  const W = 1000, L = 10, R = 10;
  const intron = Math.min(14, 300 / tx.exons.length);
  const lens = tx.exons.map((e) => e.end - e.start + 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const scale = (W - L - R - intron * (tx.exons.length - 1)) / total;
  let cursor = L;
  const boxes = tx.exons.map((e, i) => {
    const w = Math.max(3, lens[i]! * scale);
    const b = { e, x: cursor, w };
    cursor += w + intron;
    return b;
  });
  const codonExon = (r: number) => {
    const c = 3 * r - 1;
    return boxes.find((b) => b.e.cdsStart != null && c >= b.e.cdsStart && c <= b.e.cdsEnd!);
  };
  // x position of a CDS coordinate inside its exon (transcript orientation)
  const cdsX = (r: number) => {
    const b = codonExon(r);
    if (!b) return null;
    const exonLen = b.e.end - b.e.start + 1;
    const cds = b.e.cdsEnd! - b.e.cdsStart! + 1;
    const utr5 = b.e.rank === boxes.find((x) => x.e.cdsStart != null)?.e.rank ? exonLen - cds : 0;
    const off = utr5 + (3 * r - 1 - b.e.cdsStart!);
    return b.x + (off / exonLen) * b.w;
  };
  const fx = focus ? cdsX(focus) : null;
  const vx = variant ? cdsX(variant) : null;
  const exs = (extra ?? []).map((r) => cdsX(r)).filter((v): v is number => v != null);
  const fe = focus ? codonExon(focus) : undefined;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">Gene · {tx.transcriptId}</span>
        <span>
          chr{tx.chromosome} ({tx.strand === 1 ? "+" : "−"} strand, {tx.assembly}) · {tx.exons.length} exons
          {fe ? ` · residue ${focus} in exon ${fe.e.rank}` : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} 54`} className="w-full cursor-pointer" role="img" aria-label="Exon structure">
        <line x1={L} x2={W - R} y1={24} y2={24} stroke="var(--border)" strokeWidth={1.5} />
        {boxes.map(({ e, x, w }) => {
          const coding = e.cdsStart != null;
          const active = fe?.e.rank === e.rank;
          return (
            <g key={e.rank}
              onClick={(ev) => {
                if (!coding) return;
                const rect = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const px = ((ev.clientX - rect.left) / rect.width) * W;
                const frac = Math.min(1, Math.max(0, (px - x) / w));
                const c = e.cdsStart! + frac * (e.cdsEnd! - e.cdsStart!);
                onSelect(Math.max(1, Math.ceil(c / 3)));
              }}>
              <rect x={x} y={coding ? 14 : 18} width={w} height={coding ? 20 : 12} rx={2}
                fill={coding ? (active ? "var(--primary)" : "var(--chart-2)") : "var(--muted)"}
                stroke="var(--border)" opacity={coding ? 0.9 : 1}>
                <title>{`Exon ${e.rank}${coding ? ` · c.${e.cdsStart}–${e.cdsEnd}` : " · non-coding"}`}</title>
              </rect>
              {w > 18 && (
                <text x={x + w / 2} y={48} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">{e.rank}</text>
              )}
            </g>
          );
        })}
        {vx != null && <path d={`M${vx - 5},4 L${vx + 5},4 L${vx},12 Z`} fill="var(--destructive)" />}
        {exs.map((ex, i) => <path key={i} d={`M${ex - 5},4 L${ex + 5},4 L${ex},12 Z`} fill="var(--destructive)" />)}
        {fx != null && <line x1={fx} x2={fx} y1={10} y2={38} stroke="var(--foreground)" strokeWidth={2} />}
      </svg>
    </div>
  );
}

/* ---------------- Coding sequence + protein strip ---------------- */
export function CodingStrip({
  cds, protein, focus, variant, extra, onSelect,
}: SyncProps & { cds: string; protein: string }) {
  const len = protein.length || Math.floor(cds.length / 3);
  const center = focus ?? variant ?? 1;
  const half = 9;
  const from = Math.max(1, Math.min(center - half, len - 2 * half));
  const to = Math.min(len, from + 2 * half);
  const cols = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">Coding sequence ↔ protein</span>
        <span className="flex gap-1">
          <button type="button" className="rounded border px-2 py-0.5 hover:bg-muted"
            onClick={() => onSelect(Math.max(1, center - 1))} aria-label="Previous residue">‹</button>
          <button type="button" className="rounded border px-2 py-0.5 hover:bg-muted"
            onClick={() => onSelect(Math.min(len, center + 1))} aria-label="Next residue">›</button>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-1 font-mono text-xs">
          {cols.map((r) => {
            const codon = cds.slice(3 * r - 3, 3 * r);
            const aa = protein[r - 1] ?? "";
            const tr = CODON[codon] ?? "?";
            const isF = r === focus, isV = r === variant || !!extra?.includes(r);
            return (
              <button key={r} type="button" onClick={() => onSelect(r)}
                title={`c.${3 * r - 2}_${3 * r} ${codon} → ${threeLetter(aa)}${r}${tr !== aa && codon ? " (CDS/UniProt mismatch)" : ""}`}
                className={`flex w-11 shrink-0 flex-col items-center rounded border py-1 transition-colors ${
                  isF ? "border-primary bg-primary text-primary-foreground"
                    : isV ? "border-destructive bg-destructive/10"
                      : "border-border bg-muted/40 hover:bg-muted"}`}>
                <span className="tracking-tight">{codon || "···"}</span>
                <span className="text-sm font-semibold">{aa}</span>
                <span className={`text-[10px] ${isF ? "" : "text-muted-foreground"}`}>{r}</span>
              </button>
            );
          })}
        </div>
      </div>
      {focus && (
        <p className="mt-1 text-xs text-muted-foreground">
          Residue {focus}: codon c.{3 * focus - 2}_{3 * focus} ({cds.slice(3 * focus - 3, 3 * focus) || "n/a"}) →{" "}
          {threeLetter(protein[focus - 1] ?? "")}
        </p>
      )}
    </div>
  );
}
