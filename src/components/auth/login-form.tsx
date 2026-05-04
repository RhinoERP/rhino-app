"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "../ui/spinner";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const getErrorMessage = (err: unknown): string => {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      const messageMap: Record<string, string> = {
        invalid_credentials: "Credenciales incorrectas",
        email_not_confirmed: "El correo electrónico no ha sido confirmado",
        phone_not_confirmed: "El número de teléfono no ha sido confirmado",
        user_banned: "Usuario bloqueado",
        weak_password: "La contraseña es demasiado débil",
      };
      if (messageMap[code]) {
        return messageMap[code];
      }
    }

    if (err instanceof Error) {
      return err.message;
    }

    return "Ocurrió un error inesperado";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw signInError;
      }

      const redirectTo = searchParams.get("redirectTo");
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="m@ejemplo.com"
            required
            type="email"
            value={email}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">Contraseña</Label>
            <Link
              className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
              href="/auth/forgot-password"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordInput
            id="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            value={password}
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button className="w-full" disabled={isLoading} type="submit">
          {isLoading ? (
            <>
              <Spinner /> Iniciando sesión...
            </>
          ) : (
            "Iniciar sesión"
          )}
        </Button>
      </div>
    </form>
  );
}
