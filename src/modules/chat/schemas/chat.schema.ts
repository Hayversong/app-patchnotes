import { z } from "zod";

export const chatSchema = z.object({
  message: z
    .string()
    .min(1, { message: "Escreva uma mensagem" })
    .max(2000, { message: "A mensagem deve ter no máximo 2000 caracteres" }),
});

export type ChatFormData = z.infer<typeof chatSchema>;
