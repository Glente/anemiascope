import { fetchHbVar, fetchIthaGenes } from "@/lib/globin.functions";
import { fetchPredictions } from "@/lib/prediction.functions";
import { fetchPdbMapping, fetchPdbStructures } from "@/lib/structure.functions";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchAlphaFold,
  fetchClinVar,
  fetchOmim,
  fetchTranscript,
  fetchUniProt,
} from "./evidence.functions";

export const uniProtQuery = (accession: string, residue?: number) =>
  queryOptions({
    queryKey: ["uniprot", accession, residue ?? null],
    queryFn: () => fetchUniProt({ data: residue ? { accession, residue } : { accession } }),
    staleTime: 1000 * 60 * 60,
  });

export const alphaFoldQuery = (accession: string, residue?: number) =>
  queryOptions({
    queryKey: ["alphafold", accession, residue ?? null],
    queryFn: () => fetchAlphaFold({ data: residue ? { accession, residue } : { accession } }),
    staleTime: 1000 * 60 * 60,
  });

export const clinVarQuery = (gene: string, variant?: string) =>
  queryOptions({
    queryKey: ["clinvar", gene, variant ?? null],
    queryFn: () => fetchClinVar({ data: variant ? { gene, variant } : { gene } }),
    staleTime: 1000 * 60 * 30,
  });

export const omimQuery = (mim: string) =>
  queryOptions({
    queryKey: ["omim", mim],
    queryFn: () => fetchOmim({ data: { mim } }),
    staleTime: 1000 * 60 * 60,
  });

export const transcriptQuery = (gene: string) =>
  queryOptions({
    queryKey: ["transcript", gene],
    queryFn: () => fetchTranscript({ data: { gene } }),
    staleTime: 1000 * 60 * 60,
  });

export const predictionQuery = (hgvs: string, transcriptId: string) =>
  queryOptions({
    queryKey: ["vep", hgvs],
    queryFn: () => fetchPredictions({ data: { hgvs, transcriptId } }),
    staleTime: 1000 * 60 * 60,
    enabled: Boolean(hgvs),
  });

export const pdbStructuresQuery = (accession: string) =>
  queryOptions({
    queryKey: ["pdb-structures", accession],
    queryFn: () => fetchPdbStructures({ data: { accession } }),
    staleTime: 1000 * 60 * 60 * 24,
  });

export const pdbMappingQuery = (pdbId: string, accession: string) =>
  queryOptions({
    queryKey: ["pdb-mapping", pdbId, accession],
    queryFn: () => fetchPdbMapping({ data: { pdbId, accession } }),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: Boolean(pdbId),
  });

export const links = {
  uniprot: (acc: string) => `https://www.uniprot.org/uniprotkb/${acc}/entry`,
  alphafold: (acc: string) => `https://alphafold.ebi.ac.uk/entry/${acc}`,
  clinvar: (gene: string, variant?: string) =>
    `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(
      variant ? `${gene}[gene] AND ${variant}` : `${gene}[gene]`,
    )}`,
  gnomad: (gene: string) => `https://gnomad.broadinstitute.org/gene/${gene}?dataset=gnomad_r4`,
  omim: (mim: string) => `https://omim.org/entry/${mim}`,
  orphanet: (code: string) => `https://www.orpha.net/en/disease/detail/${code}`,
  pdbe: (pdbId: string) => `https://www.ebi.ac.uk/pdbe/entry/pdb/${pdbId.toLowerCase()}`,
  vep: () => "https://www.ensembl.org/Homo_sapiens/Tools/VEP",
  spliceAiLookup: () => "https://spliceailookup.broadinstitute.org/",
  varsome: (gene: string, variant: string) =>
    `https://varsome.com/variant/hg38/${encodeURIComponent(`${gene} ${variant}`)}`,
};

export const ithaQuery = (ithaId: string) => ({
  queryKey: ["ithagenes", ithaId],
  queryFn: () => fetchIthaGenes({ data: { ithaId } }),
  staleTime: 1000 * 60 * 60,
});
export const hbvarQuery = (hbvarId: string) => ({
  queryKey: ["hbvar", hbvarId],
  queryFn: () => fetchHbVar({ data: { hbvarId } }),
  staleTime: 1000 * 60 * 60,
});
