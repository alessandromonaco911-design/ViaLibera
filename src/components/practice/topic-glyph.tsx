import { cn } from "@/lib/utils/cn";

/**
 * CSS-only topic indicator: a small brutalist badge with a geometric
 * glyph derived from the official topic code. No emoji, no unicode art,
 * no SVG — pure divs, borders and a subtle rotating segment.
 */

type GlyphKind =
  | "warning" // segnali di pericolo
  | "divieto" // segnali di divieto
  | "obbligo" // segnali di obbligo
  | "precedenza" // segnali di precedenza
  | "indicazione" // segnali di indicazione
  | "orizzontale" // segnaletica orizzontale
  | "semaforo"
  | "velocita"
  | "sorpasso"
  | "distanza"
  | "sosta"
  | "luci"
  | "protezione" // casco/cinture
  | "patente"
  | "assicurazione"
  | "soccorso" // primo soccorso/incidente
  | "ambiente" // inquinamento/consumi
  | "motocicli"
  | "pannelli"
  | "generico";

const PALETTE: Record<GlyphKind, string> = {
  warning: "bg-accent-yellow",
  divieto: "bg-accent-pink",
  obbligo: "bg-accent-blue",
  precedenza: "bg-accent-orange",
  indicazione: "bg-accent-blue",
  orizzontale: "bg-accent-green",
  semaforo: "bg-accent-yellow",
  velocita: "bg-accent-pink",
  sorpasso: "bg-accent-orange",
  distanza: "bg-accent-blue",
  sosta: "bg-accent-green",
  luci: "bg-accent-yellow",
  protezione: "bg-accent-blue",
  patente: "bg-accent-green",
  assicurazione: "bg-accent-orange",
  soccorso: "bg-accent-pink",
  ambiente: "bg-accent-green",
  motocicli: "bg-accent-blue",
  pannelli: "bg-accent-yellow",
  generico: "bg-surface",
};

export function glyphKind(code: string, name: string): GlyphKind {
  const n = `${code} ${name}`.toLowerCase();
  if (n.includes("segnali di pericolo")) return "warning";
  if (n.includes("segnali di divieto")) return "divieto";
  if (n.includes("segnali di obbligo")) return "obbligo";
  if (n.includes("segnali di precedenza")) return "precedenza";
  if (n.includes("segnali di indicazione")) return "indicazione";
  if (n.includes("segnaletica orizzontale")) return "orizzontale";
  if (n.includes("semafor")) return "semaforo";
  if (n.includes("velocità")) return "velocita";
  if (n.includes("sorpasso")) return "sorpasso";
  if (n.includes("distanza di sicurezza")) return "distanza";
  if (n.includes("sosta")) return "sosta";
  if (n.includes("luci")) return "luci";
  if (n.includes("casco") || n.includes("cinture")) return "protezione";
  if (n.includes("patenti")) return "patente";
  if (n.includes("assicurazione")) return "assicurazione";
  if (n.includes("primo soccorso") || n.includes("incidente")) return "soccorso";
  if (n.includes("inquinamento") || n.includes("consumi")) return "ambiente";
  if (n.includes("motocicli")) return "motocicli";
  if (n.includes("pannelli integrativi")) return "pannelli";
  return "generico";
}

/** Geometric glyph body for a kind. Pure CSS shapes. */
function GlyphShape({ kind }: { kind: GlyphKind }) {
  switch (kind) {
    case "warning":
      return <span aria-hidden className="h-0 w-0 border-x-[7px] border-b-[12px] border-x-transparent border-b-foreground" />;
    case "divieto":
      return <span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-foreground" />;
    case "obbligo":
      return <span aria-hidden className="h-3.5 w-3.5 rotate-45 border-2 border-foreground bg-accent-blue" />;
    case "precedenza":
      return <span aria-hidden className="h-0 w-0 border-x-[8px] border-t-[12px] border-x-transparent border-t-foreground" />;
    case "indicazione":
      return <span aria-hidden className="h-3 w-3 border-2 border-foreground" />;
    case "orizzontale":
      return <span aria-hidden className="h-1 w-5 border-y border-foreground" />;
    case "semaforo":
      return <span aria-hidden className="flex h-4 w-2.5 flex-col justify-between rounded-[2px] border border-foreground p-0.5"><span className="h-1 w-1 rounded-full bg-foreground" /><span className="h-1 w-1 rounded-full bg-foreground" /></span>;
    case "velocita":
      return <span aria-hidden className="h-0 w-0 border-x-[6px] border-b-[10px] border-x-transparent border-b-foreground" />;
    case "sorpasso":
      return <span aria-hidden className="flex items-center gap-0.5"><span className="h-1 w-3 bg-foreground" /><span className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-foreground" /></span>;
    case "distanza":
      return <span aria-hidden className="h-px w-5 bg-foreground" />;
    case "sosta":
      return <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border-2 border-foreground font-mono text-[9px] font-bold leading-none">P</span>;
    case "luci":
      return <span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-foreground" />;
    case "protezione":
      return <span aria-hidden className="h-3.5 w-3.5 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] border-2 border-foreground" />;
    case "patente":
      return <span aria-hidden className="h-3.5 w-3 border-2 border-foreground" />;
    case "assicurazione":
      return <span aria-hidden className="h-3.5 w-3.5 rotate-45 border-2 border-foreground bg-accent-orange" />;
    case "soccorso":
      return <span aria-hidden className="relative h-3.5 w-3.5 border-2 border-foreground"><span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-foreground" /><span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-foreground" /></span>;
    case "ambiente":
      return <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border-2 border-foreground" style={{ transform: "rotate(45deg)" }} />;
    case "motocicli":
      return <span aria-hidden className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-foreground" /><span className="h-px w-3 bg-foreground" /></span>;
    case "pannelli":
      return <span aria-hidden className="h-2.5 w-4 border-2 border-foreground" />;
    default:
      return <span aria-hidden className="h-3.5 w-3.5 border-2 border-foreground" />;
  }
}

/**
 * Small editorial badge: pastel fill, black border, geometric glyph and a
 * tiny rotating corner segment (pure CSS, 4s loop, reduced-motion safe).
 */
export function TopicGlyph({ code, name, className }: { code: string; name: string; className?: string }) {
  const kind = glyphKind(code, name);
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center border-2 border-foreground",
        PALETTE[kind],
        className,
      )}
      aria-hidden
    >
      <GlyphShape kind={kind} />
      <span className="topic-glyph-dot absolute -right-[3px] -top-[3px] h-1.5 w-1.5 border border-foreground bg-surface" />
    </span>
  );
}
