"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./misc";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "soft";
type Size = "xs" | "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-500 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_1px_2px_rgb(0_0_0/0.2)]",
  accent:
    "text-white bg-[linear-gradient(110deg,var(--color-iris-500),#8a5cff_45%,var(--color-coral-500))] hover:brightness-105 shadow-glow",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-[#fbfaf8] shadow-soft",
  ghost: "text-ink-2 hover:bg-subtle",
  soft: "bg-iris-50 text-iris-700 hover:bg-iris-100",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs rounded-lg",
  sm: "h-8 px-3 text-[13px] rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-[15px] rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  icon,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
