import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Provenance } from "@/lib/evidence.functions";
import {
  parseAssembly,
  parseBestStructures,
  parseSifts,
  type AssemblyJson,
  type BestStructureJson,
  type PdbEntry,
  type PdbMapping,
  type SiftsJson,
} from "@/lib/pdb-structures";

const PDBE = "https://www.ebi.ac.uk/pdbe/api";
const prov = (sourceUrl: string, recordVersion: string | null = null): Provenance => ({
  sourceUrl,
  retrievedAt: new Date().toISOString(),
  recordVersion,
});

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  // PDBe answers 404 when there is simply nothing mapped
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PDBe returned ${res.status}`);
  return (await res.json()) as T;
}

export type PdbList = {
  accession: string;
  entries: PdbEntry[];
  provenance: Provenance;
  error?: string;
};

/** Experimental structures covering a UniProt accession, best first (PDBe/SIFTS ranking). */
export const fetchPdbStructures = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ accession: z.string().regex(/^[A-Z0-9]{6,10}$/) }).parse(input),
  )
  .handler(async ({ data }): Promise<PdbList> => {
    const url = `${PDBE}/mappings/best_structures/${data.accession}`;
    try {
      const json = await getJson<Record<string, BestStructureJson[]>>(url);
      const entries = parseBestStructures(json, data.accession);
      return {
        accession: data.accession,
        entries,
        provenance: prov(url, `${entries.length} PDB entr${entries.length === 1 ? "y" : "ies"}`),
      };
    } catch (e) {
      return {
        accession: data.accession,
        entries: [],
        provenance: prov(url),
        error: e instanceof Error ? e.message : "PDBe lookup failed",
      };
    }
  });

export type PdbMappingResult =
  | (PdbMapping & { provenance: Provenance; error?: undefined })
  | {
      pdbId: string;
      error: string;
      provenance: Provenance;
    };

/** UniProt→label_seq_id mapping (SIFTS) and the preferred biological assembly for one PDB entry. */
export const fetchPdbMapping = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        pdbId: z.string().regex(/^[0-9][a-zA-Z0-9]{3}$/),
        accession: z.string().regex(/^[A-Z0-9]{6,10}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PdbMappingResult> => {
    const id = data.pdbId.toLowerCase();
    const siftsUrl = `${PDBE}/mappings/uniprot/${id}`;
    const asmUrl = `${PDBE}/pdb/entry/assembly/${id}`;
    const sumUrl = `${PDBE}/pdb/entry/summary/${id}`;
    try {
      const [sifts, asm, summary] = await Promise.all([
        getJson<SiftsJson>(siftsUrl),
        getJson<Record<string, AssemblyJson[]>>(asmUrl).catch(() => null),
        getJson<Record<string, { title?: string }[]>>(sumUrl).catch(() => null),
      ]);
      const mapped = parseSifts(sifts, id, data.accession);
      if (!mapped)
        return {
          pdbId: id,
          error: `No SIFTS mapping of ${data.accession} in ${id.toUpperCase()}`,
          provenance: prov(siftsUrl),
        };
      const assembly = parseAssembly(asm, id);
      return {
        ...mapped,
        assembly,
        title: String(summary?.[id]?.[0]?.title ?? ""),
        provenance: prov(
          `${siftsUrl} ; ${asmUrl}`,
          `${id.toUpperCase()} entity ${mapped.entityId}${assembly ? ` · assembly ${assembly.id}` : ""}`,
        ),
      };
    } catch (e) {
      return {
        pdbId: id,
        error: e instanceof Error ? e.message : "PDBe lookup failed",
        provenance: prov(siftsUrl),
      };
    }
  });
