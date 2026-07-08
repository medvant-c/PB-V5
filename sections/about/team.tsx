import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

function Team() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">Команда</Eyebrow>
        <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Команда</h2>

        {/* TODO: заменить на реальное фото команды, когда пришлют */}
        <div className="mx-auto mt-8 flex aspect-video w-full max-w-2xl items-center justify-center rounded-2xl border border-border bg-bg">
          <span className="text-sm font-medium text-text-secondary">Фото команды</span>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-base text-text-secondary">
          Panda Bridge — это команда специалистов, объединённых одной целью: сделать
          международную торговлю простой, понятной и безопасной.
        </p>
      </Reveal>
    </section>
  );
}

export { Team };
