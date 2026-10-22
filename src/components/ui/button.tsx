"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "outline" | "pastel" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/** Brutalist editorial buttons: flat, black-bordered, mono, hard press. */
const variantClass: Record<Variant, string> = {
  primary: "bg-foreground text-white border-2 border-foreground hover:bg-black",
  secondary: "bg-accent-blue text-foreground border-2 border-foreground hover:bg-accent-yellow",
  outline: "bg-surface text-foreground border-2 border-foreground hover:bg-accent-blue",
  pastel: "bg-accent-yellow text-foreground border-2 border-foreground hover:bg-accent-pink",
  danger: "bg-danger text-white border-2 border-foreground hover:bg-black",
  success: "bg-success text-white border-2 border-foreground hover:bg-black",
  ghost: "bg-transparent text-foreground border-2 border-foreground hover:bg-accent-blue",
};

const sizeClass: Record<Size, string> = {
  sm: "min-h-12 px-3 py-2 text-sm rounded-sm font-mono",
  md: "min-h-12 px-4 py-3 text-base rounded-md font-mono uppercase tracking-wide",
  lg: "min-h-14 px-5 py-3 text-base rounded-md font-mono uppercase tracking-wide",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", fullWidth, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex min-w-0 select-none items-center justify-center gap-2 text-center font-medium leading-snug transition-colors disabled:pointer-events-none disabled:opacity-50",
        "editorial-press",
        variantClass[variant],
        sizeClass[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
});
