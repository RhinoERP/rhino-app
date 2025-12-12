"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        throw new Error(updateError.message);
      }
      // Update this route to redirect to an authenticated route. The user already has an active session.
      router.push("/");
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error ? updateError.message : "Ocurrió un error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleForgotPassword}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input
            id="password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña"
            required
            type="password"
            value={password}
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button className="w-full" disabled={isLoading} type="submit">
          {isLoading ? "Guardando..." : "Guardar nueva contraseña"}
        </Button>
      </div>
    </form>
  );
}
