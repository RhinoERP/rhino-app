import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { LoginForm } from "@/components/auth/login-form";

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <AuthCard
        description="Ingresa tu correo electrónico para iniciar sesión en tu cuenta"
        title="Iniciar sesión"
      >
        <LoginForm />
      </AuthCard>
    </Suspense>
  );
}
