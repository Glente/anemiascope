import type { Gene } from "@/data/genes";
import type { CaseState } from "@/lib/case-store";
import { LAB_FIELDS } from "@/lib/case-store";
import { links } from "@/lib/evidence-queries";
import type { AlphaFoldInfo, ClinVarResult, UniProtInfo } from "@/lib/evidence.functions";
import { describeVariant, parseVariant, substitutionContext } from "@/lib/variant";

const INK = "16212B";
const OXBLOOD = "8C1D2C";
const SAND = "F3EFE8";
const SLATE = "51606B";
const WHITE = "FFFFFF";

export type ExportInput = {
  state: CaseState;
  gene: Gene;
  uniprot?: UniProtInfo | undefined;
  alphafold?: AlphaFoldInfo | undefined;
  clinvar?: ClinVarResult | undefined;
};

const H = { header: "Georgia", body: "Calibri" };

export async function buildDeck({ state, gene, uniprot, alphafold, clinvar }: ExportInput) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Anemia Variant Board";
  pptx.title = `${gene.symbol} variant — board discussion`;

  const parsed = parseVariant(state.variantInput);
  const variantText = state.variantInput ? describeVariant(parsed) : "No variant entered";
  const caseLabel = state.caseLabel || "Unlabelled case";

  /* ---------- 1. Title ---------- */
  const s1 = pptx.addSlide();
  s1.background = { color: INK };
  s1.addShape("rect", { x: 0, y: 0, w: 0.28, h: 5.63, fill: { color: OXBLOOD } });
  s1.addText("Anemia variant board", {
    x: 0.9, y: 1.5, w: 8.4, h: 0.5, fontFace: H.body, fontSize: 20, color: "C9A227", charSpacing: 2,
  });
  const headline = `${gene.symbol} ${state.variantInput || ""}`.trim();
  s1.addText(headline, {
    x: 0.9, y: 1.9, w: 8.4, h: 1.35,
    fontFace: H.header, fontSize: headline.length > 34 ? 26 : headline.length > 22 ? 32 : 42,
    bold: true, color: WHITE, valign: "middle",
  });
  s1.addText(
    [
      { text: gene.protein, options: { breakLine: true } },
      { text: `${caseLabel}${state.zygosity ? ` · ${state.zygosity}` : ""}`, options: { breakLine: true } },
      { text: new Date().toLocaleDateString(), options: {} },
    ],
    { x: 0.9, y: 3.4, w: 8.4, h: 1.3, fontFace: H.body, fontSize: 18, color: "C7D0D8", lineSpacing: 26 },
  );

  /* ---------- 2. Case summary ---------- */
  const s2 = pptx.addSlide();
  slideTitle(s2, "Case summary");
  const clinical: [string, string][] = [
    ["Case", caseLabel],
    ["Age band", state.ageBand],
    ["Sex", state.sex],
    ["Ancestry", state.ancestry],
    ["Presentation", state.presentation],
    ["Transfusions", state.transfusion],
    ["Surgery", state.splenectomy],
    ["Family history", state.familyHistory],
  ].filter(([, v]) => v && v.trim()) as [string, string][];

  if (clinical.length) {
    s2.addTable(
      clinical.map(([k, v]) => [
        { text: k, options: { bold: true, color: OXBLOOD, fontSize: 16 } },
        { text: v, options: { fontSize: 16, color: INK } },
      ]),
      {
        x: 0.6, y: 1.35, w: 8.8, colW: [2.2, 6.6], fontFace: H.body,
        border: { type: "solid", color: "DDD6CB", pt: 1 }, rowH: 0.42, valign: "middle",
      },
    );
  } else {
    s2.addText("No clinical details entered.", {
      x: 0.6, y: 1.5, w: 8.8, h: 0.5, fontFace: H.body, fontSize: 18, color: SLATE,
    });
  }
  if (state.question) {
    s2.addShape("rect", { x: 0.6, y: 4.5, w: 8.8, h: 0.75, fill: { color: SAND } });
    s2.addText(`Question for the board: ${state.question}`, {
      x: 0.8, y: 4.55, w: 8.4, h: 0.65, fontFace: H.body, fontSize: 15, italic: true, color: INK, valign: "middle",
    });
  }

  /* ---------- 3. Labs ---------- */
  const labRows = LAB_FIELDS.filter((f) => (state.labs[f.key] ?? "").trim() !== "");
  if (labRows.length) {
    const s3 = pptx.addSlide();
    slideTitle(s3, "Hematology");
    const half = Math.ceil(labRows.length / 2);
    const columns = [labRows.slice(0, half), labRows.slice(half)];
    columns.forEach((col, i) => {
      if (!col.length) return;
      s3.addTable(
        [
          [
            { text: "Test", options: { bold: true, color: WHITE, fill: { color: INK } } },
            { text: "Value", options: { bold: true, color: WHITE, fill: { color: INK } } },
            { text: "Reference", options: { bold: true, color: WHITE, fill: { color: INK } } },
          ],
          ...col.map((f) => [
            { text: f.label, options: { color: INK } },
            { text: `${state.labs[f.key]} ${f.unit}`.trim(), options: { bold: true, color: OXBLOOD } },
            { text: f.ref ?? "—", options: { color: SLATE } },
          ]),
        ],
        {
          x: 0.5 + i * 4.6, y: 1.3, w: 4.4, colW: [1.7, 1.35, 1.35], fontFace: H.body, fontSize: 11,
          border: { type: "solid", color: "DDD6CB", pt: 1 }, rowH: 0.3, valign: "middle",
        },
      );
    });
    s3.addText("Reference intervals are generic adult values — confirm against your own laboratory.", {
      x: 0.5, y: 5.0, w: 9.0, h: 0.3, fontFace: H.body, fontSize: 11, color: SLATE, italic: true,
    });
  }

  /* ---------- 4. Variant impact ---------- */
  const s4 = pptx.addSlide();
  slideTitle(s4, "Genetic variant");
  s4.addShape("rect", { x: 0.6, y: 1.25, w: 4.1, h: 3.4, fill: { color: SAND } });
  s4.addText(
    [
      { text: `${gene.symbol} ${variantText}`, options: { fontSize: 26, bold: true, color: OXBLOOD, breakLine: true, fontFace: H.header } },
      { text: state.variantInput || "—", options: { fontSize: 14, color: INK, breakLine: true } },
      { text: `${parsed.consequence}${state.zygosity ? ` · ${state.zygosity}` : ""}`, options: { fontSize: 14, color: SLATE, breakLine: true } },
      ...(state.secondAllele
        ? [{ text: `Second allele: ${state.secondAllele}`, options: { fontSize: 14, color: SLATE, breakLine: true } }]
        : []),
      { text: `Transcript ${gene.transcript ?? "—"} · UniProt ${gene.uniprot}`, options: { fontSize: 12, color: SLATE } },
    ],
    { x: 0.85, y: 1.5, w: 3.6, h: 2.9, fontFace: H.body, lineSpacing: 22 },
  );

  const impact: string[] = [];
  if (uniprot?.features?.some((f) => f.covers)) {
    uniprot.features.filter((f) => f.covers).slice(0, 4).forEach((f) => {
      impact.push(`${f.type}${f.description ? `: ${f.description}` : ""} (${f.start}–${f.end})`);
    });
  }
  if (alphafold?.plddt != null) impact.push(`AlphaFold pLDDT at residue: ${alphafold.plddt.toFixed(1)} — ${alphafold.plddtBand}`);
  substitutionContext(parsed).forEach((n) => impact.push(n));
  if (uniprot?.knownVariantsAtResidue?.length) {
    impact.push(`UniProt annotates ${uniprot.knownVariantsAtResidue.length} natural variant(s) at this residue.`);
  }
  if (!impact.length) impact.push("No residue-level annotation retrieved for this variant.");

  s4.addText("Structural and functional context", {
    x: 5.0, y: 1.25, w: 4.4, h: 0.35, fontFace: H.body, fontSize: 16, bold: true, color: INK,
  });
  s4.addText(
    impact.map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true } })),
    { x: 5.0, y: 1.65, w: 4.4, h: 3.0, fontFace: H.body, fontSize: 13, color: INK, lineSpacing: 20 },
  );
  s4.addText(`${gene.inheritance} · ${gene.summary}`, {
    x: 0.6, y: 4.8, w: 8.8, h: 0.6, fontFace: H.body, fontSize: 12, color: SLATE,
  });

  /* ---------- 5. Structure ---------- */
  const s5 = pptx.addSlide();
  s5.background = { color: INK };
  const structTitle = `AlphaFold model — ${gene.protein}`;
  s5.addText(structTitle, {
    x: 0.5, y: 0.25, w: 9.0, h: 0.8,
    fontFace: H.header, fontSize: structTitle.length > 44 ? 20 : 26,
    bold: true, color: WHITE, valign: "middle",
  });
  if (state.structureImage) {
    s5.addImage({ data: state.structureImage, x: 2.3, y: 1.2, w: 5.4, h: 3.55, sizing: { type: "contain", w: 5.4, h: 3.55 } });
  } else {
    s5.addText("No 3D view captured — use 'Capture for slides' in the workspace.", {
      x: 1.0, y: 2.4, w: 8.0, h: 0.6, fontFace: H.body, fontSize: 16, color: "C7D0D8", align: "center",
    });
  }
  s5.addText(
    state.structureCaption ||
      `Predicted structure of ${gene.protein} (UniProt ${gene.uniprot}). Predicted model, not experimental.`,
    { x: 0.5, y: 4.9, w: 9.0, h: 0.5, fontFace: H.body, fontSize: 12, color: "C7D0D8", align: "center" },
  );

  /* ---------- 6. Database evidence ---------- */
  const s6 = pptx.addSlide();
  slideTitle(s6, "Database evidence");
  const cards: { title: string; body: string; link: string }[] = [
    {
      title: "ClinVar",
      body: clinvar?.hits.length
        ? clinvar.hits.slice(0, 2).map((h) => `${h.significance}${h.reviewStatus ? ` (${h.reviewStatus})` : ""}`).join("\n")
        : "No matching submission retrieved.",
      link: links.clinvar(gene.symbol, parsed.protein ?? state.variantInput),
    },
    {
      title: "gnomAD v4",
      body: "Population frequency to be recorded from the gene page.",
      link: links.gnomad(gene.symbol),
    },
    {
      title: "OMIM",
      body: [
        gene.mim ? `Gene MIM ${gene.mim}` : "",
        ...(gene.phenotypeMim ?? []).map((p) => `${p.name} (${p.mim})`),
      ].filter(Boolean).join("\n"),
      link: gene.mim ? links.omim(gene.mim) : "https://omim.org",
    },
    {
      title: "Orphanet",
      body: (gene.orpha ?? []).map((o) => `ORPHA:${o.code} ${o.name}`).join("\n") || "No ORPHA code curated.",
      link: gene.orpha?.[0] ? links.orphanet(gene.orpha[0].code) : "https://www.orpha.net",
    },
    {
      title: "UniProt",
      body: `${uniprot?.proteinName || gene.protein}\n${uniprot?.length ?? "?"} amino acids · ${gene.uniprot}`,
      link: links.uniprot(gene.uniprot),
    },
    {
      title: "AlphaFold DB",
      body: alphafold?.available
        ? `Predicted model ${alphafold.version ?? ""}${alphafold.plddt != null ? ` · pLDDT ${alphafold.plddt.toFixed(1)}` : ""}`
        : "No model available.",
      link: links.alphafold(gene.uniprot),
    },
  ];

  cards.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 3.05;
    const y = 1.25 + row * 1.95;
    s6.addShape("rect", { x, y, w: 2.85, h: 1.75, fill: { color: SAND } });
    s6.addShape("rect", { x, y, w: 2.85, h: 0.08, fill: { color: OXBLOOD } });
    s6.addText(c.title, {
      x: x + 0.15, y: y + 0.18, w: 2.55, h: 0.3, fontFace: H.body, fontSize: 14, bold: true, color: OXBLOOD,
    });
    s6.addText(c.body, {
      x: x + 0.15, y: y + 0.5, w: 2.55, h: 0.85, fontFace: H.body, fontSize: 10.5, color: INK,
      valign: "top", fit: "shrink",
    });
    s6.addText("Open source", {
      x: x + 0.15, y: y + 1.4, w: 2.55, h: 0.25, fontFace: H.body, fontSize: 9, color: SLATE,
      hyperlink: { url: c.link },
    });
  });

  await pptx.writeFile({
    fileName: `${gene.symbol}_${(variantText || "variant").replace(/[^\w.-]/g, "")}_board.pptx`,
  });
}

function slideTitle(slide: any, text: string) {
  slide.background = { color: WHITE };
  slide.addText(text, {
    x: 0.5, y: 0.4, w: 9.0, h: 0.6, fontFace: H.header, fontSize: 32, bold: true, color: INK,
  });
}
