"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 200;

interface ServiceTooltipProps {
  service: string;
  result: string;
  sampleFile?: string;
  sampleFileName?: string;
}

function ServiceTooltip({ service, result, sampleFile, sampleFileName }: ServiceTooltipProps) {
  const [open, setOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function clearPendingTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function scheduleOpen() {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }

  // Closes on a short delay rather than instantly — moving the mouse from
  // the trigger down into the popover (e.g. to click the sample-file link)
  // briefly leaves both elements, and an instant close would strand the
  // click. The content's own hover handlers cancel this if the mouse lands
  // there in time.
  function scheduleClose() {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function closeNow() {
    clearPendingTimeout();
    setOpen(false);
  }

  const hoverContentHandlers = canHover
    ? { onMouseEnter: clearPendingTimeout, onMouseLeave: scheduleClose }
    : {};

  const interactionHandlers = canHover
    ? {
        onMouseEnter: scheduleOpen,
        onMouseLeave: scheduleClose,
        onFocus: scheduleOpen,
        onBlur: closeNow,
      }
    : {
        onClick: () => setOpen((current) => !current),
      };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded text-left text-sm text-text-secondary underline decoration-border decoration-dotted underline-offset-4 outline-none transition-colors hover:text-text focus-visible:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50"
          {...interactionHandlers}
        >
          {service}
          <Info className="h-3.5 w-3.5 shrink-0 text-text-secondary/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        {...hoverContentHandlers}
      >
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Что вы получаете</p>
        <p className="mt-1.5 text-sm text-text">{result}</p>
        {sampleFile && (
          <a
            href={sampleFile}
            download={sampleFileName ?? true}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            <Download className="h-3.5 w-3.5" />
            Скачать пример отчёта (PDF)
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { ServiceTooltip };
