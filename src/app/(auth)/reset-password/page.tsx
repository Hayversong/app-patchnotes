import { AuthShell } from "@/modules/auth/components/auth-shell";
import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Criar nova senha"
      description="Escolha uma senha nova para a sua conta."
      footer={{ text: "Lembrou a senha?", label: "Voltar ao login", href: "/login" }}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
