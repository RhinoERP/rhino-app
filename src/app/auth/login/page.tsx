import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { LoginForm } from "@/components/auth/login-form";
import { Spinner } from "@/components/ui/spinner";

export default function Page() {
  return (
    <AuthCard
      description="Ingresa tu correo electrónico para iniciar sesión en tu cuenta"
      title="Iniciar sesión"
    >
      <Suspense
        fallback={
          <AuthCard title="Iniciar sesión">
            <Spinner />
          </AuthCard>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
