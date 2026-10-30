import { G6PD_HISTORICAL_CLASSES, G6PD_WHO_CLASSES, type VariantPreset } from "@/data/genes";

export function G6pdClassificationPanel({
  presetLabel,
  presets,
}: {
  presetLabel: string;
  presets: VariantPreset[];
}) {
  const preset = presets.find((p) => p.label === presetLabel);
  const c = preset?.g6pd;

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-xs">
      <p className="font-medium">G6PD classification</p>
      {c ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border bg-background p-2">
            <p className="text-muted-foreground">Revised WHO (2022)</p>
            <p className="text-sm font-semibold">{G6PD_WHO_CLASSES[c.who].title}</p>
            <p className="text-muted-foreground">{G6PD_WHO_CLASSES[c.who].criteria}</p>
          </div>
          <div className="rounded border bg-background p-2">
            <p className="text-muted-foreground">Traditional (historical I–V)</p>
            <p className="text-sm font-semibold">{G6PD_HISTORICAL_CLASSES[c.historical].title}</p>
            <p className="text-muted-foreground">
              {G6PD_HISTORICAL_CLASSES[c.historical].criteria}
            </p>
          </div>
          {c.activity && (
            <p className="text-muted-foreground sm:col-span-2">
              Typical residual activity: {c.activity}
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Choose a G6PD preset to see its class. Custom variants are not classified automatically.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground">Class definitions</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ul className="space-y-1">
            {Object.entries(G6PD_WHO_CLASSES).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">WHO {k}:</span> {v.criteria}
              </li>
            ))}
          </ul>
          <ul className="space-y-1">
            {Object.entries(G6PD_HISTORICAL_CLASSES).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">Class {k}:</span> {v.criteria}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
