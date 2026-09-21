import { AuthShell } from "@/modules/auth/components/auth-shell";
import { LoginForm } from "@/modules/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Boas-vindas de volta"
      description="Entre para continuar documentando seu jogo."
      footer={{ text: "Ainda não tem conta?", label: "Cadastre-se", href: "/register" }}
    >
      <LoginForm />
    </AuthShell>
  );
}
