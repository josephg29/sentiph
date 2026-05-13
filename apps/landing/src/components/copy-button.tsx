"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="copy install command"
      className={cn(
        "inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-control text-white/70 transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white",
        copied && "border-term-green/50 text-term-green",
        className,
      )}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "copied" : label}
    </button>
  );
}
