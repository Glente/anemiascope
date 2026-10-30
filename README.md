# Anemiascope

I want to make a web app that can help me evaluate anemia variants, especially variants of the red blood cell membrane, enzymes and hemoglobin.

Key requirements:

1. Gene & variant evaluation: Support target anemia panels including red blood cell membrane genes (e.g., ANK1, SPTA1, SPTB, SLC4A1), enzyme genes (e.g., G6PD, PKLR, TPI1), and hemoglobin genes (e.g., HBA1, HBA2, HBB). Provide quick-select presets for common canonical variants alongside custom variant input (cDNA / protein notation / HGVS).
2. Database integrations & links: Pull information and provide direct links to UniProt, AlphaFold Protein Structure Database, ClinVar, gnomAD, OMIM (omim.org with MIM numbers, phenotype summaries, and API key support), and Orphanet (ORPHA codes, inheritance, and disease classifications).
3. 3D Protein Structure & AlphaFold visualization: Embed an interactive 3D protein structure viewer (such as MolStar) fetching AlphaFold predicted structures for the target protein, automatically highlighting and labeling where the specific variant residue is situated, showing local structural context and domains.
4. Anemia board presentation slide export: Allow entering patient clinical details and hematology lab values (Hb, MCV, reticulocytes, bilirubin, ferritin, Coombs, etc.), and provide a one-click PowerPoint (.pptx) slide export capturing the 3D AlphaFold model view, patient information, genetic variant impact, and database evidence cards formatted for clinical multidisciplinary board presentations.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://anemiascope.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f69d1d92-ea3a-4c57-b1c1-6fecf6aa24c5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
