import { Link } from "@tanstack/react-router";
import { Dna, FlaskConical, Presentation, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Variant workspace", icon: Dna },
  { to: "/patient", label: "Case & labs", icon: FlaskConical },
  { to: "/export", label: "Board slides", icon: Presentation },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Dna className="h-4.5 w-4.5" />
            </span>
            <span className="font-semibold tracking-tight">
              Anemia Variant Board
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground font-medium" }}
                activeOptions={{ exact: to === "/" }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Case data stays in this browser tab
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-5 pb-10 pt-4 text-xs text-muted-foreground">
        Research and discussion support only — not a diagnostic device. Curated gene
        facts should be verified against the linked primary sources before clinical use.
      </footer>
    </div>
  );
}
