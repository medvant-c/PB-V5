import type { QuoteStatus } from "@/lib/quote-statuses";

// Plain-language, client-facing explanation of each status — deliberately
// separate from any manager-facing copy (which talks about premiums,
// confirmations, internal handoffs). A client has no context for the
// 12-step internal pipeline, so each entry answers two things: "what does
// this mean right now" and "what happens next" — see PB-V5 chat
// 2026-07-29 ("не должно быть сплошного текста... везде должны быть
// подсказки").
const CLIENT_STATUS_EXPLANATION: Record<QuoteStatus, string> = {
  new_request: "Ваша заявка получена. Менеджер скоро возьмёт её в работу и начнёт расчёт.",
  in_progress: "Менеджер уже считает стоимость, вес и сроки доставки по вашему товару.",
  pending_approval: "Расчёт готов — проверьте условия ниже и подтвердите их или напишите менеджеру, если нужен другой вариант.",
  approved_by_client: "Вы подтвердили расчёт. Дальше — оплата, и менеджер выкупит товар у поставщика.",
  needs_replacement: "Нужен другой вариант — менеджер подбирает замену по вашим комментариям.",
  rejected: "Эта заявка отклонена. Если нужен новый расчёт — отправьте новое ТЗ на просчёт.",
  awaiting_payment: "Ждём оплату — как только она пройдёт, менеджер начнёт выкуп у поставщика.",
  need_to_buyout: "Оплата получена, менеджер готовится выкупить товар у поставщика.",
  in_transit_to_warehouse: "Товар выкуплен и едет на склад в Китае.",
  delivered_to_warehouse: "Товар на складе в Китае, готовится к отправке.",
  sent_to_client: "Груз в пути к вам.",
  handed_to_client: "Заказ выполнен — товар у вас.",
};

export { CLIENT_STATUS_EXPLANATION };
