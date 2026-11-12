import { AuthShell } from "@/modules/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/modules/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Esqueceu a senha?"
      description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      footer={{ text: "Lembrou a senha?", label: "Voltar ao login", href: "/login" }}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
