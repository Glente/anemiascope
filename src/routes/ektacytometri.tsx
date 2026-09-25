import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, Eraser, Eye, EyeOff, Lock, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { keyParams, parseOsmoscan, type CsvFormat, type OsmoscanFile } from "@/lib/osmoscan";

export const Route = createFileRoute("/ektacytometri")({
  head: () => ({
    meta: [
      { title: "Ektacytometry curves — Anemia Variant Board" },
      {
        name: "description",
        content: "Plot Osmoscan ektacytometry curves for patient and controls, locally in your browser.",
      },
      { property: "og:title", content: "Ektacytometry curves — Anemia Variant Board" },
      {
        property: "og:description",
        content: "Osmotic gradient ektacytometry plots; files never leave the browser tab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EktaPage,
});

// Fixed hex colours so exported images look identical outside the app.
const PALETTE = ["#1d4ed8", "#dc2626", "#15803d", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563", "#65a30d", "#9f1239"];

type Slot = { id: number; file: OsmoscanFile; legend: string; color: string; visible: boolean; format: CsvFormat };
let nextId = 1;

function EktaPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [lines, setLines] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [refId, setRefId] = useState<number | null>(null);
  const [tab, setTab] = useState<"plot" | "compare" | "info" | "values">("plot");
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasData = slots.length > 0;
  const refSlot = slots.find((s) => s.id === refId) ?? slots[0];

  useEffect(() => {
    if (!hasData) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasData]);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const added: Slot[] = [];
    for (const f of Array.from(list)) {
      const text = await f.text(); // read locally — never uploaded
      const res = parseOsmoscan(text, f.name);
      if (!res) { toast.error(`Could not read ${f.name} as an Osmoscan export.`); continue; }
      added.push({ id: nextId++, file: res.file, format: res.format, legend: "", color: "", visible: true });
    }
    setSlots((prev) => {
      const all = [...prev, ...added];
      return all.map((s, i) => ({
        ...s,
        color: s.color || PALETTE[i % PALETTE.length]!,
        legend: s.legend || (i === 0 ? "Patient" : `Control ${i}`),
      }));
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const update = (id: number, patch: Partial<Slot>) => setSlots((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: number) => setSlots((p) => p.filter((s) => s.id !== id));
  const move = (i: number, d: number) => setSlots((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j]!, n[i]!]; return n;
  });

  const clearAll = () => {
    setSlots([]); setRefId(null);
    toast.success("Ektacytometry files cleared from this tab.");
  };

  const baseName = refSlot?.file.sampleName.replace(/[^\w-]+/g, "_") || "osmoscan";

  const exportImage = async (kind: "png" | "svg") => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml" });
    if (kind === "svg") return download(svgBlob, `${baseName}.svg`);
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const c = document.createElement("canvas");
      c.width = W * scale; c.height = H * scale;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => b && download(b, `${baseName}.png`), "image/png");
    };
    img.src = url;
  };

  const exportCsv = () => {
    const head = ["Description", "Sample", "Date", "EImin", "Omin", "EImax", "Omax", "EIhyper", "Ohyper", "Area"];
    const rows = slots.map((s) => { const k = keyParams(s.file); return [s.legend, s.file.sampleName, s.file.date, k.eiMin, k.oMin, k.eiMax, k.oMax, k.eiHyper, k.oHyper, k.area]; });
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    download(new Blob([csv], { type: "text/csv" }), `${baseName}_parameters.csv`);
  };

  return (
    <AppShell>
      <div className="space-y-4 sm:space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ektacytometry: Osmoscan</h1>
          <p className="text-sm text-muted-foreground">
            Upload as many Osmoscan CSV exports as you like to compare patient and controls. CSV format is detected automatically.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Files ({slots.length})</CardTitle>
              <CardDescription>Read inside this browser tab only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                className={`flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed px-3 py-5 text-sm transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Drop CSV files or click to choose</span>
                <span className="text-xs text-muted-foreground">Several files at once are fine</span>
              </button>
              <input ref={inputRef} type="file" multiple accept=".csv,text/csv,text/plain" className="hidden"
                aria-label="Choose Osmoscan CSV files" onChange={(e) => addFiles(e.target.files)} />

              {slots.map((s, i) => (
                <div key={s.id} className="space-y-1.5 rounded-md border border-border/60 p-2.5">
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.color} onChange={(e) => update(s.id, { color: e.target.value })}
                      aria-label={`Colour for ${s.legend}`} className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
                    <Input className="h-8" aria-label={`Description file ${i + 1}`} value={s.legend}
                      onChange={(e) => update(s.id, { legend: e.target.value })} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title={s.visible ? "Hide curve" : "Show curve"}
                      onClick={() => update(s.id, { visible: !s.visible })}>
                      {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="Remove" onClick={() => remove(s.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <p className="min-w-0 flex-1 truncate" title={s.file.fileName}>
                      {s.file.sampleName}{s.file.date && ` · ${s.file.date.replace(/^on\s*/, "")}`} · {s.file.points.length} pts · {s.format}
                    </p>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Move down" disabled={i === slots.length - 1} onClick={() => move(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}

              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} /> Help lines
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={annotations} onChange={(e) => setAnnotations(e.target.checked)} /> Annotations
                </label>
                {slots.length > 1 && (
                  <label className="flex items-center gap-2">
                    <span className="text-muted-foreground">Annotate</span>
                    <select className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                      value={refSlot?.id} onChange={(e) => setRefId(Number(e.target.value))}>
                      {slots.map((s) => <option key={s.id} value={s.id}>{s.legend || s.file.sampleName}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {hasData && (
                <Button variant="outline" className="w-full" onClick={clearAll}>
                  <Eraser className="mr-1.5 h-4 w-4" /> Clear all files
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-3">
              {(["plot", "compare", "info", "values"] as const).map((t) => (
                <Button key={t} size="sm" variant={tab === t ? "default" : "ghost"} onClick={() => setTab(t)}>
                  {{ plot: "Plot", compare: "Compare", info: "Table: Info", values: "Table: Values" }[t]}
                </Button>
              ))}
              {hasData && (
                <div className="ml-auto flex gap-2">
                  {tab === "plot" && (<>
                    <Button size="sm" variant="outline" onClick={() => exportImage("png")}><Download className="mr-1 h-4 w-4" /> PNG</Button>
                    <Button size="sm" variant="outline" onClick={() => exportImage("svg")}><Download className="mr-1 h-4 w-4" /> SVG</Button>
                  </>)}
                  {tab === "compare" && (
                    <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!hasData ? (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <Upload className="h-6 w-6" /> Choose one or more CSV files to draw the curves.
                </div>
              ) : tab === "plot" ? (
                <div className="overflow-x-auto">
                  <Chart ref={svgRef} slots={slots.filter((s) => s.visible)} refSlot={refSlot} lines={lines} annotations={annotations} />
                </div>
              ) : tab === "compare" ? (
                <CompareTable slots={slots} refSlot={refSlot} />
              ) : tab === "info" ? (
                <InfoTables slots={slots} />
              ) : (
                <ValueTables slots={slots} />
              )}
            </CardContent>
          </Card>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Files are read directly by your browser and kept only in this tab's memory. They are never
          uploaded, stored or sent anywhere, and disappear when you close or reload the tab.
          Based on the Osmoscan Shiny app by Andreas Glenthøj, Danish Center for Hemoglobinopathies.
        </p>
      </div>
    </AppShell>
  );
}

function CompareTable({ slots, refSlot }: { slots: Slot[]; refSlot?: Slot | undefined }) {
  const cols = [["eiMin", "EImin"], ["oMin", "Omin"], ["eiMax", "EImax"], ["oMax", "Omax"], ["eiHyper", "EIhyper"], ["oHyper", "Ohyper"], ["area", "Area"]] as const;
  const ref = refSlot ? keyParams(refSlot.file) : null;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="border-b">
            <th className="px-2 py-1 text-left font-medium">Curve</th>
            {cols.map(([, l]) => <th key={l} className="px-2 py-1 text-right font-medium">{l}</th>)}
          </tr></thead>
          <tbody>{slots.map((s) => {
            const k = keyParams(s.file);
            return (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-2 py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.legend}</td>
                {cols.map(([key]) => {
                  const v = k[key]; const r = ref?.[key];
                  const diff = s !== refSlot && v != null && r != null && r !== 0 ? ((v - r) / r) * 100 : null;
                  return (
                    <td key={key} className="px-2 py-1.5 text-right">
                      {v ?? "—"}
                      {diff != null && <span className="ml-1 text-xs text-muted-foreground">({diff > 0 ? "+" : ""}{diff.toFixed(0)}%)</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {slots.length > 1 && <p className="text-xs text-muted-foreground">Percentages are relative to {refSlot?.legend}.</p>}
    </div>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const W = 800, H = 520;
const M = { l: 64, r: 150, t: 20, b: 52 };
const X0 = 100, X1 = 550, Y0 = 0, Y1 = 0.65;
const sx = (o: number) => M.l + ((o - X0) / (X1 - X0)) * (W - M.l - M.r);
const sy = (e: number) => H - M.b - ((e - Y0) / (Y1 - Y0)) * (H - M.t - M.b);

function Chart({ slots, refSlot, lines, annotations, ref }: {
  slots: Slot[]; refSlot?: Slot | undefined; lines: boolean; annotations: boolean; ref: React.Ref<SVGSVGElement>;
}) {
  const axis = "#374151", grid = "#e5e7eb";
  const main = refSlot && slots.includes(refSlot) ? refSlot.file : undefined;
  const mc = refSlot?.color ?? "#1d4ed8";
  const kp = main ? keyParams(main) : null;
  const guides = kp
    ? ([
        ["EImin", "Omin", kp.eiMin, kp.oMin, 55],
        ["EImax", "Omax", kp.eiMax, kp.oMax, 90],
        ["EIhyper", "Ohyper", kp.eiHyper, kp.oHyper, 60],
      ] as const).filter(([, , e, o]) => e != null && o != null)
    : [];

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full"
      fontFamily="Arial, sans-serif" role="img" aria-label="Ektacytometry curve">
      <rect width={W} height={H} fill="#ffffff" />
      {[100, 200, 300, 400, 500].map((o) => (
        <g key={o}>
          <line x1={sx(o)} x2={sx(o)} y1={sy(Y0)} y2={sy(Y1)} stroke={grid} />
          <text x={sx(o)} y={sy(Y0) + 18} fontSize="12" textAnchor="middle" fill={axis}>{o}</text>
        </g>
      ))}
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((e) => (
        <g key={e}>
          <line x1={sx(X0)} x2={sx(X1)} y1={sy(e)} y2={sy(e)} stroke={grid} />
          <text x={sx(X0) - 8} y={sy(e) + 4} fontSize="12" textAnchor="end" fill={axis}>{e.toFixed(1)}</text>
        </g>
      ))}
      <line x1={sx(X0)} x2={sx(X1)} y1={sy(Y0)} y2={sy(Y0)} stroke={axis} />
      <line x1={sx(X0)} x2={sx(X0)} y1={sy(Y0)} y2={sy(Y1)} stroke={axis} />
      <text x={(sx(X0) + sx(X1)) / 2} y={H - 12} fontSize="13" textAnchor="middle" fill={axis}>Osmolality (mOsm/kg)</text>
      <text transform={`translate(18 ${(sy(Y0) + sy(Y1)) / 2}) rotate(-90)`} fontSize="13" textAnchor="middle" fill={axis}>Elongation Index (EI)</text>

      <clipPath id="plot-area"><rect x={sx(X0)} y={sy(Y1)} width={sx(X1) - sx(X0)} height={sy(Y0) - sy(Y1)} /></clipPath>
      <g clipPath="url(#plot-area)">
        {slots.map((s) => (
          <polyline key={s.id} fill="none" stroke={s.color} strokeWidth="2"
            points={s.file.points.map((p) => `${sx(p.o)},${sy(p.ei)}`).join(" ")} />
        ))}
        {lines && guides.map(([k, , e, o]) => (
          <path key={k} d={`M${sx(X0)},${sy(e!)} H${sx(o!)} V${sy(Y0)}`} fill="none" stroke={mc} strokeDasharray="3 3" strokeWidth="1" />
        ))}
      </g>

      {annotations && kp && (
        <g fontSize="11" fill={axis}>
          {guides.map(([ek, ok, e, o, dx]) => (
            <g key={ek}>
              <circle cx={sx(o!)} cy={sy(e!)} r="3" fill={mc} />
              <text x={sx(o!) + dx * 0.4} y={sy(e!) - 6}>{ek} = {e}</text>
              <text x={sx(o!) + 4} y={sy(e!) + 16}>{ok} = {o}</text>
            </g>
          ))}
          {kp.area != null && kp.oMax != null && kp.eiMax != null && (
            <text x={sx(kp.oMax)} y={sy(kp.eiMax * 0.4)} textAnchor="middle">Area = {kp.area}</text>
          )}
        </g>
      )}

      {slots.map((s, i) => (
        <g key={s.id} transform={`translate(${W - M.r + 16} ${M.t + 10 + i * 22})`}>
          <line x1="0" x2="22" y1="0" y2="0" stroke={s.color} strokeWidth="2.5" />
          <text x="28" y="4" fontSize="12" fill={axis}>{s.legend || `File ${i + 1}`}</text>
        </g>
      ))}
    </svg>
  );
}

function InfoTables({ slots }: { slots: Slot[] }) {
  return (
    <div className="space-y-6">
      {slots.map((s) => (
        <div key={s.id} className="space-y-2">
          <h2 className="font-semibold" style={{ color: s.color }}>{s.file.sampleName}</h2>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr>{s.file.params.map((p) => <th key={p.parameter} className="border-b px-3 py-1 text-left font-medium">{p.parameter}</th>)}</tr></thead>
              <tbody><tr>{s.file.params.map((p) => <td key={p.parameter} className="px-3 py-1 tabular-nums">{p.value ?? "—"}</td>)}</tr></tbody>
            </table>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">All file metadata</summary>
            <table className="mt-2">
              <tbody>{s.file.info.map((r, j) => (
                <tr key={j}><td className="pr-4">{r.parameter}</td><td>{r.value}</td></tr>
              ))}</tbody>
            </table>
          </details>
        </div>
      ))}
    </div>
  );
}

function ValueTables({ slots }: { slots: Slot[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {slots.map((s) => (
        <div key={s.id} className="max-h-[480px] overflow-auto rounded border">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr><th colSpan={2} className="px-2 py-1 text-left" style={{ color: s.color }}>{s.legend}</th></tr>
              <tr><th className="px-2 text-left font-medium">O</th><th className="px-2 text-left font-medium">EI</th></tr>
            </thead>
            <tbody>{s.file.points.map((p, j) => (
              <tr key={j} className="border-t"><td className="px-2">{p.o}</td><td className="px-2">{p.ei}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
