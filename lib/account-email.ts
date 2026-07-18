import "server-only";
import { Resend } from "resend";

// Reuses the same RESEND_API_KEY / CONTACT_EMAIL_FROM as the contact form
// (app/actions/contact.ts) and the same fail-soft philosophy: a missing key
// or a Resend error never crashes the request. Locally (no key configured
// yet), the link is just logged to the server console — the whole
// activation/reset flow can be tested end-to-end without real email.
async function sendAccountEmail(to: string, subject: string, text: string, linkForFallback: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[account-email] RESEND_API_KEY не задан — ссылка для ${to}:\n${linkForFallback}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.CONTACT_EMAIL_FROM ?? "Panda Bridge <onboarding@resend.dev>",
      to,
      subject,
      text,
    });
    if (error) console.error("Resend error (account email):", error);
  } catch (error) {
    console.error("Account email send failed:", error);
  }
}

async function sendActivationEmail(to: string, name: string, link: string): Promise<void> {
  await sendAccountEmail(
    to,
    "Доступ в личный кабинет Panda Bridge",
    `Здравствуйте, ${name}!\n\nДля вас создан личный кабинет на сайте Panda Bridge — там вы сможете отслеживать статус заказов и скачивать документы.\n\nЗадайте пароль по ссылке (действует 7 дней):\n${link}`,
    link,
  );
}

async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  await sendAccountEmail(
    to,
    "Сброс пароля — личный кабинет Panda Bridge",
    `Ссылка для установки нового пароля (действует 1 час):\n${link}\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    link,
  );
}

// Pings the manager (CONTACT_EMAIL_TO — same inbox the contact form uses,
// since there's a single recipient for the site today) when a client
// submits an order themselves via the /account cart, so they don't have to
// notice it by chance in /desk. The desk UI itself is the source of truth —
// this is just a heads-up, so a missing key/recipient only logs, never fails
// the client's checkout request.
async function sendManagerOrderNotification(clientName: string, clientEmail: string, orderTitles: string[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_EMAIL_TO;
  const subject = `Новая заявка от клиента — ${clientName}`;
  const text = `Клиент ${clientName} (${clientEmail}) оформил заявку в личном кабинете:\n\n${orderTitles.map((t) => `— ${t}`).join("\n")}\n\nОткройте вкладку «Клиенты» в /desk, чтобы посмотреть детали.`;

  if (!apiKey || !toEmail) {
    console.log(`[account-email] Уведомление менеджеру (RESEND_API_KEY/CONTACT_EMAIL_TO не заданы):\n${text}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.CONTACT_EMAIL_FROM ?? "Panda Bridge <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text,
    });
    if (error) console.error("Resend error (manager notification):", error);
  } catch (error) {
    console.error("Manager notification send failed:", error);
  }
}

export { sendActivationEmail, sendPasswordResetEmail, sendManagerOrderNotification };
