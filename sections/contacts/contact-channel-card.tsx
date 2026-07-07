import type { ContactChannel } from "@/types";
import { Card } from "@/components/ui/card";

function ContactChannelCard({ channel }: { channel: ContactChannel }) {
  const Icon = channel.icon;

  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-sm font-bold text-text">{channel.label}</div>
        <div className="text-sm text-text-secondary">{channel.value}</div>
        <div className="text-xs text-text-secondary/70">{channel.note}</div>
      </div>
    </>
  );

  if (!channel.href) {
    return <Card className="flex items-center gap-3 p-4">{content}</Card>;
  }

  return (
    <a
      href={channel.href}
      target={channel.href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-black/3"
    >
      {content}
    </a>
  );
}

export { ContactChannelCard };
