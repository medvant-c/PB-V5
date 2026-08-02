"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CONTAINER_TYPES, type ContainerType } from "@/lib/container-types";
import { cn } from "@/lib/utils";

interface SelectedQuote {
  id: string;
  displayId: number;
  productName: string;
  totalVolumeM3: string;
  totalWeightKg: string;
}

interface ContainerShipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  quotes: SelectedQuote[];
  // /api/managers succeeding (see ManagerClientsTab) doubles as "am I the
  // owner" — reused here rather than threading session.role down as a new
  // prop, same convention already established for this component tree.
  isOwner: boolean;
  onDone: () => void;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("ru-RU", { maximumFractionDigits: 3 }) : "—";
}

// A completely separate pricing view from each quote's own cargo delivery —
// batches already-priced quotes into one rail container shipment and splits
// its own flat delivery price back across them proportionally by volume.
// Never touches the underlying Quote rows. See ContainerShipment in
// prisma/schema.prisma, PB-V5 chat 2026-08-02.
function ContainerShipmentDialog({ open, onOpenChange, clientId, quotes, isOwner, onDone }: ContainerShipmentDialogProps) {
  const [containerType, setContainerType] = useState<ContainerType | "">("");
  const [totalDeliveryUsd, setTotalDeliveryUsd] = useState("");
  const [totalDeliveryCostUsd, setTotalDeliveryCostUsd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVolumeM3Sum = quotes.reduce((sum, q) => sum + Number(q.totalVolumeM3), 0);
  const totalWeightKgSum = quotes.reduce((sum, q) => sum + Number(q.totalWeightKg), 0);

  function reset() {
    setContainerType("");
    setTotalDeliveryUsd("");
    setTotalDeliveryCostUsd("");
    setError(null);
  }

  async function handleSubmit() {
    const deliveryUsd = Number(totalDeliveryUsd);
    if (!containerType) {
      setError("Выберите тип контейнера.");
      return;
    }
    if (!Number.isFinite(deliveryUsd) || deliveryUsd <= 0) {
      setError("Укажите цену доставки контейнера в $.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch("/api/manager-container-shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          containerType,
          totalDeliveryUsd: deliveryUsd,
          totalDeliveryCostUsd: isOwner && totalDeliveryCostUsd.trim() ? Number(totalDeliveryCostUsd) : undefined,
          quoteIds: quotes.map((q) => q.id),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error ?? "Не удалось сформировать контейнер.");
        return;
      }

      const shipmentId = createData.containerShipment.id as string;
      const pdfRes = await fetch(`/api/manager-container-shipments/${shipmentId}/pdf`);
      if (!pdfRes.ok) {
        const pdfData = await pdfRes.json();
        setError(pdfData.error ?? "Контейнер сформирован, но не удалось скачать PDF.");
        return;
      }
      const disposition = pdfRes.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Контейнер ЖД.pdf";
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      reset();
      onOpenChange(false);
      onDone();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Сформировать контейнер ЖД доставки</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Просчёты в контейнере ({quotes.length})</Label>
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border bg-bg p-2 text-xs">
              {quotes.map((q) => (
                <li key={q.id} className="flex justify-between gap-2 text-text-secondary">
                  <span className="truncate">
                    №{q.displayId} · {q.productName}
                  </span>
                  <span className="shrink-0">{fmt(Number(q.totalVolumeM3))} м³</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-secondary">
              Общий объём: <span className="font-semibold text-text">{fmt(totalVolumeM3Sum)} м³</span> · общий вес:{" "}
              <span className="font-semibold text-text">{fmt(totalWeightKgSum)} кг</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Тип контейнера</Label>
            <div className="flex gap-2">
              {CONTAINER_TYPES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setContainerType(c.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors",
                    containerType === c.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-text-secondary hover:text-text",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Цена доставки контейнера, $</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={totalDeliveryUsd}
              onChange={(e) => setTotalDeliveryUsd(e.target.value)}
            />
          </div>

          {isOwner && (
            <div className="space-y-1.5">
              <Label>Себестоимость доставки контейнера, $ (не видно клиенту)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={totalDeliveryCostUsd}
                onChange={(e) => setTotalDeliveryCostUsd(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          <Button type="button" onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Рассчитать и скачать PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ContainerShipmentDialog };
