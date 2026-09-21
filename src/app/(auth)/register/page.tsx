import { AuthShell } from "@/modules/auth/components/auth-shell";
import { RegisterForm } from "@/modules/auth/components/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Crie sua conta"
      description="Organize decisões, progresso e ideias do seu projeto."
      footer={{ text: "Já possui uma conta?", label: "Entrar", href: "/login" }}
    >
      <RegisterForm />
    </AuthShell>
  );
}
