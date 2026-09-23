import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TranscriptInfo, UniProtInfo } from "@/lib/evidence.functions";
import { CodingStrip, GeneSchematic } from "@/components/SequenceViews";

const TYPE_COLOR: Record<string, string> = {
  Domain: "var(--chart-1)",
  Region: "var(--chart-2)",
  Transmembrane: "var(--chart-3)",
  Motif: "var(--chart-4)",
  "Binding site": "var(--chart-5)",
  "Active site": "var(--destructive)",
  Site: "var(--chart-4)",
  "Disulfide bond": "var(--muted-foreground)",
};
const LANES = ["Domain", "Region", "Transmembrane", "Motif", "Binding site", "Active site", "Site", "Disulfide bond"];

export function ProteinMap({
  info,
  residue,
  extra,
  altAa,
  geneSymbol,
  tx,
  focus,
  onSelect,
  onReset,
}: {
  tx?: TranscriptInfo | undefined;
  focus: number | null;
  onSelect: (r: number) => void;
  onReset: () => void;
  info?: UniProtInfo | undefined;
  residue?: number | undefined;
  extra?: number[] | undefined;
  altAa?: string | null | undefined;
  geneSymbol: string;
}) {
  const len = info?.length ?? 0;
  if (!len) return null;
  const W = 1000, L = 20, R = 20, inner = W - L - R;
  const x = (p: number) => L + ((p - 1) / Math.max(1, len - 1)) * inner;
  const lanes = LANES.filter((t) => info!.features.some((f) => f.type === t));
  const laneH = 18, top = 58;
  const H = top + lanes.length * laneH + 34;
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(1 + (i * (len - 1)) / 5));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Gene, coding sequence &amp; protein</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="focus-pos" className="text-muted-foreground">Position</label>
            <input id="focus-pos" type="number" min={1} max={len} value={focus ?? ""}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= len) onSelect(v); }}
              className="h-7 w-20 rounded border bg-background px-2" />
            {residue && focus !== residue && (
              <button type="button" onClick={onReset} className="rounded border px-2 py-1 hover:bg-muted">
                Back to variant
              </button>
            )}
          </div>
        </div>
        <CardDescription>
          {geneSymbol} · {info!.proteinName} · {len} aa — click any view to move the linked position; the 3D model follows
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tx?.exons.length ? (
          <GeneSchematic tx={tx} focus={focus} variant={residue} extra={extra} onSelect={onSelect} />
        ) : tx?.error ? (
          <p className="text-xs text-muted-foreground">Gene structure unavailable: {tx.error}</p>
        ) : null}
        {tx?.cds && info?.length && Math.abs(tx.cds.length / 3 - 1 - info.length) > 0 && (
          <p className="text-xs text-destructive">
            Ensembl canonical CDS ({tx.cds.length / 3 - 1} aa) differs from UniProt ({info.length} aa) — codons may not align.
          </p>
        )}
        <p className="-mb-3 text-xs uppercase tracking-wide text-muted-foreground">Protein features</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" role="img"
          onClick={(ev) => {
            const rect = ev.currentTarget.getBoundingClientRect();
            const px = ((ev.clientX - rect.left) / rect.width) * W;
            const r = Math.round(1 + ((px - L) / inner) * (len - 1));
            onSelect(Math.min(len, Math.max(1, r)));
          }} aria-label="Protein feature map">
          {/* backbone */}
          <rect x={L} y={30} width={inner} height={14} rx={7} fill="var(--muted)" stroke="var(--border)" />
          {info!.features
            .filter((f) => f.type === "Domain" || f.type === "Transmembrane" || f.type === "Region")
            .map((f, i) => (
              <rect key={i} x={x(f.start)} y={30} width={Math.max(2, x(f.end) - x(f.start))} height={14}
                fill={TYPE_COLOR[f.type]} opacity={0.55}>
                <title>{`${f.type}: ${f.description || ""} ${f.start}–${f.end}`}</title>
              </rect>
            ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={20} fontSize={11} textAnchor="middle" fill="var(--muted-foreground)">{t}</text>
          ))}
          {lanes.map((t, li) => {
            const y = top + li * laneH;
            return (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y + 7} y2={y + 7} stroke="var(--border)" strokeDasharray="2 4" />
                {info!.features.filter((f) => f.type === t).map((f, i) => (
                  <rect key={i} x={x(f.start) - (f.start === f.end ? 1.5 : 0)} y={y + 1}
                    width={Math.max(3, x(f.end) - x(f.start))} height={12} rx={2}
                    fill={TYPE_COLOR[t] ?? "var(--chart-2)"}
                    stroke={f.covers ? "var(--foreground)" : "none"} strokeWidth={f.covers ? 1.5 : 0}>
                    <title>{`${t}${f.description ? `: ${f.description}` : ""} (${f.start}–${f.end})`}</title>
                  </rect>
                ))}
              </g>
            );
          })}
          {focus && focus !== residue && (
            <line x1={x(focus)} x2={x(focus)} y1={24} y2={H - 22} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="4 3" />
          )}
          {residue && residue <= len && (
            <g>
              <line x1={x(residue)} x2={x(residue)} y1={24} y2={H - 22} stroke="var(--primary)" strokeWidth={2} />
              <circle cx={x(residue)} cy={37} r={6} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
              <text x={Math.min(W - 60, Math.max(60, x(residue)))} y={H - 6} fontSize={12} fontWeight={600}
                textAnchor="middle" fill="var(--primary)">
                {`${info!.residueAa ?? "?"}${residue}${altAa ?? ""}`}
              </text>
            </g>
          )}
          {(extra ?? []).filter((r) => r <= len).map((r) => (
            <g key={r}>
              <line x1={x(r)} x2={x(r)} y1={24} y2={H - 22} stroke="var(--primary)" strokeWidth={2} />
              <circle cx={x(r)} cy={37} r={6} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
              <text x={Math.min(W - 60, Math.max(60, x(r)))} y={H - 6} fontSize={12} fontWeight={600}
                textAnchor="middle" fill="var(--primary)">
                {`${info!.sequence?.[r - 1] ?? "?"}${r}`}
              </text>
            </g>
          ))}
        </svg>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {lanes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_COLOR[t] }} /> {t}
            </span>
          ))}
          {residue && (
            <span className="inline-flex items-center gap-1.5 text-primary">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Variant residue (outlined features overlap it)
            </span>
          )}
        </div>

        {info!.sequence && (
          <CodingStrip cds={tx?.cds ?? ""} protein={info!.sequence} focus={focus} variant={residue} extra={extra} onSelect={onSelect} />
        )}
      </CardContent>
    </Card>
  );
}
