import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "border font-bold uppercase tracking-control transition-colors",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-70",
    "[&_svg]:size-3.5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "border-foreground bg-foreground text-canvas",
          "hover:bg-neutral-800 hover:border-neutral-800",
          "focus-visible:ring-foreground",
        ].join(" "),
        secondary: [
          "border-foreground bg-canvas text-foreground",
          "hover:bg-surface-1",
          "focus-visible:ring-foreground",
        ].join(" "),
        info: [
          "border-term-blue bg-term-blue-soft text-term-blue",
          "hover:bg-[#dfe7f3]",
          "focus-visible:ring-term-blue",
        ].join(" "),
        ghost: [
          "border-transparent bg-transparent text-secondary",
          "hover:text-foreground hover:border-border-subtle hover:bg-surface-1",
          "focus-visible:ring-foreground",
        ].join(" "),
      },
      size: {
        sm: "h-7 px-2.5 text-[10px]",
        md: "h-9 px-3.5 text-[11px]",
        lg: "h-11 px-5 text-[12px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export const buttonClassName = ({
  className,
  ...variants
}: VariantProps<typeof buttonVariants> & { className?: string } = {}) =>
  cn(buttonVariants(variants), className);
