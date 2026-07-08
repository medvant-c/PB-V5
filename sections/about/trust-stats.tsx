import { CountUpStat } from "@/components/common/count-up-stat";
import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

// TODO: заменить плейсхолдер-цифры на реальную статистику, когда накопится
const stats = [
  { value: "100+", label: "реализованных проектов" },
  { value: "50+", label: "проверенных фабрик" },
  { value: "", label: "Поставки по всему миру" },
  { value: "", label: "Собственные процессы контроля качества" },
  { value: "", label: "Сопровождение на русском языке" },
];

function TrustStats() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <Eyebrow className="justify-center">Доверие</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Почему нам доверяют</h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <CountUpStat key={stat.value} value={stat.value} label={stat.label} />
          ))}
        </div>
      </div>
    </section>
  );
}

export { TrustStats };
