import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listIthaIndex } from "@/lib/globin.functions";
import { readIthaIndexCache, writeIthaIndexCache } from "@/lib/itha-index-cache";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^hb\s*/, "").replace(/\s+/g, " ").trim();

type Props = { loading: boolean; loadedId: string; onLoad: (id: string) => void };

export function IthaSearch({ loading, loadedId, onLoad }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [cacheSource, setCacheSource] = useState<"stored" | "fetched" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const isNumber = /^\d{1,6}$/.test(q.trim());
  const index = useQuery({
    queryKey: ["itha-index"],
    queryFn: async () => {
      const startedAt = Date.now();
      const entries = await listIthaIndex();
      const remaining = 700 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      writeIthaIndexCache(entries);
      setCacheSource("fetched");
      return entries;
    },
    staleTime: 1000 * 60 * 60 * 24 * 7,
    gcTime: Infinity,
    enabled: cacheChecked && q.trim().length >= 2 && !isNumber,
  });

  useEffect(() => {
    const cached = readIthaIndexCache();
    if (cached) {
      queryClient.setQueryData(["itha-index"], cached);
      setCacheSource("stored");
    }
    setCacheChecked(true);
  }, [queryClient]);

  const results = useMemo(() => {
    const n = norm(q);
    if (n.length < 2 || isNumber || !index.data) return [];
    const scored = index.data
      .map((e) => {
        const names = [e.hbName, e.commonName, e.hgvsName].map(norm);
        const exact = names.some((x) => x === n);
        const starts = names.some((x) => x.startsWith(n));
        const hit = names.some((x) => x.includes(n));
        return { e, score: exact ? 3 : starts ? 2 : hit ? 1 : 0 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 30).map((x) => x.e);
  }, [q, isNumber, index.data]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (id: string) => {
    setOpen(false);
    setQ(id);
    onLoad(id);
  };

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (isNumber) pick(q.trim());
        else {
          const result = results[active];
          if (result) pick(result.ithaId);
        }
      }}
    >
      <Label htmlFor="ithaid">IthaID or hemoglobin name (ITHANET)</Label>
      <div className="relative grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" ref={ref}>
        <Input
          id="ithaid"
          autoComplete="off"
          placeholder="e.g. 824, HbS, Hb Köln"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        <Button type="submit" variant="outline" disabled={!q.trim() || loading} className="w-full sm:w-auto">
          {loading ? "Loading…" : "Load"}
        </Button>
        {open && !isNumber && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-popover p-1 shadow-md sm:right-auto sm:w-[min(32rem,calc(100vw-3rem))]">
            {!cacheChecked || index.isLoading ? (
              <div className="space-y-2 px-3 py-3 text-xs text-muted-foreground" role="status" aria-live="polite">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Fetching the ITHANET name list…
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                </div>
                <p>The first fetch can take about 15 seconds. Later searches use the saved copy.</p>
              </div>
            ) : results.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No ITHANET entry named “{q}”.</p>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.ithaId}
                  type="button"
                  className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm ${i === active ? "bg-accent" : "hover:bg-accent/50"}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r.ithaId)}
                >
                  <span className="font-medium">
                    {r.hbName || r.commonName} <span className="text-xs text-muted-foreground">· IthaID {r.ithaId} · {r.gene}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[r.hbName ? r.commonName : "", r.hgvsName].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {cacheSource && index.data && q.trim().length >= 2 && !index.isLoading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          {index.data.length.toLocaleString()} names ready · {cacheSource === "stored" ? "loaded from saved copy" : "saved for faster repeat searches"}
        </p>
      )}
      {loadedId && <p className="text-xs text-muted-foreground">Loaded from IthaID {loadedId}</p>}
    </form>
  );
}
