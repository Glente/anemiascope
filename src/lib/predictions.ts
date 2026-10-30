/**
 * Variant effect predictions (Ensembl VEP: SIFT, PolyPhen-2, AlphaMissense, REVEL, CADD, SpliceAI).
 * Pure helpers — shared by the server function, the UI, the slides and the tests.
 * Everything here is descriptive in-silico evidence, never a classification.
 */
import { parseVariant, translateVariant } from "@/lib/variant";

export type PredictionResult = {
  /** HGVS string sent to VEP */
  query: string;
  transcriptId: string;
  mostSevere: string;
  consequenceTerms: string[];
  impact: string;
  hgvsc: string | null;
  hgvsp: string | null;
  sift: { prediction: string; score: number | null } | null;
  polyphen: { prediction: string; score: number | null } | null;
  alphaMissense: { class: string; score: number | null } | null;
  revel: number | null;
  caddPhred: number | null;
  spliceAi: SpliceAiScores | null;
  /** Plugins that the Ensembl REST service did not return this time */
  unavailable: string[];
  provenance?: { sourceUrl: string; retrievedAt: string; recordVersion: string | null } | undefined;
  error?: string | undefined;
};

export type SpliceAiScores = {
  acceptorGain: number;
  acceptorLoss: number;
  donorGain: number;
  donorLoss: number;
  /** Positions (relative to the variant) of each delta score, when reported */
  positions: {
    acceptorGain?: number;
    acceptorLoss?: number;
    donorGain?: number;
    donorLoss?: number;
  };
  max: number;
};

export type PredictionQuery =
  { ok: true; hgvs: string; note?: string } | { ok: false; reason: string };

/**
 * Builds the HGVS string VEP needs (transcript:c.change). Protein-only input is
 * back-translated with the transcript CDS when exactly one SNV explains it.
 */
export function predictionQuery(input: string, transcriptId: string, cds: string): PredictionQuery {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter a variant to run the predictors." };
  if (!transcriptId) return { ok: false, reason: "Reference transcript not loaded yet." };
  const tx = transcriptId.replace(/\.\d+$/, "");
  const p = parseVariant(raw);

  if (p.cdna) {
    if (/^c\.\[/.test(p.cdna)) {
      return {
        ok: false,
        reason:
          "Predictors score one change at a time — enter each change of the allele separately.",
      };
    }
    return { ok: true, hgvs: `${tx}:${p.cdna}` };
  }

  if (p.residue && p.refAa && p.altAa) {
    const t = translateVariant(raw, cds);
    if (t?.kind === "p2c" && t.options.length) {
      const first = t.options[0]!;
      return {
        ok: true,
        hgvs: `${tx}:${first}`,
        ...(t.options.length > 1
          ? {
              note: `Several cDNA changes give this protein change (${t.options.join(", ")}); scores shown for ${first}. SIFT, PolyPhen and AlphaMissense are the same for all; CADD and SpliceAI can differ — enter the cDNA change to be exact.`,
            }
          : { note: `Protein change back-translated to ${first}.` }),
      };
    }
    if (t?.kind === "error") return { ok: false, reason: t.note };
    if (!cds) return { ok: false, reason: "Reference transcript not loaded yet." };
    return { ok: false, reason: "Enter the cDNA change (c.) to run the predictors." };
  }

  return { ok: false, reason: "Enter the cDNA change (c.) to run the predictors." };
}

export type Tone = "damaging" | "benign" | "neutral";
export type PredictionRow = {
  tool: string;
  value: string;
  call: string;
  tone: Tone;
  /** Which calibration or convention the call is based on */
  basis: string;
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);

const humanize = (s: string) => s.replace(/_/g, " ");

/** REVEL bands from the ClinGen SVI calibration (Pejaver et al., AJHG 2022). */
export function revelCall(score: number): { call: string; tone: Tone } {
  if (score >= 0.932) return { call: "PP3 strong", tone: "damaging" };
  if (score >= 0.773) return { call: "PP3 moderate", tone: "damaging" };
  if (score >= 0.644) return { call: "PP3 supporting", tone: "damaging" };
  if (score > 0.29) return { call: "Indeterminate", tone: "neutral" };
  if (score > 0.183) return { call: "BP4 supporting", tone: "benign" };
  if (score > 0.016) return { call: "BP4 moderate", tone: "benign" };
  if (score > 0.003) return { call: "BP4 strong", tone: "benign" };
  return { call: "BP4 very strong", tone: "benign" };
}

/** SpliceAI bands from the ClinGen SVI Splicing Subgroup (Walker et al., AJHG 2023). */
export function spliceAiCall(max: number): { call: string; tone: Tone } {
  if (max >= 0.2) return { call: "PP3 (splice impact predicted)", tone: "damaging" };
  if (max > 0.1) return { call: "Indeterminate", tone: "neutral" };
  return { call: "BP4 (no splice impact predicted)", tone: "benign" };
}

export function predictionRows(r: PredictionResult): PredictionRow[] {
  const rows: PredictionRow[] = [];
  if (r.sift) {
    rows.push({
      tool: "SIFT",
      value: fmt(r.sift.score),
      call: humanize(r.sift.prediction),
      tone: /deleterious/.test(r.sift.prediction)
        ? "damaging"
        : /tolerated/.test(r.sift.prediction)
          ? "benign"
          : "neutral",
      basis: "Tool's own call (deleterious < 0.05)",
    });
  }
  if (r.polyphen) {
    rows.push({
      tool: "PolyPhen-2",
      value: fmt(r.polyphen.score, 3),
      call: humanize(r.polyphen.prediction),
      tone: /damaging/.test(r.polyphen.prediction)
        ? "damaging"
        : /benign/.test(r.polyphen.prediction)
          ? "benign"
          : "neutral",
      basis: "Tool's own call (HumVar)",
    });
  }
  if (r.alphaMissense) {
    rows.push({
      tool: "AlphaMissense",
      value: fmt(r.alphaMissense.score, 3),
      call: humanize(r.alphaMissense.class),
      tone: /pathogenic/.test(r.alphaMissense.class)
        ? "damaging"
        : /benign/.test(r.alphaMissense.class)
          ? "benign"
          : "neutral",
      basis: "Developer classes (not a ClinGen calibration)",
    });
  }
  if (r.revel != null) {
    const c = revelCall(r.revel);
    rows.push({
      tool: "REVEL",
      value: fmt(r.revel, 3),
      call: c.call,
      tone: c.tone,
      basis: "ClinGen calibration (Pejaver 2022)",
    });
  }
  if (r.caddPhred != null) {
    rows.push({
      tool: "CADD",
      value: `PHRED ${fmt(r.caddPhred, 1)}`,
      call:
        r.caddPhred >= 20
          ? "Top 1 % most deleterious"
          : r.caddPhred >= 10
            ? "Top 10 %"
            : "Not in top 10 %",
      tone: "neutral",
      basis: "Genome-wide rank; no calibrated call shown",
    });
  }
  if (r.spliceAi) {
    const c = spliceAiCall(r.spliceAi.max);
    const s = r.spliceAi;
    rows.push({
      tool: "SpliceAI",
      value: `max Δ ${fmt(s.max)} (AG ${fmt(s.acceptorGain)} · AL ${fmt(s.acceptorLoss)} · DG ${fmt(s.donorGain)} · DL ${fmt(s.donorLoss)})`,
      call: c.call,
      tone: c.tone,
      basis: "ClinGen splicing calibration (Walker 2023)",
    });
  }
  return rows;
}

/** One line per tool, for slides. */
export function predictionSummaryLines(r: PredictionResult): string[] {
  return predictionRows(r).map((row) => `${row.tool}: ${row.value} — ${row.call}`);
}

/* ---------- Parsing the VEP REST response ---------- */

type Num = number | string | null | undefined;
const num = (v: Num): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type VepTranscriptJson = {
  transcript_id?: string;
  canonical?: number;
  consequence_terms?: string[];
  impact?: string;
  hgvsc?: string;
  hgvsp?: string;
  sift_prediction?: string;
  sift_score?: Num;
  polyphen_prediction?: string;
  polyphen_score?: Num;
  alphamissense?: { am_class?: string; am_pathogenicity?: Num };
  revel?: Num;
  revel_score?: Num;
  cadd_phred?: Num;
  spliceai?: Record<string, Num | string>;
};

export type VepResultJson = {
  input?: string;
  most_severe_consequence?: string;
  transcript_consequences?: VepTranscriptJson[];
};

function spliceFrom(raw: Record<string, Num | string> | undefined): SpliceAiScores | null {
  if (!raw) return null;
  const get = (k: string) => num((raw[k] ?? raw[k.toLowerCase()]) as Num);
  const ag = get("DS_AG"),
    al = get("DS_AL"),
    dg = get("DS_DG"),
    dl = get("DS_DL");
  if (ag == null && al == null && dg == null && dl == null) return null;
  const positions: SpliceAiScores["positions"] = {};
  const pag = get("DP_AG"),
    pal = get("DP_AL"),
    pdg = get("DP_DG"),
    pdl = get("DP_DL");
  if (pag != null) positions.acceptorGain = pag;
  if (pal != null) positions.acceptorLoss = pal;
  if (pdg != null) positions.donorGain = pdg;
  if (pdl != null) positions.donorLoss = pdl;
  const vals = [ag ?? 0, al ?? 0, dg ?? 0, dl ?? 0];
  return {
    acceptorGain: ag ?? 0,
    acceptorLoss: al ?? 0,
    donorGain: dg ?? 0,
    donorLoss: dl ?? 0,
    positions,
    max: Math.max(...vals),
  };
}

export const PLUGINS = ["AlphaMissense", "REVEL", "CADD", "SpliceAI"] as const;

/** Picks the reference transcript's consequence from a VEP response and normalises it. */
export function parseVep(
  json: VepResultJson[],
  transcriptId: string,
  query: string,
  requested: readonly string[],
): PredictionResult {
  const result: PredictionResult = {
    query,
    transcriptId,
    mostSevere: "",
    consequenceTerms: [],
    impact: "",
    hgvsc: null,
    hgvsp: null,
    sift: null,
    polyphen: null,
    alphaMissense: null,
    revel: null,
    caddPhred: null,
    spliceAi: null,
    unavailable: [],
  };
  const entry = json?.[0];
  if (!entry) return { ...result, error: "VEP returned no result for this variant." };
  const tx = transcriptId.replace(/\.\d+$/, "");
  const tcs = entry.transcript_consequences ?? [];
  const tc =
    tcs.find((t) => (t.transcript_id ?? "").replace(/\.\d+$/, "") === tx) ??
    tcs.find((t) => t.canonical === 1) ??
    tcs[0];
  result.mostSevere = entry.most_severe_consequence ?? "";
  if (!tc) return result;

  result.transcriptId = tc.transcript_id ?? transcriptId;
  result.consequenceTerms = tc.consequence_terms ?? [];
  result.impact = tc.impact ?? "";
  result.hgvsc = tc.hgvsc ?? null;
  result.hgvsp = tc.hgvsp ?? null;
  if (tc.sift_prediction)
    result.sift = { prediction: tc.sift_prediction, score: num(tc.sift_score) };
  if (tc.polyphen_prediction)
    result.polyphen = { prediction: tc.polyphen_prediction, score: num(tc.polyphen_score) };
  if (tc.alphamissense?.am_class)
    result.alphaMissense = {
      class: tc.alphamissense.am_class,
      score: num(tc.alphamissense.am_pathogenicity),
    };
  result.revel = num(tc.revel ?? tc.revel_score);
  result.caddPhred = num(tc.cadd_phred);
  // SpliceAI is reported on the transcript record; fall back to any transcript for the gene.
  result.spliceAi = spliceFrom(tc.spliceai ?? tcs.find((t) => t.spliceai)?.spliceai);

  const missing = PLUGINS.filter((p) => !requested.includes(p));
  result.unavailable = missing;
  return result;
}
