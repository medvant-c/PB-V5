import { Reveal } from "@/components/common/reveal";

function IntroText() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-extrabold text-text sm:text-3xl">
          Мы строим мост между идеями и производством
        </h2>
        <p className="mt-4 text-base text-text-secondary sm:text-lg">
          Panda Bridge — это международная компания, которая помогает предпринимателям
          запускать, развивать и масштабировать бизнес с Китаем. Мы объединяем производителей,
          логистику, аналитику, технологии и экспертов в единую экосистему, чтобы предпринимателю
          не приходилось искать десятки подрядчиков. От идеи продукта до его продажи на
          маркетплейсах — весь путь можно пройти вместе с Panda Bridge.
        </p>
      </Reveal>
    </section>
  );
}

export { IntroText };
