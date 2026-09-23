import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Provenance = {
  sourceUrl: string;
  retrievedAt: string;
  recordVersion: string | null;
};

const prov = (sourceUrl: string, recordVersion: string | null = null): Provenance => ({
  sourceUrl,
  retrievedAt: new Date().toISOString(),
  recordVersion,
});

export type UniProtFeature = {
  type: string;
  description: string;
  start: number;
  end: number;
  covers: boolean;
};

export type UniProtInfo = {
  provenance?: Provenance | undefined;
  accession: string;
  proteinName: string;
  geneName: string;
  length: number;
  residueAa: string | null;
  sequenceWindow: string | null;
  features: UniProtFeature[];
  knownVariantsAtResidue: { description: string; alt: string }[];
  error?: string;
};

const RESIDUE_LETTERS: Record<string, string> = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu", G: "Gly",
  H: "His", I: "Ile", L: "Leu", K: "Lys", M: "Met", F: "Phe", P: "Pro", S: "Ser",
  T: "Thr", W: "Trp", Y: "Tyr", V: "Val",
};

export const threeLetter = (aa: string) => RESIDUE_LETTERS[aa] ?? aa;

const accessionInput = z.object({
  accession: z.string().regex(/^[A-Z0-9]{6,10}$/),
  residue: z.number().int().positive().optional(),
});

export const fetchUniProt = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => accessionInput.parse(input))
  .handler(async ({ data }): Promise<UniProtInfo> => {
    const base: UniProtInfo = {
      accession: data.accession,
      proteinName: "",
      geneName: "",
      length: 0,
      residueAa: null,
      sequenceWindow: null,
      features: [],
      knownVariantsAtResidue: [],
    };
    const url = `https://rest.uniprot.org/uniprotkb/${data.accession}.json?fields=accession,protein_name,gene_names,sequence,ft_domain,ft_region,ft_binding,ft_act_site,ft_transmem,ft_motif,ft_variant,ft_site,ft_disulfid`;
    base.provenance = prov(url);
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return { ...base, error: `UniProt returned ${res.status}` };
      const json = (await res.json()) as Record<string, any>;

      const sequence: string = json["sequence"]?.value ?? "";
      const residue = data.residue;
      const features: UniProtFeature[] = [];
      const variantsAt: { description: string; alt: string }[] = [];

      for (const f of (json["features"] ?? []) as any[]) {
        const start = Number(f?.location?.start?.value ?? 0);
        const end = Number(f?.location?.end?.value ?? start);
        if (!start) continue;
        if (f.type === "Natural variant") {
          if (residue && residue >= start && residue <= end) {
            variantsAt.push({
              description: String(f.description ?? "").slice(0, 300),
              alt: [f?.alternativeSequence?.originalSequence, "->", f?.alternativeSequence?.alternativeSequences?.[0]]
                .filter(Boolean)
                .join(" "),
            });
          }
          continue;
        }
        features.push({
          type: String(f.type),
          description: String(f.description ?? ""),
          start,
          end,
          covers: residue ? residue >= start && residue <= end : false,
        });
      }

      features.sort((a, b) => Number(b.covers) - Number(a.covers) || a.start - b.start);

      const audit = json["entryAudit"] ?? {};
      const version = [
        audit.entryVersion ? `entry v${audit.entryVersion}` : null,
        audit.sequenceVersion ? `sequence v${audit.sequenceVersion}` : null,
        audit.lastAnnotationUpdateDate ? `updated ${audit.lastAnnotationUpdateDate}` : null,
      ].filter(Boolean).join(" · ");
      return {
        provenance: prov(url, version || null),
        accession: json["primaryAccession"] ?? data.accession,
        proteinName:
          json["proteinDescription"]?.recommendedName?.fullName?.value ??
          json["proteinDescription"]?.submissionNames?.[0]?.fullName?.value ??
          "",
        geneName: json["genes"]?.[0]?.geneName?.value ?? "",
        length: sequence.length,
        residueAa: residue && sequence[residue - 1] ? sequence[residue - 1]! : null,
        sequenceWindow:
          residue && sequence
            ? sequence.slice(Math.max(0, residue - 6), Math.min(sequence.length, residue + 5))
            : null,
        features: features.slice(0, 40),
        knownVariantsAtResidue: variantsAt.slice(0, 8),
      };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "UniProt lookup failed" };
    }
  });

export type AlphaFoldInfo = {
  provenance?: Provenance | undefined;
  accession: string;
  available: boolean;
  modelUrl?: string | undefined;
  modelCreatedDate?: string | undefined;
  version?: string | undefined;
  plddt?: number | null | undefined;
  plddtBand?: string | undefined;
  error?: string | undefined;
};

function plddtBand(v: number): string {
  if (v >= 90) return "Very high confidence (pLDDT ≥ 90)";
  if (v >= 70) return "Confident (70–90)";
  if (v >= 50) return "Low (50–70)";
  return "Very low (< 50) — likely disordered";
}

export const fetchAlphaFold = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => accessionInput.parse(input))
  .handler(async ({ data }): Promise<AlphaFoldInfo> => {
    const url = `https://alphafold.ebi.ac.uk/api/prediction/${data.accession}`;
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "AnemiaVariantBoard/1.0 (clinical research tool)",
        },
      });
      if (!res.ok) return { accession: data.accession, provenance: prov(url), available: false, error: `AlphaFold returned ${res.status}` };
      const arr = (await res.json()) as any[];
      const entry = arr?.[0];
      if (!entry) return { accession: data.accession, provenance: prov(url), available: false, error: "No AlphaFold model found" };

      let plddt: number | null = null;
      if (data.residue && entry.pdbUrl) {
        try {
          const pdb = await fetch(entry.pdbUrl);
          if (pdb.ok) {
            const text = await pdb.text();
            for (const line of text.split("\n")) {
              if (!line.startsWith("ATOM")) continue;
              if (line.slice(12, 16).trim() !== "CA") continue;
              if (Number(line.slice(22, 26).trim()) !== data.residue) continue;
              plddt = Number(line.slice(60, 66).trim());
              break;
            }
          }
        } catch {
          /* pLDDT is optional */
        }
      }

      return {
        provenance: prov(
          data.residue && entry.pdbUrl ? `${url} ; pLDDT from ${entry.pdbUrl}` : url,
          [entry.entryId, entry.latestVersion ? `model v${entry.latestVersion}` : null, entry.modelCreatedDate ? `created ${entry.modelCreatedDate.slice(0, 10)}` : null]
            .filter(Boolean).join(" · ") || null,
        ),
        accession: data.accession,
        available: true,
        modelUrl: entry.cifUrl ?? entry.pdbUrl,
        modelCreatedDate: entry.modelCreatedDate,
        version: entry.latestVersion ? `v${entry.latestVersion}` : undefined,
        plddt,
        plddtBand: plddt != null ? plddtBand(plddt) : undefined,
      };
    } catch (e) {
      return {
        accession: data.accession,
        available: false,
        error: e instanceof Error ? e.message : "AlphaFold lookup failed",
      };
    }
  });

export type ClinVarHit = {
  uid: string;
  accession: string;
  title: string;
  significance: string;
  reviewStatus: string;
  lastEvaluated: string;
  conditions: string;
};

export type ClinVarResult = {
  provenance?: Provenance | undefined;
  query: string;
  total: number;
  hits: ClinVarHit[];
  error?: string;
};

export const fetchClinVar = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ gene: z.string().min(1).max(20), variant: z.string().max(120).optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<ClinVarResult> => {
    const term = data.variant
      ? `${data.gene}[gene] AND "${data.variant.replace(/"/g, "")}"`
      : `${data.gene}[gene]`;
    try {
      const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&retmode=json&retmax=8&term=${encodeURIComponent(term)}`;
      const esearch = await fetch(esearchUrl);
      if (!esearch.ok) return { query: term, total: 0, hits: [], error: `ClinVar returned ${esearch.status}` };
      const sj = (await esearch.json()) as any;
      const ids: string[] = sj?.esearchresult?.idlist ?? [];
      const total = Number(sj?.esearchresult?.count ?? 0);
      if (!ids.length) return { query: term, total, hits: [], provenance: prov(esearchUrl, "no records matched") };

      const esum = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&retmode=json&id=${ids.join(",")}`,
      );
      if (!esum.ok) return { query: term, total, hits: [], error: `ClinVar summary returned ${esum.status}` };
      const ej = (await esum.json()) as any;
      const hits: ClinVarHit[] = ids
        .map((id) => ej?.result?.[id])
        .filter(Boolean)
        .map((r: any) => ({
          uid: String(r.uid ?? r.accession ?? ""),
          accession: String(r.accession_version ?? r.accession ?? ""),
          title: String(r.title ?? ""),
          significance: String(r.germline_classification?.description ?? r.clinical_significance?.description ?? "Not provided"),
          reviewStatus: String(r.germline_classification?.review_status ?? r.clinical_significance?.review_status ?? ""),
          lastEvaluated: String(r.germline_classification?.last_evaluated ?? r.clinical_significance?.last_evaluated ?? ""),
          conditions: ((r.germline_classification?.trait_set ?? r.trait_set ?? []) as any[])
            .map((t) => t?.trait_name)
            .filter(Boolean)
            .join("; "),
        }));
      const esumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&retmode=json&id=${ids.join(",")}`;
      return {
        query: term,
        total,
        hits,
        provenance: prov(
          `${esearchUrl} ; ${esumUrl}`,
          hits.map((h) => h.accession).filter(Boolean).slice(0, 4).join(", ") || null,
        ),
      };
    } catch (e) {
      return { query: term, total: 0, hits: [], error: e instanceof Error ? e.message : "ClinVar lookup failed" };
    }
  });

export type OmimResult = {
  provenance?: Provenance | undefined;
  mim: string;
  configured: boolean;
  title?: string | undefined;
  summary?: string | undefined;
  error?: string | undefined;
};

export const fetchOmim = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ mim: z.string().regex(/^\d{5,6}$/) }).parse(input))
  .handler(async ({ data }): Promise<OmimResult> => {
    const key = process.env["OMIM_API_KEY"];
    if (!key) return { mim: data.mim, configured: false };
    try {
      const publicUrl = `https://api.omim.org/api/entry?mimNumber=${data.mim}&include=text:description&format=json`;
      const res = await fetch(`${publicUrl}&apiKey=${key}`);
      if (!res.ok) return { mim: data.mim, configured: true, error: `OMIM returned ${res.status}` };
      const json = (await res.json()) as any;
      const entry = json?.omim?.entryList?.[0]?.entry;
      const text = entry?.textSectionList?.[0]?.textSection?.textSectionContent as string | undefined;
      return {
        mim: data.mim,
        configured: true,
        provenance: prov(
          `${publicUrl} (API key redacted)`,
          [entry?.version ? `v${entry.version}` : null, entry?.dateUpdated ? `updated ${entry.dateUpdated}` : null].filter(Boolean).join(" · ") || null,
        ),
        title: entry?.titles?.preferredTitle,
        summary: text ? text.replace(/\{[^}]*\}/g, "").slice(0, 1600) : undefined,
      };
    } catch (e) {
      return { mim: data.mim, configured: true, error: e instanceof Error ? e.message : "OMIM lookup failed" };
    }
  });
