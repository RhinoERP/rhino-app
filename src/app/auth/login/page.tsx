import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default function Page() {
  return (
    <AuthCard
      description="Ingresa tu correo electrónico para iniciar sesión en tu cuenta"
      title="Iniciar sesión"
    >
      <LoginForm />
    </AuthCard>
  );
}
