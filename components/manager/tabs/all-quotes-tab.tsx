"use client";

import { useEffect, useState } from "react";
import { QuoteDialog } from "@/components/manager/quote-dialog";

// Re-exported from clients-tab.tsx rather than duplicated — ClientQuotes
// already has every bulk action (export, status, reassign, recalculate,
// duplicate, cargo bonus rate, etc.) a manager needs; this tab just runs
// it with no clientId, which switches it into "every quote visible to me,
// across every client" mode (see the `isGlobal` branches inside it) and
// surfaces the extra search/sort/date-range controls that only make sense
// at that scale. See PB-V5 chat 2026-08-01.
import { ClientQuotes } from "@/components/manager/tabs/clients-tab";

function ManagerAllQuotesTab() {
  const [allManagers, setAllManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [teamManagers, setTeamManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [canConfirmBuyout, setCanConfirmBuyout] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<{ id: string; name: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetch("/api/managers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAllManagers(data?.managers ?? null));
    fetch("/api/manager-confirmations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setCanConfirmBuyout(Boolean(data));
        setTeamManagers(data?.teamManagers ?? null);
      });
    fetch("/api/manager-payment-accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPaymentAccounts(data?.accounts ?? []));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-text">Все просчёты</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Все просчёты, закреплённые за вами{teamManagers && teamManagers.length > 1 ? " и вашей командой" : ""}, одним
          списком — те же действия, что и в карточке клиента.
        </p>
      </div>

      <ClientQuotes
        refreshKey={refreshKey}
        allManagers={allManagers}
        teamManagers={teamManagers}
        canConfirmBuyout={canConfirmBuyout}
        paymentAccounts={paymentAccounts}
        onChanged={() => setRefreshKey((k) => k + 1)}
        onEdit={(quoteId, client) => {
          setEditingQuoteId(quoteId);
          setEditingClient(client);
          setDialogOpen(true);
        }}
      />

      {editingClient && (
        <QuoteDialog
          client={editingClient}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingQuoteId(null);
              setEditingClient(null);
            }
          }}
          onSaved={() => setRefreshKey((k) => k + 1)}
          editingQuoteId={editingQuoteId}
        />
      )}
    </div>
  );
}

export { ManagerAllQuotesTab };
