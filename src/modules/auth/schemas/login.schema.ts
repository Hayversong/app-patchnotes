import * as z from "zod";


export const loginSchema= z.object({
    email:
        z.string()
        .min(1, {message: 'Informe seu e-mail'})
        .email({ message: 'Informe um e-mail válido' }),
    password:
        z.string()
        .min(1, {message: 'Insira uma senha'})
        .min(8, {message: 'A senha deve ter no mínimo 8 caracteres'})
});

export type LoginFormData = z.infer<typeof loginSchema>;
