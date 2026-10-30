import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CATEGORY_LABEL, GENES, type Gene, type GeneCategory } from "@/data/genes";

type Props = {
  value: string;
  onChange: (symbol: string) => void;
};

export function GeneSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedGene = GENES.find((g) => g.symbol === value);

  // Show the selected gene symbol when not searching
  useEffect(() => {
    if (!query && selectedGene) {
      // keep placeholder showing the selected gene
    }
  }, [query, selectedGene]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GENES.filter((g) => g.common);
    const hits = GENES.filter(
      (g) =>
        g.symbol.toLowerCase().includes(q) ||
        g.protein.toLowerCase().includes(q) ||
        CATEGORY_LABEL[g.category].toLowerCase().includes(q) ||
        (g.panels ?? []).some((p) => p.toLowerCase().includes(q)),
    );
    const rank = (g: Gene) => {
      const s = g.symbol.toLowerCase();
      return s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : 3;
    };
    return hits.sort((a, b) => rank(a) - rank(b));
  }, [query]);

  // Group results by category for display
  const grouped = useMemo(() => {
    const out: Record<GeneCategory, Gene[]> = {
      hemoglobin: [],
      membrane: [],
      enzyme: [],
      other: [],
    };
    results.forEach((g) => out[g.category].push(g));
    return out;
  }, [results]);
  // Keyboard order follows display order (grouped)
  const ordered = useMemo(
    () => (Object.keys(grouped) as GeneCategory[]).flatMap((c) => grouped[c]),
    [grouped],
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectGene = (symbol: string) => {
    onChange(symbol);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0) {
        const match = ordered[Math.min(activeIndex, ordered.length - 1)];
        if (match) selectGene(match.symbol);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const flatResults = results;
  let runningIndex = -1;

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          className="pl-8"
          placeholder={
            selectedGene ? `${selectedGene.symbol} — ${selectedGene.protein}` : "Type a gene name…"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {flatResults.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No gene found for “{query}”. Try a symbol like G6PD, HBB, or ANK1.
            </p>
          ) : (
            <>
              {query.trim() === "" && (
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {`Most used genes — type to search all ${GENES.length} panel genes`}
                </p>
              )}
              {(Object.keys(grouped) as GeneCategory[]).map((cat) =>
                grouped[cat].length === 0 ? null : (
                  <div key={cat} className="mb-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABEL[cat]}
                    </p>
                    {grouped[cat].map((g) => {
                      runningIndex++;
                      const idx = runningIndex;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={g.symbol}
                          type="button"
                          className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                            isActive ? "bg-accent" : "hover:bg-accent/50"
                          }`}
                          onClick={() => selectGene(g.symbol)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <span className="font-medium">{g.symbol}</span>
                          <span className="truncate text-muted-foreground">{g.protein}</span>
                        </button>
                      );
                    })}
                  </div>
                ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
