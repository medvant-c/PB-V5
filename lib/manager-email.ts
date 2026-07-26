import "server-only";
import { Resend } from "resend";

// Same fail-soft shape as lib/account-email.ts: a missing RESEND_API_KEY (or
// a Resend error) never blocks the flow — the activation/reset link is just
// logged to the server console instead, so the whole manager-onboarding
// flow is testable without real email.
async function sendManagerEmail(to: string, subject: string, text: string, linkForFallback: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[manager-email] RESEND_API_KEY не задан — ссылка для ${to}:\n${linkForFallback}`);
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
    if (error) console.error("Resend error (manager email):", error);
  } catch (error) {
    console.error("Manager email send failed:", error);
  }
}

async function sendManagerActivationEmail(to: string, name: string, link: string): Promise<void> {
  await sendManagerEmail(
    to,
    "Доступ в личный кабинет менеджера Panda Bridge",
    `Здравствуйте, ${name}!\n\nДля вас создан личный кабинет менеджера на /desk/manager — там вы ведёте клиентов, просчёты и видите свой KPI.\n\nЗадайте пароль по ссылке (действует 7 дней):\n${link}`,
    link,
  );
}

async function sendManagerPasswordResetEmail(to: string, link: string): Promise<void> {
  await sendManagerEmail(
    to,
    "Сброс пароля — кабинет менеджера Panda Bridge",
    `Ссылка для установки нового пароля (действует 1 час):\n${link}\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    link,
  );
}

export { sendManagerActivationEmail, sendManagerPasswordResetEmail };
