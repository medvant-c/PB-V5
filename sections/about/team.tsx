import { Reveal } from "@/components/common/reveal";
import { Eyebrow } from "@/components/ui/eyebrow";

function Team() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow className="justify-center">Команда</Eyebrow>
        <h2 className="mt-3 text-3xl font-extrabold text-text sm:text-4xl">Команда</h2>

        {/* No team photo yet — a placeholder box invites more scrutiny than
            it deflects (an "about us" section is exactly where visitors are
            checking whether the company is real). Add a real <Image> here
            once a photo exists, don't restore the placeholder in the meantime. */}

        <p className="mx-auto mt-6 max-w-xl text-base text-text-secondary">
          Panda Bridge — это команда специалистов, объединённых одной целью: сделать
          международную торговлю простой, понятной и безопасной.
        </p>
      </Reveal>
    </section>
  );
}

export { Team };
