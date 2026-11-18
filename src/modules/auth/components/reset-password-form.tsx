"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Button, buttonVariants } from "@/components/ui/button";
import { Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useResetPasswordMutation } from "@/modules/auth/hooks/use-auth";
import { resetPasswordSchema, type ResetPasswordFormData } from "@/modules/auth/schemas/reset-password.schema";
import { AnimatedInput } from "./animated-input";
import { AuthItem } from "./auth-motion";

const linkClass = "font-medium text-lime-400 underline underline-offset-4 hover:text-lime-300";

/** Lê o token do fragmento (#token=...) e o remove da barra de endereço logo em seguida. */
function useResetTokenFromFragment(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // O ref guarda o token lido: o efeito pode rodar de novo (StrictMode) depois que o fragmento já foi apagado.
  const captured = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (captured.current === undefined) {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      captured.current = value && value.length >= 20 ? value : null;
      if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setToken(captured.current);
  }, []);
  return token;
}

export function ResetPasswordForm() {
  const token = useResetTokenFromFragment();
  const resetPassword = useResetPasswordMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, touchedFields, isSubmitted } } = useForm<ResetPasswordFormData>({
    ...formOptions,
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setServerError(null);
    try {
      await resetPassword.mutateAsync({ token, password });
      setDone(true);
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível redefinir a senha. Tente novamente."));
    }
  });

  if (token === undefined) return <LoadingState label="Verificando o link..." />;

  if (token === null) {
    return <div className="space-y-4">
      <Feedback error>Este link de redefinição está incompleto ou já foi aberto. Os links só funcionam uma vez.</Feedback>
      <p className="text-sm"><Link href="/forgot-password" className={linkClass}>Solicitar um novo link</Link></p>
    </div>;
  }

  if (done) {
    return <div className="space-y-4">
      <Feedback>Senha redefinida. Por segurança, todas as sessões abertas foram encerradas.</Feedback>
      <Link href="/login" className={buttonVariants({ className: "w-full" })}>Entrar com a nova senha</Link>
    </div>;
  }

  return (
    <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={resetPassword.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={resetPassword.isPending}>
        <AuthItem><AnimatedInput id="password" autoFocus label="Nova senha" hint="Use pelo menos 8 caracteres." type="password" autoComplete="new-password" error={touchedFields.password || isSubmitted ? errors.password?.message : undefined} success={Boolean(touchedFields.password && !errors.password)} {...register("password")} /></AuthItem>
        <AuthItem><AnimatedInput id="passwordConfirmation" label="Confirme a nova senha" type="password" autoComplete="new-password" error={touchedFields.passwordConfirmation || isSubmitted ? errors.passwordConfirmation?.message : undefined} success={Boolean(touchedFields.passwordConfirmation && !errors.passwordConfirmation)} {...register("passwordConfirmation")} /></AuthItem>
        {serverError && <AuthItem><Feedback error>{serverError}</Feedback><p className="mt-2 text-sm"><Link href="/forgot-password" className={linkClass}>Solicitar um novo link</Link></p></AuthItem>}
        <AuthItem><Button type="submit" className="w-full motion-safe:hover:scale-[1.01]" loading={resetPassword.isPending} loadingText="Salvando...">Redefinir senha</Button></AuthItem>
      </fieldset>
    </form>
  );
}
