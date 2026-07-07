import { ArrowRight } from "lucide-react";
import { steps } from "@/data/steps";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";

function HowItWorks() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow className="justify-center">Процесс</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Как мы работаем</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="flex items-center gap-4">
                <Card className="relative flex flex-1 flex-col gap-3 p-5">
                  <span className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-text text-xs font-bold text-white">
                    {step.number}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-base font-bold text-text">{step.title}</div>
                    <p className="mt-1 text-sm text-text-secondary">{step.description}</p>
                  </div>
                </Card>
                {index < steps.length - 1 && (
                  <ArrowRight className="hidden h-5 w-5 shrink-0 text-border lg:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { HowItWorks };
