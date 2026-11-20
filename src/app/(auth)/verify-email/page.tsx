import { AuthShell } from "@/modules/auth/components/auth-shell";
import { VerifyEmail } from "@/modules/auth/components/verify-email";

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Confirmar cadastro"
      description="Estamos ativando a sua conta."
      footer={{ text: "Já confirmou?", label: "Entrar", href: "/login" }}
    >
      <VerifyEmail />
    </AuthShell>
  );
}
