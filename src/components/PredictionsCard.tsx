import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { links, predictionQuery as vepQuery } from "@/lib/evidence-queries";
import { predictionQuery, predictionRows, type Tone } from "@/lib/predictions";

const TONE: Record<Tone, string> = {
  damaging: "bg-destructive/10 text-destructive",
  benign: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
};

export function PredictionsCard({
  input,
  transcriptId,
  cds,
}: {
  input: string;
  transcriptId: string;
  cds: string;
}) {
  const q = predictionQuery(input, transcriptId, cds);
  const hgvs = q.ok ? q.hgvs : "";
  const vep = useQuery(vepQuery(hgvs, transcriptId));
  const data = vep.data;
  const rows = data && !data.error ? predictionRows(data) : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-base">Variant effect predictions</CardTitle>
          <CardDescription>
            SIFT · PolyPhen-2 · AlphaMissense · REVEL · CADD · SpliceAI, via Ensembl VEP
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <a
            href={links.vep()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            VEP <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={links.spliceAiLookup()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            SpliceAI Lookup <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-xs leading-relaxed sm:px-6">
        {!q.ok ? (
          <p className="text-muted-foreground">{q.reason}</p>
        ) : vep.isLoading ? (
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running VEP for{" "}
            <span className="font-mono">{hgvs}</span>…
          </p>
        ) : data?.error ? (
          <p className="text-destructive">{data.error}</p>
        ) : data ? (
          <>
            <p className="text-muted-foreground">
              <span className="font-mono text-foreground">{data.hgvsc ?? hgvs}</span>
              {data.hgvsp ? <span className="font-mono"> · {data.hgvsp.split(":")[1]}</span> : null}
              {data.consequenceTerms.length ? (
                <> · {data.consequenceTerms.map((t) => t.replace(/_/g, " ")).join(", ")}</>
              ) : null}
            </p>
            {q.note && <p className="text-muted-foreground">{q.note}</p>}
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Tool</th>
                      <th className="py-1 pr-3 font-medium">Score</th>
                      <th className="py-1 pr-3 font-medium">Call</th>
                      <th className="py-1 font-medium">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.tool} className="border-b last:border-0 align-top">
                        <td className="py-1.5 pr-3 font-medium">{r.tool}</td>
                        <td className="py-1.5 pr-3 font-mono">{r.value}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`rounded px-1.5 py-0.5 ${TONE[r.tone]}`}>{r.call}</span>
                        </td>
                        <td className="py-1.5 text-muted-foreground">{r.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">
                No scores returned for this change. SIFT, PolyPhen, AlphaMissense and REVEL only
                score missense changes; SpliceAI has precomputed scores for SNVs and short indels.
              </p>
            )}
            {data.unavailable.length > 0 && (
              <p className="text-muted-foreground">
                Not available from Ensembl right now: {data.unavailable.join(", ")}.
              </p>
            )}
            <p className="text-muted-foreground">
              In-silico evidence only. Use one calibrated missense predictor (e.g. REVEL) for
              PP3/BP4 — the tools overlap and should not be counted together. Splice predictions
              need RNA studies before they count beyond supporting.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
