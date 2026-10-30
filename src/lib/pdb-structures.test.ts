import { describe, expect, it } from "vitest";

import {
  describeAssembly,
  parseAssembly,
  parseBestStructures,
  parseSifts,
  seqToUnp,
  unpToSeq,
  type ResidueSegment,
} from "@/lib/pdb-structures";

// Shapes follow the PDBe REST API (trimmed). Numbers are illustrative, not real 2VGB values.
const BEST = {
  P30613: [
    {
      pdb_id: "2vgb",
      chain_id: "A",
      experimental_method: "X-ray diffraction",
      resolution: 2.73,
      coverage: 0.92,
      unp_start: 47,
      unp_end: 574,
      start: 1,
      end: 528,
    },
    {
      pdb_id: "2vgb",
      chain_id: "B",
      experimental_method: "X-ray diffraction",
      resolution: 2.73,
      coverage: 0.92,
      unp_start: 47,
      unp_end: 574,
    },
    {
      pdb_id: "6nn4",
      chain_id: "A",
      experimental_method: "X-ray diffraction",
      resolution: "2.1",
      coverage: 0.9,
      unp_start: 44,
      unp_end: 574,
    },
    { pdb_id: "bad!", chain_id: "A" },
  ],
};

const SIFTS = {
  "2vgb": {
    UniProt: {
      P30613: {
        identifier: "KPYR_HUMAN",
        mappings: [
          {
            entity_id: 1,
            chain_id: "A",
            struct_asym_id: "A",
            unp_start: 47,
            unp_end: 300,
            start: { residue_number: 1, author_residue_number: 47 },
            end: { residue_number: 254 },
          },
          {
            entity_id: 1,
            chain_id: "A",
            struct_asym_id: "A",
            unp_start: 306,
            unp_end: 574,
            start: { residue_number: 260, author_residue_number: 306 },
            end: { residue_number: 528 },
          },
          {
            entity_id: 1,
            chain_id: "B",
            struct_asym_id: "B",
            unp_start: 47,
            unp_end: 300,
            start: { residue_number: 1 },
            end: { residue_number: 254 },
          },
          {
            entity_id: 1,
            chain_id: "B",
            struct_asym_id: "B",
            unp_start: 306,
            unp_end: 574,
            start: { residue_number: 260 },
            end: { residue_number: 528 },
          },
        ],
      },
    },
  },
};

describe("parseBestStructures", () => {
  it("dedupes by PDB id, keeps ranking and drops invalid ids", () => {
    const list = parseBestStructures(BEST, "P30613");
    expect(list.map((e) => e.pdbId)).toEqual(["2vgb", "6nn4"]);
    expect(list[0]).toMatchObject({
      chainId: "A",
      resolution: 2.73,
      coverage: 0.92,
      unpStart: 47,
      unpEnd: 574,
    });
    expect(list[1]!.resolution).toBe(2.1);
  });

  it("returns nothing for an unknown accession", () => {
    expect(parseBestStructures(BEST, "P00000")).toEqual([]);
    expect(parseBestStructures(null, "P30613")).toEqual([]);
  });
});

describe("parseSifts", () => {
  it("collects segments and chains for the protein's entity", () => {
    const m = parseSifts(SIFTS, "2VGB", "P30613")!;
    expect(m.entityId).toBe("1");
    expect(m.chains).toEqual(["A", "B"]);
    expect(m.segments).toEqual([
      { unpStart: 47, unpEnd: 300, seqStart: 1 },
      { unpStart: 306, unpEnd: 574, seqStart: 260 },
    ]);
  });

  it("picks the right entity in a heteromer (beta globin in a haemoglobin entry)", () => {
    const hb = {
      "4hhb": {
        UniProt: {
          P69905: {
            mappings: [
              {
                entity_id: 1,
                chain_id: "A",
                unp_start: 2,
                unp_end: 142,
                start: { residue_number: 1 },
              },
            ],
          },
          P68871: {
            mappings: [
              {
                entity_id: 2,
                chain_id: "B",
                unp_start: 2,
                unp_end: 147,
                start: { residue_number: 1 },
              },
            ],
          },
        },
      },
    };
    const m = parseSifts(hb, "4hhb", "P68871")!;
    expect(m.entityId).toBe("2");
    // HbS: UniProt Glu7 (HGVS p.Glu7Val) is label_seq_id 6 when Met1 is absent
    expect(unpToSeq(m.segments, 7)).toBe(6);
  });

  it("accepts isoform-suffixed accessions", () => {
    const iso = {
      "1abc": { UniProt: { "P30613-2": { mappings: SIFTS["2vgb"].UniProt.P30613.mappings } } },
    };
    expect(parseSifts(iso, "1abc", "P30613")?.segments).toHaveLength(2);
  });

  it("returns null when the accession is not in the entry", () => {
    expect(parseSifts(SIFTS, "2vgb", "P68871")).toBeNull();
  });
});

describe("residue mapping", () => {
  const segs: ResidueSegment[] = [
    { unpStart: 47, unpEnd: 300, seqStart: 1 },
    { unpStart: 306, unpEnd: 574, seqStart: 260 },
  ];

  it("maps UniProt numbering to label_seq_id and back", () => {
    expect(unpToSeq(segs, 47)).toBe(1);
    expect(unpToSeq(segs, 510)).toBe(464);
    expect(seqToUnp(segs, 464)).toBe(510);
    for (const r of [47, 100, 300, 306, 486, 574])
      expect(seqToUnp(segs, unpToSeq(segs, r)!)).toBe(r);
  });

  it("returns null outside the mapped construct", () => {
    expect(unpToSeq(segs, 10)).toBeNull();
    expect(unpToSeq(segs, 303)).toBeNull();
    expect(unpToSeq(segs, 600)).toBeNull();
    expect(seqToUnp(segs, 1000)).toBeNull();
  });
});

describe("assemblies", () => {
  it("prefers the preferred assembly and describes it", () => {
    const a = parseAssembly(
      {
        "2vgb": [
          { assembly_id: "2", name: "dimer", form: "homo" },
          { assembly_id: "1", name: "tetramer", form: "homo", preferred: true },
        ],
      },
      "2vgb",
    );
    expect(a).toEqual({ id: "1", name: "tetramer", form: "homo" });
    expect(describeAssembly(a)).toBe("homo-tetramer");
    expect(describeAssembly({ id: "1", name: "monomer", form: "homo" })).toBe("monomer");
    expect(parseAssembly({}, "2vgb")).toBeNull();
  });
});
