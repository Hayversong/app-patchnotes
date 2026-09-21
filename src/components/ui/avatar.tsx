"use client";

import Image from "next/image";
import { useState } from "react";

export function Avatar({ name, src }: { name?: string; src?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  return (
    <span role="img" aria-label={name ? `Avatar de ${name}` : "Avatar do usuário"} className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-secondary font-mono text-sm font-semibold text-foreground">
      {src && failedSource !== src ? <Image src={src} alt="" fill sizes="40px" unoptimized className="object-cover" onError={() => setFailedSource(src)} /> : initials}
    </span>
  );
}
