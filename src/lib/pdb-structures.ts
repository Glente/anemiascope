/**
 * Experimental PDB structures for a UniProt accession (via PDBe/SIFTS), so oligomers such as the
 * pyruvate kinase tetramer can be shown as the biological assembly instead of an AlphaFold monomer.
 * Pure parsing + residue mapping — used by the server functions, the viewer and the tests.
 */

export type PdbEntry = {
  pdbId: string;
  chainId: string;
  method: string;
  resolution: number | null;
  /** Fraction of the UniProt sequence covered, 0–1 */
  coverage: number | null;
  unpStart: number;
  unpEnd: number;
};

/** A contiguous stretch where UniProt numbering maps 1:1 onto mmCIF label_seq_id. */
export type ResidueSegment = { unpStart: number; unpEnd: number; seqStart: number };

export type PdbAssembly = { id: string; name: string; form: string };

export type PdbMapping = {
  pdbId: string;
  entityId: string;
  chains: string[];
  segments: ResidueSegment[];
  assembly: PdbAssembly | null;
  title: string;
};

type Num = number | string | null | undefined;
const num = (v: Num): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ---------- residue mapping ---------- */

export function unpToSeq(segments: ResidueSegment[], unp: number): number | null {
  for (const s of segments) {
    if (unp >= s.unpStart && unp <= s.unpEnd) return s.seqStart + (unp - s.unpStart);
  }
  return null;
}

export function seqToUnp(segments: ResidueSegment[], seq: number): number | null {
  for (const s of segments) {
    const end = s.seqStart + (s.unpEnd - s.unpStart);
    if (seq >= s.seqStart && seq <= end) return s.unpStart + (seq - s.seqStart);
  }
  return null;
}

/* ---------- PDBe API parsing ---------- */

export type BestStructureJson = {
  pdb_id?: string;
  chain_id?: string;
  experimental_method?: string;
  resolution?: Num;
  coverage?: Num;
  unp_start?: Num;
  unp_end?: Num;
  start?: Num;
  end?: Num;
};

/** `/mappings/best_structures/{acc}` → one entry per PDB id, in PDBe's ranking order. */
export function parseBestStructures(
  json: Record<string, BestStructureJson[] | undefined> | null | undefined,
  accession: string,
  limit = 8,
): PdbEntry[] {
  const list = json?.[accession] ?? json?.[accession.toUpperCase()] ?? [];
  const seen = new Set<string>();
  const out: PdbEntry[] = [];
  for (const e of list) {
    const id = String(e.pdb_id ?? "").toLowerCase();
    if (!/^[0-9][a-z0-9]{3}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      pdbId: id,
      chainId: String(e.chain_id ?? ""),
      method: String(e.experimental_method ?? ""),
      resolution: num(e.resolution),
      coverage: num(e.coverage),
      unpStart: num(e.unp_start) ?? num(e.start) ?? 0,
      unpEnd: num(e.unp_end) ?? num(e.end) ?? 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export type SiftsMappingJson = {
  entity_id?: Num;
  chain_id?: string;
  struct_asym_id?: string;
  unp_start?: Num;
  unp_end?: Num;
  start?: { residue_number?: Num; author_residue_number?: Num };
  end?: { residue_number?: Num; author_residue_number?: Num };
};

export type SiftsJson = Record<
  string,
  { UniProt?: Record<string, { mappings?: SiftsMappingJson[] } | undefined> } | undefined
>;

/**
 * `/mappings/uniprot/{pdb}` → segments for the entity that carries this accession.
 * residue_number is the mmCIF label_seq_id, which is what the viewer selects on.
 */
export function parseSifts(
  json: SiftsJson | null | undefined,
  pdbId: string,
  accession: string,
): Omit<PdbMapping, "assembly" | "title"> | null {
  const entry = json?.[pdbId.toLowerCase()] ?? json?.[pdbId.toUpperCase()];
  const uni = entry?.UniProt ?? {};
  // Accept isoform-suffixed keys (P30613-1) as well
  const key = Object.keys(uni).find((k) => k === accession || k.split("-")[0] === accession);
  const mappings = (key ? uni[key]?.mappings : undefined) ?? [];
  if (!mappings.length) return null;
  const entityId = String(mappings[0]!.entity_id ?? "1");
  const chains = new Set<string>();
  const segs = new Map<string, ResidueSegment>();
  for (const m of mappings) {
    if (String(m.entity_id ?? "1") !== entityId) continue;
    if (m.chain_id) chains.add(m.chain_id);
    const unpStart = num(m.unp_start);
    const unpEnd = num(m.unp_end);
    const seqStart = num(m.start?.residue_number);
    if (unpStart == null || unpEnd == null || seqStart == null || unpEnd < unpStart) continue;
    segs.set(`${unpStart}-${unpEnd}-${seqStart}`, { unpStart, unpEnd, seqStart });
  }
  const segments = [...segs.values()].sort((a, b) => a.unpStart - b.unpStart);
  if (!segments.length) return null;
  return { pdbId: pdbId.toLowerCase(), entityId, chains: [...chains].sort(), segments };
}

export type AssemblyJson = {
  assembly_id?: Num;
  name?: string;
  form?: string;
  preferred?: boolean;
};

/** `/pdb/entry/assembly/{pdb}` → the preferred biological assembly. */
export function parseAssembly(
  json: Record<string, AssemblyJson[] | undefined> | null | undefined,
  pdbId: string,
): PdbAssembly | null {
  const list = json?.[pdbId.toLowerCase()] ?? json?.[pdbId.toUpperCase()] ?? [];
  const a = list.find((x) => x.preferred) ?? list[0];
  if (!a || a.assembly_id == null) return null;
  return { id: String(a.assembly_id), name: String(a.name ?? ""), form: String(a.form ?? "") };
}

/** "homo-tetramer", "hetero-tetramer", "monomer" … */
export function describeAssembly(a: PdbAssembly | null | undefined): string {
  if (!a?.name) return "";
  if (!a.form || a.name === "monomer") return a.name;
  return `${a.form}-${a.name}`;
}

export const pdbFileUrl = (pdbId: string) =>
  `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId.toLowerCase()}_updated.cif`;

export const pdbEntryUrl = (pdbId: string) =>
  `https://www.ebi.ac.uk/pdbe/entry/pdb/${pdbId.toLowerCase()}`;
