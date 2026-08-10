"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  FileSpreadsheet,
  FileStack,
  FileText,
  ImageOff,
  Inbox,
  Info,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Package,
  Pencil,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/desk/empty-state";
import { QuoteDialog } from "@/components/manager/quote-dialog";
import { PhotoLightbox } from "@/components/manager/photo-lightbox";
import { ClientFilesPanel } from "@/components/manager/client-files-panel";
import { CreatePaymentDialog } from "@/components/manager/create-payment-dialog";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_BADGE_CLASSES,
  QUOTE_STATUS_DOT_COLOR,
  STALE_IN_PROGRESS_MS,
  type QuoteStatus,
} from "@/lib/quote-statuses";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_BADGE_CLASSES,
  CLIENT_STATUS_DOT_COLOR,
  type ClientStatus,
} from "@/lib/client-statuses";
import { cn } from "@/lib/utils";
import { formatPhoneMask } from "@/lib/phone";
import { destinationCountryLabel, destinationCountryColor } from "@/lib/destination-countries";

const BULK_QUOTE_TYPES = [
  { value: "standard", label: "Standart" },
  { value: "expert", label: "Expert" },
  { value: "pro", label: "Pro" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  website: "Сайт",
  referral: "Рекомендация",
  other: "Другое",
};

interface ClientRecord {
  id: string;
  displayId: number;
  name: string;
  company: string | null;
  messenger: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: ClientStatus;
  createdByManagerId: string | null;
  createdByManager: { name: string } | null;
  selfSourcedClaimed: boolean;
  selfSourcedClaimedAt: string | null;
  selfSourcedConfirmed: boolean;
  contactsHiddenFromManager: boolean;
  contactsHidden: boolean;
  // Owner-only — absent entirely for a senior/plain-manager session (see
  // GET /api/manager-clients), not just null. undefined here means "I'm
  // not the owner, I can't see this," while null means "I am, and no
  // override is set."
  vladShareRatePercentOverride?: string | null;
  archivedAt: string | null;
  createdAt: string;
}

interface QuoteRecord {
  id: string;
  displayId: number;
  destinationCountry: string;
  productName: string;
  quoteType: string;
  status: QuoteStatus;
  statusChangedAt: string;
  totalRub: string;
  totalPriceRub: string;
  chinaDeliveryRub: string;
  searchServiceFeeRub: string;
  searchFeeWaived: boolean;
  isCustomProduction: boolean;
  customProductionFeeRub: string;
  buyoutCommissionRub: string;
  cargoDeliveryRub: string;
  cargoDiscountUsd: string;
  deliveryPricingMode: string;
  densityKgM3: string;
  createdAt: string;
  updatedAt: string;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
  firstPhotoId: string | null;
  clientComment: string;
  managerComment: string;
  totalPriceCny: string;
  cnyRateUsed: string;
  actualBuyoutCny: string | null;
  actualBuyoutRateUsed: string | null;
  actualClientPaymentRub: string | null;
  actualClientPaymentRateUsed: string | null;
  buyoutFactConfirmed: boolean;
  buyoutConfirmedAt: string | null;
  buyoutPremiumRatePercent: string | null;
  cargoRateUsd: string;
  usdRateUsed: string;
  totalWeightKg: string;
  totalVolumeM3: string;
  actualTotalWeightKg: string | null;
  actualTotalVolumeM3: string | null;
  estimatedTotalWeightKg: string | null;
  estimatedTotalVolumeM3: string | null;
  estimatedTotalRub: string | null;
  cargoActualizedAt: string | null;
  cargoBonusRatePercent: string | null;
  packagingCostRub: string;
  insuranceCostRub: string;
  mskExpensesRub: string;
  actualCargoCostRateUsd: string | null;
  actualCargoCostBasis: "density" | "volume" | null;
  paymentAllocations: { amountRub: string }[];
}

// Below this density, cargo is always priced "по объёму" regardless of the
// manager's chosen mode — see LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 in
// lib/quote-engine.ts. Kept in sync manually since this is a display-only
// label, not a pricing decision.
const LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 = 100;

// Mirrors POST_BUYOUT_STATUSES in app/api/manager-quotes/[id]/status/
// route.ts — only past this point does "факт по выкупу" make sense to ask
// for (the manager hasn't actually bought anything before then).
const POST_BUYOUT_STATUSES = ["in_transit_to_warehouse", "delivered_to_warehouse", "sent_to_client", "handed_to_client"];

// Mirrors CARGO_ACTUALIZATION_REQUIRED_STATUSES in the same status route —
// only from here on does actualizing cargo (or re-correcting it) make sense.
const CARGO_RELEVANT_STATUSES = ["delivered_to_warehouse", "sent_to_client", "handed_to_client"];

const BUYOUT_CURRENCY_LABEL: Record<"rub" | "usd" | "usdt" | "cny", string> = { rub: "₽", usd: "$", usdt: "USDT", cny: "¥" };

function fmtRub(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function fmtUsd(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Everything that makes up totalRub, for the hover breakdown — attached
// services aren't a field on Quote itself (they live in a separate table),
// so that line is the residual after every other known component is
// subtracted, not a separately-fetched value.
function quoteBreakdown(quote: QuoteRecord) {
  const totalPriceRub = Number(quote.totalPriceRub);
  const chinaDeliveryRub = Number(quote.chinaDeliveryRub);
  const searchServiceFeeRub = Number(quote.searchServiceFeeRub);
  const customProductionFeeRub = Number(quote.customProductionFeeRub);
  const buyoutCommissionRub = Number(quote.buyoutCommissionRub);
  const cargoDeliveryRub = Number(quote.cargoDeliveryRub);
  const totalRub = Number(quote.totalRub);
  // Real extra shipment costs (see actualize-cargo/route.ts) — carved out
  // by name, same as every other known line, so they don't silently get
  // mistaken for "Доп. услуги" below (that's a derived residual, not a
  // real field).
  const extraShipmentCostsRub = Number(quote.packagingCostRub) + Number(quote.insuranceCostRub) + Number(quote.mskExpensesRub);
  const cargoBasis =
    quote.deliveryPricingMode === "density" && Number(quote.densityKgM3) >= LOW_DENSITY_VOLUME_THRESHOLD_KG_M3
      ? "по плотности"
      : "по объёму";
  const knownSum =
    totalPriceRub +
    chinaDeliveryRub +
    searchServiceFeeRub +
    customProductionFeeRub +
    buyoutCommissionRub +
    cargoDeliveryRub +
    extraShipmentCostsRub;
  const attachedServicesRub = Math.max(0, totalRub - knownSum);

  return {
    totalPriceRub,
    chinaDeliveryRub,
    searchServiceFeeRub,
    customProductionFeeRub,
    buyoutCommissionRub,
    cargoDeliveryRub,
    cargoBasis,
    cargoDiscountUsd: Number(quote.cargoDiscountUsd),
    extraShipmentCostsRub,
    attachedServicesRub,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function isStale(quote: QuoteRecord): boolean {
  if (quote.status !== "in_progress") return false;
  return Date.now() - new Date(quote.statusChangedAt).getTime() > STALE_IN_PROGRESS_MS;
}

interface DraftRequestFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface DraftRequestRecord {
  id: string;
  displayId: number;
  note: string;
  quantity: number | null;
  done: boolean;
  createdAt: string;
  // Null exactly when the client submitted this themselves from /account
  // (see schema comment on QuoteDraftRequest.managerId) — the discriminator
  // the "создано клиентом" badge below keys off of.
  manager: { id: string; name: string } | null;
  files: DraftRequestFile[];
}

// "Черновики" — lightweight reminders ("клиент попросил X, есть только фото
// референса") deliberately styled in warning/amber, never white/bg-surface
// like a real Quote card, so it can never be mistaken for a quote actually
// in progress — see PB-V5 chat 2026-07-28.
function ClientDraftRequests({
  clientId,
  refreshKey,
  onChange,
}: {
  clientId: string;
  refreshKey: number;
  onChange: () => void;
}) {
  // Collapsed by default — same "archive pushing the rest of the card
  // down the page" reasoning as ClientFilesPanel's own `open` state, with
  // the same visible count-on-the-closed-header pattern. See PB-V5 chat
  // 2026-08-01.
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`/api/manager-quote-drafts?clientId=${clientId}`)
      .then((res) => res.json())
      .then((data) => setDrafts(data.drafts ?? []))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating || !note.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/manager-quote-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось создать черновик.");
        return;
      }
      setNote("");
      await load();
      onChange();
    } finally {
      setCreating(false);
    }
  }

  async function handleMarkDone(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/manager-quote-drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (res.ok) {
        await load();
        onChange();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить черновик?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/manager-quote-drafts/${id}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        onChange();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Черновики — заявки на просчёт (ещё не в работе){!loading && drafts.length > 0 ? ` (${drafts.length})` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-warning transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-warning/20 p-3 pt-2.5">
      {!loading && drafts.length > 0 && (
        <ul className="space-y-1.5">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-start justify-between gap-2 rounded-lg border border-warning/20 bg-surface p-2.5 text-sm">
              <div className="min-w-0">
                <span className="mr-1.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                  к выполнению
                </span>
                {!draft.manager && (
                  <span className="mr-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    создано клиентом
                  </span>
                )}
                <span className="text-text">{draft.note}</span>
                {draft.quantity != null && <span className="ml-1.5 text-text-secondary">· {draft.quantity} шт</span>}
                <div className="mt-0.5 text-xs text-text-secondary">
                  {new Date(draft.createdAt).toLocaleDateString("ru-RU")}
                  {draft.manager ? ` · ${draft.manager.name}` : ""}
                </div>
                {draft.files.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {draft.files.map((file) => (
                      <a
                        key={file.id}
                        href={`/api/quote-draft-files/${file.id}`}
                        className="flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        <Download className="h-3 w-3" /> {file.originalName}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMarkDone(draft.id)}
                  disabled={busyId === draft.id}
                  title="Просчёт создан — убрать из черновиков"
                  className="text-text-secondary transition-colors hover:text-success disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(draft.id)}
                  disabled={busyId === draft.id}
                  className="text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="Что просит клиент? (например: хочет подвесы для качелей, скинул фото)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8 flex-1 text-sm"
        />
        <Button type="submit" size="sm" disabled={creating || !note.trim()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
        </Button>
      </form>
      {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ClientQuotes({
  clientId,
  refreshKey,
  onEdit,
  onChanged,
  allManagers,
  teamManagers,
  canConfirmBuyout,
  paymentAccounts,
  clientSelfSourcedConfirmed,
  clientCreatedByManagerId,
}: {
  // Absent = "Все просчёты" mode (see ManagerAllQuotesTab): every quote
  // visible to this session, across every client, instead of one client's
  // own history. The export/reassign/status/etc. machinery below is
  // exactly the same either way — only the fetch URL, the export
  // endpoints, and whether each row shows its own client name change.
  // See PB-V5 chat 2026-08-01.
  clientId?: string;
  refreshKey: number;
  onEdit: (quoteId: string, client: { id: string; name: string }) => void;
  onChanged: () => void;
  allManagers: { id: string; name: string }[] | null;
  teamManagers: { id: string; name: string }[] | null;
  canConfirmBuyout: boolean;
  paymentAccounts: { id: string; name: string }[];
  clientSelfSourcedConfirmed?: boolean;
  clientCreatedByManagerId?: string | null;
}) {
  const isGlobal = !clientId;
  // Клик/тап по фото в строке просчёта — открывает оригинал (см.
  // components/manager/photo-lightbox.tsx). Раньше увеличенное превью
  // показывалось только по :hover, что на тач-экране вообще никогда не
  // срабатывает — тап теперь работает одинаково на десктопе и мобильном.
  // См. PB-V5 chat 2026-08-08.
  const [zoomedPhotoId, setZoomedPhotoId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingInvoice, setExportingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [exportingPdfBundle, setExportingPdfBundle] = useState(false);
  const [pdfBundleError, setPdfBundleError] = useState<string | null>(null);
  const [buyoutInvoiceBusyId, setBuyoutInvoiceBusyId] = useState<string | null>(null);
  const [buyoutInvoiceError, setBuyoutInvoiceError] = useState<string | null>(null);
  // Bulk "Счёт на выкуп" — one PDF, one page per selected quote (see
  // app/api/manager-quotes/buyout-invoice-pdf-bundle). Separate busy/error
  // state from the per-row buyoutInvoiceBusyId above since this acts on
  // the whole selection at once, not one quote.
  const [bulkBuyoutInvoiceCurrency, setBulkBuyoutInvoiceCurrency] = useState<"rub" | "usd" | "usdt" | "cny" | null>(null);
  const [bulkBuyoutInvoiceError, setBulkBuyoutInvoiceError] = useState<string | null>(null);
  const [createPaymentDialogOpen, setCreatePaymentDialogOpen] = useState(false);
  // The toolbar below used to be seven-plus separate pill buttons in a row
  // (unreadable once the client card moved into the narrower master-detail
  // right pane) — collapsed into two menus: "Экспорт" (read-only exports)
  // and "Действия" (everything that changes data). See PB-V5 chat
  // 2026-08-02.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  // "Пересчитать тарифы" needs its own confirmation dialog, same as before
  // — just controlled now (opened from inside the Действия menu) instead
  // of an AlertDialogTrigger wrapping the button directly.
  const [recalculateConfirmOpen, setRecalculateConfirmOpen] = useState(false);
  // Owner-only bulk cargo discount, computed off cargo MARGIN, not the full
  // cargo charge — see app/api/manager-quotes/bulk-cargo-discount/route.ts.
  const [cargoMarginDiscountPercent, setCargoMarginDiscountPercent] = useState("");
  const [bulkCargoDiscountBusy, setBulkCargoDiscountBusy] = useState(false);
  const [bulkCargoDiscountMessage, setBulkCargoDiscountMessage] = useState<string | null>(null);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  // Per-row "Счёт на выкуп" currency-picker popover — see
  // app/api/manager-quotes/[id]/buyout-invoice/route.ts.
  const [invoiceMenuQuoteId, setInvoiceMenuQuoteId] = useState<string | null>(null);
  // Rarer/riskier per-quote actions (передать менеджеру, ставка премии за
  // карго, пересчитать по тарифам, удалить) collapsed into one "⋯ Действия"
  // menu instead of sitting as bare icons in the row — see PB-V5 UX audit
  // 2026-08-05. The always-frequent ones (PDF/счёт/статус/комментарии/
  // факт/карго/редактировать) stay as direct icon buttons.
  const [rowActionsMenuId, setRowActionsMenuId] = useState<string | null>(null);
  // Менеджер-аутсорсинг sees "№1_1" style local labels instead of the real
  // displayId here — null (not fetched, or applicable:false for every
  // other role) means "show the real displayId", the original behaviour.
  // See app/api/manager-outsource-numbering and ManagerRole.outsource_manager
  // in prisma/schema.prisma.
  const [outsourceQuoteLabels, setOutsourceQuoteLabels] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    fetch("/api/manager-outsource-numbering")
      .then((res) => res.json())
      .then((data) => setOutsourceQuoteLabels(data.applicable ? data.quoteLabels : null))
      .catch(() => setOutsourceQuoteLabels(null));
  }, []);
  const [expandedBuyoutId, setExpandedBuyoutId] = useState<string | null>(null);
  const [buyoutDrafts, setBuyoutDrafts] = useState<
    Record<string, { cny: string; rate: string; paymentRub: string; paymentRate: string; accountId: string }>
  >({});
  const [savingBuyoutId, setSavingBuyoutId] = useState<string | null>(null);

  // Owner-only manual override of one quote's cargo bonus % — see
  // app/api/manager-quotes/[id]/cargo-bonus-rate/route.ts.
  const [expandedCargoBonusId, setExpandedCargoBonusId] = useState<string | null>(null);
  const [cargoBonusDrafts, setCargoBonusDrafts] = useState<Record<string, string>>({});
  const [savingCargoBonusId, setSavingCargoBonusId] = useState<string | null>(null);
  const [cargoBonusError, setCargoBonusError] = useState<string | null>(null);

  // Cargo actualization modal — opened either because a status change got
  // blocked (pendingStatus set, so we can retry it right after saving) or
  // because the manager wants to correct already-entered data by hand
  // (pendingStatus null).
  const [cargoModalQuoteId, setCargoModalQuoteId] = useState<string | null>(null);
  const [cargoModalPendingStatus, setCargoModalPendingStatus] = useState<string | null>(null);
  const [cargoModalDraft, setCargoModalDraft] = useState<{
    weight: string;
    volume: string;
    packaging: string;
    insurance: string;
    msk: string;
    costRate: string;
    costBasis: "density" | "volume";
  }>({
    weight: "",
    volume: "",
    packaging: "",
    insurance: "",
    msk: "",
    costRate: "",
    costBasis: "density",
  });
  const [cargoModalBusy, setCargoModalBusy] = useState(false);
  const [cargoModalError, setCargoModalError] = useState<string | null>(null);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"recalculate" | "duplicate" | "status" | "quoteType" | "reassign" | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Filters the visible list only — "Выбрать все" and every bulk action
  // below operate on whatever's currently visible, not the client's full
  // quote history, matching what the manager is actually looking at.
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filteredQuotes = statusFilter === "all" ? quotes : quotes.filter((q) => q.status === statusFilter);

  // Search/sort — only surfaced in "Все просчёты" mode (see isGlobal
  // above); a single client's own list is short enough that the plain
  // status filter above has always been enough. See PB-V5 chat 2026-08-01.
  const [sortBy, setSortBy] = useState<"date" | "amount" | "client" | "manager">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterNumber, setFilterNumber] = useState("");
  const [filterClientName, setFilterClientName] = useState("");
  const [filterProductName, setFilterProductName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const searchedQuotes = !isGlobal
    ? filteredQuotes
    : filteredQuotes.filter((q) => {
        if (filterNumber.trim() && !String(q.displayId).includes(filterNumber.trim())) return false;
        if (filterClientName.trim()) {
          const needle = filterClientName.trim().toLowerCase();
          if (!q.client.name.toLowerCase().includes(needle) && !(q.client.company ?? "").toLowerCase().includes(needle)) return false;
        }
        if (filterProductName.trim() && !q.productName.toLowerCase().includes(filterProductName.trim().toLowerCase())) return false;
        if (dateFrom && new Date(q.createdAt) < new Date(`${dateFrom}T00:00:00`)) return false;
        if (dateTo && new Date(q.createdAt) > new Date(`${dateTo}T23:59:59.999`)) return false;
        return true;
      });

  const visibleQuotes = isGlobal
    ? [...searchedQuotes].sort((a, b) => {
        let cmp = 0;
        if (sortBy === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (sortBy === "amount") cmp = Number(a.totalRub) - Number(b.totalRub);
        else if (sortBy === "client") cmp = a.client.name.localeCompare(b.client.name, "ru");
        else if (sortBy === "manager") cmp = a.manager.name.localeCompare(b.manager.name, "ru");
        return sortDir === "asc" ? cmp : -cmp;
      })
    : searchedQuotes;

  // Preset date-range buttons — set both ends at once so "неделя" etc. is
  // one click, not two. "Произвольно" is just typing directly into the two
  // date inputs, no separate mode to toggle.
  function applyDatePreset(preset: "week" | "month" | "quarter" | "year") {
    const now = new Date();
    const from = new Date(now);
    if (preset === "week") from.setDate(now.getDate() - 7);
    else if (preset === "month") from.setMonth(now.getMonth() - 1);
    else if (preset === "quarter") from.setMonth(now.getMonth() - 3);
    else from.setFullYear(now.getFullYear() - 1);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(now.toISOString().slice(0, 10));
  }

  const load = useCallback(() => {
    setLoading(true);
    return fetch(clientId ? `/api/manager-quotes?clientId=${clientId}` : "/api/manager-quotes")
      .then((res) => res.json())
      .then((data) => setQuotes(data.quotes ?? []))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleStatusChange(quoteId: string, status: string) {
    setChangingStatusId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await load();
        return;
      }
      const data = await res.json();
      if (data.code === "CARGO_NOT_ACTUALIZED") {
        openCargoModal(quoteId, status);
      }
    } finally {
      setChangingStatusId(null);
    }
  }

  // Упаковка/страховка/МСК are keyed in by the manager in $ (that's how the
  // warehouse reports them), but stored on Quote in ₽ (packagingCostRub etc.)
  // so every other consumer — profit/premium exclusion, PDF, buyout invoice —
  // keeps working in ₽ unchanged. Convert at the quote's own usdRateUsed,
  // the same rate already used for the cargo-delivery $→₽ conversion above.
  function rubToUsdDraft(rub: string | undefined, usdRateUsed: string): string {
    if (!rub || rub === "0") return "";
    const rate = Number(usdRateUsed);
    if (!Number.isFinite(rate) || rate <= 0) return "";
    return (Number(rub) / rate).toFixed(2);
  }

  function openCargoModal(quoteId: string, pendingStatus: string | null) {
    const quote = quotes.find((q) => q.id === quoteId);
    setCargoModalQuoteId(quoteId);
    setCargoModalPendingStatus(pendingStatus);
    setCargoModalError(null);
    setCargoModalDraft({
      weight: quote?.actualTotalWeightKg ?? quote?.totalWeightKg ?? "",
      volume: quote?.actualTotalVolumeM3 ?? quote?.totalVolumeM3 ?? "",
      packaging: quote ? rubToUsdDraft(quote.packagingCostRub, quote.usdRateUsed) : "",
      insurance: quote ? rubToUsdDraft(quote.insuranceCostRub, quote.usdRateUsed) : "",
      msk: quote ? rubToUsdDraft(quote.mskExpensesRub, quote.usdRateUsed) : "",
      costRate: quote?.actualCargoCostRateUsd ?? "",
      costBasis: quote?.actualCargoCostBasis ?? "density",
    });
  }

  async function handleActualizeCargo() {
    if (!cargoModalQuoteId) return;
    const quote = quotes.find((q) => q.id === cargoModalQuoteId);
    const weight = Number(cargoModalDraft.weight);
    const volume = Number(cargoModalDraft.volume);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(volume) || volume <= 0) {
      setCargoModalError("Укажите реальный вес и объём.");
      return;
    }
    const usdRateUsed = Number(quote?.usdRateUsed ?? 0);
    const usdToRub = (draft: string) => (draft.trim() ? String(Number(draft) * usdRateUsed) : "");
    setCargoModalBusy(true);
    setCargoModalError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${cargoModalQuoteId}/actualize-cargo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualTotalWeightKg: weight,
          actualTotalVolumeM3: volume,
          packagingCostRub: usdToRub(cargoModalDraft.packaging),
          insuranceCostRub: usdToRub(cargoModalDraft.insurance),
          mskExpensesRub: usdToRub(cargoModalDraft.msk),
          ...(allManagers !== null && cargoModalDraft.costRate.trim()
            ? { actualCargoCostRateUsd: Number(cargoModalDraft.costRate), actualCargoCostBasis: cargoModalDraft.costBasis }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCargoModalError(data.error ?? "Не удалось сохранить реальные данные по карго.");
        return;
      }
      // If this was triggered by a blocked status change, retry it now
      // that cargo is actualized — the manager shouldn't have to reopen
      // the status dropdown and pick the same status a second time.
      if (cargoModalPendingStatus) {
        await fetch(`/api/manager-quotes/${cargoModalQuoteId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: cargoModalPendingStatus }),
        });
      }
      setCargoModalQuoteId(null);
      setCargoModalPendingStatus(null);
      await load();
    } finally {
      setCargoModalBusy(false);
    }
  }

  async function handleDelete(quoteId: string) {
    setDeletingId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(quoteId: string) {
    setSelectedIds((current) =>
      current.includes(quoteId) ? current.filter((id) => id !== quoteId) : [...current, quoteId],
    );
  }

  function toggleSelectAll() {
    setSelectedIds((current) => (current.length === visibleQuotes.length ? [] : visibleQuotes.map((q) => q.id)));
  }

  async function handleRecalculate(quoteId: string) {
    setRecalculatingId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/recalculate`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setRecalculatingId(null);
    }
  }

  async function handleBulkRecalculate() {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("recalculate");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) => fetch(`/api/manager-quotes/${id}/recalculate`, { method: "POST" })),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось пересчитать.");
      await load();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkDuplicate() {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("duplicate");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) => fetch(`/api/manager-quotes/${id}/duplicate`, { method: "POST" })),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось дублировать.");
      setSelectedIds([]);
      await load();
      onChanged();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkStatusChange(status: string) {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("status");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/manager-quotes/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть статусов не удалось изменить.");
      await load();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkQuoteType(quoteType: string) {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("quoteType");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/manager-quotes/${id}/quote-type`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quoteType }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось изменить.");
      await load();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkReassign(managerId: string) {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy("reassign");
    setBulkError(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/manager-quotes/${id}/reassign`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ managerId }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) setBulkError("Часть просчётов не удалось передать.");
      await load();
      onChanged();
    } catch {
      setBulkError("Не удалось связаться с сервером.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkCargoMarginDiscount() {
    const percent = Number(cargoMarginDiscountPercent.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setBulkCargoDiscountMessage("Укажите скидку от 1 до 100%.");
      return;
    }
    if (selectedIds.length === 0 || bulkCargoDiscountBusy) return;
    setBulkCargoDiscountBusy(true);
    setBulkCargoDiscountMessage(null);
    try {
      const res = await fetch("/api/manager-quotes/bulk-cargo-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds, discountPercent: percent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkCargoDiscountMessage(data.error ?? "Не удалось применить скидку.");
        return;
      }
      await load();
      onChanged();
      setCargoMarginDiscountPercent("");
      setBulkCargoDiscountMessage(
        data.skipped > 0
          ? `Применено к ${data.updated} из ${selectedIds.length} — у ${data.skipped} нет маржи по карго (пропущены).`
          : `Скидка применена к ${data.updated} просчётам.`,
      );
    } catch {
      setBulkCargoDiscountMessage("Не удалось связаться с сервером.");
    } finally {
      setBulkCargoDiscountBusy(false);
    }
  }

  // cargoInUsd — see lib/desk-services/quotes-excel.ts: same file, same
  // columns, just the "Доставка карго" column in $ instead of ₽ (the one
  // line this business actually tracks in $ internally) while everything
  // else (цена товара, доставка по Китаю, услуги) stays in ₽. Second
  // button below reuses this same handler with the flag flipped. See
  // PB-V5 chat 2026-08-01.
  async function handleExportExcel(cargoInUsd: boolean) {
    if (exportingExcel || selectedIds.length === 0) return;
    setExportingExcel(true);
    setExportError(null);
    try {
      const res = await fetch(isGlobal ? "/api/manager-quotes/quotes-excel" : `/api/manager-clients/${clientId}/quotes-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds, cargoInUsd }),
      });
      if (!res.ok) {
        const data = await res.json();
        setExportError(data.error ?? "Не удалось выгрузить в Excel.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Просчёты.xlsx";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Не удалось связаться с сервером.");
    } finally {
      setExportingExcel(false);
    }
  }

  // "Счёт на услуги" — bills specifically for the Просчёт service fee per
  // selected quote (not the full order total), for the manager to hand the
  // client after doing the calculation work. Same request/download shape
  // as handleExportExcel above, different endpoint.
  async function handleExportInvoice() {
    if (exportingInvoice || selectedIds.length === 0) return;
    // A счёт bills ONE client — in "Все просчёты" mode the selection can
    // span several, so this checks they're all the same client instead of
    // silently billing whichever one happened to own the first quote.
    let invoiceClientId = clientId;
    if (isGlobal) {
      const selectedClientIds = new Set(quotes.filter((q) => selectedIds.includes(q.id)).map((q) => q.client.id));
      if (selectedClientIds.size !== 1) {
        setInvoiceError("Счёт можно сформировать только по просчётам одного клиента — сузьте выбор.");
        return;
      }
      invoiceClientId = [...selectedClientIds][0];
    }
    setExportingInvoice(true);
    setInvoiceError(null);
    try {
      const res = await fetch(`/api/manager-clients/${invoiceClientId}/invoice-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteIds: selectedIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setInvoiceError(data.error ?? "Не удалось сформировать счёт.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Счёт на услуги.xlsx";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setInvoiceError("Не удалось связаться с сервером.");
    } finally {
      setExportingInvoice(false);
    }
  }

  // Merges each selected quote's full detail page (photo, breakdown,
  // disclaimer — same layout as one quote's own PDF) into a single file, in
  // creation order — "по порядку" — instead of downloading N separate PDFs.
  async function handleExportPdfBundle() {
    if (exportingPdfBundle || selectedIds.length === 0) return;
    setExportingPdfBundle(true);
    setPdfBundleError(null);
    try {
      const res = await fetch(
        isGlobal ? "/api/manager-quotes/quotes-pdf-bundle" : `/api/manager-clients/${clientId}/quotes-pdf-bundle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteIds: selectedIds }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setPdfBundleError(data.error ?? "Не удалось выгрузить PDF.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Просчёты.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfBundleError("Не удалось связаться с сервером.");
    } finally {
      setExportingPdfBundle(false);
    }
  }

  // Plain <a href> works fine for the ₽/$ PDF exports elsewhere in this
  // file (they basically never fail), but the USDT option can legitimately
  // 400 — the shared TariffSettings.usdtRateCny rate might not be set or
  // not yet confirmed (see app/api/manager-tariffs/confirm-usdt-rate) — and
  // a plain anchor would navigate the whole tab to raw JSON on that error.
  // fetch+blob keeps the manager on the page and shows the reason instead.
  async function handleDownloadBuyoutInvoice(quoteId: string, currency: "rub" | "usd" | "usdt" | "cny") {
    if (buyoutInvoiceBusyId) return;
    setBuyoutInvoiceBusyId(quoteId);
    setBuyoutInvoiceError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/buyout-invoice?currency=${currency}`);
      if (!res.ok) {
        const data = await res.json();
        setBuyoutInvoiceError(data.error ?? "Не удалось сформировать счёт.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Счёт на выкуп.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setInvoiceMenuQuoteId(null);
    } catch {
      setBuyoutInvoiceError("Не удалось связаться с сервером.");
    } finally {
      setBuyoutInvoiceBusyId(null);
    }
  }

  // "Счёт на выкуп списком" — same merge-into-one-PDF pattern as
  // handleExportPdfBundle above (one page per selected quote), just
  // pointed at buyout-invoice-pdf-bundle instead of quotes-pdf-bundle, and
  // with a currency to pick.
  async function handleExportBuyoutInvoiceBundle(currency: "rub" | "usd" | "usdt" | "cny") {
    if (bulkBuyoutInvoiceCurrency || selectedIds.length === 0) return;
    setBulkBuyoutInvoiceCurrency(currency);
    setBulkBuyoutInvoiceError(null);
    try {
      const res = await fetch(
        isGlobal ? "/api/manager-quotes/buyout-invoice-pdf-bundle" : `/api/manager-clients/${clientId}/buyout-invoice-pdf-bundle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteIds: selectedIds, currency }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setBulkBuyoutInvoiceError(data.error ?? "Не удалось сформировать счета.");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : "Счета на выкуп.pdf";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setExportMenuOpen(false);
    } catch {
      setBulkBuyoutInvoiceError("Не удалось связаться с сервером.");
    } finally {
      setBulkBuyoutInvoiceCurrency(null);
    }
  }

  function getCommentDraft(quote: QuoteRecord): string {
    return commentDrafts[quote.id] ?? quote.managerComment;
  }

  async function handleSaveManagerComment(quoteId: string) {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;
    setSavingCommentId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: getCommentDraft(quote) }),
      });
      if (res.ok) await load();
    } finally {
      setSavingCommentId(null);
    }
  }

  // Reassigns just this one quote's managerId — independent of the client's
  // own createdByManagerId (which stays put), so the premium for this quote
  // specifically counts for whoever it's handed to.
  async function handleReassignQuote(quoteId: string, managerId: string) {
    if (!managerId) return;
    setReassigningId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId }),
      });
      if (res.ok) await load();
    } finally {
      setReassigningId(null);
    }
  }

  function getBuyoutDraft(quote: QuoteRecord): { cny: string; rate: string; paymentRub: string; paymentRate: string; accountId: string } {
    return (
      buyoutDrafts[quote.id] ?? {
        cny: quote.actualBuyoutCny ?? "",
        rate: quote.actualBuyoutRateUsed ?? quote.cnyRateUsed,
        paymentRub: quote.actualClientPaymentRub ?? "",
        paymentRate: quote.actualClientPaymentRateUsed ?? quote.cnyRateUsed,
        accountId: paymentAccounts[0]?.id ?? "",
      }
    );
  }

  async function handleConfirmBuyout(quoteId: string) {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;
    const draft = getBuyoutDraft(quote);
    const cny = Number(draft.cny);
    const rate = Number(draft.rate);
    const paymentRub = Number(draft.paymentRub);
    const paymentRate = Number(draft.paymentRate);
    if (!Number.isFinite(cny) || cny <= 0 || !Number.isFinite(rate) || rate <= 0) return;
    if (!Number.isFinite(paymentRub) || paymentRub <= 0 || !Number.isFinite(paymentRate) || paymentRate <= 0) return;
    if (!draft.accountId) return;
    setSavingBuyoutId(quoteId);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/confirm-buyout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualBuyoutCny: cny,
          actualBuyoutRateUsed: rate,
          actualClientPaymentRub: paymentRub,
          actualClientPaymentRateUsed: paymentRate,
          accountId: draft.accountId,
        }),
      });
      if (res.ok) await load();
    } finally {
      setSavingBuyoutId(null);
    }
  }

  async function handleSaveCargoBonusRate(quoteId: string) {
    const draft = cargoBonusDrafts[quoteId];
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) {
      setCargoBonusError("Ставка должна быть неотрицательным числом.");
      return;
    }
    setSavingCargoBonusId(quoteId);
    setCargoBonusError(null);
    try {
      const res = await fetch(`/api/manager-quotes/${quoteId}/cargo-bonus-rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratePercent: value }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        setCargoBonusError(data.error ?? "Не удалось сохранить.");
      }
    } finally {
      setSavingCargoBonusId(null);
    }
  }

  if (loading) return <p className="text-xs text-text-secondary">Загрузка просчётов…</p>;
  if (quotes.length === 0) return <p className="text-xs text-text-secondary">Просчётов пока нет.</p>;

  return (
    <TooltipProvider>
    <div className="space-y-2">
      {isGlobal && (
        <div className="space-y-2 rounded-lg border border-border bg-bg p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="№ просчёта"
              value={filterNumber}
              onChange={(e) => setFilterNumber(e.target.value)}
              className="h-8 w-28 text-xs"
            />
            <Input
              placeholder="Клиент"
              value={filterClientName}
              onChange={(e) => setFilterClientName(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <Input
              placeholder="Название товара"
              value={filterProductName}
              onChange={(e) => setFilterProductName(e.target.value)}
              className="h-8 w-44 text-xs"
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">По дате</SelectItem>
                <SelectItem value="amount">По сумме</SelectItem>
                <SelectItem value="client">По клиенту</SelectItem>
                <SelectItem value="manager">По менеджеру</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
              title={sortDir === "asc" ? "По возрастанию" : "По убыванию"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
            <span className="text-xs text-text-secondary">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
            {([
              ["week", "Неделя"],
              ["month", "Месяц"],
              ["quarter", "Квартал"],
              ["year", "Год"],
            ] as const).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyDatePreset(preset)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
              >
                {label}
              </button>
            ))}
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-error"
              >
                Сбросить период
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setSelectedIds([]); }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Фильтр по статусу" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {QUOTE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
                {QUOTE_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={selectedIds.length > 0 && selectedIds.length === visibleQuotes.length}
            onChange={toggleSelectAll}
            aria-label="Выбрать все просчёты"
          />
          Выбрать все
        </label>
        {selectedIds.length > 0 && (
          <span className="text-xs text-text-secondary">выбрано: {selectedIds.length}</span>
        )}

        {/* "Экспорт" — every read-only export (nothing here changes data),
            collapsed out of the row so it stays one line even in the
            narrow master-detail right pane. See PB-V5 chat 2026-08-02. */}
        <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" /> Экспорт <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-0.5 p-1.5">
            {!isGlobal && quotes.length > 1 && (
              <a
                href={`/api/manager-clients/${clientId}/quotes-pdf`}
                onClick={() => setExportMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
              >
                <FileStack className="h-3.5 w-3.5 shrink-0" /> Скачать все просчёты клиента в PDF ({quotes.length})
              </a>
            )}
            {/* Тот же компактный табличный формат (одна строка на просчёт),
                что и "Скачать все просчёты..." выше, но только по отмеченным
                чекбоксами — раньше выбор чекбоксами работал только для
                "PDF выбранных" ниже, а это другой формат (целая страница на
                просчёт), не список. См. PB-V5 chat 2026-08-08. */}
            {!isGlobal && selectedIds.length > 0 && (
              <a
                href={`/api/manager-clients/${clientId}/quotes-pdf?ids=${encodeURIComponent(selectedIds.join(","))}`}
                onClick={() => setExportMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
              >
                <FileStack className="h-3.5 w-3.5 shrink-0" /> Скачать список выбранных в PDF ({selectedIds.length})
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                handleExportPdfBundle();
                setExportMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || exportingPdfBundle}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingPdfBundle ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              Скачать PDF выбранных — по странице на просчёт {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            {/* Внутренний формат для согласования с фабрикой/логистикой —
                кол-во/цена/цена доставки/описание/габариты/цвет, без
                клиентских итогов и тарифов. См. PB-V5 chat 2026-08-08. */}
            {!isGlobal && quotes.length > 0 && (
              <a
                href={`/api/manager-clients/${clientId}/quotes-pdf-for-manager`}
                onClick={() => setExportMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
              >
                <FileStack className="h-3.5 w-3.5 shrink-0" /> Скачать список для менеджера ({quotes.length})
              </a>
            )}
            {!isGlobal && selectedIds.length > 0 && (
              <a
                href={`/api/manager-clients/${clientId}/quotes-pdf-for-manager?ids=${encodeURIComponent(selectedIds.join(","))}`}
                onClick={() => setExportMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
              >
                <FileStack className="h-3.5 w-3.5 shrink-0" /> Скачать список для менеджера — выбранные ({selectedIds.length})
              </a>
            )}
            {!isGlobal && quotes.length > 1 && (
              <>
                <a
                  href={`/api/manager-clients/${clientId}/quotes-pdf?cargoInUsd=1`}
                  onClick={() => setExportMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
                >
                  <FileStack className="h-3.5 w-3.5 shrink-0" /> Все просчёты клиента (карго в $)
                </a>
                <div className="my-1 border-t border-border" />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                handleExportExcel(false);
                setExportMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || exportingExcel}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingExcel ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />}
              Выгрузить выбранные в Excel {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                handleExportExcel(true);
                setExportMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || exportingExcel}
              title="Карго — в $, остальное — в ₽"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingExcel ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />}
              Выбранные в Excel, карго в $ {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                handleExportInvoice();
                setExportMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || exportingInvoice}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingInvoice ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Receipt className="h-3.5 w-3.5 shrink-0" />}
              Счёт на услуги {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <div className="my-1 border-t border-border" />
            {bulkBuyoutInvoiceError && <p className="px-2.5 py-1 text-xs text-error">{bulkBuyoutInvoiceError}</p>}
            {(["rub", "usd", "usdt", "cny"] as const).map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => handleExportBuyoutInvoiceBundle(currency)}
                disabled={selectedIds.length === 0 || bulkBuyoutInvoiceCurrency !== null}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkBuyoutInvoiceCurrency === currency ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Receipt className="h-3.5 w-3.5 shrink-0" />
                )}
                Счёт на выкуп списком — {BUYOUT_CURRENCY_LABEL[currency]} {selectedIds.length > 0 && `(${selectedIds.length})`}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* "Действия" — everything that changes data (recalculate,
            duplicate, container, status/type/manager reassignment). Same
            collapsing reasoning as "Экспорт" above. */}
        <Popover open={actionsMenuOpen} onOpenChange={setActionsMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
            >
              <MoreHorizontal className="h-3.5 w-3.5" /> Действия <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-0.5 p-1.5">
            <button
              type="button"
              onClick={() => {
                setRecalculateConfirmOpen(true);
                setActionsMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || bulkBusy !== null}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "recalculate" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 shrink-0" />}
              Пересчитать тарифы {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                handleBulkDuplicate();
                setActionsMenuOpen(false);
              }}
              disabled={selectedIds.length === 0 || bulkBusy !== null}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "duplicate" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
              Дублировать {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            {canConfirmBuyout && (
              <button
                type="button"
                onClick={() => {
                  setCreatePaymentDialogOpen(true);
                  setActionsMenuOpen(false);
                }}
                disabled={selectedIds.length === 0}
                title="Зафиксировать оплату клиента и распределить её по услугам выбранных просчётов"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Banknote className="h-3.5 w-3.5 shrink-0" />
                Приходный ордер {selectedIds.length > 0 && `(${selectedIds.length})`}
              </button>
            )}

            <div className="my-1 border-t border-border" />

            <div className="space-y-1 px-1 pb-1">
              <Select
                value=""
                onValueChange={(v) => {
                  handleBulkStatusChange(v);
                  setActionsMenuOpen(false);
                }}
                disabled={selectedIds.length === 0 || bulkBusy !== null}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder={`Изменить статус выбранным${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`} />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }} />
                      {QUOTE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value=""
                onValueChange={(v) => {
                  handleBulkQuoteType(v);
                  setActionsMenuOpen(false);
                }}
                disabled={selectedIds.length === 0 || bulkBusy !== null}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  {bulkBusy === "quoteType" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SelectValue placeholder={`Присвоить тип поиска${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {BULK_QUOTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {teamManagers && teamManagers.length > 1 && (
                <Select
                  value=""
                  onValueChange={(v) => {
                    handleBulkReassign(v);
                    setActionsMenuOpen(false);
                  }}
                  disabled={selectedIds.length === 0 || bulkBusy !== null}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    {bulkBusy === "reassign" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <SelectValue placeholder={`Передать менеджеру${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`} />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {teamManagers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {allManagers !== null && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div className="space-y-1.5 px-1 pb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-text-secondary">Скидка на карго от маржи, %</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-text-secondary hover:text-primary">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64">
                          Скидка считается не от полной суммы карго доставки, а от маржи (прибыли) по карго
                          каждого просчёта. Пример: маржа по карго — $100, скидка 30% → клиент получит скидку
                          $30 (не 30% от всей доставки). Если у просчёта маржи нет (ставка на уровне себестоимости
                          или ниже) — он пропускается. Доступно только руководителю.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        step="1"
                        placeholder="напр. 30"
                        value={cargoMarginDiscountPercent}
                        onChange={(e) => setCargoMarginDiscountPercent(e.target.value)}
                        disabled={bulkCargoDiscountBusy}
                        className="h-8 flex-1 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleBulkCargoMarginDiscount}
                        disabled={selectedIds.length === 0 || !cargoMarginDiscountPercent.trim() || bulkCargoDiscountBusy}
                      >
                        {bulkCargoDiscountBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Применить"}
                        {selectedIds.length > 0 && ` (${selectedIds.length})`}
                      </Button>
                    </div>
                    {bulkCargoDiscountMessage && (
                      <p className="text-[11px] text-text-secondary">{bulkCargoDiscountMessage}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <AlertDialog open={recalculateConfirmOpen} onOpenChange={setRecalculateConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Пересчитать тарифы?</AlertDialogTitle>
              <AlertDialogDescription>
                Выбранные просчёты ({selectedIds.length}) будут пересчитаны по сегодняшним курсам, комиссии,
                ставкам поиска и карго — вместо цифр, зафиксированных при создании. Итоговая сумма может измениться.
                Вы уверены, что хотите пересчитать тарифы?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkRecalculate}>Пересчитать</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {bulkError && <p className="text-xs text-error">{bulkError}</p>}
      {exportError && <p className="text-xs text-error">{exportError}</p>}
      {pdfBundleError && <p className="text-xs text-error">{pdfBundleError}</p>}
      {invoiceError && <p className="text-xs text-error">{invoiceError}</p>}
      {visibleQuotes.length === 0 ? (
        <p className="text-xs text-text-secondary">{isGlobal ? "Ничего не найдено." : "Нет просчётов с этим статусом."}</p>
      ) : (
      <ul className="space-y-1.5">
        {visibleQuotes.map((quote) => (
          <li key={quote.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.includes(quote.id)}
                onChange={() => toggleSelected(quote.id)}
                className="shrink-0"
                aria-label={`Выбрать просчёт №${outsourceQuoteLabels?.[quote.id] ?? quote.displayId}`}
              />
              <div className="group relative shrink-0">
                {quote.firstPhotoId ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                    <img
                      src={`/api/manager-quotes/photos/${quote.firstPhotoId}/thumbnail`}
                      alt=""
                      onClick={() => setZoomedPhotoId(quote.firstPhotoId)}
                      className="h-9 w-9 cursor-zoom-in rounded-md border border-border object-cover"
                    />
                    {/* Наведение — быстрый предпросмотр для мыши; клик/тап (выше)
                        открывает полноразмерный оригинал в диалоге — единственный
                        способ увидеть фото на тач-экране, где :hover не срабатывает
                        вообще. No fixed box + object-contain here — that forced
                        every photo into a square frame, letterboxing a non-square
                        source into a thin sliver. h-auto/w-auto with only a
                        max-size cap keeps the source's real aspect ratio ("1 к 1",
                        undistorted) instead. */}
                    <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden group-hover:block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- session-gated API route, not a static asset */}
                      <img
                        src={`/api/manager-quotes/photos/${quote.firstPhotoId}/thumbnail`}
                        alt=""
                        className="h-auto w-auto max-h-[140px] max-w-[140px] rounded-lg border border-border bg-bg shadow-lg"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border text-text-secondary">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEdit(quote.id, quote.client)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate font-medium text-text">
                      №{outsourceQuoteLabels?.[quote.id] ?? quote.displayId} · {quote.productName}
                    </span>
                    {quote.destinationCountry !== "russia" && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${destinationCountryColor(quote.destinationCountry)}1a`,
                          color: destinationCountryColor(quote.destinationCountry),
                        }}
                      >
                        {destinationCountryLabel(quote.destinationCountry)}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {formatDate(quote.createdAt)}
                    {quote.updatedAt !== quote.createdAt && <> · изменён {formatDate(quote.updatedAt)}</>} ·{" "}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help font-bold text-success underline decoration-success/40 decoration-dotted underline-offset-2">
                          {fmtRub(Number(quote.totalRub))} ₽
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-56">
                        {(() => {
                          const b = quoteBreakdown(quote);
                          return (
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span>Товар</span>
                                <span>{fmtRub(b.totalPriceRub)} ₽</span>
                              </div>
                              {b.chinaDeliveryRub > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Доставка по Китаю</span>
                                  <span>{fmtRub(b.chinaDeliveryRub)} ₽</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <span>Услуга поиска</span>
                                <span>{quote.searchFeeWaived ? "бесплатно" : `${fmtRub(b.searchServiceFeeRub)} ₽`}</span>
                              </div>
                              {b.customProductionFeeRub > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Производство под заказ</span>
                                  <span>{fmtRub(b.customProductionFeeRub)} ₽</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <span>Комиссия за выкуп</span>
                                <span>{fmtRub(b.buyoutCommissionRub)} ₽</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span>Карго ({b.cargoBasis})</span>
                                <span>{fmtRub(b.cargoDeliveryRub)} ₽</span>
                              </div>
                              {b.cargoDiscountUsd > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Скидка на карго</span>
                                  <span>-${b.cargoDiscountUsd.toFixed(1)}</span>
                                </div>
                              )}
                              {b.extraShipmentCostsRub > 0 && (
                                <div className="flex justify-between gap-4">
                                  <span>Упаковка, страховка, МСК</span>
                                  <span>{fmtRub(b.extraShipmentCostsRub)} ₽</span>
                                </div>
                              )}
                              {b.attachedServicesRub > 1 && (
                                <div className="flex justify-between gap-4">
                                  <span>Доп. услуги</span>
                                  <span>{fmtRub(b.attachedServicesRub)} ₽</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4 border-t border-surface/25 pt-1 font-bold">
                                <span>Итого</span>
                                <span>{fmtRub(Number(quote.totalRub))} ₽</span>
                              </div>
                            </div>
                          );
                        })()}
                      </TooltipContent>
                    </Tooltip>{" "}
                    · {quote.manager.name}
                    {isGlobal && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-text">
                          {quote.client.name}
                          {quote.client.company ? ` (${quote.client.company})` : ""}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>

              <a
                href={`/api/manager-quotes/${quote.id}/pdf`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Скачать PDF"
                title="Скачать PDF"
              >
                <Download className="h-4 w-4" />
              </a>

              <Popover
                open={invoiceMenuQuoteId === quote.id}
                onOpenChange={(open) => setInvoiceMenuQuoteId(open ? quote.id : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label="Выставить счёт на выкуп"
                    title="Выставить счёт на выкуп"
                  >
                    <Receipt className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 space-y-0.5 p-1.5">
                  {buyoutInvoiceError && invoiceMenuQuoteId === quote.id && (
                    <p className="px-2.5 py-1 text-xs text-error">{buyoutInvoiceError}</p>
                  )}
                  {(["rub", "usd", "usdt", "cny"] as const).map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      onClick={() => handleDownloadBuyoutInvoice(quote.id, currency)}
                      disabled={buyoutInvoiceBusyId === quote.id}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {buyoutInvoiceBusyId === quote.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : (
                        <Receipt className="h-3.5 w-3.5 shrink-0" />
                      )}
                      Счёт на выкуп — в {BUYOUT_CURRENCY_LABEL[currency]}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <Select
                value={quote.status}
                onValueChange={(status) => handleStatusChange(quote.id, status)}
                disabled={changingStatusId === quote.id}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-fit min-w-42.5 shrink-0 rounded-full border-0 text-xs font-medium",
                    QUOTE_STATUS_BADGE_CLASSES[quote.status],
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: QUOTE_STATUS_DOT_COLOR[status] }}
                      />
                      {QUOTE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => setExpandedCommentId(expandedCommentId === quote.id ? null : quote.id)}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Комментарии"
                title="Комментарии"
              >
                <MessageSquare className="h-4 w-4" />
                {quote.clientComment && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-error" />
                )}
              </button>

              {POST_BUYOUT_STATUSES.includes(quote.status) && (
                <button
                  type="button"
                  onClick={() => setExpandedBuyoutId(expandedBuyoutId === quote.id ? null : quote.id)}
                  className={cn(
                    "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-primary/10 hover:text-primary",
                    quote.buyoutFactConfirmed ? "text-success" : "text-text-secondary",
                  )}
                  aria-label="Факт по выкупу"
                  title={quote.buyoutFactConfirmed ? "Факт по выкупу подтверждён" : "Факт по выкупу не подтверждён"}
                >
                  <Banknote className="h-4 w-4" />
                  {!quote.buyoutFactConfirmed && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />
                  )}
                </button>
              )}

              {CARGO_RELEVANT_STATUSES.includes(quote.status) && (
                <button
                  type="button"
                  onClick={() => openCargoModal(quote.id, null)}
                  className={cn(
                    "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-primary/10 hover:text-primary",
                    quote.cargoActualizedAt ? "text-success" : "text-text-secondary",
                  )}
                  aria-label="Реальные габариты карго"
                  title={quote.cargoActualizedAt ? "Реальные габариты внесены" : "Реальные габариты не внесены"}
                >
                  <Package className="h-4 w-4" />
                  {!quote.cargoActualizedAt && quote.status !== "delivered_to_warehouse" && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => onEdit(quote.id, quote.client)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Редактировать просчёт"
                title="Редактировать просчёт"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {/* Rarer/riskier actions collapsed into one menu instead of
                  bare icons — передать менеджеру, ставка премии за карго,
                  пересчитать по тарифам, удалить. See PB-V5 UX audit
                  2026-08-05. */}
              <Popover open={rowActionsMenuId === quote.id} onOpenChange={(open) => setRowActionsMenuId(open ? quote.id : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label="Действия"
                    title="Действия"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-0.5 p-1.5">
                  {teamManagers && teamManagers.length > 1 && (
                    <Select
                      value=""
                      onValueChange={(managerId) => {
                        handleReassignQuote(quote.id, managerId);
                        setRowActionsMenuId(null);
                      }}
                      disabled={reassigningId === quote.id}
                    >
                      <SelectTrigger className="h-auto w-full justify-start gap-2 rounded-lg border-0 px-2.5 py-2 text-xs font-medium text-text-secondary hover:bg-bg hover:text-primary [&>svg:last-child]:hidden">
                        {reassigningId === quote.id ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        Передать другому менеджеру
                      </SelectTrigger>
                      <SelectContent position="popper" align="start">
                        {teamManagers
                          .filter((m) => m.id !== quote.manager.id)
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}

                  {allManagers !== null &&
                    quote.cargoBonusRatePercent !== null &&
                    clientSelfSourcedConfirmed &&
                    quote.manager.id === clientCreatedByManagerId && (
                      <button
                        type="button"
                        onClick={() => {
                          setCargoBonusDrafts((current) => ({
                            ...current,
                            [quote.id]: current[quote.id] ?? quote.cargoBonusRatePercent ?? "",
                          }));
                          setCargoBonusError(null);
                          setExpandedCargoBonusId(expandedCargoBonusId === quote.id ? null : quote.id);
                          setRowActionsMenuId(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary"
                      >
                        <Percent className="h-3.5 w-3.5 shrink-0" />
                        Ставка премии за карго
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => {
                      handleRecalculate(quote.id);
                      setRowActionsMenuId(null);
                    }}
                    disabled={recalculatingId === quote.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {recalculatingId === quote.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    )}
                    Пересчитать по новым тарифам
                  </button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-error transition-colors hover:bg-error/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        Удалить просчёт
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить просчёт?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Просчёт №{outsourceQuoteLabels?.[quote.id] ?? quote.displayId} «{quote.productName}» и приложенные к нему фото будут удалены без
                          возможности восстановления.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          variant="danger"
                          onClick={() => {
                            handleDelete(quote.id);
                            setRowActionsMenuId(null);
                          }}
                          disabled={deletingId === quote.id}
                        >
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </PopoverContent>
              </Popover>
            </div>

            {isStale(quote) && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-error/10 px-2.5 py-2 text-xs font-medium text-error">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Почему так долго идёт просчёт? Это влияет на твой доход. Поторопись!
              </div>
            )}

            {expandedCommentId === quote.id && (
              <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg p-2.5">
                <div>
                  <p className="mb-1 text-xs font-medium text-text-secondary">Комментарий клиента</p>
                  <p className="rounded-md bg-surface px-2.5 py-1.5 text-sm text-text">
                    {quote.clientComment || <span className="text-text-secondary">Пока нет комментария.</span>}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-text-secondary">Комментарий менеджера</p>
                  <textarea
                    value={getCommentDraft(quote)}
                    onChange={(e) => setCommentDrafts((current) => ({ ...current, [quote.id]: e.target.value }))}
                    placeholder="Напишите комментарий, видимый клиенту"
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveManagerComment(quote.id)}
                    disabled={savingCommentId === quote.id || getCommentDraft(quote) === quote.managerComment}
                    className="mt-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCommentId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Сохранить
                  </button>
                </div>
              </div>
            )}

            {expandedBuyoutId === quote.id &&
              (() => {
                const draft = getBuyoutDraft(quote);
                const draftCny = Number(draft.cny);
                const draftRate = Number(draft.rate);
                const draftPaymentRub = Number(draft.paymentRub);
                const draftPaymentRate = Number(draft.paymentRate);
                const draftValid =
                  Number.isFinite(draftCny) &&
                  draftCny > 0 &&
                  Number.isFinite(draftRate) &&
                  draftRate > 0 &&
                  Number.isFinite(draftPaymentRub) &&
                  draftPaymentRub > 0 &&
                  Number.isFinite(draftPaymentRate) &&
                  draftPaymentRate > 0 &&
                  Boolean(draft.accountId);
                const draftSpentRub = draftValid ? draftCny * draftRate : null;
                const draftProfitRub = draftSpentRub != null ? Number(quote.totalPriceRub) - draftSpentRub : null;
                const confirmedSpentRub = quote.buyoutFactConfirmed
                  ? Number(quote.actualBuyoutCny) * Number(quote.actualBuyoutRateUsed)
                  : null;
                // Уже получено отдельными "Приходными ордерами" с карточки
                // клиента до подтверждения факта — "Оплата от клиента" ниже
                // должна быть суммой ЗА ВЕСЬ просчёт (нужна целиком для
                // расчёта скидки поставщика на сервере), но кассовый ордер
                // сервер заведёт только на остаток сверх уже учтённого —
                // подсказка здесь просто объясняет, откуда берётся разница.
                const alreadyReceivedRub = quote.paymentAllocations.reduce((sum, a) => sum + Number(a.amountRub), 0);
                return (
                  <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg p-2.5">
                    <p className="text-xs text-text-secondary">
                      По плану: {quote.totalPriceCny}¥ ({fmtRub(Number(quote.totalPriceRub))}₽)
                    </p>

                    {quote.buyoutFactConfirmed ? (
                      <div className="space-y-1 rounded-md bg-surface p-2.5 text-sm">
                        <div className="text-text">
                          Потрачено по факту: {quote.actualBuyoutCny}¥ × {quote.actualBuyoutRateUsed}₽ ={" "}
                          {fmtRub(confirmedSpentRub!)}₽
                        </div>
                        <div className="font-bold text-success">
                          Доход с выкупа: {fmtRub(Number(quote.totalPriceRub) - confirmedSpentRub!)}₽ (премия{" "}
                          {quote.buyoutPremiumRatePercent}%)
                        </div>
                        <div className="text-xs text-text-secondary">
                          Подтверждено {quote.buyoutConfirmedAt ? formatDate(quote.buyoutConfirmedAt) : ""}
                        </div>
                      </div>
                    ) : canConfirmBuyout ? (
                      <div className="space-y-1.5 rounded-md bg-surface p-2.5">
                        <Select
                          value={draft.accountId}
                          onValueChange={(v) => setBuyoutDrafts((current) => ({ ...current, [quote.id]: { ...draft, accountId: v } }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Счёт зачисления" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentAccounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="¥ потрачено"
                            value={draft.cny}
                            onChange={(e) =>
                              setBuyoutDrafts((current) => ({ ...current, [quote.id]: { ...draft, cny: e.target.value } }))
                            }
                            className="w-32 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="курс ¥→₽"
                            value={draft.rate}
                            onChange={(e) =>
                              setBuyoutDrafts((current) => ({ ...current, [quote.id]: { ...draft, rate: e.target.value } }))
                            }
                            className="w-28 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="₽ оплата от клиента"
                            value={draft.paymentRub}
                            onChange={(e) =>
                              setBuyoutDrafts((current) => ({ ...current, [quote.id]: { ...draft, paymentRub: e.target.value } }))
                            }
                            className="w-40 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="курс ₽→¥"
                            value={draft.paymentRate}
                            onChange={(e) =>
                              setBuyoutDrafts((current) => ({ ...current, [quote.id]: { ...draft, paymentRate: e.target.value } }))
                            }
                            className="w-28 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        {alreadyReceivedRub > 0 && (
                          <p className="text-xs text-text-secondary">
                            Уже получено {fmtRub(alreadyReceivedRub)}₽ отдельными приходными ордерами — в «оплата от
                            клиента» укажите ОБЩУЮ сумму за весь просчёт, остаток в кассу заведётся сам.
                          </p>
                        )}
                        {draftValid && (
                          <p className={cn("text-xs font-medium", draftProfitRub! >= 0 ? "text-success" : "text-error")}>
                            Потрачено: {fmtRub(draftSpentRub!)}₽ → Доход с выкупа: {fmtRub(draftProfitRub!)}₽
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => handleConfirmBuyout(quote.id)}
                          disabled={!draftValid || savingBuyoutId === quote.id}
                          className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingBuyoutId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Подтвердить факт
                        </button>
                      </div>
                    ) : (
                      <p className="rounded-md bg-surface p-2.5 text-xs text-text-secondary">
                        Ожидает подтверждения старшим менеджером или руководителем.
                      </p>
                    )}
                  </div>
                );
              })()}

            {expandedCargoBonusId === quote.id && (
              <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg p-2.5">
                <p className="text-xs text-text-secondary">
                  По умолчанию: 10% (свой клиент). Можно вручную изменить премию менеджера за карго именно по этой сделке.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={cargoBonusDrafts[quote.id] ?? ""}
                    onChange={(e) => setCargoBonusDrafts((current) => ({ ...current, [quote.id]: e.target.value }))}
                    className="w-24 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-sm text-text-secondary">%</span>
                  <button
                    type="button"
                    onClick={() => handleSaveCargoBonusRate(quote.id)}
                    disabled={savingCargoBonusId === quote.id}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCargoBonusId === quote.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Сохранить
                  </button>
                </div>
                {cargoBonusError && <p className="text-xs text-error">{cargoBonusError}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      )}

      <Dialog open={cargoModalQuoteId !== null} onOpenChange={(open) => !open && setCargoModalQuoteId(null)}>
        <DialogContent>
          {(() => {
            const quote = quotes.find((q) => q.id === cargoModalQuoteId);
            if (!quote) return null;

            const weight = Number(cargoModalDraft.weight);
            const volume = Number(cargoModalDraft.volume);
            const draftValid = Number.isFinite(weight) && weight > 0 && Number.isFinite(volume) && volume > 0;

            // Same baseline-picking logic as the server route — use the
            // ORIGINAL quoted numbers (estimated* once they exist), not
            // whatever a previous actualization already overwrote, so the
            // preview matches exactly what the server will actually save.
            const isFirstActualization = quote.estimatedTotalWeightKg === null;
            const baselineWeightKg = isFirstActualization ? Number(quote.totalWeightKg) : Number(quote.estimatedTotalWeightKg);
            const baselineVolumeM3 = isFirstActualization ? Number(quote.totalVolumeM3) : Number(quote.estimatedTotalVolumeM3);
            const basisIsDensity = quote.deliveryPricingMode === "density" && Number(quote.densityKgM3) >= 100;
            const newBasisQuantity = basisIsDensity ? weight : volume;
            const newCargoDeliveryUsd = draftValid
              ? Math.max(0, Number(quote.cargoRateUsd) * newBasisQuantity - Number(quote.cargoDiscountUsd))
              : null;
            const newCargoDeliveryRub = newCargoDeliveryUsd != null ? newCargoDeliveryUsd * Number(quote.usdRateUsed) : null;
            const usdRateUsed = Number(quote.usdRateUsed);
            // Упаковка/страховка/МСК are keyed in by the manager in $ — converted
            // to ₽ at the quote's own usdRateUsed for storage/totals, same rate
            // the cargo-delivery $→₽ conversion above already uses.
            const packagingCostUsd = cargoModalDraft.packaging.trim() ? Number(cargoModalDraft.packaging) : 0;
            const insuranceCostUsd = cargoModalDraft.insurance.trim() ? Number(cargoModalDraft.insurance) : 0;
            const mskExpensesUsd = cargoModalDraft.msk.trim() ? Number(cargoModalDraft.msk) : 0;
            const newExtraCostsUsd = packagingCostUsd + insuranceCostUsd + mskExpensesUsd;
            const newExtraCostsRub = newExtraCostsUsd * usdRateUsed;
            const oldExtraCostsRub = Number(quote.packagingCostRub) + Number(quote.insuranceCostRub) + Number(quote.mskExpensesRub);
            const newTotalRub =
              newCargoDeliveryRub != null
                ? Number(quote.totalRub) - Number(quote.cargoDeliveryRub) + newCargoDeliveryRub - oldExtraCostsRub + newExtraCostsRub
                : null;
            const newTotalUsd = newTotalRub != null && usdRateUsed > 0 ? newTotalRub / usdRateUsed : null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle>Реальные габариты карго</DialogTitle>
                  <DialogDescription>
                    №{outsourceQuoteLabels?.[quote.id] ?? quote.displayId} · {quote.productName} — внесите вес и объём с накладной кладовщика. Раньше
                    оценка была {baselineWeightKg.toFixed(1)} кг, {baselineVolumeM3.toFixed(3)} м³.
                  </DialogDescription>
                </DialogHeader>

                {quote.cargoActualizedAt && (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    Уже актуализировано {formatDate(quote.cargoActualizedAt)} — если клиенту уже озвучена сумма
                    {quote.totalRub ? ` (${fmtRub(Number(quote.totalRub))} ₽)` : ""}, повторное изменение поменяет её
                    ещё раз.
                  </p>
                )}

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="cargo-actual-weight">Реальный вес, кг</Label>
                      <Input
                        id="cargo-actual-weight"
                        type="number"
                        step="0.01"
                        value={cargoModalDraft.weight}
                        onChange={(e) => setCargoModalDraft((current) => ({ ...current, weight: e.target.value }))}
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="cargo-actual-volume">Реальный объём, м³</Label>
                      <Input
                        id="cargo-actual-volume"
                        type="number"
                        step="0.001"
                        value={cargoModalDraft.volume}
                        onChange={(e) => setCargoModalDraft((current) => ({ ...current, volume: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="cargo-actual-packaging">Упаковка, $</Label>
                      <Input
                        id="cargo-actual-packaging"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={cargoModalDraft.packaging}
                        onChange={(e) => setCargoModalDraft((current) => ({ ...current, packaging: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cargo-actual-insurance">Страховка, $</Label>
                      <Input
                        id="cargo-actual-insurance"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={cargoModalDraft.insurance}
                        onChange={(e) => setCargoModalDraft((current) => ({ ...current, insurance: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cargo-actual-msk">Расходы МСК, $</Label>
                      <Input
                        id="cargo-actual-msk"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={cargoModalDraft.msk}
                        onChange={(e) => setCargoModalDraft((current) => ({ ...current, msk: e.target.value }))}
                      />
                    </div>
                  </div>

                  {allManagers !== null && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg p-2.5">
                      <div>
                        <Label htmlFor="cargo-actual-cost-rate">Реальная ставка закупки карго, $</Label>
                        <Input
                          id="cargo-actual-cost-rate"
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={cargoModalDraft.costRate}
                          onChange={(e) => setCargoModalDraft((current) => ({ ...current, costRate: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="cargo-actual-cost-basis">Тип отправки</Label>
                        <Select
                          value={cargoModalDraft.costBasis}
                          onValueChange={(v) => setCargoModalDraft((current) => ({ ...current, costBasis: v as "density" | "volume" }))}
                        >
                          <SelectTrigger id="cargo-actual-cost-basis" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="density">По кг</SelectItem>
                            <SelectItem value="volume">По объёму</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="col-span-2 text-xs text-text-secondary">
                        Реальная ставка закупки карго у перевозчика — уточняет маржу по карго для отчётов руководителя;
                        цену клиента и премию менеджера не меняет.
                      </p>
                    </div>
                  )}

                  {draftValid && newCargoDeliveryRub != null && newTotalRub != null && newTotalUsd != null && (
                    <div className="rounded-lg bg-bg p-3 text-sm">
                      <div className="flex justify-between text-text-secondary">
                        <span>Было (карго)</span>
                        <span>{fmtRub(Number(quote.cargoDeliveryRub))} ₽</span>
                      </div>
                      <div className="flex justify-between font-bold text-text">
                        <span>Станет (карго)</span>
                        <span>{fmtRub(newCargoDeliveryRub)} ₽</span>
                      </div>
                      {newExtraCostsUsd > 0 && (
                        <div className="flex justify-between text-text-secondary">
                          <span>Упаковка + страховка + МСК</span>
                          <span>${fmtUsd(newExtraCostsUsd)} ({fmtRub(newExtraCostsRub)} ₽)</span>
                        </div>
                      )}
                      <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 font-bold text-primary">
                        <span>Новый итог просчёта</span>
                        <span>
                          ${fmtUsd(newTotalUsd)} ({fmtRub(newTotalRub)} ₽ · курс {usdRateUsed.toFixed(2)})
                        </span>
                      </div>
                    </div>
                  )}

                  {cargoModalError && <p className="text-xs text-error">{cargoModalError}</p>}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCargoModalQuoteId(null)}>
                    Отмена
                  </Button>
                  <Button type="button" onClick={handleActualizeCargo} disabled={!draftValid || cargoModalBusy}>
                    {cargoModalBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Сохранить и продолжить
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {canConfirmBuyout && (
        <CreatePaymentDialog
          open={createPaymentDialogOpen}
          onOpenChange={setCreatePaymentDialogOpen}
          quoteIds={selectedIds}
          onSaved={() => {
            setSelectedIds([]);
            load();
          }}
        />
      )}

      <PhotoLightbox
        src={zoomedPhotoId ? `/api/manager-quotes/photos/${zoomedPhotoId}` : null}
        onClose={() => setZoomedPhotoId(null)}
      />
    </div>
    </TooltipProvider>
  );
}

function ManagerClientsTab() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Which client's own quotes/details show in the right-hand panel — a
  // plain selection now (master-detail layout), not an accordion toggle
  // per row, so clicking a different client never closes the pane, and
  // the same client's data stays visible while the manager works through
  // its quote list. See PB-V5 chat 2026-08-02.
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [quoteDialogClientId, setQuoteDialogClientId] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [quotesRefreshKey, setQuotesRefreshKey] = useState(0);

  // /api/managers is owner-only (403 for anyone else) — its success doubles
  // as "am I the owner" without threading the role down as a prop, and its
  // response is exactly the manager list the transfer dropdown needs.
  const [allManagers, setAllManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [transferringClientId, setTransferringClientId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/managers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAllManagers(data?.managers ?? null));
  }, []);

  // Менеджер-аутсорсинг sees "№1"/"№2"… local client numbers here instead
  // of the real displayId — see app/api/manager-outsource-numbering and
  // ManagerRole.outsource_manager in prisma/schema.prisma. null for every
  // other role, falling back to the real displayId unchanged.
  const [outsourceClientNumbers, setOutsourceClientNumbers] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch("/api/manager-outsource-numbering")
      .then((res) => res.json())
      .then((data) => setOutsourceClientNumbers(data.applicable ? data.clientNumbers : null))
      .catch(() => setOutsourceClientNumbers(null));
  }, []);

  // /api/manager-team-managers is owner/senior-only — its success doubles
  // as "can I confirm facts" the same way /api/managers above doubles as
  // "am I the owner", without a dedicated whoami endpoint. A lightweight
  // sibling of /api/manager-confirmations (same permission gate, same
  // teamManagers query) that skips the 9 pending-confirmation queues this
  // tab never displays — see app/api/manager-team-managers/route.ts.
  const [canConfirmBuyout, setCanConfirmBuyout] = useState(false);
  // Manager-scoped team list (owner: everyone; senior: self + own
  // subordinates) — drives the client-level "передать менеджеру" dropdown
  // and doubles as "am I senior/owner" for the contacts-visibility toggle.
  // Deliberately NOT the owner-only allManagers/api/managers above — that
  // one also gates quote-level reassignment, which stays owner-only.
  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[] | null>(null);
  // Для выбора счёта зачисления в "Подтвердить факт"/приходном ордере —
  // тот же owner/senior gate, см. app/api/manager-payment-accounts.
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/manager-team-managers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setCanConfirmBuyout(Boolean(data));
        setTeamManagers(data?.teamManagers ?? null);
      });
    fetch("/api/manager-payment-accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPaymentAccounts(data?.accounts ?? []));
  }, []);

  async function handleTransfer(clientId: string, managerId: string) {
    if (!managerId) return;
    setTransferringClientId(clientId);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferToManagerId: managerId }),
      });
      if (res.ok) {
        await loadClients();
        setQuotesRefreshKey((key) => key + 1);
      }
    } finally {
      setTransferringClientId(null);
    }
  }

  const [contactsToggleBusyId, setContactsToggleBusyId] = useState<string | null>(null);
  async function handleToggleContactsHidden(clientId: string, nextHidden: boolean) {
    setContactsToggleBusyId(clientId);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactsHiddenFromManager: nextHidden }),
      });
      if (res.ok) await loadClients();
    } finally {
      setContactsToggleBusyId(null);
    }
  }

  async function handleClientStatusChange(clientId: string, status: string) {
    setChangingClientStatusId(clientId);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await loadClients();
    } finally {
      setChangingClientStatusId(null);
    }
  }

  // Owner-only override of Влад's cut for this one client — see
  // Client.vladShareRatePercentOverride in prisma/schema.prisma. Own
  // draft/busy state (not folded into editDraft/handleSaveEdit) since it
  // saves independently on blur, same pattern as the contacts-hidden
  // toggle above rather than the name/phone/etc. batch-edit form.
  const [vladShareDrafts, setVladShareDrafts] = useState<Record<string, string>>({});
  const [vladShareBusyId, setVladShareBusyId] = useState<string | null>(null);
  async function handleSaveVladShareOverride(clientId: string, currentValue: string | null | undefined) {
    const draft = vladShareDrafts[clientId];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (trimmed === (currentValue ?? "")) return;
    let value: number | null;
    if (trimmed === "") {
      value = null;
    } else {
      value = Number(trimmed);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setVladShareDrafts((c) => ({ ...c, [clientId]: currentValue ?? "" }));
        return;
      }
    }
    setVladShareBusyId(clientId);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vladShareRatePercentOverride: value }),
      });
      if (res.ok) await loadClients();
    } finally {
      setVladShareBusyId(null);
    }
  }

  const [selfSourcedBusyId, setSelfSourcedBusyId] = useState<string | null>(null);
  const [selfSourcedError, setSelfSourcedError] = useState<string | null>(null);

  async function handleClaimSelfSourced(clientId: string) {
    setSelfSourcedBusyId(clientId);
    setSelfSourcedError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/claim-self-sourced`, { method: "PATCH" });
      if (res.ok) {
        await loadClients();
      } else {
        const data = await res.json();
        setSelfSourcedError(data.error ?? "Не удалось заявить клиента.");
      }
    } finally {
      setSelfSourcedBusyId(null);
    }
  }

  async function handleConfirmSelfSourced(clientId: string) {
    setSelfSourcedBusyId(clientId);
    setSelfSourcedError(null);
    try {
      const res = await fetch(`/api/manager-clients/${clientId}/confirm-self-sourced`, { method: "PATCH" });
      if (res.ok) {
        await loadClients();
      } else {
        const data = await res.json();
        setSelfSourcedError(data.error ?? "Не удалось подтвердить клиента.");
      }
    } finally {
      setSelfSourcedBusyId(null);
    }
  }

  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [messenger, setMessenger] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<string>("other");
  const [newClientSelfSourced, setNewClientSelfSourced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("all");
  const [clientStatusFilter, setClientStatusFilter] = useState<ClientStatus | "all">("all");
  const [changingClientStatusId, setChangingClientStatusId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", company: "", phone: "", messenger: "", email: "", source: "other" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manager-clients${showArchived ? "?includeArchived=1" : ""}`);
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Not-done draft count per client — fetched once across all of this
  // manager's visible clients (not per-client) so the "заявки на поиск: N"
  // badge is already visible in the COLLAPSED row, before expanding a
  // client to see ClientDraftRequests itself. See PB-V5 chat 2026-07-28.
  const [draftCounts, setDraftCounts] = useState<Record<string, number>>({});
  const loadDraftCounts = useCallback(async () => {
    const res = await fetch("/api/manager-quote-drafts");
    const data = await res.json();
    if (!res.ok) return;
    const counts: Record<string, number> = {};
    for (const draft of data.drafts ?? []) {
      counts[draft.clientId] = (counts[draft.clientId] ?? 0) + 1;
    }
    setDraftCounts(counts);
  }, []);

  useEffect(() => {
    loadDraftCounts();
  }, [loadDraftCounts]);

  // Same "count visible before expanding" treatment as draftCounts above,
  // for two more statuses — a quote the client rejected needs just as much
  // attention as an unprocessed search request, and a quote nobody's
  // picked up yet needs a first look. One shared fetch of /api/manager-
  // quotes rather than two, since both counts come from the same list.
  // See PB-V5 chat 2026-07-29.
  const [needsReplacementCounts, setNeedsReplacementCounts] = useState<Record<string, number>>({});
  const [newRequestCounts, setNewRequestCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    // summary=1 — только id/status/clientId (см. app/api/manager-quotes/
    // route.ts) вместо полного объекта каждого просчёта компании; это
    // единственное, что здесь читается.
    fetch("/api/manager-quotes?summary=1")
      .then((res) => res.json())
      .then((data) => {
        const replacementCounts: Record<string, number> = {};
        const requestCounts: Record<string, number> = {};
        for (const quote of data.quotes ?? []) {
          if (quote.status === "needs_replacement") replacementCounts[quote.clientId] = (replacementCounts[quote.clientId] ?? 0) + 1;
          if (quote.status === "new_request") requestCounts[quote.clientId] = (requestCounts[quote.clientId] ?? 0) + 1;
        }
        setNeedsReplacementCounts(replacementCounts);
        setNewRequestCounts(requestCounts);
      });
  }, [quotesRefreshKey]);

  function startEditing(client: ClientRecord) {
    setEditingClientId(client.id);
    setEditError(null);
    setEditDraft({
      name: client.name,
      company: client.company ?? "",
      phone: client.phone ?? "",
      messenger: client.messenger ?? "",
      email: client.email ?? "",
      source: client.source ?? "other",
    });
  }

  async function handleSaveEdit(clientId: string) {
    if (editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      // Contacts stay out of the request entirely when hidden from this
      // viewer — editDraft.phone/messenger/email are empty strings in that
      // case (the API never sent the real values), and the PATCH route
      // treats an empty messenger/email as "clear it", so sending them
      // would silently wipe the real contact data.
      const client = clients.find((c) => c.id === clientId);
      const { phone, messenger, email, ...rest } = editDraft;
      const body = client?.contactsHidden ? rest : editDraft;
      void phone;
      void messenger;
      void email;
      const res = await fetch(`/api/manager-clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Не удалось сохранить клиента.");
        return;
      }
      setEditingClientId(null);
      await loadClients();
    } catch {
      setEditError("Не удалось связаться с сервером.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleArchive(client: ClientRecord) {
    if (!client.archivedAt && !window.confirm(`Отправить клиента «${client.name}» в архив?`)) return;
    setArchivingId(client.id);
    try {
      const res = await fetch(`/api/manager-clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !client.archivedAt }),
      });
      if (res.ok) await loadClients();
    } finally {
      setArchivingId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/manager-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone, messenger, email, source, selfSourced: newClientSelfSourced }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось создать клиента.");
        return;
      }
      setName("");
      setCompany("");
      setPhone("");
      setMessenger("");
      setEmail("");
      setSource("other");
      setNewClientSelfSourced(false);
      setShowNewForm(false);
      await loadClients();
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setCreating(false);
    }
  }

  const quoteDialogClient = clients.find((c) => c.id === quoteDialogClientId) ?? null;
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  // Free-text search over name/company/phone/email/messenger, plus an
  // optional manager filter — client-side over the already-scoped
  // `clients` list (loadClients already applies role-based visibility and
  // the archived toggle), same "filter what's already loaded" approach as
  // manager-dashboard.tsx's status pills.
  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      if (managerFilter !== "all" && client.createdByManagerId !== managerFilter) return false;
      if (clientStatusFilter !== "all" && client.status !== clientStatusFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [client.name, client.company, client.phone, client.email, client.messenger]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [clients, managerFilter, clientStatusFilter, normalizedSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-260px)] lg:min-h-140 lg:flex-row">
        {/* LEFT: client list — hidden on mobile once a client is picked (see
            RIGHT panel below), so picking a client doesn't leave the whole
            list still scrolled above it. Always shown on lg+, where both
            panels sit side by side. See PB-V5 chat 2026-08-05. */}
        <div className={cn("w-full shrink-0 flex-col rounded-xl border border-border bg-surface lg:flex lg:w-80", selectedClient ? "hidden lg:flex" : "flex")}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">Клиенты · {filteredClients.length}</h2>
              {!showNewForm && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
                  <Plus className="h-3.5 w-3.5" /> Новый
                </Button>
              )}
            </div>
            <Input
              placeholder="Поиск по имени, телефону, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              {teamManagers && teamManagers.length > 1 && (
                <Select value={managerFilter} onValueChange={setManagerFilter}>
                  <SelectTrigger className="h-7 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все менеджеры</SelectItem>
                    {teamManagers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={clientStatusFilter} onValueChange={(v) => setClientStatusFilter(v as ClientStatus | "all")}>
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {CLIENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLIENT_STATUS_DOT_COLOR[status] }} />
                      {CLIENT_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-text-secondary">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                архивные
              </label>
            </div>
          </div>

          {showNewForm && (
            <form onSubmit={handleCreate} className="space-y-2 border-b border-border p-3">
              <p className="text-xs font-semibold text-text-secondary">Новый клиент</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewClientSelfSourced(false)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    !newClientSelfSourced ? "border-error/40 bg-error/10 text-error" : "border-border text-text-secondary hover:border-error/30",
                  )}
                >
                  Клиент компании
                </button>
                <button
                  type="button"
                  onClick={() => setNewClientSelfSourced(true)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    newClientSelfSourced ? "border-success/40 bg-success/10 text-success" : "border-border text-text-secondary hover:border-success/30",
                  )}
                >
                  Мой личный клиент
                </button>
              </div>
              <div className="space-y-2">
                <Input placeholder="Имя клиента" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input placeholder="Компания (необязательно)" value={company} onChange={(e) => setCompany(e.target.value)} />
                <Input
                  placeholder="+7 (___) ___-__-__ (необязательно)"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneMask(e.target.value, phone))}
                />
                <Input placeholder="Telegram / WeChat" value={messenger} onChange={(e) => setMessenger(e.target.value)} />
                <Input type="email" placeholder="Email (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-xs text-error">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-2 lg:min-h-0">
            {loading ? (
              <p className="p-2 text-sm text-text-secondary">Загрузка…</p>
            ) : clients.length === 0 ? (
              <EmptyState icon={UserRound} message="Клиентов пока нет — добавьте первого кнопкой выше." />
            ) : filteredClients.length === 0 ? (
              <EmptyState icon={UserRound} message="Ничего не найдено — измените поиск или фильтр." />
            ) : (
              <div className="space-y-1">
                {filteredClients.map((client) => {
                  const isSelected = selectedClientId === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                        isSelected ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-bg",
                        client.archivedAt && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          client.selfSourcedClaimed ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
                        )}
                        title={client.selfSourcedClaimed ? "Свой клиент" : "Клиент компании"}
                      >
                        {client.name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-text">
                          <span className="text-text-secondary">№{outsourceClientNumbers?.[client.id] ?? client.displayId}</span> {client.name}
                        </div>
                        {client.company && (
                          <div className="truncate text-[11px] text-text-secondary">{client.company}</div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span
                            className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", CLIENT_STATUS_BADGE_CLASSES[client.status])}
                          >
                            {CLIENT_STATUS_LABEL[client.status]}
                          </span>
                          {newRequestCounts[client.id] > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              <Inbox className="h-3 w-3" /> {newRequestCounts[client.id]}
                            </span>
                          )}
                          {draftCounts[client.id] > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                              <AlertTriangle className="h-3 w-3" /> {draftCounts[client.id]}
                            </span>
                          )}
                          {needsReplacementCounts[client.id] > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-error/15 px-1.5 py-0.5 text-[10px] font-semibold text-error">
                              <AlertTriangle className="h-3 w-3" /> {needsReplacementCounts[client.id]}
                            </span>
                          )}
                          {client.vladShareRatePercentOverride !== null && client.vladShareRatePercentOverride !== undefined && (
                            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                              Влад: {client.vladShareRatePercentOverride}%
                            </span>
                          )}
                          {client.archivedAt && <span className="text-[10px] font-medium text-error">архив</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: selected client's details + quotes — hidden on mobile
            until a client is actually picked, so there's no empty-state
            block sitting under the full client list requiring a scroll
            past it. See PB-V5 chat 2026-08-05. */}
        <div className={cn("min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-bg p-4 lg:block lg:min-h-0", selectedClient ? "block" : "hidden lg:block")}>
          {!selectedClient ? (
            <EmptyState icon={UserRound} message="Выберите клиента слева, чтобы увидеть его данные и просчёты." />
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedClientId(null)}
                className="-ml-1 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-primary lg:hidden"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Назад к списку клиентов
              </button>
              <div>
                <h3 className="text-sm font-bold text-text">
                  <span className="text-text-secondary">№{outsourceClientNumbers?.[selectedClient.id] ?? selectedClient.displayId}</span> {selectedClient.name}
                  {selectedClient.company && <span className="text-text-secondary"> · {selectedClient.company}</span>}
                  {selectedClient.archivedAt && <span className="ml-1.5 text-xs font-normal text-error">архив</span>}
                </h3>
                <div className="text-xs text-text-secondary">
                  {selectedClient.contactsHidden ? (
                    <span className="italic">контакты скрыты</span>
                  ) : (
                    <>
                      {selectedClient.email ?? "без email"}
                      {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
                    </>
                  )}
                  {selectedClient.source ? ` · ${SOURCE_LABELS[selectedClient.source] ?? selectedClient.source}` : ""}
                </div>
              </div>

              <Select
                value={selectedClient.status}
                onValueChange={(status) => handleClientStatusChange(selectedClient.id, status)}
                disabled={changingClientStatusId === selectedClient.id}
              >
                <SelectTrigger
                  className={cn(
                    "h-7 w-fit rounded-full border-0 text-xs font-medium",
                    CLIENT_STATUS_BADGE_CLASSES[selectedClient.status],
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLIENT_STATUS_DOT_COLOR[status] }} />
                      {CLIENT_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {allManagers && (
                <p className="text-xs text-text-secondary">
                  Сейчас у менеджера: <span className="font-medium text-text">{selectedClient.createdByManager?.name ?? "—"}</span>
                </p>
              )}
              {teamManagers ? (
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={!selectedClient.contactsHiddenFromManager}
                    disabled={contactsToggleBusyId === selectedClient.id}
                    onChange={(e) => handleToggleContactsHidden(selectedClient.id, !e.target.checked)}
                  />
                  Показывать контакты менеджеру
                  {contactsToggleBusyId === selectedClient.id && <Loader2 className="h-3 w-3 animate-spin" />}
                </label>
              ) : (
                selectedClient.contactsHidden && (
                  <p className="text-xs text-text-secondary">
                    Контакты скрыты старшим менеджером или руководителем.
                  </p>
                )
              )}
              {allManagers && (
                <label className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                  Доля Влада для этого клиента, % (пусто — обычная ставка из «Настроек»):
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    placeholder="—"
                    value={vladShareDrafts[selectedClient.id] ?? selectedClient.vladShareRatePercentOverride ?? ""}
                    onChange={(e) => setVladShareDrafts((c) => ({ ...c, [selectedClient.id]: e.target.value }))}
                    onBlur={() => handleSaveVladShareOverride(selectedClient.id, selectedClient.vladShareRatePercentOverride)}
                    disabled={vladShareBusyId === selectedClient.id}
                    className="h-7 w-20 px-1.5 text-sm"
                  />
                  {vladShareBusyId === selectedClient.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  {selectedClient.vladShareRatePercentOverride !== null && selectedClient.vladShareRatePercentOverride !== undefined && (
                    <span className="font-medium text-warning">переопределено</span>
                  )}
                </label>
              )}
              {selectedClient.selfSourcedConfirmed ? (
                <p className="text-xs font-medium text-success">✓ Личный клиент менеджера — повышенная премия с даты подтверждения</p>
              ) : selectedClient.selfSourcedClaimed ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-warning">
                  Заявлен как личный, ждёт подтверждения
                  {canConfirmBuyout && (
                    <button
                      type="button"
                      onClick={() => handleConfirmSelfSourced(selectedClient.id)}
                      disabled={selfSourcedBusyId === selectedClient.id}
                      className="rounded-lg border border-border bg-bg px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
                    >
                      {selfSourcedBusyId === selectedClient.id && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                      Подтвердить
                    </button>
                  )}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => handleClaimSelfSourced(selectedClient.id)}
                  disabled={selfSourcedBusyId === selectedClient.id}
                  className="text-xs font-medium text-text-secondary underline decoration-dotted underline-offset-2 transition-colors hover:text-primary disabled:opacity-50"
                >
                  {selfSourcedBusyId === selectedClient.id && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                  Заявить как личного клиента (повышенная премия)
                </button>
              )}
              {selfSourcedError && <p className="text-xs text-error">{selfSourcedError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => startEditing(selectedClient)}>
                    <Pencil className="h-3.5 w-3.5" /> Редактировать
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleArchive(selectedClient)}
                    disabled={archivingId === selectedClient.id}
                  >
                    {archivingId === selectedClient.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : selectedClient.archivedAt ? (
                      "Из архива"
                    ) : (
                      "В архив"
                    )}
                  </Button>
                  {teamManagers && (
                    <Select
                      value=""
                      onValueChange={(managerId) => handleTransfer(selectedClient.id, managerId)}
                      disabled={transferringClientId === selectedClient.id}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="Передать менеджеру" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamManagers
                          .filter((m) => m.id !== selectedClient.createdByManagerId)
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button type="button" size="sm" onClick={() => setQuoteDialogClientId(selectedClient.id)}>
                  Сформировать просчёт
                </Button>
              </div>

              {editingClientId === selectedClient.id && (
                <div className="space-y-2 rounded-lg bg-surface p-3">
                  <p className="text-xs font-semibold text-text-secondary">Редактирование клиента</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Имя клиента"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                    <Input
                      placeholder="Компания"
                      value={editDraft.company}
                      onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))}
                    />
                    {selectedClient.contactsHidden ? (
                      <p className="text-xs text-text-secondary sm:col-span-2">
                        Телефон, Telegram/WeChat и email скрыты — недоступны для редактирования.
                      </p>
                    ) : (
                      <>
                        <Input
                          placeholder="+7 (___) ___-__-__"
                          value={editDraft.phone}
                          onChange={(e) => setEditDraft((d) => ({ ...d, phone: formatPhoneMask(e.target.value, d.phone) }))}
                        />
                        <Input
                          placeholder="Telegram / WeChat"
                          value={editDraft.messenger}
                          onChange={(e) => setEditDraft((d) => ({ ...d, messenger: e.target.value }))}
                        />
                        <Input
                          type="email"
                          placeholder="Email (необязательно)"
                          value={editDraft.email}
                          onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                        />
                      </>
                    )}
                    <Select value={editDraft.source} onValueChange={(v) => setEditDraft((d) => ({ ...d, source: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editError && <p className="text-xs text-error">{editError}</p>}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => handleSaveEdit(selectedClient.id)} disabled={editSaving}>
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingClientId(null)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <ClientDraftRequests clientId={selectedClient.id} refreshKey={quotesRefreshKey} onChange={loadDraftCounts} />
                </div>
                <div className="min-w-0 flex-1">
                  <ClientFilesPanel clientId={selectedClient.id} />
                </div>
              </div>

              <ClientQuotes
                clientId={selectedClient.id}
                refreshKey={quotesRefreshKey}
                allManagers={allManagers}
                teamManagers={teamManagers}
                canConfirmBuyout={canConfirmBuyout}
                paymentAccounts={paymentAccounts}
                clientSelfSourcedConfirmed={selectedClient.selfSourcedConfirmed}
                clientCreatedByManagerId={selectedClient.createdByManagerId}
                onEdit={(quoteId) => {
                  setQuoteDialogClientId(selectedClient.id);
                  setEditingQuoteId(quoteId);
                }}
                onChanged={() => setQuotesRefreshKey((key) => key + 1)}
              />
            </div>
          )}
        </div>
      </div>

      {quoteDialogClient && (
        <QuoteDialog
          client={quoteDialogClient}
          open
          editingQuoteId={editingQuoteId}
          onOpenChange={(open) => {
            if (!open) {
              setQuoteDialogClientId(null);
              setEditingQuoteId(null);
            }
          }}
          onSaved={() => setQuotesRefreshKey((key) => key + 1)}
        />
      )}
    </div>
  );
}

export { ManagerClientsTab, ClientQuotes };
