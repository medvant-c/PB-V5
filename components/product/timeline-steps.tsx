interface TimelineStep {
  title: string;
  description: string;
}

function TimelineSteps({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-6 border-l border-border pl-8 sm:pl-10">
      {steps.map((step, index) => (
        <li key={step.title} className="relative">
          <span className="absolute top-0 -left-[2.55rem] flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white sm:-left-[3.05rem]">
            {index + 1}
          </span>
          <div className="text-sm font-bold text-text">{step.title}</div>
          <p className="mt-1 text-sm text-text-secondary">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

export { TimelineSteps };
