import { z } from "@/lib/zod";

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, { message: "Informe seu e-mail" }).email({ message: "Informe um e-mail válido" }),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
