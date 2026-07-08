import { Reveal } from "@/components/common/reveal";

function Mission() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-extrabold text-text sm:text-3xl">Наша миссия</h2>
        <p className="mt-5 text-lg leading-relaxed text-text-secondary sm:text-xl">
          Сделать международный бизнес доступным каждому предпринимателю. Мы верим, что хороший
          продукт способен изменить жизнь человека, а наша задача — убрать все сложности между
          идеей и производством.
        </p>
      </Reveal>
    </section>
  );
}

export { Mission };
