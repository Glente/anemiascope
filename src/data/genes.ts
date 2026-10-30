import { PANEL_GENES, PANEL_MEMBERSHIP } from "./panel-genes";

export type GeneCategory = "membrane" | "enzyme" | "hemoglobin" | "other";

/** Revised WHO classification of G6PD variants (WHO Malaria Policy Advisory Group, 2022). */
export type G6pdWhoClass = "A" | "B" | "C" | "U";
/** Traditional WHO classification (1967/1985), historical classes I–V. */
export type G6pdHistoricalClass = "I" | "II" | "III" | "IV" | "V";

export type G6pdClassification = {
  who: G6pdWhoClass;
  historical: G6pdHistoricalClass;
  /** Typical residual activity (% of normal) underlying the class, when reported. */
  activity?: string;
};

export const G6PD_WHO_CLASSES: Record<G6pdWhoClass, { title: string; criteria: string }> = {
  A: {
    title: "Class A",
    criteria: "Median activity < 20 % with chronic non-spherocytic hemolytic anemia (CNSHA).",
  },
  B: {
    title: "Class B",
    criteria:
      "Median activity < 45 %; acute hemolysis triggered by oxidants, fava beans or infection.",
  },
  C: { title: "Class C", criteria: "Median activity 60–150 %; no hemolysis." },
  U: { title: "Class U", criteria: "Any activity; uncertain clinical significance." },
};

export const G6PD_HISTORICAL_CLASSES: Record<
  G6pdHistoricalClass,
  { title: string; criteria: string }
> = {
  I: {
    title: "Class I",
    criteria: "Severe deficiency with chronic non-spherocytic hemolytic anemia.",
  },
  II: {
    title: "Class II",
    criteria: "Severe deficiency, < 10 % activity; intermittent acute hemolysis.",
  },
  III: {
    title: "Class III",
    criteria: "Moderate deficiency, 10–60 % activity; hemolysis with stressors.",
  },
  IV: { title: "Class IV", criteria: "Normal activity, 60–150 %." },
  V: { title: "Class V", criteria: "Increased activity, > 150 %." },
};

export type VariantPreset = {
  label: string;
  protein: string;
  cdna?: string;
  residue?: number;
  note?: string;
  /** Only set for G6PD variants. */
  g6pd?: G6pdClassification;
};

export type Gene = {
  symbol: string;
  category: GeneCategory;
  protein: string;
  uniprot: string;
  mim?: string;
  phenotypeMim?: { mim: string; name: string }[];
  orpha?: { code: string; name: string }[];
  inheritance: string;
  summary: string;
  transcript?: string;
  presets: VariantPreset[];
  panels?: string[];
  /** Curated, frequently used gene shown in the default dropdown. */
  common?: boolean;
};

export const CATEGORY_LABEL: Record<GeneCategory, string> = {
  membrane: "Red cell membrane",
  enzyme: "Red cell enzymes",
  hemoglobin: "Hemoglobin",
  other: "Other panel genes",
};

const CURATED: Gene[] = [
  {
    symbol: "ANK1",
    category: "membrane",
    protein: "Ankyrin-1",
    uniprot: "P16157",
    mim: "612641",
    phenotypeMim: [{ mim: "182900", name: "Spherocytosis type 1" }],
    orpha: [{ code: "822", name: "Hereditary spherocytosis" }],
    inheritance: "Autosomal dominant (de novo common); rare recessive",
    summary:
      "Anchors the spectrin-actin skeleton to band 3. Loss-of-function causes hereditary spherocytosis, most often with combined spectrin/ankyrin deficiency.",
    transcript: "NM_020476.3",
    presets: [],
  },
  {
    symbol: "SPTA1",
    category: "membrane",
    protein: "Spectrin alpha chain, erythrocytic 1",
    uniprot: "P02549",
    mim: "182860",
    phenotypeMim: [
      { mim: "270970", name: "Spherocytosis type 3" },
      { mim: "611804", name: "Elliptocytosis type 2" },
      { mim: "266140", name: "Pyropoikilocytosis" },
    ],
    orpha: [
      { code: "822", name: "Hereditary spherocytosis" },
      { code: "288", name: "Hereditary elliptocytosis" },
    ],
    inheritance: "Recessive for HS type 3; dominant for HE/HPP",
    summary:
      "Alpha spectrin forms the heterodimer backbone of the membrane skeleton. Self-association-site variants give elliptocytosis/pyropoikilocytosis; hypomorphic alleles in trans give severe recessive spherocytosis.",
    transcript: "NM_003126.4",
    presets: [
      {
        label: "alpha-LELY (low expression allele Lyon)",
        protein: "p.Leu1858Val",
        cdna: "c.5572C>G",
        residue: 1858,
        note: "Low-expression allele; clinically relevant only in trans with a pathogenic SPTA1 allele.",
      },
    ],
  },
  {
    symbol: "SPTB",
    category: "membrane",
    protein: "Spectrin beta chain, erythrocytic",
    uniprot: "P11277",
    mim: "182870",
    phenotypeMim: [
      { mim: "182870", name: "Spherocytosis type 2" },
      { mim: "130600", name: "Elliptocytosis type 3" },
    ],
    orpha: [
      { code: "822", name: "Hereditary spherocytosis" },
      { code: "288", name: "Hereditary elliptocytosis" },
    ],
    inheritance: "Autosomal dominant",
    summary:
      "Beta spectrin pairs with alpha spectrin; truncating variants typically cause dominant spherocytosis, self-association-domain variants cause elliptocytosis.",
    transcript: "NM_001355436.2",
    presets: [],
  },
  {
    symbol: "SLC4A1",
    category: "membrane",
    protein: "Band 3 anion transport protein (AE1)",
    uniprot: "P02730",
    mim: "109270",
    phenotypeMim: [
      { mim: "612653", name: "Spherocytosis type 4" },
      { mim: "109270", name: "Southeast Asian ovalocytosis" },
      { mim: "179800", name: "Distal renal tubular acidosis" },
    ],
    orpha: [
      { code: "822", name: "Hereditary spherocytosis" },
      { code: "98868", name: "Southeast Asian ovalocytosis" },
    ],
    inheritance: "Autosomal dominant (recessive forms with dRTA)",
    summary:
      "Major integral membrane protein and anion exchanger; also a skeletal anchoring site. Variants cause spherocytosis, ovalocytosis, stomatocytosis and distal renal tubular acidosis.",
    transcript: "NM_000342.4",
    presets: [
      { label: "Band 3 Memphis", protein: "p.Lys56Glu", cdna: "c.166A>G", residue: 56 },
      { label: "Band 3 Coimbra", protein: "p.Val488Met", cdna: "c.1462G>A", residue: 488 },
      {
        label: "SAO (Southeast Asian ovalocytosis)",
        protein: "p.Ala400_Ala408del",
        cdna: "c.1199_1225del",
        residue: 400,
        note: "In-frame 9-amino-acid deletion at the membrane domain boundary.",
      },
    ],
  },
  {
    symbol: "EPB42",
    category: "membrane",
    protein: "Erythrocyte membrane protein band 4.2",
    uniprot: "P16452",
    mim: "177070",
    phenotypeMim: [{ mim: "612690", name: "Spherocytosis type 5" }],
    orpha: [{ code: "822", name: "Hereditary spherocytosis" }],
    inheritance: "Autosomal recessive",
    summary:
      "Band 4.2 stabilises the band 3-ankyrin complex. Deficiency causes recessive spherocytosis, frequent in Japanese cohorts.",
    transcript: "NM_000119.3",
    presets: [{ label: "Band 4.2 Nippon", protein: "p.Ala142Thr", cdna: "c.424G>A", residue: 142 }],
  },
  {
    symbol: "PIEZO1",
    category: "membrane",
    protein: "Piezo-type mechanosensitive ion channel component 1",
    uniprot: "Q92508",
    mim: "611184",
    phenotypeMim: [{ mim: "194380", name: "Dehydrated hereditary stomatocytosis 1" }],
    orpha: [{ code: "3202", name: "Dehydrated hereditary stomatocytosis" }],
    inheritance: "Autosomal dominant (gain of function)",
    summary:
      "Mechanosensitive cation channel; slowed inactivation causes cation leak, cell dehydration, xerocytosis and marked iron loading.",
    transcript: "NM_001142864.4",
    presets: [],
  },
  {
    symbol: "RHAG",
    category: "membrane",
    protein: "Ammonium transporter Rh type A",
    uniprot: "Q02094",
    mim: "180297",
    phenotypeMim: [{ mim: "185000", name: "Overhydrated hereditary stomatocytosis" }],
    orpha: [{ code: "3203", name: "Overhydrated hereditary stomatocytosis" }],
    inheritance: "Autosomal dominant (OHSt); recessive Rh-null regulator type",
    summary:
      "Rh-associated glycoprotein; specific variants convert it into a cation leak pathway causing overhydrated stomatocytosis.",
    transcript: "NM_000324.3",
    presets: [],
  },
  {
    symbol: "G6PD",
    category: "enzyme",
    protein: "Glucose-6-phosphate 1-dehydrogenase",
    uniprot: "P11413",
    mim: "305900",
    phenotypeMim: [{ mim: "300908", name: "G6PD deficiency / favism" }],
    orpha: [{ code: "466", name: "Glucose-6-phosphate dehydrogenase deficiency" }],
    inheritance: "X-linked",
    summary:
      "Rate-limiting enzyme of the pentose phosphate pathway and the red cell's only NADPH source. Deficiency causes acute hemolysis with oxidative stress; class I variants cause chronic non-spherocytic hemolytic anemia.",
    transcript: "NM_001360016.2",
    presets: [
      {
        label: "G6PD Mediterranean",
        protein: "p.Ser188Phe",
        cdna: "c.563C>T",
        residue: 188,
        note: "Severe acute hemolysis with fava beans and oxidant drugs.",
        g6pd: { who: "B", historical: "II", activity: "< 10 %" },
      },
      {
        label: "G6PD A- (202A/376G)",
        protein: "p.Val68Met",
        cdna: "c.202G>A",
        residue: 68,
        note: "Usually in cis with c.376A>G (p.Asn126Asp).",
        g6pd: { who: "B", historical: "III", activity: "10–60 %" },
      },
      {
        label: "G6PD A+ (376G)",
        protein: "p.Asn126Asp",
        cdna: "c.376A>G",
        residue: 126,
        g6pd: { who: "C", historical: "IV", activity: "60–150 %" },
      },
      {
        label: "G6PD Canton",
        protein: "p.Arg459Leu",
        cdna: "c.1376G>T",
        residue: 459,
        g6pd: { who: "B", historical: "II" },
      },
      {
        label: "G6PD Kaiping",
        protein: "p.Arg463His",
        cdna: "c.1388G>A",
        residue: 463,
        g6pd: { who: "B", historical: "II" },
      },
      {
        label: "G6PD Union",
        protein: "p.Arg454Cys",
        cdna: "c.1360C>T",
        residue: 454,
        g6pd: { who: "B", historical: "II" },
      },
    ],
  },
  {
    symbol: "PKLR",
    category: "enzyme",
    protein: "Pyruvate kinase PKLR (R-type/L-type)",
    uniprot: "P30613",
    mim: "609712",
    phenotypeMim: [{ mim: "266200", name: "Pyruvate kinase deficiency" }],
    orpha: [{ code: "766", name: "Pyruvate kinase deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "Final ATP-generating step of glycolysis. Deficiency causes chronic non-spherocytic hemolytic anemia with raised 2,3-DPG, and iron overload independent of transfusion.",
    transcript: "NM_000298.6",
    presets: [
      {
        label: "p.Arg510Gln (common European)",
        protein: "p.Arg510Gln",
        cdna: "c.1529G>A",
        residue: 510,
      },
      { label: "p.Arg486Trp", protein: "p.Arg486Trp", cdna: "c.1456C>T", residue: 486 },
      { label: "p.Thr384Met", protein: "p.Thr384Met", cdna: "c.1151C>T", residue: 384 },
      { label: "p.Arg479His", protein: "p.Arg479His", cdna: "c.1436G>A", residue: 479 },
    ],
  },
  {
    symbol: "TPI1",
    category: "enzyme",
    protein: "Triosephosphate isomerase",
    uniprot: "P60174",
    mim: "190450",
    phenotypeMim: [{ mim: "615512", name: "Triosephosphate isomerase deficiency" }],
    orpha: [{ code: "868", name: "Triosephosphate isomerase deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "Glycolytic isomerase. Deficiency gives hemolytic anemia with progressive neuromuscular disease and early mortality.",
    transcript: "NM_000365.6",
    presets: [
      {
        label: "TPI Manchester p.Glu105Asp",
        protein: "p.Glu105Asp",
        cdna: "c.315G>C",
        residue: 105,
        note: "Legacy nomenclature Glu104Asp; the most common pathogenic allele.",
      },
    ],
  },
  {
    symbol: "GPI",
    category: "enzyme",
    protein: "Glucose-6-phosphate isomerase",
    uniprot: "P06744",
    mim: "172400",
    phenotypeMim: [{ mim: "613470", name: "Hemolytic anemia, GPI deficiency" }],
    orpha: [{ code: "712", name: "Glucose phosphate isomerase deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "Second glycolytic step; also acts extracellularly as neuroleukin. Deficiency causes chronic non-spherocytic hemolytic anemia, sometimes with neurological features.",
    transcript: "NM_000175.5",
    presets: [],
  },
  {
    symbol: "PGK1",
    category: "enzyme",
    protein: "Phosphoglycerate kinase 1",
    uniprot: "P00558",
    mim: "311800",
    phenotypeMim: [{ mim: "300653", name: "Phosphoglycerate kinase 1 deficiency" }],
    orpha: [{ code: "713", name: "Phosphoglycerate kinase deficiency" }],
    inheritance: "X-linked",
    summary:
      "ATP-generating glycolytic kinase. Deficiency combines hemolytic anemia with myopathy and CNS involvement in varying proportion.",
    transcript: "NM_000291.4",
    presets: [],
  },
  {
    symbol: "HK1",
    category: "enzyme",
    protein: "Hexokinase-1",
    uniprot: "P19367",
    mim: "142600",
    phenotypeMim: [{ mim: "235700", name: "Hexokinase deficiency hemolytic anemia" }],
    orpha: [{ code: "90031", name: "Hexokinase deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "First glycolytic step. Very rare deficiency with chronic hemolysis and, unusually, low 2,3-DPG and left-shifted oxygen dissociation.",
    transcript: "NM_000188.3",
    presets: [],
  },
  {
    symbol: "ALDOA",
    category: "enzyme",
    protein: "Fructose-bisphosphate aldolase A",
    uniprot: "P04075",
    mim: "103850",
    phenotypeMim: [{ mim: "611881", name: "Aldolase A deficiency" }],
    orpha: [{ code: "57", name: "Aldolase A deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "Glycolytic aldolase; deficiency causes hemolytic anemia often with myopathy and rhabdomyolysis during fever.",
    transcript: "NM_000034.4",
    presets: [],
  },
  {
    symbol: "NT5C3A",
    category: "enzyme",
    protein: "Pyrimidine 5'-nucleotidase (P5'N-1)",
    uniprot: "Q9H0P0",
    mim: "606224",
    phenotypeMim: [{ mim: "266120", name: "Pyrimidine 5'-nucleotidase deficiency" }],
    orpha: [{ code: "35122", name: "Pyrimidine 5'-nucleotidase deficiency" }],
    inheritance: "Autosomal recessive",
    summary:
      "Degrades pyrimidine nucleotides during reticulocyte maturation. Deficiency is the classic cause of hereditary hemolysis with marked basophilic stippling.",
    transcript: "NM_016489.14",
    presets: [],
  },
  {
    symbol: "HBB",
    category: "hemoglobin",
    protein: "Hemoglobin subunit beta",
    uniprot: "P68871",
    mim: "141900",
    phenotypeMim: [
      { mim: "603903", name: "Sickle cell disease" },
      { mim: "613985", name: "Beta-thalassemia" },
    ],
    orpha: [
      { code: "232", name: "Sickle cell anemia" },
      { code: "848", name: "Beta-thalassemia" },
    ],
    inheritance: "Autosomal recessive (dominant for some unstable variants)",
    summary:
      "Beta globin chain. Structural variants give sickling and unstable hemoglobins; quantitative defects give beta-thalassemia.",
    transcript: "NM_000518.5",
    presets: [
      {
        label: "HbS (sickle)",
        protein: "p.Glu7Val",
        cdna: "c.20A>T",
        residue: 7,
        note: "Legacy nomenclature Glu6Val (HGVS counts the initiator methionine).",
      },
      { label: "HbC", protein: "p.Glu7Lys", cdna: "c.19G>A", residue: 7 },
      {
        label: "HbE",
        protein: "p.Glu27Lys",
        cdna: "c.79G>A",
        residue: 27,
        note: "Legacy Glu26Lys; also activates a cryptic splice site (beta-thalassemic behaviour).",
      },
      { label: "Hb D-Punjab", protein: "p.Glu122Gln", cdna: "c.364G>C", residue: 122 },
      { label: "Hb O-Arab", protein: "p.Glu122Lys", cdna: "c.364G>A", residue: 122 },
    ],
  },
  {
    symbol: "HBA1",
    category: "hemoglobin",
    protein: "Hemoglobin subunit alpha",
    uniprot: "P69905",
    mim: "141800",
    phenotypeMim: [{ mim: "604131", name: "Alpha-thalassemia" }],
    orpha: [{ code: "846", name: "Alpha-thalassemia" }],
    inheritance: "Autosomal recessive / gene dosage",
    summary:
      "One of the two alpha globin genes. Deletions dominate alpha-thalassemia; point variants give unstable or high/low-affinity hemoglobins.",
    transcript: "NM_000558.5",
    presets: [],
  },
  {
    symbol: "HBA2",
    category: "hemoglobin",
    protein: "Hemoglobin subunit alpha",
    uniprot: "P69905",
    mim: "141850",
    phenotypeMim: [{ mim: "604131", name: "Alpha-thalassemia" }],
    orpha: [{ code: "846", name: "Alpha-thalassemia" }],
    inheritance: "Autosomal recessive / gene dosage",
    summary:
      "The more highly expressed alpha globin gene; HBA2 point variants therefore tend to have a larger phenotypic effect than HBA1.",
    transcript: "NM_000517.6",
    presets: [
      {
        label: "Hb Constant Spring",
        protein: "p.Ter143Glnext*31",
        cdna: "c.427T>C",
        note: "Stop-codon readthrough producing an elongated, unstable alpha chain (no single residue to map).",
      },
    ],
  },
  {
    symbol: "HBD",
    category: "hemoglobin",
    protein: "Hemoglobin subunit delta",
    uniprot: "P02042",
    mim: "142000",
    orpha: [{ code: "848", name: "Beta-thalassemia (HbA2 interpretation)" }],
    inheritance: "Autosomal recessive",
    summary:
      "Delta globin (HbA2). Delta variants matter mainly because they lower measured HbA2 and can mask beta-thalassemia trait.",
    transcript: "NM_000519.4",
    presets: [],
  },
];

export const GENES: Gene[] = [
  ...CURATED.map((g) => ({ ...g, common: true, panels: PANEL_MEMBERSHIP[g.symbol] ?? [] })),
  ...PANEL_GENES,
];

export function getGene(symbol: string): Gene | undefined {
  return GENES.find((g) => g.symbol === symbol);
}
