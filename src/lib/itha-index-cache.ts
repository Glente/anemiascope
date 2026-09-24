import type { IthaIndexEntry } from "@/lib/globin.functions";

const CACHE_KEY = "anemia-board:itha-index:v1";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

type StoredIndex = {
  savedAt: number;
  entries: IthaIndexEntry[];
};

export function readIthaIndexCache(): IthaIndexEntry[] | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Partial<StoredIndex>;
    if (
      typeof stored.savedAt !== "number" ||
      !Array.isArray(stored.entries) ||
      Date.now() - stored.savedAt > CACHE_MAX_AGE
    ) {
      window.localStorage.removeItem(CACHE_KEY);
      return undefined;
    }
    return stored.entries;
  } catch {
    return undefined;
  }
}

export function writeIthaIndexCache(entries: IthaIndexEntry[]) {
  try {
    const stored: StoredIndex = { savedAt: Date.now(), entries };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
  } catch {
    // Search still works from the in-memory query cache when storage is unavailable.
  }
}