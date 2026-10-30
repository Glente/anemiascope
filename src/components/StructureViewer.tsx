import { useEffect, useRef, useState } from "react";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { Expression } from "molstar/lib/mol-script/language/expression";
import type { ColorTheme } from "molstar/lib/mol-theme/color";
import "molstar/build/viewer/molstar.css";

import { pdbFileUrl, seqToUnp, unpToSeq, type ResidueSegment } from "@/lib/pdb-structures";
import { interfacePartners, residueLoci } from "@/lib/structure-context";

export type StructureSource =
  | { kind: "alphafold"; accession: string }
  | {
      kind: "pdb";
      pdbId: string;
      /** mmCIF label_entity_id of the protein of interest */
      entityId: string;
      /** UniProt → label_seq_id segments (SIFTS) */
      segments: ResidueSegment[];
      /** Biological assembly to build; first assembly when omitted */
      assemblyId?: string | undefined;
    };

/** What the viewer found around the focused residue (experimental structures only). */
export type StructureContext = {
  residue: number;
  /** false when the residue is outside the mapped range or not modelled */
  resolved: boolean;
  /** Other chains (auth chain id, with symmetry operator when not identity) within 4 Å */
  partners: string[];
};

type Props = {
  source: StructureSource;
  /** All residue numbers are UniProt numbering */
  residue?: number | undefined;
  extra?: number[] | undefined;
  colorTheme: string;
  focus?: number | null | undefined;
  onPick?: (residue: number) => void;
  onContext?: (ctx: StructureContext | null) => void;
  registerSnapshot?: (fn: (() => Promise<string | null>) | null) => void;
};

const sourceKey = (s: StructureSource) =>
  s.kind === "alphafold"
    ? `af:${s.accession}`
    : `pdb:${s.pdbId}:${s.entityId}:${s.assemblyId ?? ""}`;

export default function StructureViewer({
  source,
  residue,
  extra,
  colorTheme,
  focus,
  onPick,
  onContext,
  registerSnapshot,
}: Props) {
  const [loadedKey, setLoadedKey] = useState(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onContextRef = useRef(onContext);
  onContextRef.current = onContext;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Loading structure…");
  const key = sourceKey(source);

  // Create plugin once
  useEffect(() => {
    let disposed = false;
    let plugin: PluginUIContext | null = null;

    (async () => {
      const [{ createPluginUI }, { renderReact18 }, { DefaultPluginUISpec }] = await Promise.all([
        import("molstar/lib/mol-plugin-ui"),
        import("molstar/lib/mol-plugin-ui/react18"),
        import("molstar/lib/mol-plugin-ui/spec"),
      ]);
      if (disposed || !hostRef.current) return;
      const spec = DefaultPluginUISpec();
      plugin = await createPluginUI({
        target: hostRef.current,
        render: renderReact18,
        spec: {
          ...spec,
          layout: {
            initial: { isExpanded: false, showControls: false, controlsDisplay: "reactive" },
          },
          components: {
            ...spec.components,
            remoteState: "none",
          },
        },
      });
      if (disposed) {
        plugin.dispose();
        return;
      }
      pluginRef.current = plugin;
      const [{ StructureElement, StructureProperties }] = await Promise.all([
        import("molstar/lib/mol-model/structure"),
      ]);
      plugin.behaviors.interaction.click.subscribe((e) => {
        const loci = e?.current?.loci;
        if (!loci || !StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) return;
        const loc = StructureElement.Loci.getFirstLocation(loci);
        if (!loc) return;
        const seq = StructureProperties.residue.label_seq_id(loc);
        if (!seq) return;
        const src = sourceRef.current;
        if (src.kind === "alphafold") {
          onPickRef.current?.(seq);
          return;
        }
        // Only residues of the protein of interest map back to UniProt numbering
        if (StructureProperties.chain.label_entity_id(loc) !== src.entityId) return;
        const unp = seqToUnp(src.segments, seq);
        if (unp) onPickRef.current?.(unp);
      });
      registerSnapshot?.(async () => {
        const helper = pluginRef.current?.helpers?.viewportScreenshot;
        if (!helper) return null;
        return (await helper.getImageDataUri()) as string;
      });
    })();

    return () => {
      disposed = true;
      registerSnapshot?.(null);
      pluginRef.current?.dispose?.();
      pluginRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the model (AlphaFold monomer or PDB biological assembly)
  useEffect(() => {
    let cancelled = false;
    const src = sourceRef.current;
    const run = async () => {
      const plugin = pluginRef.current;
      if (!plugin) {
        setTimeout(() => {
          if (!cancelled) void run();
        }, 300);
        return;
      }
      setStatus("loading");
      setMessage(
        src.kind === "alphafold"
          ? "Loading AlphaFold model…"
          : `Loading ${src.pdbId.toUpperCase()} biological assembly…`,
      );
      onContextRef.current?.(null);
      try {
        await plugin.clear();
        let url: string;
        if (src.kind === "alphafold") {
          url = `https://alphafold.ebi.ac.uk/files/AF-${src.accession}-F1-model_v4.cif`;
          try {
            const meta = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${src.accession}`);
            if (meta.ok) {
              const entry = ((await meta.json()) as { cifUrl?: string }[])?.[0];
              if (entry?.cifUrl) url = entry.cifUrl;
            }
          } catch {
            /* fall back to the versioned file path */
          }
        } else {
          url = pdbFileUrl(src.pdbId);
        }
        const data = await plugin.builders.data.download({ url }, { state: { isGhost: true } });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
        if (src.kind === "alphafold") {
          await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
            representationPreset: "polymer-cartoon",
          });
        } else {
          await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
            structure: {
              name: "assembly",
              params: {
                id: src.assemblyId ?? "",
                dynamicBonds: undefined,
                mergeBySymmetry: undefined,
              },
            },
            representationPreset: "polymer-and-ligand",
          });
        }

        await plugin.dataTransaction(async () => {
          for (const s of plugin.managers.structure.hierarchy.current.structures) {
            const polymer = s.components.filter(
              (c) => !/ligand|water|ion/i.test(String(c.cell?.obj?.label ?? "")),
            );
            await plugin.managers.structure.component.updateRepresentationsTheme(polymer, {
              color: colorTheme as ColorTheme.BuiltIn,
            });
          }
        });

        if (!cancelled) {
          setStatus("ready");
          setMessage("");
          setLoadedKey((k) => k + 1);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            e instanceof Error ? e.message : "Could not load the structure for this protein.",
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [key, colorTheme]);

  // Highlight focus + variant residues without reloading the model
  const extraKey = (extra ?? []).join(",");
  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin || !loadedKey) return;
    let cancelled = false;
    const src = sourceRef.current;
    const extraResidues = extraKey ? extraKey.split(",").map(Number) : [];
    const toSeq = (unp: number) => (src.kind === "alphafold" ? unp : unpToSeq(src.segments, unp));
    (async () => {
      const [{ StructureSelectionQuery }, { MolScriptBuilder: MS }, { StructureElement }] =
        await Promise.all([
          import("molstar/lib/mol-plugin-state/helpers/structure-selection-query"),
          import("molstar/lib/mol-script/language/builder"),
          import("molstar/lib/mol-model/structure"),
        ]);
      if (cancelled) return;
      const structures = plugin.managers.structure.hierarchy.current.structures;
      const old = structures.flatMap((s) =>
        s.components.filter((c) => String(c.cell?.obj?.label ?? "").startsWith("sync:")),
      );
      if (old.length) await plugin.managers.structure.hierarchy.remove(old);

      const entityTest =
        src.kind === "pdb"
          ? {
              "entity-test": MS.core.rel.eq([
                MS.struct.atomProperty.macromolecular.label_entity_id(),
                src.entityId,
              ]),
            }
          : {};
      const resExpr = (seq: number) =>
        MS.struct.generator.atomGroups({
          ...entityTest,
          "residue-test": MS.core.rel.eq([
            MS.struct.atomProperty.macromolecular.label_seq_id(),
            seq,
          ]),
          "group-by": MS.struct.atomProperty.macromolecular.residueKey(),
        });
      const add = (label: string, expr: Expression) =>
        plugin.managers.structure.component.add(
          {
            selection: StructureSelectionQuery(label, expr),
            options: { checkExisting: false, label },
            representation: "ball-and-stick",
          },
          plugin.managers.structure.hierarchy.current.structures,
        );

      const vSeq = residue ? toSeq(residue) : null;
      if (residue && vSeq) await add(`sync: variant residue ${residue}`, resExpr(vSeq));
      for (const r of extraResidues) {
        const s = toSeq(r);
        if (s) await add(`sync: variant residue ${r}`, resExpr(s));
      }
      const target = focus ?? residue;
      if (!target) {
        onContextRef.current?.(null);
        return;
      }
      const tSeq = toSeq(target);
      if (!tSeq) {
        onContextRef.current?.({ residue: target, resolved: false, partners: [] });
        return;
      }
      if (target !== residue) await add(`sync: selected residue ${target}`, resExpr(tSeq));
      await add(
        `sync: contacts within 5 Å of ${target}`,
        MS.struct.modifier.includeSurroundings({
          0: resExpr(tSeq),
          radius: 5,
          "as-whole-residues": true,
        }),
      );
      const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
      if (!structure || cancelled) return;
      const all = residueLoci(structure, tSeq, src.kind === "pdb" ? src.entityId : undefined);
      if (!all) {
        onContextRef.current?.({ residue: target, resolved: false, partners: [] });
        return;
      }
      // In an oligomer the residue exists once per subunit — focus the camera on the first copy.
      const first = all.elements[0]!;
      plugin.managers.interactivity.lociSelects.selectOnly({ loci: all });
      plugin.managers.camera.focusLoci(StructureElement.Loci(all.structure, [first]), {
        extraRadius: 14,
        minRadius: 12,
      });
      if (cancelled) return;
      onContextRef.current?.(
        src.kind === "pdb"
          ? {
              residue: target,
              resolved: true,
              partners: interfacePartners(structure, first, src.entityId),
            }
          : null,
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadedKey, residue, focus, extraKey]);

  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-lg border bg-card sm:h-[460px]">
      <div ref={hostRef} className="absolute inset-0" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-card/80 px-6 text-center text-sm text-muted-foreground">
          {message}
        </div>
      )}
    </div>
  );
}
