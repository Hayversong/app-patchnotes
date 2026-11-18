"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Feedback } from "@/components/ui/feedback";
import { formOptions } from "@/lib/form-options";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/axios";
import { useRegisterMutation } from "@/modules/auth/hooks/use-auth";
import { registerSchema, type RegisterFormData } from "@/modules/auth/schemas/register.schema";
import { AuthItem } from "./auth-motion";
import { AnimatedInput } from "./animated-input";

export function RegisterForm() {
  const registerMutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, touchedFields, isSubmitted } } = useForm<RegisterFormData>({
    ...formOptions,
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", passwordConfirmation: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerMutation.mutateAsync({ name: values.name, email: values.email, password: values.password });
      setSentTo(values.email);
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível criar a conta. Verifique sua conexão e tente novamente."));
    }
  });

  // A resposta é a mesma para qualquer e-mail (a API não revela quais já têm conta).
  if (sentTo) {
    return <div className="space-y-4" role="status">
      <Feedback>Quase lá! Enviamos um link de confirmação para <strong className="break-all">{sentTo}</strong>.</Feedback>
      <p className="text-sm leading-6 text-muted-foreground">Abra o link para ativar a conta. Ele vale por 24 horas e só pode ser usado uma vez. Não chegou? Confira o spam ou faça o cadastro de novo.</p>
    </div>;
  }

  return (
    <form method="post" onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={registerMutation.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={registerMutation.isPending}>
      <AuthItem><AnimatedInput id="name" autoFocus label="Nome" hint="Use pelo menos 2 caracteres." autoComplete="name" error={touchedFields.name || isSubmitted ? errors.name?.message : undefined} success={Boolean(touchedFields.name && !errors.name)} {...register("name")} /></AuthItem>
      <AuthItem><AnimatedInput id="email" label="E-mail" type="email" autoComplete="email" error={touchedFields.email || isSubmitted ? errors.email?.message : undefined} success={Boolean(touchedFields.email && !errors.email)} {...register("email")} /></AuthItem>
      <AuthItem><AnimatedInput id="password" label="Senha" hint="Use pelo menos 8 caracteres." type="password" autoComplete="new-password" error={touchedFields.password || isSubmitted ? errors.password?.message : undefined} success={Boolean(touchedFields.password && !errors.password)} {...register("password")} /></AuthItem>
      <AuthItem><AnimatedInput id="passwordConfirmation" label="Confirme a senha" hint="Digite novamente a senha escolhida." type="password" autoComplete="new-password" error={touchedFields.passwordConfirmation || isSubmitted ? errors.passwordConfirmation?.message : undefined} success={Boolean(touchedFields.passwordConfirmation && !errors.passwordConfirmation)} {...register("passwordConfirmation")} /></AuthItem>
      {serverError ? <AuthItem><Feedback error>{serverError}</Feedback></AuthItem> : null}
      <AuthItem><Button type="submit" className="w-full motion-safe:hover:scale-[1.01]" loading={registerMutation.isPending} loadingText="Criando conta...">Criar conta</Button></AuthItem>
    </fieldset>
    </form>
  );
}
