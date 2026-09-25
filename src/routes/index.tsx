import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobinEvidence, ithaQuery } from "@/components/GlobinEvidence";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  ExternalLink,
  Info,
  Loader2,
  Microscope,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { GeneSearch } from "@/components/GeneSearch";
import { IthaSearch } from "@/components/IthaSearch";
import { ProteinMap } from "@/components/ProteinMap";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { buildProvenance } from "@/lib/provenance";
import { selectionStore, useSelectedResidue } from "@/lib/selection-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CATEGORY_LABEL, GENES, getGene } from "@/data/genes";
import { caseStore, useCase } from "@/lib/case-store";
import {
  alphaFoldQuery,
  clinVarQuery,
  links,
  omimQuery,
  transcriptQuery,
  uniProtQuery,
} from "@/lib/evidence-queries";
import { describeVariant, parseVariant, substitutionContext } from "@/lib/variant";

const StructureViewer = lazy(() => import("@/components/StructureViewer"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Variant workspace — Anemiascope" },
      {
        name: "description",
        content:
          "Evaluate red cell membrane, enzyme and hemoglobin variants with UniProt, ClinVar, gnomAD, OMIM and Orphanet evidence plus an AlphaFold 3D view.",
      },
      { property: "og:title", content: "Variant workspace — Anemia Variant Board" },
      {
        property: "og:description",
        content:
          "Gene panel, variant parsing, database evidence and AlphaFold structure view for hereditary anemia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const state = useCase();
  const gene = getGene(state.geneSymbol) ?? GENES[0]!;
  const parsed = useMemo(() => parseVariant(state.variantInput), [state.variantInput]);
  const residue = parsed.residue;
  const [colorTheme, setColorTheme] = useState("chain-id");
  const selected = useSelectedResidue();
  useEffect(() => selectionStore.set(null), [residue, gene.symbol]);
  const focus = selected ?? residue ?? null;
  const transcript = useQuery(transcriptQuery(gene.symbol));
  const snapshotRef = useRef<(() => Promise<string | null>) | null>(null);

  const uniprot = useQuery(uniProtQuery(gene.uniprot, residue));
  const alphafold = useQuery(alphaFoldQuery(gene.uniprot, residue));
  const clinvar = useQuery(
    clinVarQuery(gene.symbol, parsed.protein ?? parsed.cdna ?? undefined),
  );
  const primaryMim = gene.phenotypeMim?.[0]?.mim ?? gene.mim;
  const omim = useQuery({ ...omimQuery(primaryMim ?? ""), enabled: Boolean(primaryMim) });

  const queryClient = useQueryClient();

  const [ithaLoading, setIthaLoading] = useState(false);
  const loadIthaId = async (id: string) => {
    if (!/^\d{1,6}$/.test(id)) return;
    setIthaLoading(true);
    try {
      const info = await queryClient.fetchQuery(ithaQuery(id));
      if (!info.found) {
        toast.error(info.error ?? `IthaID ${id} not found`);
        return;
      }
      const g = info.gene ? getGene(info.gene) : undefined;
      if (!g) {
        toast.error(`IthaID ${id} (${info.hgvsName || info.commonName}) is not in this app's gene panel.`);
        return;
      }

      caseStore.set({
        geneSymbol: g.symbol,
        variantInput: info.hgvsName.replace(/^[A-Z0-9]+:/, ""),
        presetLabel: "",
        ithaId: id,
      });
      toast.success(`Loaded IthaID ${id}: ${info.hbName || info.commonName}`);
    } catch {
      toast.error("ITHANET could not be reached.");
    } finally {
      setIthaLoading(false);
    }
  };


  const capture = async () => {
    const fn = snapshotRef.current;
    if (!fn) {
      toast.error("The 3D view is still loading.");
      return;
    }
    const uri = await fn();
    if (!uri) {
      toast.error("Could not capture the current view.");
      return;
    }
    caseStore.set({
      structureImage: uri,
      structureCaption: `AlphaFold model of ${gene.protein} (${gene.uniprot})${
        residue ? `, variant residue ${residue} highlighted` : ""
      }`,
    });
    toast.success("View captured — it will appear on the slides.");
  };

  return (
    <AppShell>
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Left column: selection */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gene</CardTitle>
              <CardDescription>Target anemia panel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <GeneSearch
                value={state.geneSymbol}
                onChange={(v: string) =>
                  caseStore.set({ geneSymbol: v, variantInput: "", presetLabel: "", ithaId: "" })
                }
              />

              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABEL[gene.category]}</Badge>
                  <Badge variant="outline">{gene.inheritance}</Badge>
                </div>
                <p className="text-muted-foreground">{gene.summary}</p>
                {gene.transcript && (
                  <p className="text-xs text-muted-foreground">
                    Reference transcript {gene.transcript}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Variant</CardTitle>
              <CardDescription>Preset or free text (cDNA, protein, HGVS)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              {gene.presets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {gene.presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        caseStore.set({
                          variantInput: `${p.cdna ? `${p.cdna} ` : ""}${p.protein}`,
                          presetLabel: p.label,
                          ithaId: "",
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        state.presetLabel === p.label
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {state.presetLabel === p.label && (
                        <Check className="mr-1 inline h-3 w-3" />
                      )}
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No canonical presets curated for {gene.symbol} — enter the variant below.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="variant">Variant</Label>
                <Input
                  id="variant"
                  placeholder="c.563C>T p.Ser188Phe"
                  value={state.variantInput}
                  onChange={(e) =>
                    caseStore.set({ variantInput: e.target.value, presetLabel: "", ithaId: "" })
                  }
                />
              </div>

              <IthaSearch loading={ithaLoading} loadedId={state.ithaId} onLoad={(id) => void loadIthaId(id)} />

               <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="zygosity">Zygosity</Label>
                  <Select
                    {...(state.zygosity ? { value: state.zygosity } : {})}
                    onValueChange={(v) => caseStore.set({ zygosity: v })}
                  >
                    <SelectTrigger id="zygosity">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Heterozygous", "Homozygous", "Compound heterozygous", "Hemizygous", "Mosaic"].map(
                        (z) => (
                          <SelectItem key={z} value={z}>
                            {z}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="second">Second allele</Label>
                  <Input
                    id="second"
                    placeholder="e.g. c.1456C>T"
                    value={state.secondAllele}
                    onChange={(e) => caseStore.set({ secondAllele: e.target.value })}
                  />
                </div>
              </div>

              {state.variantInput && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{parsed.consequence}</Badge>
                    {residue && <Badge variant="outline">{parsed.extraResidues?.length ? `Residues ${[residue, ...parsed.extraResidues].join(", ")}` : `Residue ${residue}`}</Badge>}
                    {parsed.refAa && parsed.altAa && (
                      <Badge variant="outline">{describeVariant(parsed)}</Badge>
                    )}
                  </div>
                  {uniprot.data?.residueAa && residue && (
                    <p className="mt-2 text-muted-foreground">
                      UniProt residue {residue} is {uniprot.data.residueAa}
                      {parsed.refAa && parsed.refAa !== uniprot.data.residueAa && (
                        <span className="text-destructive">
                          {" "}
                          — does not match the entered reference amino acid ({parsed.refAa}).
                          Check numbering (legacy vs HGVS) or isoform.
                        </span>
                      )}
                    </p>
                  )}
                  {substitutionContext(parsed).map((n) => (
                    <p key={n} className="mt-1 text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: structure + evidence */}
         <div className="min-w-0 space-y-4">
          <ProteinMap
            info={uniprot.data}
            residue={residue}
            extra={parsed.extraResidues}
            altAa={parsed.altAa}
            geneSymbol={gene.symbol}
            tx={transcript.data}
            focus={focus}
            onSelect={(r) => selectionStore.set(r)}
            onReset={() => selectionStore.set(null)}
          />

          <GlobinEvidence
            gene={gene.symbol}
            cdna={parsed.cdna}
            ithaId={state.ithaId}
            onPick={(id) => void loadIthaId(id)}
          />

          <Card>
            <CardHeader className="gap-3 pb-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">AlphaFold structure</CardTitle>
                <CardDescription>
                  {gene.protein} ({gene.uniprot})
                  {focus ? ` — residue ${focus} ${focus === residue ? "(variant) " : "selected "}highlighted${focus !== residue && residue ? `, variant ${residue} also shown` : ""}; click the model to pick a residue` : " — enter a variant or click a position to highlight a residue"}
                </CardDescription>
              </div>
              <div className="grid gap-2 sm:flex sm:items-center">
                <Select value={colorTheme} onValueChange={setColorTheme}>
                  <SelectTrigger className="w-full sm:w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chain-id">Colour: chain</SelectItem>
                    <SelectItem value="uncertainty">Colour: pLDDT confidence</SelectItem>
                    <SelectItem value="secondary-structure">Colour: secondary structure</SelectItem>
                    <SelectItem value="hydrophobicity">Colour: hydrophobicity</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={capture} className="w-full sm:w-auto">
                  <Camera className="mr-1.5 h-4 w-4" />
                  Capture for slides
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 sm:px-6">
              <ClientOnly
                fallback={
                  <div className="flex h-[340px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:h-[460px]">
                    Preparing 3D viewer…
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className="flex h-[340px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground sm:h-[460px]">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Mol* viewer…
                    </div>
                  }
                >
                  <StructureViewer
                    accession={gene.uniprot}
                    residue={residue}
                    extra={parsed.extraResidues}
                    colorTheme={colorTheme}
                    focus={focus}
                    onPick={(r) => selectionStore.set(r)}
                    registerSnapshot={(fn) => {
                      snapshotRef.current = fn;
                    }}
                  />
                </Suspense>
              </ClientOnly>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Predicted model — not an experimental structure.
                </span>
                {alphafold.data?.plddt != null && (
                  <span>
                    pLDDT at residue {residue}: <strong>{alphafold.data.plddt.toFixed(1)}</strong> —{" "}
                    {alphafold.data.plddtBand}
                  </span>
                )}
                {state.structureImage && <span className="text-primary">View captured ✓</span>}
              </div>

              {uniprot.data?.features?.some((f) => f.covers) && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  <p className="mb-1 font-medium">Structural context at residue {residue}</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {uniprot.data.features
                      .filter((f) => f.covers)
                      .slice(0, 6)
                      .map((f) => (
                        <li key={`${f.type}-${f.start}`}>
                          {f.type}
                          {f.description ? `: ${f.description}` : ""} ({f.start}–{f.end})
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>


          <div className="grid gap-4 md:grid-cols-2">
            <EvidenceCard
              title="UniProt"
              href={links.uniprot(gene.uniprot)}
              loading={uniprot.isLoading}
            >
              {uniprot.data?.error ? (
                <p className="text-destructive">{uniprot.data.error}</p>
              ) : (
                <div className="space-y-1.5">
                  <p>
                    <strong>{uniprot.data?.proteinName || gene.protein}</strong> — {uniprot.data?.length || "?"} aa
                  </p>
                  {uniprot.data?.sequenceWindow && residue && (
                    <p className="font-mono text-[11px] tracking-wider">
                      …{uniprot.data.sequenceWindow}… (residue {residue} centred)
                    </p>
                  )}
                  {uniprot.data?.knownVariantsAtResidue?.length ? (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {uniprot.data.knownVariantsAtResidue.map((v, i) => (
                        <li key={i}>{v.description || v.alt}</li>
                      ))}
                    </ul>
                  ) : (
                    residue && <p>No annotated natural variant at this residue.</p>
                  )}
                </div>
              )}
            </EvidenceCard>

            <EvidenceCard
              title="AlphaFold DB"
              href={links.alphafold(gene.uniprot)}
              loading={alphafold.isLoading}
            >
              {alphafold.data?.available ? (
                <div className="space-y-1">
                  <p>Predicted model {alphafold.data.version ?? ""} available.</p>
                  {alphafold.data.modelCreatedDate && <p>Created {alphafold.data.modelCreatedDate}</p>}
                  {alphafold.data.plddt != null ? (
                    <p>
                      Residue {residue} pLDDT {alphafold.data.plddt.toFixed(1)} — {alphafold.data.plddtBand}
                    </p>
                  ) : (
                    <p>Enter a variant residue to read its local model confidence.</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">{alphafold.data?.error ?? "No model found."}</p>
              )}
            </EvidenceCard>

            <EvidenceCard
              title="ClinVar"
              href={links.clinvar(gene.symbol, parsed.protein ?? parsed.cdna)}
              loading={clinvar.isLoading}
            >
              {clinvar.data?.error ? (
                <p className="text-destructive">{clinvar.data.error}</p>
              ) : clinvar.data?.hits.length ? (
                <ul className="space-y-2">
                  {clinvar.data.hits.slice(0, 4).map((h) => (
                    <li key={h.uid}>
                      <p className="font-medium">{h.title}</p>
                      <p className="text-muted-foreground">
                        {h.significance}
                        {h.reviewStatus ? ` · ${h.reviewStatus}` : ""}
                        {h.conditions ? ` · ${h.conditions}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No ClinVar record matched this search{state.variantInput ? "" : " (enter a variant)"}.
                </p>
              )}
            </EvidenceCard>

            <EvidenceCard title="gnomAD" href={links.gnomad(gene.symbol)}>
              <p className="text-muted-foreground">
                Population frequency is not redistributed here — open the gnomAD v4 gene page and
                search the variant to record allele count, frequency and any homozygotes.
              </p>
            </EvidenceCard>

            <EvidenceCard
              title="OMIM"
              href={primaryMim ? links.omim(primaryMim) : "https://omim.org"}
              loading={omim.isLoading}
            >
              <div className="space-y-1.5">
                <p>
                  Gene MIM {gene.mim ?? "—"}
                  {gene.phenotypeMim?.length ? (
                    <>
                      {" "}
                      · Phenotypes:{" "}
                      {gene.phenotypeMim.map((p, i) => (
                        <span key={p.mim}>
                          {i > 0 && ", "}
                          <a
                            className="underline underline-offset-2"
                            href={links.omim(p.mim)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {p.name} ({p.mim})
                          </a>
                        </span>
                      ))}
                    </>
                  ) : null}
                </p>
                {omim.data?.configured === false ? (
                  <p className="text-muted-foreground">
                    Add an OMIM API key to pull phenotype summaries directly into this card.
                  </p>
                ) : omim.data?.summary ? (
                  <p className="text-muted-foreground">{omim.data.summary.slice(0, 500)}…</p>
                ) : omim.data?.error ? (
                  <p className="text-destructive">{omim.data.error}</p>
                ) : null}
              </div>
            </EvidenceCard>

            <EvidenceCard
              title="Orphanet"
              href={gene.orpha?.[0] ? links.orphanet(gene.orpha[0].code) : "https://www.orpha.net"}
            >
              {gene.orpha?.length ? (
                <ul className="space-y-1">
                  {gene.orpha.map((o) => (
                    <li key={o.code}>
                      <a
                        className="underline underline-offset-2"
                        href={links.orphanet(o.code)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ORPHA:{o.code} — {o.name}
                      </a>
                    </li>
                  ))}
                  <li className="text-muted-foreground">Inheritance: {gene.inheritance}</li>
                </ul>
              ) : (
                <p className="text-muted-foreground">No ORPHA code curated for this gene.</p>
              )}
            </EvidenceCard>
          </div>

          <ProvenancePanel
            rows={buildProvenance({
              gene,
              state,
              parsed,
              uniprot: uniprot.data,
              alphafold: alphafold.data,
              clinvar: clinvar.data,
              omim: omim.data,
            })}
          />

          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
              <Microscope className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">
                Next: add the clinical picture and labs, then build the board slides.
              </span>
              <Separator orientation="vertical" className="hidden h-5 sm:block" />
              <a
                className="inline-flex items-center gap-1 underline underline-offset-2"
                href={
                  state.variantInput
                    ? links.varsome(gene.symbol, parsed.protein ?? state.variantInput)
                    : "https://varsome.com"
                }
                target="_blank"
                rel="noreferrer"
              >
                Open in VarSome <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function EvidenceCard({
  title,
  href,
  loading,
  children,
}: {
  title: string;
  href: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      </CardHeader>
      <CardContent className="text-xs leading-relaxed">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </span>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
