import { useEffect, useRef, useState } from "react";
import "molstar/build/viewer/molstar.css";

type Props = {
  accession: string;
  residue?: number | undefined;
  colorTheme: string;
  onSnapshot?: (dataUri: string) => void;
  registerSnapshot?: (fn: (() => Promise<string | null>) | null) => void;
};

export default function StructureViewer({
  accession,
  residue,
  colorTheme,
  registerSnapshot,
}: Props) {
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

        if (residue) {
          const [{ StructureSelectionQuery }, { MolScriptBuilder: MS }, { Script }, { StructureSelection }] =
            await Promise.all([
              import("molstar/lib/mol-plugin-state/helpers/structure-selection-query"),
              import("molstar/lib/mol-script/language/builder"),
              import("molstar/lib/mol-script/script"),
              import("molstar/lib/mol-model/structure"),
            ]);

          const expression = MS.struct.generator.atomGroups({
            "residue-test": MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_seq_id(), residue]),
            "group-by": MS.struct.atomProperty.macromolecular.residueKey(),
          });
          const query = StructureSelectionQuery(`Residue ${residue}`, expression);

          await plugin.managers.structure.component.add(
            {
              selection: query,
              options: { checkExisting: false, label: `Variant residue ${residue}` },
              representation: "ball-and-stick",
            },
            plugin.managers.structure.hierarchy.current.structures,
          );

          const surroundings = StructureSelectionQuery(
            `Within 5 A of residue ${residue}`,
            MS.struct.modifier.includeSurroundings({
              0: expression,
              radius: 5,
              "as-whole-residues": true,
            }),
          );
          await plugin.managers.structure.component.add(
            {
              selection: surroundings,
              options: { checkExisting: false, label: `Contacts within 5 Å` },
              representation: "ball-and-stick",
            },
            plugin.managers.structure.hierarchy.current.structures,
          );

          const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell?.obj?.data;
          if (structure) {
            const sel = Script.getStructureSelection(
              (Q: any) =>
                Q.struct.generator.atomGroups({
                  "residue-test": Q.core.rel.eq([
                    Q.struct.atomProperty.macromolecular.label_seq_id(),
                    residue,
                  ]),
                }),
              structure,
            );
            const loci = StructureSelection.toLociWithSourceUnits(sel);
            if (!StructureSelection.isEmpty(sel)) {
              plugin.managers.interactivity.lociSelects.selectOnly({ loci });
              plugin.managers.camera.focusLoci(loci, { extraRadius: 14, minRadius: 12 });
            }
          }
        }
        if (!cancelled) {
          setStatus("ready");
          setMessage("");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            e instanceof Error ? e.message : "Could not load the predicted structure for this protein.",
          );
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [accession, residue, colorTheme]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-lg border bg-card">
      <div ref={hostRef} className="absolute inset-0" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-card/80 px-6 text-center text-sm text-muted-foreground">
          {message}
        </div>
      )}
    </div>
  );
}
