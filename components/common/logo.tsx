import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center", className)}>
      <Image
        src="/images/logo.png"
        alt="Panda Bridge"
        width={1896}
        height={830}
        priority
        className="h-9 w-auto object-contain"
      />
    </Link>
  );
}

export { Logo };
