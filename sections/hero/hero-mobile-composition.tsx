function MobileSocialProof() {
  const avatars = [{ initials: "ИП" }, { initials: "АС" }, { initials: "ДВ" }];

  return (
    <div className="mx-auto mt-6 flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 min-[1400px]:hidden">
      <div className="flex shrink-0 -space-x-3">
        {avatars.map((avatar) => (
          <span
            key={avatar.initials}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-primary/20 to-secondary/20 text-xs font-bold text-text-secondary"
          >
            {avatar.initials}
          </span>
        ))}
      </div>
      <p className="text-sm text-text-secondary">
        <span className="font-bold text-text">Более 500+ компаний</span> уже масштабируют бизнес с нами
      </p>
    </div>
  );
}

export { MobileSocialProof };
