import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchHbVar,
  fetchIthaGenes,
  hbvarUrl,
  ithaUrl,
  searchIthaGenes,
} from "@/lib/globin.functions";

export const ithaQuery = (ithaId: string) => ({
  queryKey: ["ithagenes", ithaId],
  queryFn: () => fetchIthaGenes({ data: { ithaId } }),
  staleTime: 1000 * 60 * 60,
});
export const hbvarQuery = (hbvarId: string) => ({
  queryKey: ["hbvar", hbvarId],
  queryFn: () => fetchHbVar({ data: { hbvarId } }),
  staleTime: 1000 * 60 * 60,
});

const GLOBIN = ["HBB", "HBA1", "HBA2", "HBD"] as const;

export function GlobinEvidence({
  gene,
  cdna,
  ithaId,
  onPick,
}: {
  gene: string;
  cdna?: string | undefined;
  ithaId: string;
  onPick: (id: string) => void;
}) {
  const isGlobin = (GLOBIN as readonly string[]).includes(gene);
  const cleanCdna = cdna && /^c\.[\w>_+\-*]+$/.test(cdna) ? cdna : undefined;
  const search = useQuery({
    queryKey: ["ithasearch", gene, cleanCdna],
    queryFn: () => searchIthaGenes({ data: { gene: gene as (typeof GLOBIN)[number], cdna: cleanCdna! } }),
    enabled: isGlobin && !ithaId && Boolean(cleanCdna),
    staleTime: 1000 * 60 * 60,
  });
  const autoId = !ithaId && search.data?.matches[0]?.hgvsName === search.data?.query ? search.data?.matches[0]?.ithaId : undefined;
  const activeId = ithaId || autoId || "";
  const itha = useQuery({ ...ithaQuery(activeId), enabled: Boolean(activeId) });
  const hbvarId = itha.data?.hbvarId ?? "";
  const hbvar = useQuery({ ...hbvarQuery(hbvarId), enabled: Boolean(hbvarId) });

  if (!isGlobin) return null;
  const i = itha.data;
  const h = hbvar.data;
  const others = (search.data?.matches ?? []).filter((m) => m.ithaId !== activeId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Hemoglobin databases — ITHANET &amp; HbVar</CardTitle>
        <CardDescription>
          {activeId
            ? `IthaGenes entry IthaID ${activeId}${autoId ? " (matched on HGVS)" : ""}`
            : cleanCdna
              ? search.isLoading
                ? "Searching IthaGenes for this cDNA change…"
                : "No exact IthaGenes match for this cDNA change"
              : "Enter a cDNA change (c.…) or an IthaID to pull ITHANET and HbVar records"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {others.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Other IthaGenes entries containing this change:</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((m) => (
                <button
                  key={m.ithaId}
                  type="button"
                  onClick={() => onPick(m.ithaId)}
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                  title={m.hgvsName}
                >
                  {m.ithaId} · {m.hbName || m.commonName}
                </button>
              ))}
            </div>
          </div>
        )}

        {search.data?.error && <p className="text-destructive">{search.data.error}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-2">
            <Head title="ITHANET · IthaGenes" href={activeId ? ithaUrl(activeId) : "https://www.ithanet.eu/db/ithagenes"} loading={itha.isLoading} />
            {i?.error ? (
              <p className="text-destructive">{i.error}</p>
            ) : i?.found ? (
              <>
                <p className="font-medium">
                  {i.hbName || i.commonName}
                  {i.synonyms.length ? <span className="text-muted-foreground"> ({i.synonyms.join(", ")})</span> : null}
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <Row k="HGVS" v={i.hgvsName} />
                  <Row k="Common name" v={i.commonName} />
                  <Row k="Protein" v={i.proteinName} />
                  <Row k="Category" v={[i.category, i.thalCategory].filter(Boolean).join(" · ")} />
                  <Row k="Mechanism" v={i.mechanism} />
                  <Row k="Inheritance" v={i.inheritance} />
                  <Row k="Phenotype" v={i.phenotypes.join(", ")} />
                  <Row k="Origin" v={i.origin} />
                  {i.clinvar && <Row k="ClinVar" v={i.clinvar} />}
                  {i.dbsnp && <Row k="dbSNP" v={i.dbsnp} />}
                </dl>
                {i.pathogenicity && <Badge variant="secondary">{i.pathogenicity}</Badge>}
                {i.hematology.length > 0 && (
                  <div>
                    <p className="mt-2 text-xs font-medium">Reported carrier hematology (IthaPhen)</p>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {i.hematology.slice(0, 10).map((s) => (
                          <tr key={s.param} className="border-b last:border-0">
                            <td className="py-0.5 pr-2">{s.param}</td>
                            <td className="py-0.5 pr-2 tabular-nums">
                              {s.mean}
                              {s.sd != null ? ` ± ${s.sd}` : ""} {s.unit}
                            </td>
                            <td className="py-0.5 text-muted-foreground">n={s.n}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {i.hplc.length > 0 && (
                  <div>
                    <p className="mt-2 text-xs font-medium">HPLC</p>
                    <ul className="text-xs text-muted-foreground">
                      {i.hplc.slice(0, 4).map((p, k) => (
                        <li key={k}>
                          {p.instrument} {p.method}: {p.areaPct ?? "—"}% at {p.retTime ?? "—"} min{p.comment ? ` — ${p.comment}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : !activeId ? (
              <p className="text-muted-foreground">No entry selected.</p>
            ) : null}
          </section>

          <section className="space-y-2">
            <Head title="HbVar" href={hbvarId ? hbvarUrl(hbvarId) : "https://globin.bx.psu.edu/hbvar/menu.html"} loading={hbvar.isLoading} />
            {h?.error ? (
              <p className="text-destructive">{h.error}</p>
            ) : h?.found ? (
              <>
                <p className="font-medium">
                  {h.name} <span className="text-muted-foreground">· {h.proteinChange}</span>
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <Row k="HbVar ID" v={h.hbvarId} />
                  <Row k="HGVS" v={h.hgvsName} />
                  <Row k="Category" v={h.category} />
                  <Row k="Location" v={h.location} />
                  <Row k="Stability" v={h.stability} />
                  <Row k="Function" v={h.functional.join(" · ")} />
                  <Row k="Ethnicity" v={h.ethnicity.join(", ")} />
                </dl>
                {h.clinical.length > 0 && (
                  <div>
                    <p className="mt-2 text-xs font-medium">Clinical presentation</p>
                    <p className="text-xs text-muted-foreground">{h.clinical.join(" · ")}</p>
                  </div>
                )}
                {h.occurrence && <p className="text-xs text-muted-foreground">{h.occurrence}</p>}
              </>
            ) : activeId && i?.found && !hbvarId ? (
              <p className="text-muted-foreground">ITHANET lists no HbVar link for this entry.</p>
            ) : (
              <p className="text-muted-foreground">Loaded via the HbVar link in the ITHANET record.</p>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function Head({ title, href, loading }: { title: string; href: string; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} {loading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
      </span>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
        Open <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
