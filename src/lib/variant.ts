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
  /** Additional residues for multi-change alleles, e.g. c.[19G>A;295G>A] */
  extraResidues?: number[];
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

  // Multi-change allele: c.[19G>A;295G>A]
  const multi = (result.cdna ?? "").match(/^c\.\[(.+)\]$/) ?? raw.match(/c\.\[([^\]]+)\]/);
  if (multi) {
    const rs = multi[1]!.split(/\s*;\s*/).map((part) => {
      const m = part.trim().match(/^(?:c\.)?(\d+)(?=[ACGTacgt]>|del|dup|ins|_|$)/);
      return m ? Math.ceil(Number(m[1]) / 3) : 0;
    }).filter((n) => n > 0);
    const uniq = [...new Set(rs)];
    if (uniq.length) {
      result.residue = uniq[0]!;
      if (uniq.length > 1) result.extraResidues = uniq.slice(1);
      result.cdna = `c.[${multi[1]}]`;
    }
  }

  if (result.consequence === "Unclassified" && result.refAa && result.altAa) {
    result.consequence = result.refAa === result.altAa ? "Synonymous" : "Missense";
  }
  if (result.consequence === "Unclassified" && result.cdna) {
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

const CODON_TABLE: Record<string, string> = (() => {
  const b = "TCAG", aa = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
  const m: Record<string, string> = {};
  let i = 0;
  for (const x of b) for (const y of b) for (const z of b) m[x + y + z] = aa[i++]!;
  return m;
})();
const three = (a: string) => (a === "*" ? "Ter" : (ONE_TO_THREE[a] ?? a));

export type Translation = { kind: "c2p"; protein: string; note?: string } | { kind: "p2c"; options: string[]; note?: string } | { kind: "error"; note: string };

/** Predict p. from a simple coding substitution, or candidate c. SNVs from a protein missense/nonsense. Uses the transcript CDS. */
export function translateVariant(input: string, cds: string): Translation | null {
  const raw = input.trim();
  if (!raw || !cds) return null;
  const c = raw.match(/c\.(\d+)([ACGT])>([ACGT])/i);
  if (c && !/c\.\[/.test(raw)) {
    const pos = Number(c[1]), ref = c[2]!.toUpperCase(), alt = c[3]!.toUpperCase();
    if (pos > cds.length) return { kind: "error", note: `c.${pos} is beyond the coding sequence (${cds.length} nt).` };
    if (cds[pos - 1] !== ref) return { kind: "error", note: `Reference base at c.${pos} is ${cds[pos - 1]}, not ${ref} — check transcript.` };
    const codonNo = Math.ceil(pos / 3), start = (codonNo - 1) * 3;
    const codon = cds.slice(start, start + 3);
    const mut = codon.split(""); mut[(pos - 1) % 3] = alt;
    const a = CODON_TABLE[codon] ?? "?", b = CODON_TABLE[mut.join("")] ?? "?";
    const protein = a === b ? `p.(${three(a)}${codonNo}=)` : codonNo === 1 && a === "M" ? "p.(Met1?)" : `p.(${three(a)}${codonNo}${three(b)})`;
    return { kind: "c2p", protein, note: `${codon} → ${mut.join("")}` };
  }
  const p = parseVariant(raw);
  if (!/^c\./i.test(raw) && !p.cdna && p.residue && p.refAa && p.altAa) {
    const start = (p.residue - 1) * 3;
    const codon = cds.slice(start, start + 3);
    if (codon.length < 3) return { kind: "error", note: `Residue ${p.residue} is beyond the coding sequence.` };
    if (CODON_TABLE[codon] !== p.refAa) return { kind: "error", note: `Codon ${p.residue} (${codon}) encodes ${three(CODON_TABLE[codon] ?? "?")}, not ${three(p.refAa)}.` };
    const options: string[] = [];
    for (let i = 0; i < 3; i++) for (const nt of "ACGT") {
      if (nt === codon[i]) continue;
      const m = codon.split(""); m[i] = nt;
      if (CODON_TABLE[m.join("")] === p.altAa) options.push(`c.${start + i + 1}${codon[i]}>${nt}`);
    }
    return options.length ? { kind: "p2c", options } : { kind: "p2c", options: [], note: "Not reachable by a single-nucleotide change." };
  }
  return null;
}
