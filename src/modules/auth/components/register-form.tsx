"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Feedback } from "@/components/ui/feedback";
import { formOptions } from "@/lib/form-options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/axios";
import { useRegisterMutation } from "@/modules/auth/hooks/use-auth";
import { registerSchema, type RegisterFormData } from "@/modules/auth/schemas/register.schema";
import { AuthItem } from "./auth-motion";

export function RegisterForm() {
  const router = useRouter();
  const registerMutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, touchedFields, isSubmitted } } = useForm<RegisterFormData>({
    ...formOptions,
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", passwordConfirmation: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerMutation.mutateAsync({ name: values.name, email: values.email, password: values.password });
      router.replace("/dashboard");
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível criar a conta. Verifique sua conexão e tente novamente."));
    }
  });

  return (
    <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={registerMutation.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={registerMutation.isPending}>
      <AuthItem><FormField className="transition-transform motion-safe:focus-visible:scale-[1.01]" id="name" autoFocus label="Nome" hint="Use pelo menos 2 caracteres." autoComplete="name" error={touchedFields.name || isSubmitted ? errors.name?.message : undefined} {...register("name")} /></AuthItem>
      <AuthItem><FormField className="transition-transform motion-safe:focus-visible:scale-[1.01]" id="email" label="E-mail" type="email" autoComplete="email" error={touchedFields.email || isSubmitted ? errors.email?.message : undefined} {...register("email")} /></AuthItem>
      <AuthItem><FormField className="transition-transform motion-safe:focus-visible:scale-[1.01]" id="password" label="Senha" hint="Use pelo menos 8 caracteres." type="password" autoComplete="new-password" error={touchedFields.password || isSubmitted ? errors.password?.message : undefined} {...register("password")} /></AuthItem>
      <AuthItem><FormField className="transition-transform motion-safe:focus-visible:scale-[1.01]" id="passwordConfirmation" label="Confirme a senha" hint="Digite novamente a senha escolhida." type="password" autoComplete="new-password" error={touchedFields.passwordConfirmation || isSubmitted ? errors.passwordConfirmation?.message : undefined} {...register("passwordConfirmation")} /></AuthItem>
      {serverError ? <AuthItem><Feedback error>{serverError}</Feedback></AuthItem> : null}
      <AuthItem><Button type="submit" className="w-full motion-safe:hover:scale-[1.01]" loading={registerMutation.isPending} loadingText="Criando conta...">Criar conta</Button></AuthItem>
    </fieldset>
    </form>
  );
}
