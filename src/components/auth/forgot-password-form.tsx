"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // The url which will be included in the email. This URL needs to be configured in your redirect URLs in the Supabase dashboard at https://supabase.com/dashboard/project/_/auth/url-configuration
      const { error: resetPasswordError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
      if (resetPasswordError) {
        throw resetPasswordError;
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthCard
        description="Instrucciones para restablecer contraseña enviadas"
        title="Revisa tu Email"
      >
        <p className="text-muted-foreground text-sm">
          Si te registraste usando tu email y contraseña, recibirás un correo
          para restablecer tu contraseña.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña"
      title="Restablecer tu Contraseña"
    >
      <form onSubmit={handleForgotPassword}>
        <div className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="m@ejemplo.com"
              required
              type="email"
              value={email}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button className="w-full" disabled={isLoading} type="submit">
            {isLoading ? "Enviando..." : "Enviar email de recuperación"}
          </Button>
        </div>
        <div className="mt-4 text-center text-sm">
          ¿Ya tienes una cuenta?{" "}
          <Link className="underline underline-offset-4" href="/auth/login">
            Iniciar sesión
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
