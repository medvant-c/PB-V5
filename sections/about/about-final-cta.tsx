import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

function AboutFinalCta() {
  return (
    <section className="bg-gradient-to-r from-primary to-secondary px-4 py-16 text-center sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Готовы начать?</h2>
        <p className="mt-3 text-base text-white/80">
          Превратите идею в реальный бизнес вместе с Panda Bridge.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/contacts" className={buttonVariants({ variant: "dark", size: "lg" })}>
            Обсудить проект <MessageSquare className="h-4 w-4" />
          </Link>
          <Link
            href="/contacts"
            className={buttonVariants({ variant: "outline", size: "lg", className: "border-white/40 bg-transparent text-white hover:bg-white/10" })}
          >
            Получить консультацию <Send className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export { AboutFinalCta };
