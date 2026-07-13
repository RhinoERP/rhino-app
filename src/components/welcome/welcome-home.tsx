import Image from "next/image";

type WelcomeHomeProps = {
  userName: string;
};

export function WelcomeHome({ userName }: WelcomeHomeProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <Image
        alt="Rhino ERP"
        className="h-20 w-20"
        height={80}
        src="/images/logo.svg"
        width={80}
      />
      <div className="space-y-1 text-center">
        <h1 className="font-heading font-semibold text-2xl">
          Bienvenido, {userName}
        </h1>
        <p className="text-muted-foreground text-sm">
          Seleccioná una sección del menú lateral para comenzar
        </p>
      </div>
    </div>
  );
}
