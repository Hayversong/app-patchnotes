import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldStyles = "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20 md:text-sm dark:bg-input/30";
const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} data-slot="input" className={cn(fieldStyles, "h-11", className)} {...props} />
));
Input.displayName = "Input";
export { Input };
