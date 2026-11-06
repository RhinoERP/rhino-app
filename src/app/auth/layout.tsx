import Image from "next/image";
import Link from "next/link";
import { DATA_DELETION_PATH, PRIVACY_PATH } from "@/lib/legal";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-2 flex flex-col items-center gap-3">
          <Image
            alt="Rhinos"
            className="h-80 w-auto"
            height={320}
            src="/images/logo.svg"
            width={320}
          />
        </div>
        {children}
        <nav
          aria-label="Información legal"
          className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-muted-foreground text-xs"
        >
          <Link
            className="underline-offset-4 hover:underline"
            href={PRIVACY_PATH}
          >
            Política de privacidad
          </Link>
          <Link
            className="underline-offset-4 hover:underline"
            href={DATA_DELETION_PATH}
          >
            Eliminación de datos
          </Link>
        </nav>
      </div>
    </div>
  );
}
