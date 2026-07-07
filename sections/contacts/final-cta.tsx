import Link from "next/link";
import { Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

function FinalCta() {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-3xl bg-text px-6 py-8 text-white sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">Готовы начать путь к масштабированию?</h2>
          <p className="mt-2 text-sm text-white/70">
            Оставьте заявку прямо сейчас — и наш менеджер свяжется с вами в ближайшее время.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="#contact-form" className={buttonVariants({ variant: "primary" })}>
            Начать работу <Send className="h-4 w-4" />
          </Link>
          <Link href="/ecosystem" className={buttonVariants({ variant: "dark" })}>
            Изучить экосистему
          </Link>
        </div>
      </div>
    </section>
  );
}

export { FinalCta };
