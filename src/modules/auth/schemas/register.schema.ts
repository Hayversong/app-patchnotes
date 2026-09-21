import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().min(2, { message: "O nome deve ter no mínimo 2 caracteres" }),
    email: z.string().email({ message: "Informe um e-mail válido" }),
    password: z.string().min(8, { message: "A senha deve ter no mínimo 8 caracteres" }),
    passwordConfirmation: z.string().min(1, { message: "Confirme sua senha" }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas não coincidem",
    path: ["passwordConfirmation"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
