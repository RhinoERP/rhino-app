"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptInvitationLoggedIn,
  acceptInvitationWithSignup,
} from "@/modules/organizations/actions/accept-invitation.action";

type InvitationLookupResponse = {
  active: boolean;
  organization_name: string;
  invited_email: string | null;
};

type AcceptInviteFormProps = {
  token: string | null;
  user: User | null;
  inviteInfo: InvitationLookupResponse | null;
  initialErrorMessage: string | null;
};

function MissingTokenMessage() {
  return (
    <p className="text-muted-foreground text-sm">
      No se encontró un token de invitación en la URL.
    </p>
  );
}

function InvalidInvitationMessage() {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">Invitación inválida o expirada</p>
      <p className="text-muted-foreground text-sm">
        Pedile a tu administrador que te envíe una nueva invitación.
      </p>
    </div>
  );
}

type LoggedInFlowProps = {
  token: string;
  user: User | null;
  inviteInfo: InvitationLookupResponse;
  initialErrorMessage: string | null;
};

function LoggedInFlow({
  token,
  user,
  inviteInfo,
  initialErrorMessage,
}: LoggedInFlowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage
  );

  const handleAcceptLoggedIn = () => {
    startTransition(async () => {
      setErrorMessage(null);
      const result = await acceptInvitationLoggedIn(token);
      if (!(result.ok && result.data)) {
        setErrorMessage(result.error ?? "No se pudo aceptar la invitación.");
        return;
      }

      const slug = (result.data as { slug?: string } | null | undefined)?.slug;
      if (slug) {
        router.replace(`/org/${slug}`);
      } else {
        router.replace("/org");
      }
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Te invitaron a unirte a{" "}
        <span className="font-semibold">{inviteInfo.organization_name}</span>.
      </p>
      <div className="grid gap-2">
        <Label>Email invitado</Label>
        <Input readOnly type="email" value={inviteInfo.invited_email ?? ""} />
      </div>
      {user?.email &&
        inviteInfo.invited_email &&
        user.email !== inviteInfo.invited_email && (
          <p className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-600">
            Estás logueado como <strong>{user.email}</strong>, pero la
            invitación es para <strong>{inviteInfo.invited_email}</strong>.
          </p>
        )}
      {errorMessage && <p className="text-red-600 text-sm">{errorMessage}</p>}
      <Button
        className="w-full"
        disabled={isPending}
        onClick={handleAcceptLoggedIn}
        type="button"
      >
        {isPending ? "Procesando…" : "Aceptar invitación"}
      </Button>
    </div>
  );
}

type SignupFlowProps = {
  token: string;
  inviteInfo: InvitationLookupResponse;
  initialErrorMessage: string | null;
};

function SignupFlow({
  token,
  inviteInfo,
  initialErrorMessage,
}: SignupFlowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage
  );
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const handleSignupSubmit = (event: FormEvent) => {
    event.preventDefault();

    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    startTransition(async () => {
      const result = await acceptInvitationWithSignup({
        token,
        fullName,
        password,
        passwordConfirm,
      });

      if (!result.ok) {
        setErrorMessage(result.error ?? "No se pudo completar el registro.");
        return;
      }

      router.replace("/auth/login");
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSignupSubmit}>
      <p className="text-muted-foreground text-sm">
        Te invitaron a unirte a{" "}
        <span className="font-semibold">{inviteInfo.organization_name}</span>.
      </p>

      <div className="grid gap-2">
        <Label>Email invitado</Label>
        <Input
          disabled
          readOnly
          type="email"
          value={inviteInfo.invited_email ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          id="fullName"
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tu nombre y apellido"
          required
          value={fullName}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          minLength={8}
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          value={password}
        />
        <p className="text-muted-foreground text-xs">Mínimo 8 caracteres.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="passwordConfirm">Confirmar contraseña</Label>
        <Input
          id="passwordConfirm"
          minLength={8}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
          type="password"
          value={passwordConfirm}
        />
      </div>

      {errorMessage && <p className="text-red-600 text-sm">{errorMessage}</p>}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Procesando…" : "Crear cuenta y aceptar invitación"}
      </Button>
    </form>
  );
}

export function AcceptInviteForm({
  token,
  user,
  inviteInfo,
  initialErrorMessage,
}: AcceptInviteFormProps) {
  const isInvalidInvitation = !!inviteInfo && inviteInfo.active === false;
  const isValidInvitation = !!inviteInfo && inviteInfo.active === true;

  const isLoggedInFlow = isValidInvitation && !!user;
  const isSignupFlow = isValidInvitation && !user;

  if (!token) {
    return <MissingTokenMessage />;
  }

  if (isInvalidInvitation || !inviteInfo) {
    return <InvalidInvitationMessage />;
  }

  if (isLoggedInFlow) {
    return (
      <LoggedInFlow
        initialErrorMessage={initialErrorMessage}
        inviteInfo={inviteInfo}
        token={token}
        user={user}
      />
    );
  }

  if (isSignupFlow) {
    return (
      <SignupFlow
        initialErrorMessage={initialErrorMessage}
        inviteInfo={inviteInfo}
        token={token}
      />
    );
  }

  return <InvalidInvitationMessage />;
}
