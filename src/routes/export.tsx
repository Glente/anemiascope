import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Eraser, Image as ImageIcon, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { buildProvenance } from "@/lib/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GENES, getGene } from "@/data/genes";
import { caseStore, LAB_FIELDS, useCase } from "@/lib/case-store";
import { alphaFoldQuery, clinVarQuery, omimQuery, uniProtQuery } from "@/lib/evidence-queries";
import { buildDeck } from "@/lib/pptx-export";
import { describeVariant, parseVariant } from "@/lib/variant";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Board slides — Anemia Variant Board" },
      {
        name: "description",
        content:
          "Build a PowerPoint deck for the anemia multidisciplinary board: case, labs, variant impact, AlphaFold view and database evidence.",
      },
      { property: "og:title", content: "Board slides — Anemia Variant Board" },
      {
        property: "og:description",
        content: "One-click .pptx export for anemia multidisciplinary board presentations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const state = useCase();
  const gene = getGene(state.geneSymbol) ?? GENES[0]!;
  const parsed = useMemo(() => parseVariant(state.variantInput), [state.variantInput]);
  const [busy, setBusy] = useState(false);

  const uniprot = useQuery(uniProtQuery(gene.uniprot, parsed.residue));
  const alphafold = useQuery(alphaFoldQuery(gene.uniprot, parsed.residue));
  const clinvar = useQuery(clinVarQuery(gene.symbol, parsed.protein ?? parsed.cdna ?? undefined));

  const primaryMim = gene.phenotypeMim?.[0]?.mim ?? gene.mim;
  const omim = useQuery({ ...omimQuery(primaryMim ?? ""), enabled: Boolean(primaryMim) });
  const provenance = buildProvenance({
    gene, state, parsed,
    uniprot: uniprot.data, alphafold: alphafold.data, clinvar: clinvar.data, omim: omim.data,
  });

  const filledLabs = LAB_FIELDS.filter((f) => (state.labs[f.key] ?? "").trim() !== "");

  const onExport = async () => {
    setBusy(true);
    try {
      await buildDeck({
        state,
        gene,
        uniprot: uniprot.data,
        alphafold: alphafold.data,
        clinvar: clinvar.data,
        provenance,
      });
      toast.success("PowerPoint downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the slides.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board slides</h1>
          <p className="text-sm text-muted-foreground">
            Seven slides: title, case summary, hematology, variant impact, AlphaFold view and
            database evidence, plus a provenance slide.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What goes on the slides</CardTitle>
            <CardDescription>Empty fields are skipped automatically</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Gene / variant">
              {gene.symbol} {state.variantInput ? describeVariant(parsed) : "—"}{" "}
              {state.zygosity && <Badge variant="outline">{state.zygosity}</Badge>}
            </Row>
            <Row label="Case label">{state.caseLabel || <Muted>not set</Muted>}</Row>
            <Row label="Clinical details">
              {[state.ageBand, state.sex, state.presentation].filter(Boolean).join(" · ") || (
                <Muted>none entered</Muted>
              )}
            </Row>
            <Row label="Lab values">
              {filledLabs.length ? `${filledLabs.length} values` : <Muted>none entered</Muted>}
            </Row>
            <Row label="3D view">
              {state.structureImage ? (
                <span className="inline-flex items-center gap-2 text-primary">
                  <ImageIcon className="h-4 w-4" /> captured
                </span>
              ) : (
                <Muted>
                  not captured — go to the{" "}
                  <Link to="/" className="underline underline-offset-2">
                    workspace
                  </Link>{" "}
                  and press “Capture for slides”
                </Muted>
              )}
            </Row>
            <Row label="Evidence">
              {clinvar.data?.hits.length
                ? `${clinvar.data.hits.length} ClinVar record(s)`
                : "ClinVar: no match"}{" "}
              · UniProt {uniprot.data?.length ?? "…"} aa · AlphaFold{" "}
              {alphafold.data?.available ? "model found" : "—"}
            </Row>
          </CardContent>
        </Card>

        {state.structureImage && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Captured structure view</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={state.structureImage}
                alt="Captured AlphaFold view"
                className="mx-auto max-h-72 rounded-md border"
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {state.structureCaption}
              </p>
            </CardContent>
          </Card>
        )}

        <ProvenancePanel rows={provenance} />

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onExport} disabled={busy}>
            <Download className="mr-2 h-4 w-4" />
            {busy ? "Building…" : "Download PowerPoint"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              caseStore.clearPatient();
              toast.success("Case and lab fields cleared.");
            }}
          >
            <Eraser className="mr-1.5 h-4 w-4" />
            Clear all patient data
          </Button>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The file is assembled inside your browser and saved straight to your computer — it is
          never uploaded.
        </p>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 pb-2 last:border-0">
      <span className="w-36 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);
