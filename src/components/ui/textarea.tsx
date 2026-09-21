import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldStyles } from "@/components/ui/input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<"textarea">>(({ className, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn(fieldStyles, "block min-h-28 resize-y leading-6", className)} {...props} />
));
Textarea.displayName = "Textarea";
export { Textarea };
