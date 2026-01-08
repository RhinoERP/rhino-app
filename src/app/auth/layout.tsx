import Image from "next/image";

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
      </div>
    </div>
  );
}
