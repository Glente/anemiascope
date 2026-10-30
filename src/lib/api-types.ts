/**
 * Minimal shapes of the external API responses this app reads. Every field is
 * optional because the upstream services are outside our control — code must
 * tolerate anything missing.
 */

type Value<T> = { value?: T };

export type UniProtFeatureJson = {
  type?: string;
  description?: string;
  location?: { start?: Value<number | string>; end?: Value<number | string> };
  alternativeSequence?: { originalSequence?: string; alternativeSequences?: string[] };
};

export type UniProtEntryJson = {
  primaryAccession?: string;
  sequence?: Value<string>;
  features?: UniProtFeatureJson[];
  comments?: { commentType?: string; texts?: Value<string>[] }[];
  entryAudit?: {
    entryVersion?: number;
    sequenceVersion?: number;
    lastAnnotationUpdateDate?: string;
  };
  proteinDescription?: {
    recommendedName?: { fullName?: Value<string> };
    submissionNames?: { fullName?: Value<string> }[];
  };
  genes?: { geneName?: Value<string> }[];
};

export type AlphaFoldPredictionJson = {
  entryId?: string;
  latestVersion?: number;
  modelCreatedDate?: string;
  cifUrl?: string;
  pdbUrl?: string;
};

export type ESearchJson = {
  esearchresult?: { idlist?: string[]; count?: string | number };
};

type ClinVarClassification = {
  description?: string;
  review_status?: string;
  last_evaluated?: string;
  trait_set?: { trait_name?: string }[];
};

export type ClinVarSummaryRecord = {
  uid?: string;
  accession?: string;
  accession_version?: string;
  title?: string;
  germline_classification?: ClinVarClassification;
  clinical_significance?: ClinVarClassification;
  trait_set?: { trait_name?: string }[];
};

export type ESummaryJson = {
  result?: Record<string, ClinVarSummaryRecord | string[] | undefined>;
};

export type OmimEntryJson = {
  omim?: {
    entryList?: {
      entry?: {
        version?: string | number;
        dateUpdated?: string;
        titles?: { preferredTitle?: string };
        textSectionList?: { textSection?: { textSectionContent?: string } }[];
      };
    }[];
  };
};

export type EnsemblExonJson = { start: number; end: number };

export type EnsemblTranscriptJson = {
  id: string;
  version?: number;
  is_canonical?: number;
  strand?: number;
  seq_region_name?: string;
  Translation?: { start: number; end: number };
  Exon?: EnsemblExonJson[];
};

export type EnsemblGeneJson = {
  assembly_name?: string;
  seq_region_name?: string;
  Transcript?: EnsemblTranscriptJson[];
};
