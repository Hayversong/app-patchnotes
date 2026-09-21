import { z } from "zod";

const optionalUrl = z.union([
  z.string().url({ message: "Informe uma URL válida" }),
  z.literal(""),
]);

export const profileSchema = z.object({
  name: z.string().min(2, { message: "O nome deve ter no mínimo 2 caracteres" }),
  bio: z.string().max(240, { message: "A bio deve ter no máximo 240 caracteres" }),
  avatarUrl: optionalUrl,
  githubUrl: optionalUrl,
});

export type ProfileFormData = z.infer<typeof profileSchema>;
