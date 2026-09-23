import type { Gene } from "@/data/genes";
import type { CaseState } from "@/lib/case-store";
import { links } from "@/lib/evidence-queries";
import type {
  AlphaFoldInfo,
  ClinVarResult,
  OmimResult,
  UniProtInfo,
} from "@/lib/evidence.functions";
import type { ParsedVariant } from "@/lib/variant";

export type Use = "evaluation" | "slides";
export type ProvField = { field: string; value: string; usedIn: Use[] };
export type ProvRow = {
  source: string;
  kind: "live lookup" | "curated reference" | "link only" | "not retrieved";
  sourceUrl: string;
  viewUrl: string;
  retrievedAt: string | null;
  recordVersion: string | null;
  fields: ProvField[];
};

const both: Use[] = ["evaluation", "slides"];
const ev: Use[] = ["evaluation"];

export function buildProvenance(args: {
  gene: Gene;
  state: CaseState;
  parsed: ParsedVariant;
  uniprot?: UniProtInfo | undefined;
  alphafold?: AlphaFoldInfo | undefined;
  clinvar?: ClinVarResult | undefined;
  omim?: OmimResult | undefined;
}): ProvRow[] {
  const { gene, parsed, uniprot, alphafold, clinvar, omim } = args;
  const r = parsed.residue;
  const rows: ProvRow[] = [];

  rows.push({
    source: "UniProt",
    kind: uniprot?.provenance ? "live lookup" : "not retrieved",
    sourceUrl: uniprot?.provenance?.sourceUrl ?? "",
    viewUrl: links.uniprot(gene.uniprot),
    retrievedAt: uniprot?.provenance?.retrievedAt ?? null,
    recordVersion: uniprot?.provenance?.recordVersion ?? null,
    fields: [
      { field: "accession", value: uniprot?.accession ?? gene.uniprot, usedIn: both },
      { field: "proteinName", value: uniprot?.proteinName || "—", usedIn: both },
      { field: "sequence.length", value: String(uniprot?.length ?? "—"), usedIn: both },
      ...(r
        ? [
            { field: `sequence[${r}]`, value: uniprot?.residueAa ?? "—", usedIn: ev },
            { field: "sequence window ±5", value: uniprot?.sequenceWindow ?? "—", usedIn: ev },
            {
              field: "features covering residue",
              value:
                uniprot?.features.filter((f) => f.covers).map((f) => `${f.type} ${f.start}–${f.end}`).join("; ") ||
                "none",
              usedIn: both,
            },
            {
              field: "natural variants at residue",
              value: uniprot?.knownVariantsAtResidue.map((v) => v.alt).join("; ") || "none",
              usedIn: ev,
            },
          ]
        : []),
    ],
  });

  rows.push({
    source: "AlphaFold DB",
    kind: alphafold?.provenance ? "live lookup" : "not retrieved",
    sourceUrl: alphafold?.provenance?.sourceUrl ?? "",
    viewUrl: links.alphafold(gene.uniprot),
    retrievedAt: alphafold?.provenance?.retrievedAt ?? null,
    recordVersion: alphafold?.provenance?.recordVersion ?? null,
    fields: [
      { field: "cifUrl (3D model)", value: alphafold?.modelUrl ?? "—", usedIn: both },
      { field: "latestVersion", value: alphafold?.version ?? "—", usedIn: both },
      { field: "modelCreatedDate", value: alphafold?.modelCreatedDate ?? "—", usedIn: ev },
      ...(r
        ? [
            {
              field: `pLDDT (CA B-factor, residue ${r})`,
              value: alphafold?.plddt != null ? alphafold.plddt.toFixed(1) : "—",
              usedIn: both,
            },
          ]
        : []),
    ],
  });

  rows.push({
    source: "ClinVar",
    kind: clinvar?.provenance ? "live lookup" : "not retrieved",
    sourceUrl: clinvar?.provenance?.sourceUrl ?? "",
    viewUrl: links.clinvar(gene.symbol, parsed.protein ?? parsed.cdna ?? undefined),
    retrievedAt: clinvar?.provenance?.retrievedAt ?? null,
    recordVersion: clinvar?.provenance?.recordVersion ?? null,
    fields: [
      { field: "search term", value: clinvar?.query ?? "—", usedIn: ev },
      { field: "esearch.count", value: String(clinvar?.total ?? "—"), usedIn: ev },
      ...(clinvar?.hits ?? []).slice(0, 4).map((h, i) => ({
        field: `${h.accession || h.uid} classification / review`,
        value: `${h.significance}${h.reviewStatus ? ` · ${h.reviewStatus}` : ""}${h.lastEvaluated ? ` · evaluated ${h.lastEvaluated}` : ""}`,
        usedIn: i < 2 ? both : ev,
      })),
    ],
  });

  rows.push({
    source: "OMIM",
    kind: omim?.provenance ? "live lookup" : "curated reference",
    sourceUrl: omim?.provenance?.sourceUrl ?? "",
    viewUrl: gene.mim ? links.omim(gene.mim) : "https://omim.org",
    retrievedAt: omim?.provenance?.retrievedAt ?? null,
    recordVersion:
      omim?.provenance?.recordVersion ?? (omim?.configured === false ? "no API key — curated MIM numbers only" : null),
    fields: [
      { field: "gene MIM (curated)", value: gene.mim ?? "—", usedIn: both },
      {
        field: "phenotype MIMs (curated)",
        value: (gene.phenotypeMim ?? []).map((p) => `${p.mim} ${p.name}`).join("; ") || "—",
        usedIn: both,
      },
      ...(omim?.summary ? [{ field: "text:description", value: `${omim.summary.slice(0, 120)}…`, usedIn: ev }] : []),
    ],
  });

  rows.push({
    source: "Orphanet",
    kind: "curated reference",
    sourceUrl: "",
    viewUrl: gene.orpha?.[0] ? links.orphanet(gene.orpha[0].code) : "https://www.orpha.net",
    retrievedAt: null,
    recordVersion: "built-in panel reference data",
    fields: [
      {
        field: "ORPHA codes (curated)",
        value: (gene.orpha ?? []).map((o) => `ORPHA:${o.code} ${o.name}`).join("; ") || "—",
        usedIn: both,
      },
      { field: "inheritance (curated)", value: gene.inheritance, usedIn: ev },
    ],
  });

  rows.push({
    source: "gnomAD v4",
    kind: "link only",
    sourceUrl: "",
    viewUrl: links.gnomad(gene.symbol),
    retrievedAt: null,
    recordVersion: "not retrieved — frequencies must be read on gnomAD",
    fields: [{ field: "gene page link", value: links.gnomad(gene.symbol), usedIn: both }],
  });

  return rows;
}

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "—";
