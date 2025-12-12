import { AuthCard } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export default function Page() {
  return (
    <AuthCard
      description="Por favor ingresa tu nueva contraseña a continuación"
      title="Restablecer tu Contraseña"
    >
      <UpdatePasswordForm />
    </AuthCard>
  );
}
