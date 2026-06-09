import { Activity, Radar } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/live", label: "Live Hunter" },
  { href: "/found", label: "Found Domains" },
  { href: "/workers", label: "Workers" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [pathname] = useLocation();
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/live" className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Radar className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
                </span>
              </div>
              <div>
                <h1 className="text-base font-bold leading-none tracking-tight">
                  Codicore Oracle
                </h1>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                  Private wealth engine · always-on
                </p>
              </div>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((n) => {
                const active = pathname === n.href || (n.href === "/live" && pathname === "/");
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                    )}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span>Stream live · Verisign RDAP gated</span>
          </div>
        </div>
      </header>
      <main className="min-h-[calc(100vh-58px)]">{children}</main>
    </div>
  );
}
