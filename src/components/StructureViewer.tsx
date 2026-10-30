import { useEffect, useRef, useState } from "react";
import "molstar/build/viewer/molstar.css";

type Props = {
  accession: string;
  residue?: number | undefined;
  extra?: number[] | undefined;
  colorTheme: string;
  focus?: number | null | undefined;
  onPick?: (residue: number) => void;
  onSnapshot?: (dataUri: string) => void;
  registerSnapshot?: (fn: (() => Promise<string | null>) | null) => void;
};

export default function StructureViewer({
  accession,
  residue,
  extra,
  colorTheme,
  focus,
  onPick,
  registerSnapshot,
}: Props) {
  const [loadedKey, setLoadedKey] = useState(0);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Loading AlphaFold model…");

  // Create plugin once
  useEffect(() => {
    let disposed = false;
    let plugin: any = null;

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
      plugin.behaviors.interaction.click.subscribe((e: any) => {
        const loci = e?.current?.loci;
        if (!loci || !StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) return;
        const loc = StructureElement.Loci.getFirstLocation(loci);
        if (!loc) return;
        const seq = StructureProperties.residue.label_seq_id(loc);
        if (seq) onPickRef.current?.(seq);
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

  // Load structure + highlight residue
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const plugin = pluginRef.current;
      if (!plugin) {
        setTimeout(() => {
          if (!cancelled) void run();
        }, 300);
        return;
      }
      setStatus("loading");
      setMessage("Loading AlphaFold model…");
      try {
        await plugin.clear();
        let url = `https://alphafold.ebi.ac.uk/files/AF-${accession}-F1-model_v4.cif`;
        try {
          const meta = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${accession}`);
          if (meta.ok) {
            const entry = (await meta.json())?.[0];
            if (entry?.cifUrl) url = entry.cifUrl;
          }
        } catch {
          /* fall back to the versioned file path */
        }
        const data = await plugin.builders.data.download({ url }, { state: { isGhost: true } });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
        await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
          representationPreset: "polymer-cartoon",
        });

        await plugin.dataTransaction(async () => {
          for (const s of plugin.managers.structure.hierarchy.current.structures) {
            await plugin.managers.structure.component.updateRepresentationsTheme(s.components, {
              color: colorTheme as any,
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
            e instanceof Error
              ? e.message
              : "Could not load the predicted structure for this protein.",
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [accession, colorTheme]);

  // Highlight focus + variant residues without reloading the model
  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin || !loadedKey) return;
    let cancelled = false;
    (async () => {
      const [
        { StructureSelectionQuery },
        { MolScriptBuilder: MS },
        { Script },
        { StructureSelection },
      ] = await Promise.all([
        import("molstar/lib/mol-plugin-state/helpers/structure-selection-query"),
        import("molstar/lib/mol-script/language/builder"),
        import("molstar/lib/mol-script/script"),
        import("molstar/lib/mol-model/structure"),
      ]);
      if (cancelled) return;
      const structures = plugin.managers.structure.hierarchy.current.structures;
      const old = structures.flatMap((s: any) =>
        s.components.filter((c: any) => String(c.cell?.obj?.label ?? "").startsWith("sync:")),
      );
      if (old.length) await plugin.managers.structure.hierarchy.remove(old);

      const resExpr = (r: number) =>
        MS.struct.generator.atomGroups({
          "residue-test": MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_seq_id(), r]),
          "group-by": MS.struct.atomProperty.macromolecular.residueKey(),
        });
      const add = (label: string, expr: any) =>
        plugin.managers.structure.component.add(
          {
            selection: StructureSelectionQuery(label, expr),
            options: { checkExisting: false, label },
            representation: "ball-and-stick",
          },
          plugin.managers.structure.hierarchy.current.structures,
        );

      if (residue) await add(`sync: variant residue ${residue}`, resExpr(residue));
      for (const r of extra ?? []) await add(`sync: variant residue ${r}`, resExpr(r));
      const target = focus ?? residue;
      if (!target) return;
      if (target !== residue) await add(`sync: selected residue ${target}`, resExpr(target));
      await add(
        `sync: contacts within 5 Å of ${target}`,
        MS.struct.modifier.includeSurroundings({
          0: resExpr(target),
          radius: 5,
          "as-whole-residues": true,
        }),
      );
      const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
      if (structure && !cancelled) {
        const sel = Script.getStructureSelection(
          (Q: any) =>
            Q.struct.generator.atomGroups({
              "residue-test": Q.core.rel.eq([
                Q.struct.atomProperty.macromolecular.label_seq_id(),
                target,
              ]),
            }),
          structure,
        );
        if (!StructureSelection.isEmpty(sel)) {
          const loci = StructureSelection.toLociWithSourceUnits(sel);
          plugin.managers.interactivity.lociSelects.selectOnly({ loci });
          plugin.managers.camera.focusLoci(loci, { extraRadius: 14, minRadius: 12 });
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadedKey, residue, focus, (extra ?? []).join(",")]);

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
