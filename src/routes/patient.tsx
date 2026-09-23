import { createFileRoute, Link } from "@tanstack/react-router";
import { Eraser, Lock } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { caseStore, LAB_FIELDS, useCase } from "@/lib/case-store";

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "Case & labs — Anemia Variant Board" },
      {
        name: "description",
        content:
          "Enter pseudonymised clinical details and hematology labs for the board discussion. Nothing is stored on a server.",
      },
      { property: "og:title", content: "Case & labs — Anemia Variant Board" },
      {
        property: "og:description",
        content: "Pseudonymised case details and hematology labs, held only in your browser tab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const state = useCase();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium">This case stays in your browser tab</p>
            <p className="text-muted-foreground">
              Nothing typed here is sent to a server, saved to a database or written to your
              disk. Closing or reloading the tab clears it. Use a local case label, never a
              name or CPR number.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clinical details</CardTitle>
            <CardDescription>Pseudonymised — no identifying fields</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Case label" value={state.caseLabel} onChange={(v) => caseStore.set({ caseLabel: v })} placeholder="Case 1 / local study ID" />
            <Field label="Age band" value={state.ageBand} onChange={(v) => caseStore.set({ ageBand: v })} placeholder="e.g. 20–29 years" />
            <Field label="Sex" value={state.sex} onChange={(v) => caseStore.set({ sex: v })} placeholder="Female / Male" />
            <Field label="Ancestry (if relevant)" value={state.ancestry} onChange={(v) => caseStore.set({ ancestry: v })} placeholder="e.g. Mediterranean" />
            <AreaField label="Presentation" value={state.presentation} onChange={(v) => caseStore.set({ presentation: v })} placeholder="Onset, jaundice, gallstones, crises, triggers…" />
            <AreaField label="Transfusion history" value={state.transfusion} onChange={(v) => caseStore.set({ transfusion: v })} placeholder="Episodes, frequency, last transfusion…" />
            <AreaField label="Splenectomy / cholecystectomy" value={state.splenectomy} onChange={(v) => caseStore.set({ splenectomy: v })} placeholder="Procedures and year" />
            <AreaField label="Family history" value={state.familyHistory} onChange={(v) => caseStore.set({ familyHistory: v })} placeholder="Affected relatives, segregation, consanguinity" />
            <div className="sm:col-span-2">
              <AreaField label="Question for the board" value={state.question} onChange={(v) => caseStore.set({ question: v })} placeholder="e.g. Does the SPTA1 variant explain the phenotype? Is splenectomy indicated?" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hematology labs</CardTitle>
            <CardDescription>Leave blank what you do not have — blanks are skipped on the slides</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LAB_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="text-xs">
                  {f.label} {f.unit && <span className="text-muted-foreground">({f.unit})</span>}
                </Label>
                <Input
                  id={f.key}
                  value={state.labs[f.key] ?? ""}
                  onChange={(e) => caseStore.setLab(f.key, e.target.value)}
                />
                {f.ref && <p className="text-[11px] text-muted-foreground">Ref: {f.ref}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/export">Continue to board slides</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              caseStore.clearPatient();
              toast.success("Case and lab fields cleared.");
            }}
          >
            <Eraser className="mr-1.5 h-4 w-4" />
            Clear all patient data
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = slug(label);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} value={value} placeholder={placeholder ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = slug(label);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Textarea
        id={id}
        rows={3}
        value={value}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
