"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function Avatar({ name, src, className, sizes = "40px" }: { name?: string; src?: string; className?: string; sizes?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  return (
    <span role="img" aria-label={name ? `Avatar de ${name}` : "Avatar do usuário"} className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-secondary font-mono text-sm font-semibold text-foreground", className)}>
      {src && failedSource !== src ? <Image src={src} alt="" fill sizes={sizes} unoptimized className="object-cover" onError={() => setFailedSource(src)} /> : initials}
    </span>
  );
}
