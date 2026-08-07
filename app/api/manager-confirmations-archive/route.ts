import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds, getTeamManagers } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Owner/senior only, same gate as /api/manager-confirmations — the
// "already handled" counterpart to that pending queue. Replaces the old
// buyout-only /api/manager-buyout-archive: every confirmation type the
// pending queue tracks (buyout fact, manual cargo rate, manual ¥→₽ rate,
// self-sourced client) lands in ONE combined, filterable list instead of
// four separate archives — see PB-V5 chat 2026-07-30 ("зачем велосипед
// изобретать"). Each entry carries a `type` discriminator and a plain-text
// `summary` instead of forcing every type's very different fields into
// shared table columns.
type ArchiveEntryType = "buyout" | "cargo_rate" | "cny_rate" | "usd_rate" | "buyout_commission" | "self_sourced_client";

interface ArchiveEntry {
  type: ArchiveEntryType;
  id: string;
  displayId: number;
  label: string;
  summary: string;
  confirmedAt: string;
  confirmedByManagerName: string | null;
  manager: { id: string; name: string };
  client: { id: string; name: string; company: string | null };
  // The proof screenshot uploaded at confirm time, if any (it's optional —
  // see confirm-cargo-rate/confirm-cny-rate routes). Served by
  // /api/manager-quote-rate-proof/[id]. null for types that never had one
  // (buyout, self_sourced_client) or where none was attached.
  proofFileId: string | null;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ru-RU") : "—";
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const managerScopeFilter = visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } };
  const clientManagerScopeFilter = visibleManagerIds === "all" ? {} : { createdByManagerId: { in: visibleManagerIds } };

  const typeParam = req.nextUrl.searchParams.get("type") as ArchiveEntryType | "all" | null;
  const managerIdParam = req.nextUrl.searchParams.get("managerId");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const dateFromParam = req.nextUrl.searchParams.get("dateFrom");
  const dateToParam = req.nextUrl.searchParams.get("dateTo");

  const dateFrom = dateFromParam ? new Date(dateFromParam) : null;
  const dateTo = dateToParam ? new Date(dateToParam) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const dateFilter = (field: string) =>
    dateFrom || dateTo ? { [field]: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {};

  const wantType = (t: ArchiveEntryType) => !typeParam || typeParam === "all" || typeParam === t;

  const [buyouts, cargoRates, cnyRates, usdRates, buyoutCommissions, selfSourcedClients] = await Promise.all([
    wantType("buyout")
      ? prisma.quote.findMany({
          where: {
            deletedAt: null,
            buyoutFactConfirmed: true,
            ...managerScopeFilter,
            ...(managerIdParam ? { managerId: managerIdParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
            ...dateFilter("buyoutConfirmedAt"),
          },
          orderBy: { buyoutConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            productName: true,
            actualBuyoutCny: true,
            actualBuyoutRateUsed: true,
            actualClientPaymentRub: true,
            buyoutConfirmedAt: true,
            buyoutConfirmedByManagerId: true,
            manager: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        })
      : Promise.resolve([]),
    wantType("cargo_rate")
      ? prisma.quote.findMany({
          where: {
            deletedAt: null,
            cargoRateUsdOverride: { not: null },
            cargoRateOverrideConfirmed: true,
            ...managerScopeFilter,
            ...(managerIdParam ? { managerId: managerIdParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
            ...dateFilter("cargoRateOverrideConfirmedAt"),
          },
          orderBy: { cargoRateOverrideConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            productName: true,
            cargoRateUsdOverride: true,
            cargoRateOverrideCostUsd: true,
            deliveryPricingMode: true,
            cargoRateOverrideConfirmedAt: true,
            cargoRateOverrideConfirmedByManagerId: true,
            manager: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        })
      : Promise.resolve([]),
    wantType("cny_rate")
      ? prisma.quote.findMany({
          where: {
            deletedAt: null,
            cnyRateRubOverride: { not: null },
            cnyRateOverrideConfirmed: true,
            ...managerScopeFilter,
            ...(managerIdParam ? { managerId: managerIdParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
            ...dateFilter("cnyRateOverrideConfirmedAt"),
          },
          orderBy: { cnyRateOverrideConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            productName: true,
            cnyRateRubOverride: true,
            cnyRateOverrideConfirmedAt: true,
            cnyRateOverrideConfirmedByManagerId: true,
            manager: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        })
      : Promise.resolve([]),
    wantType("usd_rate")
      ? prisma.quote.findMany({
          where: {
            deletedAt: null,
            usdRateRubOverride: { not: null },
            usdRateOverrideConfirmed: true,
            ...managerScopeFilter,
            ...(managerIdParam ? { managerId: managerIdParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
            ...dateFilter("usdRateOverrideConfirmedAt"),
          },
          orderBy: { usdRateOverrideConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            productName: true,
            usdRateRubOverride: true,
            usdRateOverrideConfirmedAt: true,
            usdRateOverrideConfirmedByManagerId: true,
            manager: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        })
      : Promise.resolve([]),
    wantType("buyout_commission")
      ? prisma.quote.findMany({
          where: {
            deletedAt: null,
            buyoutCommissionPercentOverride: { not: null },
            buyoutCommissionOverrideConfirmed: true,
            ...managerScopeFilter,
            ...(managerIdParam ? { managerId: managerIdParam } : {}),
            ...(clientIdParam ? { clientId: clientIdParam } : {}),
            ...dateFilter("buyoutCommissionOverrideConfirmedAt"),
          },
          orderBy: { buyoutCommissionOverrideConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            productName: true,
            buyoutCommissionPercentOverride: true,
            buyoutCommissionOverrideConfirmedAt: true,
            buyoutCommissionOverrideConfirmedByManagerId: true,
            manager: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, company: true } },
          },
        })
      : Promise.resolve([]),
    wantType("self_sourced_client")
      ? prisma.client.findMany({
          where: {
            selfSourcedConfirmed: true,
            ...clientManagerScopeFilter,
            ...(managerIdParam ? { createdByManagerId: managerIdParam } : {}),
            ...(clientIdParam ? { id: clientIdParam } : {}),
            ...dateFilter("selfSourcedConfirmedAt"),
          },
          orderBy: { selfSourcedConfirmedAt: "desc" },
          select: {
            id: true,
            displayId: true,
            name: true,
            company: true,
            selfSourcedConfirmedAt: true,
            selfSourcedConfirmedByManagerId: true,
            createdByManager: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Every *ConfirmedByManagerId is a plain string field, no Prisma relation
  // (see prisma/schema.prisma) — resolved with one batch lookup instead of
  // an include per type.
  const confirmedByIds = [
    ...new Set(
      [
        ...buyouts.map((b) => b.buyoutConfirmedByManagerId),
        ...cargoRates.map((q) => q.cargoRateOverrideConfirmedByManagerId),
        ...cnyRates.map((q) => q.cnyRateOverrideConfirmedByManagerId),
        ...usdRates.map((q) => q.usdRateOverrideConfirmedByManagerId),
        ...buyoutCommissions.map((q) => q.buyoutCommissionOverrideConfirmedByManagerId),
        ...selfSourcedClients.map((c) => c.selfSourcedConfirmedByManagerId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const confirmedByManagers = confirmedByIds.length
    ? await prisma.manager.findMany({ where: { id: { in: confirmedByIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(confirmedByManagers.map((m) => [m.id, m.name]));

  // Proof screenshots are optional (see confirm-cargo-rate/confirm-cny-rate
  // routes) — one batch DeskFile query for both tabs rather than N+1, keyed
  // by "tab:relatedId" and keeping only the newest upload per quote in case
  // it was re-confirmed more than once.
  const proofFiles = await prisma.deskFile.findMany({
    where: {
      tab: { in: ["quote_cargo_rate_proof", "quote_cny_rate_proof", "quote_usd_rate_proof", "quote_buyout_commission_proof"] },
      relatedId: {
        in: [...cargoRates.map((q) => q.id), ...cnyRates.map((q) => q.id), ...usdRates.map((q) => q.id), ...buyoutCommissions.map((q) => q.id)],
      },
    },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, tab: true, relatedId: true },
  });
  const proofFileIdByKey = new Map<string, string>();
  for (const file of proofFiles) {
    const key = `${file.tab}:${file.relatedId}`;
    if (!proofFileIdByKey.has(key)) proofFileIdByKey.set(key, file.id);
  }

  const entries: ArchiveEntry[] = [
    ...buyouts.map((b): ArchiveEntry => ({
      type: "buyout",
      id: b.id,
      displayId: b.displayId,
      label: b.productName,
      summary: `Выкуп факт: ${fmt(Number(b.actualBuyoutCny))}¥ · курс ${Number(b.actualBuyoutRateUsed).toFixed(2)} · оплата ${fmt(Number(b.actualClientPaymentRub))}₽`,
      confirmedAt: b.buyoutConfirmedAt!.toISOString(),
      confirmedByManagerName: b.buyoutConfirmedByManagerId ? (nameById.get(b.buyoutConfirmedByManagerId) ?? null) : null,
      manager: b.manager,
      client: b.client,
      proofFileId: null,
    })),
    ...cargoRates.map((q): ArchiveEntry => {
      const unit = q.deliveryPricingMode === "density" ? "кг" : "м³";
      return {
        type: "cargo_rate",
        id: q.id,
        displayId: q.displayId,
        label: q.productName,
        summary: `Ставка: $${Number(q.cargoRateUsdOverride).toFixed(2)}/${unit} · закупка: $${q.cargoRateOverrideCostUsd !== null ? Number(q.cargoRateOverrideCostUsd).toFixed(2) : "—"}/${unit}`,
        confirmedAt: q.cargoRateOverrideConfirmedAt!.toISOString(),
        confirmedByManagerName: q.cargoRateOverrideConfirmedByManagerId ? (nameById.get(q.cargoRateOverrideConfirmedByManagerId) ?? null) : null,
        manager: q.manager,
        client: q.client,
        proofFileId: proofFileIdByKey.get(`quote_cargo_rate_proof:${q.id}`) ?? null,
      };
    }),
    ...cnyRates.map((q): ArchiveEntry => ({
      type: "cny_rate",
      id: q.id,
      displayId: q.displayId,
      label: q.productName,
      summary: `Курс: 1¥ = ${Number(q.cnyRateRubOverride).toFixed(2)}₽`,
      confirmedAt: q.cnyRateOverrideConfirmedAt!.toISOString(),
      confirmedByManagerName: q.cnyRateOverrideConfirmedByManagerId ? (nameById.get(q.cnyRateOverrideConfirmedByManagerId) ?? null) : null,
      manager: q.manager,
      client: q.client,
      proofFileId: proofFileIdByKey.get(`quote_cny_rate_proof:${q.id}`) ?? null,
    })),
    ...usdRates.map((q): ArchiveEntry => ({
      type: "usd_rate",
      id: q.id,
      displayId: q.displayId,
      label: q.productName,
      summary: `Курс: 1$ = ${Number(q.usdRateRubOverride).toFixed(2)}₽`,
      confirmedAt: q.usdRateOverrideConfirmedAt!.toISOString(),
      confirmedByManagerName: q.usdRateOverrideConfirmedByManagerId ? (nameById.get(q.usdRateOverrideConfirmedByManagerId) ?? null) : null,
      manager: q.manager,
      client: q.client,
      proofFileId: proofFileIdByKey.get(`quote_usd_rate_proof:${q.id}`) ?? null,
    })),
    ...buyoutCommissions.map((q): ArchiveEntry => ({
      type: "buyout_commission",
      id: q.id,
      displayId: q.displayId,
      label: q.productName,
      summary: `Комиссия: ${Number(q.buyoutCommissionPercentOverride).toFixed(2)}%`,
      confirmedAt: q.buyoutCommissionOverrideConfirmedAt!.toISOString(),
      confirmedByManagerName: q.buyoutCommissionOverrideConfirmedByManagerId
        ? (nameById.get(q.buyoutCommissionOverrideConfirmedByManagerId) ?? null)
        : null,
      manager: q.manager,
      client: q.client,
      proofFileId: proofFileIdByKey.get(`quote_buyout_commission_proof:${q.id}`) ?? null,
    })),
    ...selfSourcedClients.map((c): ArchiveEntry => ({
      type: "self_sourced_client",
      id: c.id,
      displayId: c.displayId,
      label: c.name,
      summary: "Личный клиент подтверждён — повышенная премия за сделки с ним.",
      confirmedAt: c.selfSourcedConfirmedAt!.toISOString(),
      confirmedByManagerName: c.selfSourcedConfirmedByManagerId ? (nameById.get(c.selfSourcedConfirmedByManagerId) ?? null) : null,
      manager: c.createdByManager ?? { id: "", name: "—" },
      client: { id: c.id, name: c.name, company: c.company },
      proofFileId: null,
    })),
  ].sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());

  // Same manager-filter dropdown source as /api/manager-confirmations —
  // owner sees everyone, senior sees themself + their own subordinates.
  const teamManagers = await getTeamManagers(session);

  return Response.json({ entries, teamManagers });
}
