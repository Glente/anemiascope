import { describe, expect, it } from "vitest";

import {
  parseVep,
  PLUGINS,
  predictionQuery,
  predictionRows,
  predictionSummaryLines,
  revelCall,
  spliceAiCall,
  type VepResultJson,
} from "@/lib/predictions";

const HBB_CDS =
  "ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGCTGCTGGTGGTCTACCCTTGGACCCAGAGGTTCTTTGAGTCCTTTGGGGATCTGTCCACTCCTGATGCTGTTATGGGCAACCCTAAGGTGAAGGCTCATGGCAAGAAAGTGCTCGGTGCCTTTAGTGATGGCCTGGCTCACCTGGACAACCTCAAGGGCACCTTTGCCACACTGAGTGAGCTGCACTGTGACAAGCTGCACGTGGATCCTGAGAACTTCAGGCTCCTGGGCAACGTGCTGGTCTGTGTGCTGGCCCATCACTTTGGCAAAGAATTCACCCCACCAGTGCAGGCTGCCTATCAGAAAGTGGTGGCTGGTGTGGCTAATGCCCTGGCCCACAAGTATCACTAA";
const TX = "ENST00000335295.4";

describe("predictionQuery", () => {
  it("uses the cDNA change with the unversioned transcript", () => {
    expect(predictionQuery("c.20A>T p.Glu7Val", TX, HBB_CDS)).toEqual({
      ok: true,
      hgvs: "ENST00000335295:c.20A>T",
    });
  });

  it("passes intronic and UTR changes through (SpliceAI)", () => {
    expect(predictionQuery("c.92+1G>A", TX, HBB_CDS)).toMatchObject({
      ok: true,
      hgvs: "ENST00000335295:c.92+1G>A",
    });
    expect(predictionQuery("c.-78A>G", TX, HBB_CDS)).toMatchObject({ ok: true });
  });

  it("back-translates a protein-only change when one SNV explains it", () => {
    const q = predictionQuery("p.Glu7Val", TX, HBB_CDS);
    expect(q).toMatchObject({ ok: true, hgvs: "ENST00000335295:c.20A>T" });
  });

  it("notes when several SNVs give the same protein change", () => {
    // Glu7Lys: GAG -> AAG only; Glu7Asp: GAG -> GAT or GAC
    const q = predictionQuery("p.Glu7Asp", TX, HBB_CDS);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.note).toMatch(/Several cDNA changes/);
  });

  it("refuses multi-change alleles and empty input", () => {
    expect(predictionQuery("c.[20A>T;79G>A]", TX, HBB_CDS).ok).toBe(false);
    expect(predictionQuery("", TX, HBB_CDS).ok).toBe(false);
    expect(predictionQuery("c.20A>T", "", HBB_CDS).ok).toBe(false);
  });

  it("reports a protein change that does not match the reference", () => {
    const q = predictionQuery("p.Glu6Val", TX, HBB_CDS);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toMatch(/encodes/);
  });
});

describe("calibrated bands", () => {
  it("REVEL follows Pejaver 2022", () => {
    expect(revelCall(0.95).call).toBe("PP3 strong");
    expect(revelCall(0.8).call).toBe("PP3 moderate");
    expect(revelCall(0.644).call).toBe("PP3 supporting");
    expect(revelCall(0.5).call).toBe("Indeterminate");
    expect(revelCall(0.29).call).toBe("BP4 supporting");
    expect(revelCall(0.1).call).toBe("BP4 moderate");
    expect(revelCall(0.01).call).toBe("BP4 strong");
    expect(revelCall(0.002).call).toBe("BP4 very strong");
  });

  it("SpliceAI follows Walker 2023", () => {
    expect(spliceAiCall(0.2).tone).toBe("damaging");
    expect(spliceAiCall(0.15).call).toBe("Indeterminate");
    expect(spliceAiCall(0.1).tone).toBe("benign");
  });
});

/** Shape of an Ensembl VEP REST response (trimmed). */
const VEP_HBS: VepResultJson[] = [
  {
    input: "ENST00000335295:c.20A>T",
    most_severe_consequence: "missense_variant",
    transcript_consequences: [
      {
        transcript_id: "ENST00000647020",
        consequence_terms: ["missense_variant"],
        sift_prediction: "tolerated",
        sift_score: 0.5,
      },
      {
        transcript_id: "ENST00000335295",
        canonical: 1,
        consequence_terms: ["missense_variant"],
        impact: "MODERATE",
        hgvsc: "ENST00000335295.4:c.20A>T",
        hgvsp: "ENSP00000333994.3:p.Glu7Val",
        sift_prediction: "deleterious",
        sift_score: 0.01,
        polyphen_prediction: "probably_damaging",
        polyphen_score: 0.998,
        alphamissense: { am_class: "likely_pathogenic", am_pathogenicity: 0.9 },
        revel: "0.78",
        cadd_phred: 24.6,
        spliceai: { DS_AG: 0, DS_AL: 0.01, DS_DG: 0.03, DS_DL: 0, DP_DG: -12, SYMBOL: "HBB" },
      },
    ],
  },
];

describe("parseVep", () => {
  it("picks the reference transcript and normalises scores", () => {
    const r = parseVep(VEP_HBS, TX, "ENST00000335295:c.20A>T", PLUGINS);
    expect(r.transcriptId).toBe("ENST00000335295");
    expect(r.sift).toEqual({ prediction: "deleterious", score: 0.01 });
    expect(r.polyphen?.score).toBe(0.998);
    expect(r.alphaMissense).toEqual({ class: "likely_pathogenic", score: 0.9 });
    expect(r.revel).toBe(0.78);
    expect(r.caddPhred).toBe(24.6);
    expect(r.spliceAi?.max).toBe(0.03);
    expect(r.spliceAi?.positions.donorGain).toBe(-12);
    expect(r.unavailable).toEqual([]);
  });

  it("lists plugins that were dropped", () => {
    const r = parseVep(VEP_HBS, TX, "q", []);
    expect(r.unavailable).toEqual([...PLUGINS]);
  });

  it("handles an empty response", () => {
    expect(parseVep([], TX, "q", PLUGINS).error).toMatch(/no result/);
  });

  it("builds table rows and slide lines", () => {
    const r = parseVep(VEP_HBS, TX, "q", PLUGINS);
    const rows = predictionRows(r);
    expect(rows.map((x) => x.tool)).toEqual([
      "SIFT",
      "PolyPhen-2",
      "AlphaMissense",
      "REVEL",
      "CADD",
      "SpliceAI",
    ]);
    expect(rows.find((x) => x.tool === "REVEL")?.call).toBe("PP3 moderate");
    expect(rows.find((x) => x.tool === "SpliceAI")?.tone).toBe("benign");
    expect(predictionSummaryLines(r)[0]).toBe("SIFT: 0.01 — deleterious");
  });
});
