import { BuildingIcon } from "@phosphor-icons/react/ssr";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NoOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sin organización</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="default">
                <BuildingIcon
                  className="size-16 text-muted-foreground"
                  weight="duotone"
                />
              </EmptyMedia>
              <EmptyTitle>No tienes acceso a ninguna organización</EmptyTitle>
              <EmptyDescription className="mt-2">
                Actualmente no estás asociado a ninguna organización activa. Si
                esperabas tener acceso, contacta al administrador de tu
                organización o intenta cerrar sesión e iniciar sesión
                nuevamente.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <LogoutButton className="w-full" />
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}
