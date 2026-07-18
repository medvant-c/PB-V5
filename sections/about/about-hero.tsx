import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-transparent px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold leading-tight text-text sm:text-5xl">
          <span className="block">Постройте бизнес с Китаем.</span>
          <span className="mt-2 block bg-gradient-to-r from-primary to-secondary bg-clip-text text-4xl text-transparent sm:text-6xl">
            Мы проведём вас через каждый шаг.
          </span>
        </h1>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/contacts" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Начать сотрудничество
          </Link>
          <Link
            href="#ecosystem-diagram"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Посмотреть экосистему <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export { AboutHero };
