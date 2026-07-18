const logos = ["Wildberries", "Ozon", "AliExpress", "Яндекс Маркет", "Joom", "СБЕР МЕГА МАРКЕТ", "KazanExpress", "lamoda"];

// These are marketplaces Panda Bridge sells through, not clients or partners
// endorsing the company — the label should say that plainly rather than
// imply endorsement it doesn't have.
function TrustLogos({ title = "Продаём на маркетплейсах" }: { title?: string }) {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 border-t border-border pt-8 sm:flex-row">
        <span className="shrink-0 text-sm font-semibold text-text-secondary">{title}</span>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:justify-start">
          {logos.map((logo) => (
            <span key={logo} className="text-sm font-bold tracking-tight text-text-secondary/70">
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export { TrustLogos };
