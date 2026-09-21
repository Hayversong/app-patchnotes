import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldProps = { label: string; error?: string; hint?: string; id: string };
function FieldFrame({ label, error, hint, id, children }: FieldProps & { children: React.ReactNode }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && <p id={id + "-hint"} className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    {error && <p id={id + "-error"} role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}
function describedBy({ id, error, hint }: FieldProps, extra?: string) {
  return [hint && id + "-hint", error && id + "-error", extra].filter(Boolean).join(" ") || undefined;
}
const FormField = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<typeof Input> & FieldProps>(
  ({ label, error, hint, id, ...props }, ref) => <FieldFrame {...{ label, error, hint, id }}>
    <Input {...props} ref={ref} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy({ label, error, hint, id }, props["aria-describedby"])} />
  </FieldFrame>,
);
FormField.displayName = "FormField";
const TextareaField = React.forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<typeof Textarea> & FieldProps>(
  ({ label, error, hint, id, ...props }, ref) => <FieldFrame {...{ label, error, hint, id }}>
    <Textarea {...props} ref={ref} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy({ label, error, hint, id }, props["aria-describedby"])} />
  </FieldFrame>,
);
TextareaField.displayName = "TextareaField";
export { FormField, TextareaField };
