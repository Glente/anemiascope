import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseVep, PLUGINS, type PredictionResult, type VepResultJson } from "@/lib/predictions";

const VEP = "https://rest.ensembl.org/vep/human/hgvs";

async function callVep(hgvs: string, plugins: readonly string[]) {
  const params = new URLSearchParams({
    "content-type": "application/json",
    canonical: "1",
    hgvs: "1",
  });
  for (const p of plugins) params.set(p, "1");
  const url = `${VEP}/${encodeURIComponent(hgvs)}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  return { res, url };
}

/** Runs Ensembl VEP with prediction plugins for one coding/intronic change. */
export const fetchPredictions = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        // ENST00000335295:c.20A>T, ENST…:c.92+1G>A, ENST…:c.27dupG …
        hgvs: z
          .string()
          .max(120)
          .regex(/^ENST\d{6,}(\.\d+)?:c\.[\w>_+\-*]+$/),
        transcriptId: z.string().max(30),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PredictionResult> => {
    const empty = (error: string, url = `${VEP}/${encodeURIComponent(data.hgvs)}`) =>
      ({
        ...parseVep([], data.transcriptId, data.hgvs, PLUGINS),
        error,
        provenance: { sourceUrl: url, retrievedAt: new Date().toISOString(), recordVersion: null },
      }) satisfies PredictionResult;
    try {
      let requested: readonly string[] = PLUGINS;
      let { res, url } = await callVep(data.hgvs, requested);
      // A plugin that is temporarily unavailable makes the whole request fail — retry without plugins.
      if (!res.ok && res.status !== 429) {
        const body = await res.text().catch(() => "");
        if (/not a valid|plugin|parameter/i.test(body) || res.status >= 500) {
          requested = [];
          ({ res, url } = await callVep(data.hgvs, requested));
        } else {
          const msg = body.match(/"error"\s*:\s*"([^"]+)"/)?.[1];
          return empty(msg ? `VEP: ${msg}` : `VEP returned ${res.status}`, url);
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const msg = body.match(/"error"\s*:\s*"([^"]+)"/)?.[1];
        return empty(msg ? `VEP: ${msg}` : `VEP returned ${res.status}`, url);
      }
      const json = (await res.json()) as VepResultJson[];
      const parsed = parseVep(json, data.transcriptId, data.hgvs, requested);
      return {
        ...parsed,
        provenance: {
          sourceUrl: url,
          retrievedAt: new Date().toISOString(),
          recordVersion: `Ensembl VEP · ${parsed.transcriptId}`,
        },
      };
    } catch (e) {
      return empty(e instanceof Error ? e.message : "VEP lookup failed");
    }
  });
