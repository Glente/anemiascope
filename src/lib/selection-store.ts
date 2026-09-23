import { useSyncExternalStore } from "react";

/** Residue currently selected in any linked view (gene, CDS, protein, 3D). null = follow the variant. */
let selected: number | null = null;
const ls = new Set<() => void>();

export const selectionStore = {
  get: () => selected,
  set(r: number | null) {
    if (r === selected) return;
    selected = r;
    ls.forEach((l) => l());
  },
  subscribe(l: () => void) {
    ls.add(l);
    return () => ls.delete(l);
  },
};

export function useSelectedResidue() {
  return useSyncExternalStore(selectionStore.subscribe, selectionStore.get, () => null);
}
