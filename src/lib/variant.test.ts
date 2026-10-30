import { describe, expect, it } from "vitest";

import { GENES } from "@/data/genes";
import {
  describeVariant,
  parseVariant,
  substitutionContext,
  translateCds,
  translateVariant,
  validateVariant,
} from "@/lib/variant";

/** HBB coding sequence (NM_000518.5 / ENST00000335295), including the stop codon. */
const HBB_CDS =
  "ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGCTGCTGGTGGTCTACCCTTGGACCCAGAGGTTCTTTGAGTCCTTTGGGGATCTGTCCACTCCTGATGCTGTTATGGGCAACCCTAAGGTGAAGGCTCATGGCAAGAAAGTGCTCGGTGCCTTTAGTGATGGCCTGGCTCACCTGGACAACCTCAAGGGCACCTTTGCCACACTGAGTGAGCTGCACTGTGACAAGCTGCACGTGGATCCTGAGAACTTCAGGCTCCTGGGCAACGTGCTGGTCTGTGTGCTGGCCCATCACTTTGGCAAAGAATTCACCCCACCAGTGCAGGCTGCCTATCAGAAAGTGGTGGCTGGTGTGGCTAATGCCCTGGCCCACAAGTATCACTAA";

/** Beta-globin, UniProt P68871. */
const HBB_PROTEIN =
  "MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH";

describe("parseVariant — consequence and residue", () => {
  const cases: [
    input: string,
    residue: number | undefined,
    ref: string | undefined,
    alt: string | undefined,
    consequence: string,
  ][] = [
    ["p.Ser188Phe", 188, "S", "F", "Missense"],
    ["S188F", 188, "S", "F", "Missense"],
    ["p.(Glu7Val)", 7, "E", "V", "Missense"],
    ["NM_000402.4(G6PD):c.563C>T (p.Ser188Phe)", 188, "S", "F", "Missense"],
    ["c.315G>C (p.Glu105Asp)", 105, "E", "D", "Missense"],
    ["c.563C>T", 188, undefined, undefined, "Nucleotide-level variant"],
    ["p.Ser188=", 188, "S", "S", "Synonymous"],
    ["p.S188=", 188, "S", "S", "Synonymous"],
    ["p.Gln40Ter", 40, "Q", "*", "Nonsense"],
    ["p.Q40*", 40, "Q", "*", "Nonsense"],
    ["Q40X", 40, "Q", "*", "Nonsense"],
    ["p.Trp15*", 15, "W", "*", "Nonsense"],
    ["p.Ter143GlnextTer31", 143, "*", undefined, "Stop-loss (C-terminal extension)"],
    ["p.*143Glnext*31", 143, "*", undefined, "Stop-loss (C-terminal extension)"],
    ["p.Met1?", 1, "M", undefined, "Start-loss"],
    ["p.(Met1?)", 1, "M", undefined, "Start-loss"],
    ["p.Leu17ProfsTer12", 17, "L", undefined, "Frameshift"],
    ["p.Glu7delinsValLys", 7, "E", undefined, "Deletion-insertion"],
    ["c.123_125delinsA", 41, undefined, undefined, "Deletion-insertion"],
    ["c.123del", 41, undefined, undefined, "Deletion"],
    ["c.27dupG", 9, undefined, undefined, "Duplication"],
    ["c.315+1G>A", undefined, undefined, undefined, "Intronic / splice region"],
    ["c.92+5G>C", undefined, undefined, undefined, "Intronic / splice region"],
    ["c.-12-2A>G", undefined, undefined, undefined, "Intronic / splice region"],
    ["c.-78A>G", undefined, undefined, undefined, "5′ UTR"],
    ["c.*110A>G", undefined, undefined, undefined, "3′ UTR"],
    ["HbS", undefined, undefined, undefined, "Unclassified"],
    ["", undefined, undefined, undefined, "Unclassified"],
  ];

  it.each(cases)("%s", (input, residue, ref, alt, consequence) => {
    const p = parseVariant(input);
    expect(p.consequence).toBe(consequence);
    expect(p.residue).toBe(residue);
    expect(p.refAa).toBe(ref);
    expect(p.altAa).toBe(alt);
  });

  it("parses multi-change alleles into several residues", () => {
    const p = parseVariant("c.[202G>A;376A>G]");
    expect(p.residue).toBe(68);
    expect(p.extraResidues).toEqual([126]);
    expect(p.cdna).toBe("c.[202G>A;376A>G]");
  });
});

describe("curated presets", () => {
  const presets = GENES.flatMap((g) => g.presets.map((p) => ({ gene: g.symbol, ...p })));

  it.each(presets.map((p) => [`${p.gene} ${p.label}`, p] as const))(
    "%s parses consistently",
    (_name, p) => {
      // Same string the workspace builds when a preset is clicked
      const parsed = parseVariant(`${p.cdna ? `${p.cdna} ` : ""}${p.protein}`);
      expect(parsed.consequence).not.toBe("Unclassified");
      if (p.residue) expect(parsed.residue).toBe(p.residue);
    },
  );

  it("Hb Constant Spring is a stop-loss, not a nonsense variant", () => {
    const cs = GENES.find((g) => g.symbol === "HBA2")!.presets.find(
      (p) => p.label === "Hb Constant Spring",
    )!;
    expect(parseVariant(`${cs.cdna} ${cs.protein}`).consequence).toBe(
      "Stop-loss (C-terminal extension)",
    );
  });
});

describe("describeVariant and substitutionContext", () => {
  it("renders three-letter descriptions", () => {
    expect(describeVariant(parseVariant("S188F"))).toBe("Ser188Phe");
    expect(describeVariant(parseVariant("p.Q40*"))).toBe("Gln40Ter");
  });

  it("does not describe a stop codon as an amino-acid class change", () => {
    const notes = substitutionContext(parseVariant("p.Gln40Ter"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/Premature stop/);
  });

  it("flags class changes for missense", () => {
    expect(substitutionContext(parseVariant("p.Glu7Val")).join(" ")).toMatch(
      /Change of amino-acid class/,
    );
  });
});

describe("HBB reference fixture", () => {
  it("translates to the UniProt sequence", () => {
    expect(translateCds(HBB_CDS)).toBe(HBB_PROTEIN);
  });
});

describe("translateVariant", () => {
  it("predicts HbS from c.20A>T", () => {
    expect(translateVariant("c.20A>T", HBB_CDS)).toEqual({
      kind: "c2p",
      protein: "p.(Glu7Val)",
      note: "GAG → GTG",
    });
  });

  it("suggests cDNA changes for a protein change", () => {
    const t = translateVariant("p.Glu7Val", HBB_CDS);
    expect(t).toEqual({ kind: "p2c", options: ["c.20A>T"] });
  });

  it("reports a wrong reference base", () => {
    expect(translateVariant("c.20G>T", HBB_CDS)).toMatchObject({ kind: "error" });
  });
});

describe("validateVariant", () => {
  const v = (input: string, uniprot: string | undefined = HBB_PROTEIN) =>
    validateVariant(input, HBB_CDS, "ENST00000335295.4", uniprot);

  it("accepts every curated HBB preset", () => {
    const hbb = GENES.find((g) => g.symbol === "HBB")!;
    for (const p of hbb.presets) {
      const r = v(`${p.cdna} ${p.protein}`);
      expect(r.status, `${p.label}: ${r.checks.map((c) => c.message).join(" | ")}`).toBe("ok");
    }
  });

  it("catches discordant cDNA and protein descriptions", () => {
    const r = v("c.20A>T p.Glu7Lys");
    expect(r.status).toBe("error");
    expect(r.checks.some((c) => /predicts Glu7Val/.test(c.message))).toBe(true);
  });

  it("catches cDNA and protein naming different codons", () => {
    expect(v("c.20A>T p.Glu27Val").status).toBe("error");
  });

  it("catches legacy hemoglobin numbering", () => {
    const r = v("p.Glu6Val");
    expect(r.status).toBe("error");
    expect(r.checks[0]!.message).toMatch(/Legacy numbering/);
  });

  it("catches a wrong reference base", () => {
    expect(v("c.20G>T").status).toBe("error");
  });

  it("checks stated deleted bases", () => {
    expect(v("c.1_3delATG").status).toBe("ok");
    expect(v("c.1_3delATC").status).toBe("error");
  });

  it("checks each change in a multi-change allele", () => {
    expect(v("c.[20A>T;79G>A]").status).toBe("ok");
    expect(v("c.[20A>T;79C>A]").status).toBe("error");
  });

  it("flags positions beyond the coding sequence", () => {
    expect(v("c.900A>T").status).toBe("error");
    expect(v("p.Ala300Val").status).toBe("error");
  });

  it("only informs for intronic and UTR positions", () => {
    expect(v("c.92+1G>A").status).toBe("info");
    expect(v("c.-78A>G").status).toBe("info");
  });

  it("warns when the transcript and UniProt sequences differ", () => {
    const r = v("c.20A>T", `${HBB_PROTEIN}X`);
    expect(r.status).toBe("warn");
  });

  it("does nothing without input", () => {
    expect(v("").checks).toEqual([]);
  });
});
