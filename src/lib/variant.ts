const THREE_TO_ONE: Record<string, string> = {
  Ala: "A",
  Arg: "R",
  Asn: "N",
  Asp: "D",
  Cys: "C",
  Gln: "Q",
  Glu: "E",
  Gly: "G",
  His: "H",
  Ile: "I",
  Leu: "L",
  Lys: "K",
  Met: "M",
  Phe: "F",
  Pro: "P",
  Ser: "S",
  Thr: "T",
  Trp: "W",
  Tyr: "Y",
  Val: "V",
  Ter: "*",
  Sec: "U",
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

  // Position class from the cDNA part: 5'UTR (c.-N), 3'UTR (c.*N), intronic (c.N+N / c.N-N)
  const cdnaPos = result.cdna?.replace(/^c\.\[?/i, "") ?? "";
  const cdnaClass = !result.cdna
    ? null
    : /^-\d+[+-]\d/.test(cdnaPos) || /^\*\d+[+-]\d/.test(cdnaPos) || /^\d+[+-]\d/.test(cdnaPos)
      ? "Intronic / splice region"
      : /^-\d/.test(cdnaPos)
        ? "5′ UTR"
        : /^\*\d/.test(cdnaPos)
          ? "3′ UTR"
          : null;

  // Only interpret protein keywords when a protein description is present
  const hasProtein = Boolean(proteinChunk) || !/^c\./i.test(raw);
  if (hasProtein && /ext/i.test(proteinText))
    result.consequence = "Stop-loss (C-terminal extension)";
  else if (hasProtein && /^(Met|M)1(\?|\w*$)/.test(proteinText) && /\?|0/.test(proteinText))
    result.consequence = "Start-loss";
  else if (hasProtein && /fs/i.test(proteinText)) result.consequence = "Frameshift";
  else if (hasProtein && /delins/i.test(proteinText)) result.consequence = "Deletion-insertion";
  else if (hasProtein && /\d(Ter|\*|X)$|\d(Ter|\*|X)\b/.test(proteinText))
    result.consequence = "Nonsense";
  else if (hasProtein && /del/i.test(proteinText)) result.consequence = "Deletion";
  else if (hasProtein && /dup/i.test(proteinText)) result.consequence = "Duplication";
  else if (hasProtein && /ins/i.test(proteinText)) result.consequence = "Insertion";
  else if (cdnaClass) result.consequence = cdnaClass;
  else if (/^c\./i.test(raw) && /delins/i.test(raw)) result.consequence = "Deletion-insertion";
  else if (/^c\./i.test(raw) && /del/i.test(raw)) result.consequence = "Deletion";
  else if (/^c\./i.test(raw) && /dup/i.test(raw)) result.consequence = "Duplication";
  else if (/^c\./i.test(raw) && /ins/i.test(raw)) result.consequence = "Insertion";

  const toOne = (code: string | undefined): string | undefined =>
    code ? (code === "*" || code === "X" ? "*" : (THREE_TO_ONE[code] ?? code)) : undefined;

  // Three-letter notation is used when the description starts with a three-letter code
  // (or a stop symbol followed by one), e.g. Ser188Phe, Ter143Gln, *143Gln.
  const three = proteinText.match(/^(Ter|[A-Z][a-z]{2}|\*)(\d+)(Ter|[A-Z][a-z]{2}|\*|=)?/);
  const isThree = Boolean(
    three && (/^[A-Z][a-z]{2}/.test(proteinText) || /^\*\d+[A-Z][a-z]{2}/.test(proteinText)),
  );
  const one = isThree ? null : proteinText.match(/^([A-Z*])(\d+)([A-Z*]|=)?(?![a-z])/);
  const m = isThree ? three : one;
  if (m && !(isThree && !THREE_TO_ONE[m[1]!] && m[1] !== "*")) {
    const ref = toOne(m[1]);
    const alt = m[3] === "=" ? ref : toOne(m[3]);
    if (ref) result.refAa = ref;
    if (alt && !/fs|ext|del|ins|dup/i.test(proteinText)) result.altAa = alt;
    result.residue = Number(m[2]);
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
    const rs = multi[1]!
      .split(/\s*;\s*/)
      .map((part) => {
        const m = part.trim().match(/^(?:c\.)?(\d+)(?=[ACGTacgt]>|del|dup|ins|_|$)/);
        return m ? Math.ceil(Number(m[1]) / 3) : 0;
      })
      .filter((n) => n > 0);
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
  if (p.altAa === "*") {
    notes.push(
      "Premature stop codon — truncated protein, or no protein if the transcript undergoes nonsense-mediated decay.",
    );
    return notes;
  }
  if (p.refAa === "*" || p.refAa === p.altAa) return notes;
  const a = classOf(p.refAa);
  const b = classOf(p.altAa);
  notes.push(
    `${ONE_TO_THREE[p.refAa] ?? p.refAa} is ${a}; ${ONE_TO_THREE[p.altAa] ?? p.altAa} is ${b}.`,
  );
  if (a !== b)
    notes.push("Change of amino-acid class — possible effect on local packing or electrostatics.");
  if (p.refAa === "G") notes.push("Loss of glycine may restrict backbone flexibility.");
  if (p.refAa === "P" || p.altAa === "P")
    notes.push("Proline change can disrupt secondary structure.");
  if (p.refAa === "C" || p.altAa === "C")
    notes.push("Cysteine change may alter disulphide bonding or add a free thiol.");
  return notes;
}

const CODON_TABLE: Record<string, string> = (() => {
  const b = "TCAG",
    aa = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
  const m: Record<string, string> = {};
  let i = 0;
  for (const x of b) for (const y of b) for (const z of b) m[x + y + z] = aa[i++]!;
  return m;
})();
const three = (a: string) => (a === "*" ? "Ter" : (ONE_TO_THREE[a] ?? a));

export type Translation =
  | { kind: "c2p"; protein: string; note?: string }
  | { kind: "p2c"; options: string[]; note?: string }
  | { kind: "error"; note: string };

/** Predict p. from a simple coding substitution, or candidate c. SNVs from a protein missense/nonsense. Uses the transcript CDS. */
export function translateVariant(input: string, cds: string): Translation | null {
  const raw = input.trim();
  if (!raw || !cds) return null;
  const c = raw.match(/c\.(\d+)([ACGT])>([ACGT])/i);
  if (c && !/c\.\[/.test(raw)) {
    const pos = Number(c[1]),
      ref = c[2]!.toUpperCase(),
      alt = c[3]!.toUpperCase();
    if (pos > cds.length)
      return { kind: "error", note: `c.${pos} is beyond the coding sequence (${cds.length} nt).` };
    if (cds[pos - 1] !== ref)
      return {
        kind: "error",
        note: `Reference base at c.${pos} is ${cds[pos - 1]}, not ${ref} — check transcript.`,
      };
    const codonNo = Math.ceil(pos / 3),
      start = (codonNo - 1) * 3;
    const codon = cds.slice(start, start + 3);
    const mut = codon.split("");
    mut[(pos - 1) % 3] = alt;
    const a = CODON_TABLE[codon] ?? "?",
      b = CODON_TABLE[mut.join("")] ?? "?";
    const protein =
      a === b
        ? `p.(${three(a)}${codonNo}=)`
        : codonNo === 1 && a === "M"
          ? "p.(Met1?)"
          : `p.(${three(a)}${codonNo}${three(b)})`;
    return { kind: "c2p", protein, note: `${codon} → ${mut.join("")}` };
  }
  const p = parseVariant(raw);
  if (!/^c\./i.test(raw) && !p.cdna && p.residue && p.refAa && p.altAa) {
    const start = (p.residue - 1) * 3;
    const codon = cds.slice(start, start + 3);
    if (codon.length < 3)
      return { kind: "error", note: `Residue ${p.residue} is beyond the coding sequence.` };
    if (CODON_TABLE[codon] !== p.refAa)
      return {
        kind: "error",
        note: `Codon ${p.residue} (${codon}) encodes ${three(CODON_TABLE[codon] ?? "?")}, not ${three(p.refAa)}.`,
      };
    const options: string[] = [];
    for (let i = 0; i < 3; i++)
      for (const nt of "ACGT") {
        if (nt === codon[i]) continue;
        const m = codon.split("");
        m[i] = nt;
        if (CODON_TABLE[m.join("")] === p.altAa)
          options.push(`c.${start + i + 1}${codon[i]}>${nt}`);
      }
    return options.length
      ? { kind: "p2c", options }
      : { kind: "p2c", options: [], note: "Not reachable by a single-nucleotide change." };
  }
  return null;
}

export type CheckLevel = "ok" | "warn" | "error" | "info";
export type ReferenceCheck = { level: CheckLevel; message: string };
export type ValidationResult = {
  /** Worst level among the checks; "info" when nothing could be checked. */
  status: CheckLevel;
  checks: ReferenceCheck[];
};

/** Translate a coding sequence (stop codon excluded). */
export function translateCds(cds: string): string {
  let out = "";
  for (let i = 0; i + 3 <= cds.length; i += 3) {
    const aa = CODON_TABLE[cds.slice(i, i + 3).toUpperCase()] ?? "X";
    if (aa === "*") break;
    out += aa;
  }
  return out;
}

const RANK: Record<CheckLevel, number> = { info: 0, ok: 1, warn: 2, error: 3 };

/** Simple coding substitutions in the cDNA part, including multi-change alleles c.[a;b]. */
function cdnaSubstitutions(cdna: string): { pos: number; ref: string; alt: string }[] {
  const body = cdna.replace(/^c\.\[?/i, "").replace(/\]$/, "");
  return body
    .split(/\s*;\s*/)
    .map((part) => part.replace(/^c\./i, "").match(/^(\d+)([ACGT])>([ACGT])$/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ pos: Number(m[1]), ref: m[2]!.toUpperCase(), alt: m[3]!.toUpperCase() }));
}

/**
 * Checks an entered variant against the reference coding sequence (Ensembl canonical)
 * and, when given, the UniProt sequence used for structure mapping. Descriptive only.
 */
export function validateVariant(
  input: string,
  cds: string,
  transcriptId = "the reference transcript",
  uniprotSeq?: string,
): ValidationResult {
  const checks: ReferenceCheck[] = [];
  const raw = input.trim();
  const p = parseVariant(raw);
  const done = (): ValidationResult => ({
    status: checks.reduce<CheckLevel>((w, c) => (RANK[c.level] > RANK[w] ? c.level : w), "info"),
    checks,
  });
  if (!raw) return done();

  const protein = cds ? translateCds(cds) : "";

  // Transcript vs UniProt: residue numbers only map 1:1 onto the structure if they agree.
  if (protein && uniprotSeq) {
    if (protein !== uniprotSeq) {
      checks.push({
        level: "warn",
        message: `${transcriptId} encodes ${protein.length} aa but the UniProt/AlphaFold sequence has ${uniprotSeq.length} aa — residue numbers may not map 1:1 onto the structure (different isoform).`,
      });
    }
  }

  if (/^(\d+|[gmnr])\./i.test(raw) || /^[gmnr]\./i.test(raw.replace(/^[^:]+:/, ""))) {
    checks.push({
      level: "info",
      message: "Only c. and p. descriptions can be checked against the coding sequence.",
    });
    return done();
  }

  if (!cds) {
    if (p.cdna || p.residue)
      checks.push({
        level: "info",
        message: "Reference coding sequence not loaded yet — cannot check.",
      });
    return done();
  }

  // cDNA checks
  let predicted: { residue: number; ref: string; alt: string }[] = [];
  if (p.cdna) {
    if (/^c\.\[?[-*]/.test(p.cdna) || /^c\.\[?\d+[+-]\d/.test(p.cdna)) {
      checks.push({
        level: "info",
        message:
          "Intronic or UTR position — outside the coding sequence, so the reference base cannot be checked here.",
      });
    }
    const subs = cdnaSubstitutions(p.cdna);
    for (const s of subs) {
      if (s.pos > cds.length) {
        checks.push({
          level: "error",
          message: `c.${s.pos} is beyond the coding sequence of ${transcriptId} (${cds.length} nt).`,
        });
        continue;
      }
      const actual = cds[s.pos - 1]!.toUpperCase();
      if (actual !== s.ref) {
        checks.push({
          level: "error",
          message: `Reference base at c.${s.pos} in ${transcriptId} is ${actual}, not ${s.ref}. Check transcript or strand.`,
        });
        continue;
      }
      const codonNo = Math.ceil(s.pos / 3);
      const start = (codonNo - 1) * 3;
      const codon = cds.slice(start, start + 3).toUpperCase();
      const mut = codon.split("");
      mut[(s.pos - 1) % 3] = s.alt;
      predicted.push({
        residue: codonNo,
        ref: CODON_TABLE[codon] ?? "?",
        alt: CODON_TABLE[mut.join("")] ?? "?",
      });
      checks.push({ level: "ok", message: `c.${s.pos}${s.ref} matches ${transcriptId}.` });
    }
    // Deletions / duplications that spell out the reference bases, e.g. c.123_125delGAA
    const span = p.cdna.match(/^c\.(\d+)(?:_(\d+))?(del|dup)([ACGT]+)$/i);
    if (span) {
      const a = Number(span[1]);
      const b = Number(span[2] ?? span[1]);
      const stated = span[4]!.toUpperCase();
      const actual = cds.slice(a - 1, b).toUpperCase();
      if (b > cds.length)
        checks.push({
          level: "error",
          message: `c.${b} is beyond the coding sequence (${cds.length} nt).`,
        });
      else if (actual !== stated)
        checks.push({
          level: "error",
          message: `${transcriptId} has ${actual} at c.${a}${b !== a ? `_${b}` : ""}, not ${stated}.`,
        });
      else
        checks.push({
          level: "ok",
          message: `Stated ${span[3]!.toLowerCase()} bases ${stated} match ${transcriptId}.`,
        });
    }
  }
  if (predicted.length > 1) predicted = []; // multi-change alleles: per-codon check only

  // Protein checks
  const entersProtein = Boolean(p.protein) || (!p.cdna && Boolean(p.residue && p.refAa));
  if (entersProtein && p.residue && p.refAa && p.refAa !== "*") {
    const aaAt = protein[p.residue - 1];
    if (!aaAt) {
      checks.push({
        level: "error",
        message: `Residue ${p.residue} is beyond the protein (${protein.length} aa).`,
      });
    } else if (aaAt !== p.refAa) {
      checks.push({
        level: "error",
        message: `Residue ${p.residue} in ${transcriptId} is ${three(aaAt)}, not ${three(p.refAa)}. Legacy numbering (e.g. hemoglobin without Met1) or another isoform?`,
      });
    } else {
      checks.push({
        level: "ok",
        message: `${three(p.refAa)}${p.residue} matches ${transcriptId}.`,
      });
    }
  }

  // Concordance between entered c. and entered p.
  const pred = predicted[0];
  if (pred && entersProtein && p.residue) {
    const enteredAlt = p.altAa;
    const predAlt = pred.alt;
    if (pred.residue !== p.residue) {
      checks.push({
        level: "error",
        message: `The cDNA change affects codon ${pred.residue}, but the protein description names residue ${p.residue}.`,
      });
    } else if (enteredAlt && predAlt !== enteredAlt && !(pred.residue === 1 && pred.ref === "M")) {
      checks.push({
        level: "error",
        message: `The cDNA change predicts ${three(pred.ref)}${pred.residue}${pred.ref === predAlt ? "=" : three(predAlt)}, but ${three(p.refAa ?? "?")}${p.residue}${three(enteredAlt)} was entered.`,
      });
    } else if (enteredAlt) {
      checks.push({ level: "ok", message: "cDNA and protein descriptions agree." });
    }
  }

  return done();
}
