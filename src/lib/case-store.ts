import { useSyncExternalStore } from "react";

/**
 * In-memory only. Patient data never reaches a server, a database or
 * localStorage — closing or reloading the tab clears everything.
 */

export type LabValue = { key: string; label: string; unit: string; value: string; ref?: string };

export type CaseState = {
  geneSymbol: string;
  variantInput: string;
  presetLabel: string;
  ithaId: string;
  zygosity: string;
  secondAllele: string;
  caseLabel: string;
  ageBand: string;
  sex: string;
  ancestry: string;
  presentation: string;
  transfusion: string;
  splenectomy: string;
  familyHistory: string;
  question: string;
  labs: Record<string, string>;
  structureImage: string | null;
  structureCaption: string;
};

export const LAB_FIELDS: LabValue[] = [
  { key: "hb", label: "Hemoglobin", unit: "g/dL", value: "", ref: "13.5–17.5 (M) / 12.0–15.5 (F)" },
  { key: "mcv", label: "MCV", unit: "fL", value: "", ref: "80–100" },
  { key: "mchc", label: "MCHC", unit: "g/dL", value: "", ref: "32–36" },
  { key: "rdw", label: "RDW", unit: "%", value: "", ref: "11.5–14.5" },
  { key: "retics", label: "Reticulocytes", unit: "×10⁹/L", value: "", ref: "25–100" },
  { key: "bili", label: "Bilirubin (total)", unit: "µmol/L", value: "", ref: "< 21" },
  { key: "ldh", label: "LDH", unit: "U/L", value: "", ref: "120–250" },
  { key: "hapto", label: "Haptoglobin", unit: "g/L", value: "", ref: "0.3–2.0" },
  { key: "ferritin", label: "Ferritin", unit: "µg/L", value: "", ref: "30–300" },
  { key: "tsat", label: "Transferrin saturation", unit: "%", value: "", ref: "20–45" },
  { key: "dat", label: "DAT / Coombs", unit: "", value: "", ref: "Negative" },
  { key: "ema", label: "EMA binding", unit: "% of control", value: "", ref: "> 80" },
  { key: "ekta", label: "Osmotic gradient ektacytometry", unit: "", value: "" },
  { key: "g6pd", label: "G6PD activity", unit: "U/g Hb", value: "", ref: "7–20" },
  { key: "pk", label: "Pyruvate kinase activity", unit: "U/g Hb", value: "", ref: "9–22" },
  { key: "hplc", label: "Hb fractions (HPLC)", unit: "", value: "", ref: "HbA2 2.0–3.3 %, HbF < 1 %" },
  { key: "spleen", label: "Spleen size (imaging)", unit: "cm", value: "" },
];

const initial = (): CaseState => ({
  geneSymbol: "HBB",
  variantInput: "",
  presetLabel: "",
  ithaId: "",
  zygosity: "",
  secondAllele: "",
  caseLabel: "",
  ageBand: "",
  sex: "",
  ancestry: "",
  presentation: "",
  transfusion: "",
  splenectomy: "",
  familyHistory: "",
  question: "",
  labs: {},
  structureImage: null,
  structureCaption: "",
});

let state: CaseState = initial();
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export const caseStore = {
  get: () => state,
  set(patch: Partial<CaseState>) {
    state = { ...state, ...patch };
    emit();
  },
  setLab(key: string, value: string) {
    state = { ...state, labs: { ...state.labs, [key]: value } };
    emit();
  },
  clearPatient() {
    const { geneSymbol, variantInput, presetLabel, ithaId, zygosity, secondAllele } = state;
    state = { ...initial(), geneSymbol, variantInput, presetLabel, ithaId, zygosity, secondAllele };
    emit();
  },
  clearAll() {
    state = initial();
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

const serverSnapshot = initial();

export function useCase(): CaseState {
  return useSyncExternalStore(caseStore.subscribe, caseStore.get, () => serverSnapshot);
}

export function hasPatientData(s: CaseState): boolean {
  const text = [
    s.caseLabel, s.ageBand, s.sex, s.ancestry, s.presentation,
    s.transfusion, s.splenectomy, s.familyHistory, s.question,
  ].some((v) => v.trim() !== "");
  return text || Object.values(s.labs).some((v) => v.trim() !== "");
}
