import { Reveal } from "@/components/common/reveal";

function BigQuote() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center bg-bg px-4 py-20 sm:px-6">
      <Reveal className="mx-auto max-w-4xl text-center">
        <p className="text-3xl leading-tight font-extrabold text-text sm:text-5xl lg:text-6xl">
          «Мы строим не поставки.
          <br />
          Мы строим бизнес.»
        </p>
      </Reveal>
    </section>
  );
}

export { BigQuote };
