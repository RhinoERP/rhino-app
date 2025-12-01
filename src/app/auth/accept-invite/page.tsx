"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const AcceptInviteSchema = z
  .object({
    full_name: z
      .string()
      .min(3, "El nombre completo debe tener al menos 3 caracteres"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

type AcceptInviteFormValues = z.infer<typeof AcceptInviteSchema>;

function extractTokensFromHash(): {
  access_token: string | null;
  refresh_token: string | null;
} {
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  const params = new URLSearchParams(rawHash);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
  };
}

async function establishSession(
  supabase: ReturnType<typeof createClient>,
  access_token: string,
  refresh_token: string
): Promise<{ session: unknown; error: unknown } | null> {
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error || !data.session) {
    return { session: null, error };
  }

  return { session: data.session, error: null };
}

function cleanUrlHash(): void {
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search
  );
}

function prefillFormFromMetadata(
  session: { user: { user_metadata: { full_name?: string } } },
  setValue: (name: "full_name", value: string) => void
): void {
  const fullName =
    (session.user.user_metadata as { full_name: string })?.full_name ?? "";
  if (fullName) {
    setValue("full_name", fullName);
  }
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [isProcessingSession, setIsProcessingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
  } = useForm<AcceptInviteFormValues>({
    resolver: zodResolver(AcceptInviteSchema),
    defaultValues: {
      full_name: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const processSession = async () => {
      const supabase = createClient();

      try {
        const { access_token, refresh_token } = extractTokensFromHash();

        if (!(access_token && refresh_token)) {
          setSessionError(
            "El enlace de invitación es inválido o ha expirado. Por favor solicita una nueva invitación."
          );
          return;
        }

        const result = await establishSession(
          supabase,
          access_token,
          refresh_token
        );

        if (!result || result.error) {
          console.error(result?.error);
          setSessionError(
            "No pudimos verificar tu invitación. Intenta nuevamente más tarde."
          );
          return;
        }

        cleanUrlHash();
        prefillFormFromMetadata(
          result.session as Parameters<typeof prefillFormFromMetadata>[0],
          setValue
        );
      } catch (err) {
        console.error(err);
        setSessionError(
          "No pudimos verificar tu invitación. Intenta nuevamente más tarde."
        );
      } finally {
        setIsProcessingSession(false);
      }
    };

    processSession();
  }, [setValue]);

  const onSubmit = async (values: AcceptInviteFormValues) => {
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
        data: {
          full_name: values.full_name,
        },
      });

      if (error) {
        throw error;
      }
      router.push("/");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ocurrió un error al configurar tu contraseña. Por favor intenta nuevamente.";

      if (
        errorMessage.toLowerCase().includes("expired") ||
        errorMessage.toLowerCase().includes("invalid") ||
        errorMessage.toLowerCase().includes("auth session missing")
      ) {
        setError("root", {
          message:
            "El enlace de invitación es inválido o ha expirado. Por favor solicita una nueva invitación.",
        });
      } else {
        setError("root", {
          message: errorMessage,
        });
      }
    }
  };

  if (isProcessingSession) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground text-sm">
                Verificando tu invitación...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-500 text-sm">{sessionError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Configurar tu cuenta</CardTitle>
            <CardDescription>
              Define tu contraseña y completa tu nombre para empezar a usar la
              plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-6"
              onSubmit={handleSubmit(onSubmit)}
            >
              <div className="grid gap-2">
                <Label htmlFor="full_name">Nombre completo</Label>
                <Input
                  id="full_name"
                  placeholder="Tu nombre y apellido"
                  {...register("full_name")}
                />
                {errors.full_name && (
                  <p className="text-red-500 text-sm">
                    {errors.full_name.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  placeholder="Crea una contraseña segura"
                  type="password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-red-500 text-sm">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  placeholder="Repite tu contraseña"
                  type="password"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-sm">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {errors.root && (
                <p className="text-red-500 text-sm">{errors.root.message}</p>
              )}

              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Guardando..." : "Guardar y continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
