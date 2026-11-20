import Image from "next/image";
import { cn } from "@/lib/utils";

/** La cara de RHINO: el rinoceronte de Rhinos en un círculo. */
export function RhinoAvatar({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-primary/20",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        alt=""
        className="object-contain"
        height={size}
        src="/images/favicon.svg"
        style={{ width: size * 0.78, height: "auto" }}
        width={size}
      />
    </span>
  );
}
