import { z } from "@/lib/zod";

const optionalUrl = z.union([
  z.string().url({ message: "Informe uma URL válida" }),
  z.literal(""),
]);

export const profileSchema = z.object({
  name: z.string().min(2, { message: "O nome deve ter no mínimo 2 caracteres" }),
  bio: z.string().max(240, { message: "A bio deve ter no máximo 240 caracteres" }),
  githubUrl: optionalUrl,
});

export type ProfileFormData = z.infer<typeof profileSchema>;

/** Mesmos limites da API: PNG, JPEG ou WebP até 256 KB (a API confere de novo pelos bytes). */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_MAX_BYTES = 256 * 1024;

export function avatarFileError(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return "Escolha uma imagem PNG, JPEG ou WebP.";
  if (file.size > AVATAR_MAX_BYTES) return "A imagem pode ter no máximo 256 KB.";
  return null;
}
