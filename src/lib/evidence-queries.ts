import { queryOptions } from "@tanstack/react-query";
import { fetchAlphaFold, fetchClinVar, fetchOmim, fetchUniProt } from "./evidence.functions";

export const uniProtQuery = (accession: string, residue?: number) =>
  queryOptions({
    queryKey: ["uniprot", accession, residue ?? null],
    queryFn: () =>
      fetchUniProt({ data: residue ? { accession, residue } : { accession } }),
    staleTime: 1000 * 60 * 60,
  });

export const alphaFoldQuery = (accession: string, residue?: number) =>
  queryOptions({
    queryKey: ["alphafold", accession, residue ?? null],
    queryFn: () =>
      fetchAlphaFold({ data: residue ? { accession, residue } : { accession } }),
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

export const links = {
  uniprot: (acc: string) => `https://www.uniprot.org/uniprotkb/${acc}/entry`,
  alphafold: (acc: string) => `https://alphafold.ebi.ac.uk/entry/${acc}`,
  clinvar: (gene: string, variant?: string) =>
    `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(
      variant ? `${gene}[gene] AND ${variant}` : `${gene}[gene]`,
    )}`,
  gnomad: (gene: string) => `https://gnomad.broadinstitute.org/gene/${gene}?dataset=gnomad_r4`,
  omim: (mim: string) => `https://omim.org/entry/${mim}`,
  orphanet: (code: string) =>
    `https://www.orpha.net/en/disease/detail/${code}`,
  varsome: (gene: string, variant: string) =>
    `https://varsome.com/variant/hg38/${encodeURIComponent(`${gene} ${variant}`)}`,
};
