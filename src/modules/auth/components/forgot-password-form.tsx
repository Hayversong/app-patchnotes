"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useForgotPasswordMutation } from "@/modules/auth/hooks/use-auth";
import { forgotPasswordSchema, type ForgotPasswordFormData } from "@/modules/auth/schemas/forgot-password.schema";
import { AnimatedInput } from "./animated-input";
import { AuthItem } from "./auth-motion";

export function ForgotPasswordForm() {
  const forgotPassword = useForgotPasswordMutation();
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const { register, handleSubmit, formState: { errors, touchedFields, isSubmitted } } = useForm<ForgotPasswordFormData>({
    ...formOptions,
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setResult(null);
    try {
      const { message } = await forgotPassword.mutateAsync(values);
      setResult({ message: `${message} Confira também a caixa de spam. O link vale por 30 minutos.` });
    } catch (error) {
      setResult({ message: getApiErrorMessage(error, "Não foi possível enviar o pedido. Tente novamente."), error: true });
    }
  });

  return (
    <form onSubmit={onSubmit} onChange={() => setResult((current) => (current?.error ? null : current))} aria-busy={forgotPassword.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={forgotPassword.isPending}>
        <AuthItem><AnimatedInput id="email" autoFocus label="E-mail da conta" type="email" autoComplete="email" placeholder="voce@exemplo.com" error={touchedFields.email || isSubmitted ? errors.email?.message : undefined} success={Boolean(touchedFields.email && !errors.email)} {...register("email")} /></AuthItem>
        {result && <AuthItem><Feedback error={result.error}>{result.message}</Feedback></AuthItem>}
        <AuthItem><Button type="submit" className="w-full motion-safe:hover:scale-[1.01]" loading={forgotPassword.isPending} loadingText="Enviando...">{result && !result.error ? "Enviar novamente" : "Enviar link de redefinição"}</Button></AuthItem>
      </fieldset>
    </form>
  );
}
