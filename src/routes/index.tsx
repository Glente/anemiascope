import { G6pdClassificationPanel } from "@/components/G6pdClassificationPanel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobinEvidence } from "@/components/GlobinEvidence";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  CircleCheck,
  CircleX,
  ExternalLink,
  Info,
  Loader2,
  Microscope,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { GeneSearch } from "@/components/GeneSearch";
import { IthaSearch } from "@/components/IthaSearch";
import { PredictionsCard } from "@/components/PredictionsCard";
import { describeAssembly } from "@/lib/pdb-structures";
import { predictionQuery } from "@/lib/predictions";
import type { StructureContext, StructureSource } from "@/components/StructureViewer";
import { ProteinMap } from "@/components/ProteinMap";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { buildProvenance } from "@/lib/provenance";
import { selectionStore, useSelectedResidue } from "@/lib/selection-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  ithaQuery,
  links,
  omimQuery,
  pdbMappingQuery,
  pdbStructuresQuery,
  predictionQuery as vepQuery,
  transcriptQuery,
  uniProtQuery,
} from "@/lib/evidence-queries";
import {
  describeVariant,
  parseVariant,
  substitutionContext,
  translateCds,
  translateVariant,
  validateVariant,
} from "@/lib/variant";

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
      { property: "og:title", content: "Variant workspace — Anemiascope" },
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
  const [structureChoice, setStructureChoice] = useState("alphafold");
  const [structureCtx, setStructureCtx] = useState<StructureContext | null>(null);
  const selected = useSelectedResidue();
  useEffect(() => selectionStore.set(null), [residue, gene.symbol]);
  useEffect(() => setStructureChoice("alphafold"), [gene.uniprot]);
  const focus = selected ?? residue ?? null;
  const transcript = useQuery(transcriptQuery(gene.symbol));
  const snapshotRef = useRef<(() => Promise<string | null>) | null>(null);

  const uniprot = useQuery(uniProtQuery(gene.uniprot, residue));
  const alphafold = useQuery(alphaFoldQuery(gene.uniprot, residue));
  const clinvar = useQuery(clinVarQuery(gene.symbol, parsed.protein ?? parsed.cdna ?? undefined));
  const primaryMim = gene.phenotypeMim?.[0]?.mim ?? gene.mim;
  const omim = useQuery({ ...omimQuery(primaryMim ?? ""), enabled: Boolean(primaryMim) });
  const pdbList = useQuery(pdbStructuresQuery(gene.uniprot));
  const pdbId = structureChoice === "alphafold" ? "" : structureChoice;
  const pdbMap = useQuery(pdbMappingQuery(pdbId, gene.uniprot));
  const pdbMapping = pdbId && pdbMap.data && "segments" in pdbMap.data ? pdbMap.data : null;
  const structureSource: StructureSource | null = !pdbId
    ? { kind: "alphafold", accession: gene.uniprot }
    : pdbMapping
      ? {
          kind: "pdb",
          pdbId: pdbMapping.pdbId,
          entityId: pdbMapping.entityId,
          segments: pdbMapping.segments,
          assemblyId: pdbMapping.assembly?.id,
        }
      : null;
  const assemblyText = describeAssembly(pdbMapping?.assembly);
  const txId = transcript.data?.transcriptId ?? "";
  const predQ = predictionQuery(state.variantInput, txId, transcript.data?.cds ?? "");
  const predictions = useQuery(vepQuery(predQ.ok ? predQ.hgvs : "", txId));

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
        toast.error(
          `IthaID ${id} (${info.hgvsName || info.commonName}) is not in this app's gene panel.`,
        );
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
      structureCaption: `${
        pdbMapping
          ? `PDB ${pdbMapping.pdbId.toUpperCase()}${assemblyText ? ` (${assemblyText})` : ""} — experimental structure of ${gene.protein}`
          : `AlphaFold model of ${gene.protein} (${gene.uniprot})`
      }${residue ? `, variant residue ${residue} highlighted` : ""}`,
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
                      {state.presetLabel === p.label && <Check className="mr-1 inline h-3 w-3" />}
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No canonical presets curated for {gene.symbol} — enter the variant below.
                </p>
              )}

              {gene.symbol === "G6PD" && (
                <G6pdClassificationPanel presetLabel={state.presetLabel} presets={gene.presets} />
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

              {gene.category === "hemoglobin" && (
                <IthaSearch
                  loading={ithaLoading}
                  loadedId={state.ithaId}
                  onLoad={(id) => void loadIthaId(id)}
                />
              )}

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
                      {[
                        "Heterozygous",
                        "Homozygous",
                        "Compound heterozygous",
                        "Hemizygous",
                        "Mosaic",
                      ].map((z) => (
                        <SelectItem key={z} value={z}>
                          {z}
                        </SelectItem>
                      ))}
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
                    {residue && (
                      <Badge variant="outline">
                        {parsed.extraResidues?.length
                          ? `Residues ${[residue, ...parsed.extraResidues].join(", ")}`
                          : `Residue ${residue}`}
                      </Badge>
                    )}
                    {parsed.refAa && parsed.altAa && (
                      <Badge variant="outline">{describeVariant(parsed)}</Badge>
                    )}
                  </div>
                  {(() => {
                    const t = translateVariant(state.variantInput, transcript.data?.cds ?? "");
                    if (!t) return null;
                    const tx = transcript.data?.transcriptId ?? "";
                    if (t.kind === "error") return null; // reported by the reference check below
                    if (t.kind === "c2p")
                      return (
                        <p className="mt-2">
                          <span className="text-muted-foreground">Predicted protein ({tx}): </span>
                          <span className="font-mono font-semibold">{t.protein}</span>{" "}
                          <span className="text-muted-foreground">· codon {t.note}</span>
                        </p>
                      );
                    return (
                      <div className="mt-2">
                        <span className="text-muted-foreground">Possible cDNA ({tx}): </span>
                        {t.options.length ? (
                          t.options.map((o) => (
                            <button
                              key={o}
                              type="button"
                              className="mr-1 rounded border px-1.5 py-0.5 font-mono hover:bg-muted"
                              onClick={() =>
                                caseStore.set({
                                  variantInput: `${o} (${state.variantInput.replace(/^p\./, "p.")})`,
                                })
                              }
                            >
                              {o}
                            </button>
                          ))
                        ) : (
                          <span>{t.note}</span>
                        )}
                      </div>
                    );
                  })()}
                  <ReferenceCheckList
                    input={state.variantInput}
                    cds={transcript.data?.cds ?? ""}
                    transcriptId={transcript.data?.transcriptId || "the reference transcript"}
                    uniprotSeq={uniprot.data?.sequence}
                    loading={transcript.isLoading}
                    error={
                      transcript.data?.error ??
                      (transcript.isError ? "Ensembl could not be reached" : undefined)
                    }
                  />
                  {uniprot.data?.residueAa && residue && (
                    <p className="mt-2 text-muted-foreground">
                      UniProt residue {residue} is {uniprot.data.residueAa}
                      {parsed.refAa &&
                        parsed.refAa !== "*" &&
                        parsed.refAa !== uniprot.data.residueAa &&
                        translateCds(transcript.data?.cds ?? "") !== uniprot.data.sequence && (
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

          <PredictionsCard
            input={state.variantInput}
            transcriptId={transcript.data?.transcriptId ?? ""}
            cds={transcript.data?.cds ?? ""}
          />

          <Card>
            <CardHeader className="gap-3 pb-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">3D structure</CardTitle>
                <CardDescription>
                  {gene.protein} ({gene.uniprot}){pdbId ? ` · PDB ${pdbId.toUpperCase()}` : ""}
                  {focus
                    ? ` — residue ${focus} ${focus === residue ? "(variant) " : "selected "}highlighted${focus !== residue && residue ? `, variant ${residue} also shown` : ""}; click the model to pick a residue`
                    : " — enter a variant or click a position to highlight a residue"}
                </CardDescription>
              </div>
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Select value={structureChoice} onValueChange={setStructureChoice}>
                  <SelectTrigger className="w-full sm:w-[240px]" aria-label="Structure source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alphafold">AlphaFold model (monomer)</SelectItem>
                    {pdbList.data?.entries.length ? (
                      <SelectGroup>
                        <SelectLabel>Experimental (PDB, biological assembly)</SelectLabel>
                        {pdbList.data.entries.map((e) => (
                          <SelectItem key={e.pdbId} value={e.pdbId}>
                            {e.pdbId.toUpperCase()}
                            {e.resolution != null ? ` · ${e.resolution.toFixed(1)} Å` : ""}
                            {e.coverage != null ? ` · ${Math.round(e.coverage * 100)} %` : ""}
                            {` · ${e.unpStart}–${e.unpEnd}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
                <Select value={colorTheme} onValueChange={setColorTheme}>
                  <SelectTrigger className="w-full sm:w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chain-id">Colour: chain</SelectItem>
                    <SelectItem value="uncertainty">
                      {pdbId ? "Colour: B-factor" : "Colour: pLDDT confidence"}
                    </SelectItem>
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
                  {structureSource ? (
                    <StructureViewer
                      source={structureSource}
                      onContext={setStructureCtx}
                      residue={residue}
                      extra={parsed.extraResidues}
                      colorTheme={colorTheme}
                      focus={focus}
                      onPick={(r) => selectionStore.set(r)}
                      registerSnapshot={(fn) => {
                        snapshotRef.current = fn;
                      }}
                    />
                  ) : (
                    <div className="flex h-[340px] items-center justify-center rounded-lg border bg-muted/30 px-6 text-center text-sm text-muted-foreground sm:h-[460px]">
                      {pdbMap.isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mapping{" "}
                          {pdbId.toUpperCase()} to UniProt numbering…
                        </>
                      ) : (
                        (pdbMap.data?.error ?? "Could not load this structure.")
                      )}
                    </div>
                  )}
                </Suspense>
              </ClientOnly>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {pdbMapping ? (
                  <span className="inline-flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Experimental structure{" "}
                      <a
                        className="underline underline-offset-2"
                        href={links.pdbe(pdbMapping.pdbId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pdbMapping.pdbId.toUpperCase()}
                      </a>
                      {assemblyText ? ` — ${assemblyText}` : ""}
                      {pdbMapping.chains.length ? ` · chains ${pdbMapping.chains.join(", ")}` : ""}
                      {` · UniProt ${pdbMapping.segments.map((g) => `${g.unpStart}–${g.unpEnd}`).join(", ")}`}
                      {pdbMapping.title ? ` · ${pdbMapping.title}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    Predicted monomer — not an experimental structure.
                    {pdbList.data?.entries.length
                      ? ` ${pdbList.data.entries.length} PDB structure(s) with the oligomeric assembly can be chosen above.`
                      : ""}
                  </span>
                )}
                {!pdbId && alphafold.data?.plddt != null && (
                  <span>
                    pLDDT at residue {residue}: <strong>{alphafold.data.plddt.toFixed(1)}</strong> —{" "}
                    {alphafold.data.plddtBand}
                  </span>
                )}
                {state.structureImage && <span className="text-primary">View captured ✓</span>}
              </div>

              {pdbId && structureCtx && (
                <div
                  className={`rounded-md border p-3 text-xs ${
                    !structureCtx.resolved
                      ? "border-amber-500/40 bg-amber-500/5"
                      : structureCtx.partners.length
                        ? "border-primary/40 bg-primary/5"
                        : "bg-muted/40"
                  }`}
                >
                  {!structureCtx.resolved ? (
                    <p>
                      Residue {structureCtx.residue} is not modelled in {pdbId.toUpperCase()}{" "}
                      (outside the crystallised construct or without density). Pick another entry or
                      use the AlphaFold model.
                    </p>
                  ) : structureCtx.partners.length ? (
                    <p>
                      <span className="font-semibold">Subunit interface:</span> residue{" "}
                      {structureCtx.residue} has atoms within 4 Å of chain
                      {structureCtx.partners.length > 1 ? "s" : ""}{" "}
                      {structureCtx.partners.join(", ")} in the biological assembly.
                    </p>
                  ) : (
                    <p>
                      Residue {structureCtx.residue} has no contact (≤ 4 Å) with other chains in the
                      assembly.
                    </p>
                  )}
                </div>
              )}

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
                    <strong>{uniprot.data?.proteinName || gene.protein}</strong> —{" "}
                    {uniprot.data?.length || "?"} aa
                  </p>
                  {uniprot.data?.functionText && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Function: </span>
                      {uniprot.data.functionText}
                    </p>
                  )}
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
                  {alphafold.data.modelCreatedDate && (
                    <p>Created {alphafold.data.modelCreatedDate}</p>
                  )}
                  {alphafold.data.plddt != null ? (
                    <p>
                      Residue {residue} pLDDT {alphafold.data.plddt.toFixed(1)} —{" "}
                      {alphafold.data.plddtBand}
                    </p>
                  ) : (
                    <p>Enter a variant residue to read its local model confidence.</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {alphafold.data?.error ?? "No model found."}
                </p>
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
                  No ClinVar record matched this search
                  {state.variantInput ? "" : " (enter a variant)"}.
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
              predictions: predictions.data,
              pdb: pdbId ? pdbMap.data : undefined,
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

function ReferenceCheckList({
  input,
  cds,
  transcriptId,
  uniprotSeq,
  loading,
  error,
}: {
  input: string;
  cds: string;
  transcriptId: string;
  uniprotSeq: string | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  const result = useMemo(
    () => validateVariant(input, cds, transcriptId, uniprotSeq),
    [input, cds, transcriptId, uniprotSeq],
  );
  if (loading) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking against the reference transcript…
      </p>
    );
  }
  if (!cds && error) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
        <Info className="h-3 w-3 shrink-0" /> Reference transcript unavailable ({error}) — the
        variant could not be checked.
      </p>
    );
  }
  if (!result.checks.length) return null;
  const problems = result.checks.filter((c) => c.level === "error" || c.level === "warn");
  const shown = problems.length ? problems : result.checks;
  const tone =
    result.status === "error"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : result.status === "warn"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300"
        : result.status === "ok"
          ? "border-emerald-600/30 bg-emerald-600/5 text-emerald-800 dark:text-emerald-300"
          : "border-border bg-background text-muted-foreground";
  const Icon =
    result.status === "error"
      ? CircleX
      : result.status === "warn"
        ? AlertTriangle
        : result.status === "ok"
          ? CircleCheck
          : Info;
  const title =
    result.status === "error"
      ? "Does not match the reference"
      : result.status === "warn"
        ? "Check numbering"
        : result.status === "ok"
          ? `Matches ${transcriptId}`
          : "Reference check";
  return (
    <div
      role={result.status === "error" ? "alert" : undefined}
      className={`mt-2 rounded-md border p-2 ${tone}`}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {title}
      </p>
      {(problems.length > 0 || result.status === "info") && (
        <ul className="mt-1 space-y-0.5 pl-5">
          {shown.map((c) => (
            <li key={c.message} className="list-disc">
              {c.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
