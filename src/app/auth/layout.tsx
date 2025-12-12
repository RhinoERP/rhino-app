import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            alt="Rhinos"
            className="h-8 w-auto"
            height={32}
            src="/images/favicon.svg"
            width={32}
          />
          <span className="font-bold font-space-grotesk text-2xl">Rhinos</span>
        </div>
        {children}
      </div>
    </div>
  );
}
