"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Feedback } from "@/components/ui/feedback";
import { formOptions } from "@/lib/form-options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/axios";
import { useLoginMutation } from "@/modules/auth/hooks/use-auth";
import { loginSchema, type LoginFormData } from "@/modules/auth/schemas/login.schema";
import { AuthItem } from "./auth-motion";
import { AnimatedInput } from "./animated-input";

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLoginMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, touchedFields, isSubmitted } } = useForm<LoginFormData>({
    ...formOptions,
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await loginMutation.mutateAsync(values);
      router.replace("/dashboard");
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível entrar. Verifique sua conexão e tente novamente."));
    }
  });

  return (
    <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={loginMutation.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={loginMutation.isPending}>
      <AuthItem><AnimatedInput id="email" autoFocus label="E-mail" type="email" autoComplete="email" placeholder="voce@exemplo.com" error={touchedFields.email || isSubmitted ? errors.email?.message : undefined} success={Boolean(touchedFields.email && !errors.email)} {...register("email")} /></AuthItem>
      <AuthItem><AnimatedInput id="password" label="Senha" type="password" autoComplete="current-password" error={touchedFields.password || isSubmitted ? errors.password?.message : undefined} success={Boolean(touchedFields.password && !errors.password)} {...register("password")} /></AuthItem>
      {serverError ? <AuthItem><Feedback error>{serverError}</Feedback></AuthItem> : null}
      <AuthItem><Button type="submit" className="w-full motion-safe:hover:scale-[1.01]" loading={loginMutation.isPending} loadingText="Entrando...">Entrar</Button></AuthItem>
    </fieldset>
    </form>
  );
}
