"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Editorial site header: compact, black bottom border, accent-blue fill,
 * typographic logo, essential navigation, accessible mobile menu
 * (Esc close, focus trap, 44px targets, keyboard navigable).
 */
export function SiteHeader({ mode }: { mode?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/#inizia", label: "Simulazione" },
    { href: "/allenamento", label: "Allenamento" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/#inizia") return pathname === "/";
    return pathname.startsWith(href);
  };

  // Esc closes the mobile menu; focus trap while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (e.key === "Tab" && menuRef.current) {
        const focusables = menuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // close menu on navigation (via link clicks, not an effect on pathname)

  return (
    <header className="sticky top-0 z-30 border-b-2 border-foreground bg-accent-blue">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:h-16">
        <Link href="/" className="flex shrink-0 items-baseline gap-1 font-mono text-lg font-semibold tracking-tight sm:text-xl">
          <span>VIA</span>
          <span className="bg-foreground px-1 text-accent-blue">LIBERA</span>
        </Link>

        {mode && (
          <span className="hidden border-2 border-foreground bg-surface px-2 py-0.5 font-mono text-xs uppercase tracking-wide sm:inline-block">
            {mode}
          </span>
        )}

        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex h-10 items-center border-2 border-transparent px-3 font-mono text-sm uppercase tracking-wide transition-colors hover:border-foreground hover:bg-surface",
                isActive(item.href) && "bg-surface",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* mobile menu trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Chiudi menu" : "Apri menu"}
          className="ml-auto inline-flex h-11 w-11 items-center justify-center border-2 border-foreground bg-surface font-mono sm:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* mobile menu */}
      {open && (
        <div
          id="site-menu"
          ref={menuRef}
          className="border-t-2 border-foreground bg-surface sm:hidden"
        >
          <nav aria-label="Navigazione mobile" className="mx-auto flex max-w-5xl flex-col px-4 py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center border-b border-foreground/30 px-2 font-mono text-base uppercase tracking-wide",
                  isActive(item.href) && "bg-accent-blue",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
