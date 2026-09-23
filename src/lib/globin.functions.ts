import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Provenance } from "./evidence.functions";

const prov = (sourceUrl: string, recordVersion: string | null = null): Provenance => ({
  sourceUrl,
  retrievedAt: new Date().toISOString(),
  recordVersion,
});

const UA = { "user-agent": "AnemiaVariantBoard/1.0 (clinical research tool)", accept: "text/html" };

/** ITHANET internal gene ids for the globin genes in our panel. */
export const ITHA_GENE_IDS: Record<string, number> = { HBB: 10, HBA1: 4, HBA2: 3, HBD: 9 };
const ITHA_GENE_NAME: Record<string, string> = { "β": "HBB", "α1": "HBA1", "α2": "HBA2", "δ": "HBD" };

export const ithaUrl = (id: string | number) => `https://www.ithanet.eu/db/ithagenes?ithaID=${id}`;
export const hbvarUrl = (id: string | number) =>
  `https://globin.bx.psu.edu/cgi-bin/hbvar/query_vars3?mode=output&display_format=page&i=${id}`;

export type IthaPhenStat = { param: string; unit: string; n: number; mean: string; sd: number | null; min: number | null; max: number | null };
export type IthaHplc = { instrument: string; method: string; areaPct: number | null; retTime: number | null; comment: string };

export type IthaInfo = {
  ithaId: string;
  found: boolean;
  gene: string | null;
  commonName: string;
  hgvsName: string;
  hbName: string;
  proteinName: string;
  residue: number | null;
  altAa: string;
  pathogenicity: string;
  mechanism: string;
  inheritance: string;
  origin: string;
  category: string;
  thalCategory: string;
  phenotypes: string[];
  synonyms: string[];
  hematology: IthaPhenStat[];
  hplc: IthaHplc[];
  hbvarId: string | null;
  clinvar: string | null;
  dbsnp: string | null;
  lastUpdated: string | null;
  provenance: Provenance;
  error?: string | undefined;
};

function extractPhpvars(html: string): any | null {
  const i = html.indexOf('{"phpvars"');
  if (i < 0) return null;
  // walk braces to find the end of the JSON object
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(i, j + 1)); } catch { return null; }
    }
  }
  return null;
}

const names = (x: any): string[] => ((x?.name ?? []) as any[]).filter(Boolean).map(String);

export const fetchIthaGenes = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ ithaId: z.string().regex(/^\d{1,6}$/) }).parse(i))
  .handler(async ({ data }): Promise<IthaInfo> => {
    const url = ithaUrl(data.ithaId);
    const base: IthaInfo = {
      ithaId: data.ithaId, found: false, gene: null, commonName: "", hgvsName: "", hbName: "",
      proteinName: "", residue: null, altAa: "", pathogenicity: "", mechanism: "", inheritance: "",
      origin: "", category: "", thalCategory: "", phenotypes: [], synonyms: [], hematology: [], hplc: [],
      hbvarId: null, clinvar: null, dbsnp: null, lastUpdated: null, provenance: prov(url),
    };
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) return { ...base, error: `ITHANET returned ${res.status}` };
      const m = extractPhpvars(await res.text())?.phpvars?.mut_info;
      if (!m || !m.ithaID) return { ...base, error: `No IthaGenes entry for IthaID ${data.ithaId}` };
      const link = (n: string) => (m.links ?? []).find((l: any) => l?.name === n)?.link ?? null;
      const geneRaw = m.genes?.name?.[0] as string | undefined;
      const hgvs = String(m.hgvs_name ?? "");
      const gene = (geneRaw && ITHA_GENE_NAME[geneRaw]) || (/^(HB[A-Z0-9]+):/.exec(hgvs)?.[1] ?? null);
      const upd: string[] = m.history?.updated?.date ?? [];
      const last = upd.length ? upd[upd.length - 1]! : m.history?.created?.[0] ?? null;
      const hematology: IthaPhenStat[] = Object.entries((m.ithaphen ?? {}) as Record<string, any[]>)
        .map(([param, arr]) => {
          const s = arr?.[0] ?? {};
          return { param, unit: String(s.unit ?? ""), n: Number(s.n ?? 0), mean: String(s.mean ?? ""), sd: s.sd ?? null, min: s.min ?? null, max: s.max ?? null };
        })
        .filter((s) => s.mean !== "");
      const hplc: IthaHplc[] = ((m.hplc ?? []) as any[]).slice(0, 6).map((h) => ({
        instrument: String(h.instr_name ?? ""), method: String(h.method ?? ""),
        areaPct: h.area_per ?? null, retTime: h.ret_time ?? null, comment: String(h.comments ?? ""),
      }));
      return {
        ...base,
        found: true,
        gene,
        commonName: String(m.common_name ?? ""),
        hgvsName: hgvs,
        hbName: String(m.hb_var ?? ""),
        proteinName: String(m.protein_name ?? ""),
        residue: m.aa_no ? Number(m.aa_no) : null,
        altAa: String(m.aa ?? ""),
        pathogenicity: String(m.pathogenicity ?? ""),
        mechanism: String(m.molmech ?? ""),
        inheritance: String(m.inheritance ?? ""),
        origin: String(m.origin ?? ""),
        category: names(m.hemo).join(", "),
        thalCategory: String(m.hemo_category ?? ""),
        phenotypes: [...names(m.clin_phen), ...names(m.globin_phen)],
        synonyms: names(m.synonyms),
        hematology,
        hplc,
        hbvarId: link("HbVar"),
        clinvar: link("ClinVar"),
        dbsnp: link("dbSNP"),
        lastUpdated: last,
        provenance: prov(url, `IthaID ${m.ithaID}${last ? ` · updated ${String(last).slice(0, 10)}` : ""}`),
      };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "ITHANET lookup failed" };
    }
  });

export type IthaMatch = { ithaId: string; commonName: string; hbName: string; hgvsName: string };
export type IthaSearch = { gene: string; query: string; matches: IthaMatch[]; provenance: Provenance; error?: string };

const strip = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();

/** Find IthaGenes entries for a globin gene whose HGVS name matches the cDNA change. */
export const searchIthaGenes = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ gene: z.enum(["HBB", "HBA1", "HBA2", "HBD"]), cdna: z.string().regex(/^c\.[\w>_+\-*]+$/).max(60) }).parse(i),
  )
  .handler(async ({ data }): Promise<IthaSearch> => {
    const url = `https://www.ithanet.eu/db/ithagenes?action=list&gn=${ITHA_GENE_IDS[data.gene]}`;
    const q = `${data.gene}:${data.cdna}`;
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) return { gene: data.gene, query: q, matches: [], provenance: prov(url), error: `ITHANET returned ${res.status}` };
      const html = await res.text();
      const matches: IthaMatch[] = [];
      const rowRe = /<tr>\s*<td><a href="[^"]*ithaID=(\d+)">\d+<\/a><\/td>([\s\S]*?)<\/tr>/g;
      let r: RegExpExecArray | null;
      while ((r = rowRe.exec(html))) {
        const cells = [...r[2]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]!));
        const hgvs = cells[2] ?? "";
        // exact single-change match, or combination containing it
        const exact = hgvs === q;
        const inCombo = hgvs.startsWith(`${data.gene}:c.[`) && hgvs.includes(data.cdna.slice(2));
        if (exact || inCombo) matches.push({ ithaId: r[1]!, commonName: cells[0] ?? "", hbName: cells[1] ?? "", hgvsName: hgvs });
      }
      matches.sort((a, b) => Number(b.hgvsName === q) - Number(a.hgvsName === q));
      return { gene: data.gene, query: q, matches: matches.slice(0, 12), provenance: prov(url, `${matches.length} IthaGenes match(es) for ${q}`) };
    } catch (e) {
      return { gene: data.gene, query: q, matches: [], provenance: prov(url), error: e instanceof Error ? e.message : "ITHANET search failed" };
    }
  });

export type HbVarInfo = {
  hbvarId: string;
  found: boolean;
  name: string;
  proteinChange: string;
  hgvsName: string;
  category: string;
  location: string;
  clinical: string[];
  stability: string;
  functional: string[];
  ethnicity: string[];
  occurrence: string;
  comments: string;
  provenance: Provenance;
  error?: string | undefined;
};

export const fetchHbVar = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ hbvarId: z.string().regex(/^\d{1,6}$/) }).parse(i))
  .handler(async ({ data }): Promise<HbVarInfo> => {
    const url = hbvarUrl(data.hbvarId);
    const base: HbVarInfo = {
      hbvarId: data.hbvarId, found: false, name: "", proteinChange: "", hgvsName: "", category: "", location: "",
      clinical: [], stability: "", functional: [], ethnicity: [], occurrence: "", comments: "", provenance: prov(url),
    };
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) return { ...base, error: `HbVar returned ${res.status}` };
      let s = await res.text();
      s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
      const t = strip(s.replace(/<[^>]+>/g, "|")).split(/\s*\|[\s|]*/).map((x) => x.trim()).filter(Boolean);
      const at = (label: string, from = 0) => t.indexOf(label, from);
      const after = (label: string, from = 0) => { const i = at(label, from); return i >= 0 ? t[i + 1] ?? "" : ""; };
      const between = (a: string, b: string, from = 0) => {
        const i = at(a, from); if (i < 0) return [];
        const j = at(b, i + 1); return t.slice(i + 1, j > i ? j : i + 1);
      };
      const d = at("Detail page display");
      if (d < 0 || at("HbVar ID") < 0) return { ...base, error: "HbVar record not found" };
      const lab = at("Laboratory findings");
      const clinStart = lab >= 0 && t[lab + 1] === "Comments" ? lab + 1 : lab;
      const clinEnd = [at("Electrophoresis", clinStart), at("Structure Studies", clinStart), at("Stability", clinStart)]
        .filter((x) => x > clinStart).sort((a, b) => a - b)[0] ?? clinStart;
      const occ = at("Occurrence Comment");
      const hgvsName = after("HGVS name");
      return {
        ...base,
        found: true,
        name: t[d + 1] ?? "",
        proteinChange: t[d + 2] ?? "",
        hgvsName,
        category: after("Category"),
        location: after("Mutation location"),
        clinical: clinStart >= 0 ? t.slice(clinStart + 1, clinEnd).slice(0, 12) : [],
        stability: after("Relative stability"),
        functional: between("Study covered", "Stability").slice(0, 8),
        ethnicity: between("Ethnic background", "Occurrence Comment").slice(0, 10),
        occurrence: occ >= 0 ? t[occ + 1] ?? "" : "",
        comments: occ >= 0 ? after("Comments", occ).slice(0, 500) : "",
        provenance: prov(url, `HbVar ID ${data.hbvarId}${hgvsName ? ` · ${hgvsName}` : ""}`),
      };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "HbVar lookup failed" };
    }
  });

export type IthaIndexEntry = IthaMatch & { gene: string };

/** Index of all IthaGenes entries (common name, Hb name, HGVS) for the globin genes in our panel. */
export const listIthaIndex = createServerFn({ method: "GET" }).handler(async (): Promise<IthaIndexEntry[]> => {
  const out: IthaIndexEntry[] = [];
  const seen = new Set<string>();
  await Promise.all(
    Object.entries(ITHA_GENE_IDS).map(async ([gene, gid]) => {
      try {
        const res = await fetch(`https://www.ithanet.eu/db/ithagenes?action=list&gn=${gid}`, { headers: UA });
        if (!res.ok) return;
        const html = await res.text();
        const rowRe = /<tr>\s*<td><a href="[^"]*ithaID=(\d+)">\d+<\/a><\/td>([\s\S]*?)<\/tr>/g;
        let r: RegExpExecArray | null;
        while ((r = rowRe.exec(html))) {
          if (seen.has(r[1]!)) continue;
          seen.add(r[1]!);
          const cells = [...r[2]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]!));
          const hgvs = cells[2] ?? "";
          out.push({ ithaId: r[1]!, commonName: cells[0] ?? "", hbName: cells[1] === "N/A" ? "" : cells[1] ?? "", hgvsName: hgvs === "N/A" ? "" : hgvs, gene: /^(HB[A-Z0-9]+):/.exec(hgvs)?.[1] ?? gene });
        }
      } catch { /* skip gene */ }
    }),
  );
  return out;
});
