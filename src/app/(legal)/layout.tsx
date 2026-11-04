import Image from "next/image";
import Link from "next/link";
import {
  DATA_DELETION_PATH,
  PRIVACY_EMAIL,
  PRIVACY_EMAIL_HREF,
  PRIVACY_PATH,
} from "@/lib/legal";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-border border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link className="flex items-center gap-3" href="/auth/login">
            <Image alt="" height={36} src="/images/logo_solo.svg" width={36} />
            <span className="font-semibold text-lg">RhinosApp</span>
          </Link>
          <nav
            aria-label="Información de privacidad"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
          >
            <Link
              className="underline-offset-4 hover:underline"
              href={PRIVACY_PATH}
            >
              Privacidad
            </Link>
            <Link
              className="underline-offset-4 hover:underline"
              href={DATA_DELETION_PATH}
            >
              Eliminación de datos
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <article className="space-y-9 text-base leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h1]:font-semibold [&_h1]:text-3xl [&_h1]:leading-tight [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:font-semibold [&_h2]:text-xl [&_li]:pl-1 [&_ol+p]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-6 [&_p+ol]:mt-4 [&_p+p]:mt-4 [&_p+ul]:mt-4 [&_ul+p]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </article>
      </main>
      <footer className="border-border border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-6 py-6 text-muted-foreground text-sm">
          <p>RhinosApp SRL · República Argentina</p>
          <a
            className="break-all underline-offset-4 hover:underline"
            href={PRIVACY_EMAIL_HREF}
          >
            {PRIVACY_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}
