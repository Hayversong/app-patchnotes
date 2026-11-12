import { z } from "@/lib/zod";

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "A senha deve ter no mínimo 8 caracteres" })
      .max(128, { message: "A senha deve ter no máximo 128 caracteres" }),
    passwordConfirmation: z.string().min(1, { message: "Confirme sua nova senha" }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas não coincidem",
    path: ["passwordConfirmation"],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
