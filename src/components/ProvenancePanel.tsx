import { ExternalLink, FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtTime, type ProvRow } from "@/lib/provenance";

export function ProvenancePanel({ rows }: { rows: ProvRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-4 w-4 text-primary" /> Evidence provenance
        </CardTitle>
        <CardDescription>
          Exact source address, retrieval time, record version and every field used — in the
          evaluation, on the slides, or both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.source} className="rounded-md border border-border/70 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.source}</span>
              <Badge variant="outline">{r.kind}</Badge>
              <a
                href={r.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs underline underline-offset-2"
              >
                Open record <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Request URL</dt>
              <dd className="break-all font-mono">{r.sourceUrl || "—"}</dd>
              <dt className="text-muted-foreground">Retrieved</dt>
              <dd>{fmtTime(r.retrievedAt)}</dd>
              <dt className="text-muted-foreground">Record version</dt>
              <dd>{r.recordVersion || "not reported by source"}</dd>
            </dl>
            <table className="mt-2 w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-normal">Field</th>
                  <th className="py-1 pr-2 font-normal">Value</th>
                  <th className="py-1 font-normal">Used in</th>
                </tr>
              </thead>
              <tbody>
                {r.fields.map((f) => (
                  <tr key={f.field} className="border-t border-border/50 align-top">
                    <td className="py-1 pr-2 font-mono">{f.field}</td>
                    <td className="break-all py-1 pr-2">{f.value}</td>
                    <td className="whitespace-nowrap py-1">
                      {f.usedIn.map((u) => (
                        <Badge key={u} variant={u === "slides" ? "default" : "secondary"} className="mr-1">
                          {u}
                        </Badge>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
