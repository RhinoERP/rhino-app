function formatDate(dateString: string | null): string {
  if (!dateString) {
    return "-";
  }
  const date = new Date(dateString);
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";

type MiembrosPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function MiembrosPage({ params }: MiembrosPageProps) {
  const { orgSlug } = await params;
  const members = await getOrganizationMembersBySlug(orgSlug);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Miembros</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlassIcon
            className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
            weight="duotone"
          />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, email o rol..."
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline">Invitar</Button>
          <Button variant="outline">Administrar Roles</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={4}
                >
                  No hay miembros en esta organización
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {member.user?.name || "Sin nombre"}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {member.user?.email || "Sin email"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {member.is_owner
                        ? "Dueño"
                        : member.role?.name || "Sin rol"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(member.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">Activo</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {members.length > 0 && (
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span>0 de {members.length} fila seleccionadas.</span>
          <div className="flex items-center gap-2">
            <span>Página 1 de 1</span>
          </div>
        </div>
      )}
    </div>
  );
}
