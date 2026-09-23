# Anemia Variant Board — build plan

A single-workspace web tool for evaluating red cell membrane, enzyme and hemoglobin variants, with a 3D structure view and one-click slide export for multidisciplinary board meetings.

## What you get

**1. Gene and variant selection**
- Curated panel grouped into three categories: membrane (ANK1, SPTA1, SPTB, SLC4A1, EPB42, SPTB-related), enzymes (G6PD, PKLR, TPI1, GPI, PGK1, HK1, ALDOA), hemoglobin (HBB, HBA1, HBA2, HBD).
- Each gene carries its UniProt accession, MIM number, ORPHA code(s), inheritance and a short phenotype line.
- Quick-select presets of canonical variants per gene (e.g. G6PD Mediterranean p.Ser188Phe, PKLR p.Arg510Gln, HBB p.Glu7Val / HbS, SLC4A1 p.Glu40Lys).
- Custom entry accepting cDNA (c.563C>T), protein (p.Ser188Phe / p.S188F) or full HGVS; the app parses out the affected residue number so the structure view can highlight it.

**2. Database evidence cards**
- Cards for UniProt, AlphaFold, ClinVar, gnomAD, OMIM and Orphanet.
- Live data where the source allows anonymous browser access: UniProt (protein name, length, sequence, feature/domain annotations, natural variants at the residue), AlphaFold (model metadata and per-residue confidence), ClinVar via E-utilities (matching submissions, clinical significance, review status).
- Direct deep links for every source, including gnomAD gene page, OMIM MIM entry and Orphanet ORPHA page.
- OMIM: link-out plus an optional API key field; when a key is saved the phenotype summary is fetched through the app's own server so the key never sits in the browser.

**3. 3D structure viewer**
- Mol* embedded, loading the AlphaFold predicted model for the gene's UniProt accession.
- The variant residue is highlighted, labelled and focused, shown in ball-and-stick against a cartoon backbone; surrounding residues within 5 Å are called out as local context.
- Colour modes: pLDDT confidence or chain colour. Reset/focus controls and a snapshot button that captures the current camera view as an image.

**4. Patient details and PowerPoint export**
- Form for clinical details (age, sex, ethnicity, presentation, transfusion history, splenectomy, family history) and lab values (Hb, MCV, MCHC, reticulocytes, bilirubin, LDH, haptoglobin, ferritin, DAT/Coombs, osmotic gradient ektacytometry, enzyme activity, HPLC fractions).
- One click builds a .pptx: title slide, patient summary, lab table with flagged out-of-range values, variant impact slide, the captured 3D structure image, and evidence cards with source links. Downloads straight to your machine.

## Notes on data accuracy

Curated gene facts (MIM, ORPHA, UniProt accessions, canonical variants) come from public reference sources and will be marked as curated reference data, distinct from what is fetched live. Nothing clinical is invented — any field without a source stays blank rather than guessed.

## Technical outline

- Routes: `/` workspace (gene + variant + evidence + structure), `/patient` clinical form, `/export` review and download. Shared state in a client store persisted to local storage.
- `molstar` loaded client-side only (dynamic import behind a hydration gate); AlphaFold mmCIF from `alphafold.ebi.ac.uk/files/AF-<acc>-F1-model_v4.cif`.
- UniProt/AlphaFold/ClinVar fetched through server functions to avoid CORS and to cache; OMIM key stored as a backend secret via Lovable Cloud (enabled for secret storage only, no database needed initially).
- `pptxgenjs` for export, run in the browser with the Mol* canvas snapshot embedded as base64.
