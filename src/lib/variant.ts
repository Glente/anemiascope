const THREE_TO_ONE: Record<string, string> = {
  Ala: "A", Arg: "R", Asn: "N", Asp: "D", Cys: "C", Gln: "Q", Glu: "E", Gly: "G",
  His: "H", Ile: "I", Leu: "L", Lys: "K", Met: "M", Phe: "F", Pro: "P", Ser: "S",
  Thr: "T", Trp: "W", Tyr: "Y", Val: "V", Ter: "*", Sec: "U",
};

export const ONE_TO_THREE: Record<string, string> = Object.fromEntries(
  Object.entries(THREE_TO_ONE).map(([three, one]) => [one, three]),
);

export type ParsedVariant = {
  raw: string;
  residue?: number;
  refAa?: string;
  altAa?: string;
  consequence: string;
  protein?: string;
  cdna?: string;
};

/**
 * Accepts protein notation (p.Ser188Phe, p.S188F, S188F), cDNA (c.563C>T)
 * and full HGVS strings (NM_000402.4(G6PD):c.563C>T (p.Ser188Phe)).
 */
export function parseVariant(input: string): ParsedVariant {
  const raw = input.trim();
  const result: ParsedVariant = { raw, consequence: "Unclassified" };
  if (!raw) return result;

  const cdnaMatch = raw.match(/c\.[^\s()]+/i);
  if (cdnaMatch) result.cdna = cdnaMatch[0];

  const proteinChunk = raw.match(/p\.\(?[A-Za-z*]{1,3}\d+[A-Za-z*_>=]*[^\s()]*/);
  const proteinText = proteinChunk ? proteinChunk[0].replace(/^p\.\(?/, "") : raw;

  // Frameshift / nonsense / deletion keywords
  if (/fs/i.test(proteinText)) result.consequence = "Frameshift";
  else if (/Ter|\*$|\*\d|X$/.test(proteinText)) result.consequence = "Nonsense / stop-related";
  else if (/del/i.test(proteinText)) result.consequence = "Deletion";
  else if (/dup/i.test(proteinText)) result.consequence = "Duplication";
  else if (/ins/i.test(proteinText)) result.consequence = "Insertion";
  else if (/^c\./i.test(raw) && /[+-]\d/.test(raw)) result.consequence = "Intronic / splice region";

  const toOne = (code: string | undefined): string | undefined =>
    code ? (THREE_TO_ONE[code] ?? code) : undefined;

  const three = proteinText.match(/^([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})?/);
  const one = three ? null : proteinText.match(/^([A-Z*])(\d+)([A-Z*])?/);
  if (three) {
    const ref = toOne(three[1]);
    const alt = toOne(three[3]);
    if (ref) result.refAa = ref;
    if (alt) result.altAa = alt;
    result.residue = Number(three[2]);
  } else if (one) {
    const ref = one[1];
    const alt = one[3];
    if (ref) result.refAa = ref;
    if (alt) result.altAa = alt;
    result.residue = Number(one[2]);
  } else {
    const bare = proteinText.match(/(\d+)/);
    if (bare && /p\./.test(raw)) result.residue = Number(bare[1]);
  }

  // Derive the affected codon from a coding cDNA position (e.g. c.20A>T -> codon 7)
  if (!result.residue) {
    const pos = (result.cdna ?? "").match(/^c\.(\d+)(?=[ACGTacgt]>|del|dup|ins|_|$)/);
    if (pos && Number(pos[1]) > 0) result.residue = Math.ceil(Number(pos[1]) / 3);
  }

  if (result.consequence === "Unclassified" && result.refAa && result.altAa) {
    result.consequence = result.refAa === result.altAa ? "Synonymous" : "Missense";
  }
  if (result.consequence === "Unclassified" && result.cdna && !result.residue) {
    result.consequence = "Nucleotide-level variant";
  }

  if (proteinChunk) result.protein = proteinChunk[0];
  return result;
}

export function describeVariant(p: ParsedVariant): string {
  if (p.refAa && p.altAa && p.residue) {
    const from = ONE_TO_THREE[p.refAa] ?? p.refAa;
    const to = ONE_TO_THREE[p.altAa] ?? p.altAa;
    return `${from}${p.residue}${to}`;
  }
  return p.raw;
}

const HYDROPHOBIC = new Set(["A", "V", "L", "I", "M", "F", "W", "C", "P"]);
const CHARGED_POS = new Set(["K", "R", "H"]);
const CHARGED_NEG = new Set(["D", "E"]);
const POLAR = new Set(["S", "T", "N", "Q", "Y", "G"]);

function classOf(aa: string): string {
  if (CHARGED_POS.has(aa)) return "positively charged";
  if (CHARGED_NEG.has(aa)) return "negatively charged";
  if (HYDROPHOBIC.has(aa)) return "hydrophobic";
  if (POLAR.has(aa)) return "polar";
  return "special";
}

/** Plain-language chemical context for the substitution — descriptive, not a pathogenicity call. */
export function substitutionContext(p: ParsedVariant): string[] {
  const notes: string[] = [];
  if (!p.refAa || !p.altAa) return notes;
  const a = classOf(p.refAa);
  const b = classOf(p.altAa);
  notes.push(`${ONE_TO_THREE[p.refAa] ?? p.refAa} is ${a}; ${ONE_TO_THREE[p.altAa] ?? p.altAa} is ${b}.`);
  if (a !== b) notes.push("Change of amino-acid class — possible effect on local packing or electrostatics.");
  if (p.refAa === "G") notes.push("Loss of glycine may restrict backbone flexibility.");
  if (p.refAa === "P" || p.altAa === "P") notes.push("Proline change can disrupt secondary structure.");
  if (p.refAa === "C" || p.altAa === "C") notes.push("Cysteine change may alter disulphide bonding or add a free thiol.");
  return notes;
}
