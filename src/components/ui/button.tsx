"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong active:bg-primary-strong shadow-sm",
  secondary: "bg-primary-soft text-primary hover:bg-[#e0e8ff]",
  ghost: "bg-transparent text-foreground hover:bg-black/5",
  outline: "border border-border bg-surface text-foreground hover:bg-black/5",
  danger: "bg-danger text-white hover:bg-[#c92a2a]",
};

const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-md",
  md: "h-11 px-5 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-lg",
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
        "inline-flex select-none items-center justify-center gap-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-55",
        variantClass[variant],
        sizeClass[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
});
