import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Eraser, Lock, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
const COLORS = ["#1d4ed8", "#dc2626", "#15803d"];
const DEFAULT_LEGENDS = ["Patient", "Control", "Control 2"];

type Slot = { file: OsmoscanFile | null; legend: string };

function EktaPage() {
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_LEGENDS.map((legend) => ({ file: null, legend })));
  const [raw, setRaw] = useState<(string | null)[]>([null, null, null]);
  const [fmt, setFmt] = useState<CsvFormat>("EU");
  const [lines, setLines] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [tab, setTab] = useState<"plot" | "info" | "values">("plot");
  const svgRef = useRef<SVGSVGElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const hasData = slots.some((s) => s.file);

  // Warn before leaving while files are loaded in memory.
  useEffect(() => {
    if (!hasData) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasData]);

  // Re-parse when the CSV style changes.
  useEffect(() => {
    setSlots((prev) => prev.map((s, i) => {
      const text = raw[i];
      return text && s.file ? { ...s, file: parseOsmoscan(text, fmt, s.file.fileName) ?? s.file } : s;
    }));
  }, [fmt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (i: number, f: File | undefined) => {
    if (!f) return;
    const text = await f.text(); // read locally — never uploaded
    const parsed = parseOsmoscan(text, fmt, f.name);
    if (!parsed) {
      toast.error(`Could not read ${f.name} as an Osmoscan export.`);
      return;
    }
    setRaw((r) => r.map((x, j) => (j === i ? text : x)));
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, file: parsed } : x)));
  };

  const clearAll = () => {
    setSlots(DEFAULT_LEGENDS.map((legend) => ({ file: null, legend })));
    setRaw([null, null, null]);
    inputs.current.forEach((el) => { if (el) el.value = ""; });
    toast.success("Ektacytometry files cleared from this tab.");
  };

  const baseName = slots[0]?.file?.sampleName.replace(/[^\w-]+/g, "_") || "osmoscan";

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

  return (
    <AppShell>
      <div className="space-y-4 sm:space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ektacytometry: Osmoscan</h1>
          <p className="text-sm text-muted-foreground">
            Upload up to three Osmoscan CSV exports to compare patient and controls.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Files</CardTitle>
              <CardDescription>Read inside this browser tab only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {slots.map((s, i) => (
                <div key={i} className="space-y-1.5 border-b border-border/60 pb-3 last:border-0">
                  <Label htmlFor={`ekta-file-${i}`} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                    File {i + 1}
                  </Label>
                  <Input
                    id={`ekta-file-${i}`}
                    ref={(el) => { inputs.current[i] = el; }}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={(e) => onFile(i, e.target.files?.[0])}
                  />
                  <Input
                    aria-label={`Description file ${i + 1}`}
                    value={s.legend}
                    onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, legend: e.target.value } : x)))}
                  />
                  {s.file && (
                    <p className="truncate text-xs text-muted-foreground">
                      {s.file.sampleName} {s.file.date && `· ${s.file.date}`} · {s.file.points.length} points
                    </p>
                  )}
                </div>
              ))}

              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} /> Help lines
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={annotations} onChange={(e) => setAnnotations(e.target.checked)} /> Annotations
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">CSV format</span>
                  {(["EU", "US"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1">
                      <input type="radio" name="fmt" checked={fmt === f} onChange={() => setFmt(f)} />
                      {f === "EU" ? "EU" : "US/UK"}
                    </label>
                  ))}
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={clearAll}>
                <Eraser className="mr-1.5 h-4 w-4" /> Clear all files
              </Button>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-3">
              {(["plot", "info", "values"] as const).map((t) => (
                <Button key={t} size="sm" variant={tab === t ? "default" : "ghost"} onClick={() => setTab(t)}>
                  {t === "plot" ? "Plot" : t === "info" ? "Table: Info" : "Table: Values"}
                </Button>
              ))}
              {tab === "plot" && hasData && (
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportImage("png")}>
                    <Download className="mr-1 h-4 w-4" /> PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportImage("svg")}>
                    <Download className="mr-1 h-4 w-4" /> SVG
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!hasData ? (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <Upload className="h-6 w-6" /> Choose a CSV file to draw the curve.
                </div>
              ) : tab === "plot" ? (
                <div className="overflow-x-auto">
                  <Chart ref={svgRef} slots={slots} lines={lines} annotations={annotations} />
                </div>
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

function Chart({ slots, lines, annotations, ref }: {
  slots: Slot[]; lines: boolean; annotations: boolean; ref: React.Ref<SVGSVGElement>;
}) {
  const axis = "#374151", grid = "#e5e7eb";
  const main = slots[0]?.file;
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
        {slots.map((s, i) => s.file && (
          <polyline key={i} fill="none" stroke={COLORS[i]} strokeWidth="2"
            points={s.file.points.map((p) => `${sx(p.o)},${sy(p.ei)}`).join(" ")} />
        ))}
        {lines && guides.map(([k, , e, o]) => (
          <path key={k} d={`M${sx(X0)},${sy(e!)} H${sx(o!)} V${sy(Y0)}`} fill="none" stroke={COLORS[0]} strokeDasharray="3 3" strokeWidth="1" />
        ))}
      </g>

      {annotations && kp && (
        <g fontSize="11" fill={axis}>
          {guides.map(([ek, ok, e, o, dx]) => (
            <g key={ek}>
              <circle cx={sx(o!)} cy={sy(e!)} r="3" fill={COLORS[0]} />
              <text x={sx(o!) + dx * 0.4} y={sy(e!) - 6}>{ek} = {e}</text>
              <text x={sx(o!) + 4} y={sy(e!) + 16}>{ok} = {o}</text>
            </g>
          ))}
          {kp.area != null && kp.oMax != null && kp.eiMax != null && (
            <text x={sx(kp.oMax)} y={sy(kp.eiMax * 0.4)} textAnchor="middle">Area = {kp.area}</text>
          )}
        </g>
      )}

      {slots.map((s, i) => s.file && (
        <g key={i} transform={`translate(${W - M.r + 16} ${M.t + 10 + i * 22})`}>
          <line x1="0" x2="22" y1="0" y2="0" stroke={COLORS[i]} strokeWidth="2.5" />
          <text x="28" y="4" fontSize="12" fill={axis}>{s.legend || `File ${i + 1}`}</text>
        </g>
      ))}
    </svg>
  );
}

function InfoTables({ slots }: { slots: Slot[] }) {
  return (
    <div className="space-y-6">
      {slots.map((s, i) => s.file && (
        <div key={i} className="space-y-2">
          <h2 className="font-semibold" style={{ color: COLORS[i] }}>{s.file.sampleName}</h2>
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
    <div className="grid gap-4 sm:grid-cols-3">
      {slots.map((s, i) => s.file && (
        <div key={i} className="max-h-[480px] overflow-auto rounded border">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr><th colSpan={2} className="px-2 py-1 text-left" style={{ color: COLORS[i] }}>{s.legend}</th></tr>
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
