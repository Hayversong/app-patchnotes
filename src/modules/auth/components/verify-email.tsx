"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { useVerifyEmailMutation } from "@/modules/auth/hooks/use-auth";
import { useFragmentToken } from "@/modules/auth/hooks/use-fragment-token";

const linkClass = "font-medium text-lime-400 underline underline-offset-4 hover:text-lime-300";

/** Abre o link do e-mail: confirma o cadastro, a API cria a conta e abre a sessão, e a pessoa vai ao dashboard. */
export function VerifyEmail() {
  const token = useFragmentToken();
  const router = useRouter();
  const verify = useVerifyEmailMutation();
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false); // o link é de uso único: um envio só, mesmo com o StrictMode rodando o efeito duas vezes

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    verify.mutateAsync({ token })
      .then(() => router.replace("/dashboard"))
      .catch((caught: unknown) => setError(getApiErrorMessage(caught, "Não foi possível confirmar o cadastro. Tente novamente.")));
  }, [token, verify, router]);

  if (token === null || error) {
    return <div className="space-y-4">
      <Feedback error>{error ?? "Este link de confirmação está incompleto ou já foi aberto. Os links só funcionam uma vez."}</Feedback>
      <p className="text-sm"><Link href="/register" className={linkClass}>Fazer o cadastro de novo</Link> ou <Link href="/login" className={linkClass}>entrar</Link></p>
    </div>;
  }
  return <LoadingState label="Confirmando seu cadastro..." />;
}
