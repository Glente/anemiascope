import { Link } from "@tanstack/react-router";
import { Activity, Dna, FlaskConical, Presentation, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Variant workspace", icon: Dna },
  { to: "/patient", label: "Case & labs", icon: FlaskConical },
  { to: "/ektacytometri", label: "Ektacytometry", icon: Activity },
  { to: "/export", label: "Board slides", icon: Presentation },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3 sm:px-5 sm:py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Dna className="h-4.5 w-4.5" />
            </span>
            <span className="truncate font-semibold tracking-tight">
              Anemiascope
            </span>
          </Link>
          <nav className="col-span-2 grid grid-cols-3 gap-1 sm:col-span-1 sm:flex sm:items-center">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3 sm:text-sm"
                activeProps={{ className: "bg-accent text-foreground font-medium" }}
                activeOptions={{ exact: to === "/" }}
              >
                 <Icon className="h-4 w-4 shrink-0" />
                 <span className="truncate">{label}</span>
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Case data stays in this browser tab
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-3 pb-8 pt-4 text-xs text-muted-foreground sm:px-5 sm:pb-10">
        Research and discussion support only — not a diagnostic device. Curated gene
        facts should be verified against the linked primary sources before clinical use.
      </footer>
    </div>
  );
}
