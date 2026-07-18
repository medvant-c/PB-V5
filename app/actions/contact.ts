"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import type { ContactFormState } from "@/app/actions/contact-types";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s()-]{6,}$/;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Введите имя"),
  company: z.string().trim().optional(),
  contact: z
    .string()
    .trim()
    .min(1, "Введите email или телефон")
    .refine((value) => EMAIL_RE.test(value) || PHONE_RE.test(value), {
      message: "Введите корректный email или телефон",
    }),
  message: z.string().trim().optional(),
});

const GENERIC_FAILURE_MESSAGE =
  "Не удалось отправить сообщение. Попробуйте написать нам в Telegram или WhatsApp — контакты выше.";

async function submitContactForm(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = {
    name: formData.get("name")?.toString() ?? "",
    company: formData.get("company")?.toString() ?? "",
    contact: formData.get("contact")?.toString() ?? "",
    message: formData.get("message")?.toString() ?? "",
  };

  const forwardedFor = (await headers()).get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return {
      status: "error",
      message: "Слишком много попыток. Подождите немного и попробуйте снова.",
      values,
    };
  }

  const parsed = contactSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте поля формы.",
      errors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const { name, company, contact, message } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_EMAIL_TO;
  if (!apiKey || !toEmail) {
    console.error("Contact form: RESEND_API_KEY or CONTACT_EMAIL_TO is not configured.");
    return { status: "error", message: GENERIC_FAILURE_MESSAGE, values };
  }

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: process.env.CONTACT_EMAIL_FROM ?? "Panda Bridge <onboarding@resend.dev>",
      to: toEmail,
      replyTo: EMAIL_RE.test(contact) ? contact : undefined,
      subject: `Новая заявка с сайта — ${name}`,
      text: [
        `Имя: ${name}`,
        company ? `Компания: ${company}` : null,
        `Контакт: ${contact}`,
        message ? `Сообщение:\n${message}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    if (error) {
      console.error("Resend error:", error);
      return { status: "error", message: GENERIC_FAILURE_MESSAGE, values };
    }
  } catch (error) {
    console.error("Contact form send failed:", error);
    return { status: "error", message: GENERIC_FAILURE_MESSAGE, values };
  }

  return { status: "success", message: "Спасибо! Мы свяжемся с вами в ближайшее время." };
}

export { submitContactForm };
