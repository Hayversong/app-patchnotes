import { z } from "zod";

export const devlogSchema = z.object({
  title: z.string().min(3, { message: "O título deve ter no mínimo 3 caracteres" }),
  content: z.string().min(10, { message: "A descrição deve ter no mínimo 10 caracteres" }),
  tags: z.string().optional(),
});

export type DevlogFormData = z.infer<typeof devlogSchema>;
