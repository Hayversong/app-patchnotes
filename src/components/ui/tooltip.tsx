"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children, enabled = true }: {
  label: string;
  children: ReactElement;
  enabled?: boolean;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} disabled={!enabled} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="right" sideOffset={12} className="z-50">
          <TooltipPrimitive.Popup className="max-w-xs rounded-md border border-zinc-800 bg-background px-3 py-2 text-sm text-foreground shadow-lg">
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
