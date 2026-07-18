"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Bot, Check, Copy, ImagePlus, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnalysisMetric {
  label: string;
  value: string;
}

interface Analysis {
  points: string[];
  metrics?: AnalysisMetric[];
  note?: string;
}

interface ProductAnalysis {
  product_name: string;
  seasonality: string;
  worth_selling: string;
  worth_selling_reason: string;
  risks: string[];
  potential_earnings: string;
  competition: string;
  promotion_tips: string[];
  listing_description: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
  analysis?: Analysis;
  productAnalysis?: ProductAnalysis;
  limitReached?: boolean;
}

const GREETING: Message = {
  role: "assistant",
  content:
    "Привет! Я Panda AI. Спросите меня о запуске бизнеса с Китаем, поиске товара, сезонности спроса, логистике, попросите составить письмо фабрике, КП или описание товара — или прикрепите фото товара, и я его разберу.",
};

const SUGGESTED_PROMPTS = [
  "Какой товар лучше продавать в этом сезоне?",
  "Составь письмо фабрике с запросом цены",
  "Напиши описание товара для карточки на маркетплейсе",
  "С чего начать бизнес с Китаем?",
];

const TRIAL_LIMIT = 3;
const TRIAL_STORAGE_KEY = "panda-ai-trial-count";
const ACCESS_CODE_STORAGE_KEY = "panda-ai-access-code";
const TRIAL_LIMIT_MESSAGE =
  "Вы использовали все вопросы тестовой версии Panda AI (лимит — 3 вопроса). " +
  "Чтобы получить полноценный доступ к AI для вашего бизнеса — свяжитесь с нами, и мы откроем доступ.";
const ACCESS_CODE_INVALID_MESSAGE =
  "Этот код доступа больше не действителен. Свяжитесь с нами, чтобы получить новый.";

const FREE_MESSAGE_MAX_LENGTH = 1000;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const RESIZED_MAX_DIMENSION = 1280;
const RESIZED_QUALITY = 0.82;

const WORTH_SELLING_STYLES: Record<string, string> = {
  "стоит": "bg-success/10 text-success",
  "рискованно": "bg-error/10 text-error",
  "требует доработки": "bg-warning/10 text-warning",
};

function readStoredQuestionsUsed(): number {
  if (typeof window === "undefined") return 0;
  const stored = Number(window.localStorage.getItem(TRIAL_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

function readStoredAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY) || null;
}

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > RESIZED_MAX_DIMENSION || height > RESIZED_MAX_DIMENSION) {
          const scale = RESIZED_MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", RESIZED_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function PandaAiChat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuestionsUsed(readStoredQuestionsUsed());
    setAccessCode(readStoredAccessCode());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function recordQuestionUsed() {
    setQuestionsUsed((current) => {
      const next = current + 1;
      window.localStorage.setItem(TRIAL_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function redeemCode() {
    const trimmed = codeInput.trim();
    if (!trimmed || verifyingCode) return;
    setVerifyingCode(true);
    setCodeError(null);

    try {
      const res = await fetch("/api/panda-ai/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();

      if (data.valid) {
        window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, trimmed);
        setAccessCode(trimmed);
        setShowCodeForm(false);
        setCodeInput("");
      } else {
        setCodeError(data.error ?? "Неверный код доступа.");
      }
    } catch {
      setCodeError("Не удалось проверить код. Попробуйте позже.");
    } finally {
      setVerifyingCode(false);
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImageError(null);

    if (!file.type.startsWith("image/")) {
      setImageError("Можно прикрепить только изображение.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setImageError("Файл слишком большой (максимум 20MB).");
      return;
    }

    setAttachingImage(true);
    try {
      const resized = await resizeImageFile(file);
      setPendingImage(resized);
    } catch {
      setImageError("Не удалось обработать изображение. Попробуйте другое фото.");
    } finally {
      setAttachingImage(false);
    }
  }

  async function sendMessage(overrideText?: string) {
    const trimmed = (overrideText ?? input).trim();
    const imageToSend = pendingImage;
    if (!trimmed && !imageToSend) return;
    if (loading) return;

    if (!accessCode && questionsUsed >= TRIAL_LIMIT) {
      setMessages((current) => [
        ...current,
        { role: "user", content: trimmed, image: imageToSend ?? undefined },
        { role: "assistant", content: TRIAL_LIMIT_MESSAGE, limitReached: true },
      ]);
      setInput("");
      setPendingImage(null);
      return;
    }

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed, image: imageToSend ?? undefined },
    ];
    setMessages(nextMessages);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/panda-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, accessCode }),
      });
      const data = await res.json();

      if (res.ok && data.reply) {
        if (!accessCode) recordQuestionUsed();
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: data.reply,
            analysis: data.analysis,
            productAnalysis: data.productAnalysis,
          },
        ]);
      } else if (data.limitReached) {
        if (accessCode) {
          window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
          setAccessCode(null);
          setQuestionsUsed(TRIAL_LIMIT);
          window.localStorage.setItem(TRIAL_STORAGE_KEY, String(TRIAL_LIMIT));
          setMessages([
            ...nextMessages,
            { role: "assistant", content: ACCESS_CODE_INVALID_MESSAGE, limitReached: true },
          ]);
        } else {
          setQuestionsUsed(TRIAL_LIMIT);
          window.localStorage.setItem(TRIAL_STORAGE_KEY, String(TRIAL_LIMIT));
          setMessages([...nextMessages, { role: "assistant", content: TRIAL_LIMIT_MESSAGE, limitReached: true }]);
        }
      } else {
        setError(data.error ?? "Что-то пошло не так. Попробуйте ещё раз.");
      }
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(content: string, key: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // Clipboard permission denied or unavailable — nothing to recover into,
      // just avoid an unhandled rejection.
    }
  }

  const limitReached = !accessCode && questionsUsed >= TRIAL_LIMIT;

  return (
    <Card className="flex flex-col p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-bold text-text">Panda AI</div>
          <div className="text-xs text-text-secondary">
            {accessCode
              ? "Полный доступ активен"
              : limitReached
                ? "Тестовая версия · лимит вопросов исчерпан"
                : `Тестовая версия · осталось вопросов: ${TRIAL_LIMIT - questionsUsed}/${TRIAL_LIMIT}`}
          </div>
        </div>
      </div>

      {!accessCode && (
        <div className="mt-3">
          {showCodeForm ? (
            <div className="flex items-center gap-2">
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && redeemCode()}
                placeholder="Код доступа"
                aria-label="Код доступа"
                className="flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={redeemCode}
                disabled={verifyingCode || !codeInput.trim()}
                className="shrink-0 rounded-full bg-gradient-to-r from-primary to-secondary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {verifyingCode ? "Проверка…" : "Применить"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCodeForm(false);
                  setCodeError(null);
                  setCodeInput("");
                }}
                aria-label="Отменить ввод кода"
                className="shrink-0 text-xs text-text-secondary hover:text-text"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCodeForm(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Есть код доступа?
            </button>
          )}
          {codeError && <p className="mt-1.5 text-xs text-error">{codeError}</p>}
        </div>
      )}

      <div ref={scrollRef} className="mt-6 flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                message.role === "user"
                  ? "rounded-tr-sm bg-black/5 text-text"
                  : "rounded-tl-sm border border-primary/15 bg-primary/5 text-text",
              )}
            >
              {message.role === "assistant" ? (
                <>
                  {message.limitReached ? (
                    <div>
                      <p>{message.content}</p>
                      <Link
                        href="/contacts"
                        className={cn(buttonVariants({ variant: "primary" }), "mt-3")}
                      >
                        Связаться с нами <Send className="h-4 w-4" />
                      </Link>
                    </div>
                  ) : message.productAnalysis ? (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        Анализ товара по фото
                      </div>
                      <div className="mt-2 text-sm font-bold text-text">{message.productAnalysis.product_name}</div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-surface px-3 py-2.5">
                          <div className="text-[11px] text-text-secondary">Сезонность</div>
                          <div className="mt-0.5 text-sm font-bold text-text">
                            {message.productAnalysis.seasonality}
                          </div>
                        </div>
                        <div className="rounded-xl bg-surface px-3 py-2.5">
                          <div className="text-[11px] text-text-secondary">Конкуренция</div>
                          <div className="mt-0.5 text-sm font-bold text-text capitalize">
                            {message.productAnalysis.competition}
                          </div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "mt-3 rounded-xl px-3 py-2.5 text-sm",
                          WORTH_SELLING_STYLES[message.productAnalysis.worth_selling] ?? "bg-surface text-text",
                        )}
                      >
                        <span className="font-bold capitalize">{message.productAnalysis.worth_selling}: </span>
                        {message.productAnalysis.worth_selling_reason}
                      </div>

                      <div className="mt-3 rounded-xl bg-surface px-3 py-2.5">
                        <div className="text-[11px] text-text-secondary">Потенциальный доход</div>
                        <div className="mt-0.5 text-sm font-bold text-text">
                          {message.productAnalysis.potential_earnings}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-text">Риски</div>
                        <ul className="mt-1.5 space-y-1.5">
                          {message.productAnalysis.risks.map((risk) => (
                            <li key={risk} className="flex items-start gap-2 text-sm text-text">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-text">Советы по продвижению</div>
                        <ul className="mt-1.5 space-y-1.5">
                          {message.productAnalysis.promotion_tips.map((tip) => (
                            <li key={tip} className="flex items-start gap-2 text-sm text-text">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-text">Описание для карточки</div>
                          <button
                            type="button"
                            onClick={() => copyText(message.productAnalysis!.listing_description, `${index}-listing`)}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-primary"
                          >
                            {copiedKey === `${index}-listing` ? (
                              <>
                                <Check className="h-3.5 w-3.5" /> Скопировано
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" /> Скопировать
                              </>
                            )}
                          </button>
                        </div>
                        <p className="mt-1.5 rounded-xl bg-surface px-3 py-2.5 text-sm text-text">
                          {message.productAnalysis.listing_description}
                        </p>
                      </div>

                      <p className="mt-3 text-xs text-text-secondary">
                        Оценка по фото и общим знаниям рынка — ориентир, не гарантия продаж. Точные цифры под вашу
                        нишу уточняйте с менеджером.
                      </p>
                    </div>
                  ) : message.analysis ? (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        Panda AI отвечает
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {message.analysis.points.map((point) => (
                          <li key={point} className="flex items-center gap-2 text-sm text-text">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                            {point}
                          </li>
                        ))}
                      </ul>
                      {message.analysis.metrics && message.analysis.metrics.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {message.analysis.metrics.slice(0, 2).map((metric) => (
                            <div key={metric.label} className="rounded-xl bg-surface px-3 py-2.5">
                              <div className="text-[11px] text-text-secondary">{metric.label}</div>
                              <div className="mt-0.5 text-sm font-bold text-text">{metric.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.analysis.note && (
                        <p className="mt-3 text-xs text-text-secondary">{message.analysis.note}</p>
                      )}
                    </div>
                  ) : (
                    <div className="prose-chat">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                  {index > 0 && !message.limitReached && (
                    <button
                      type="button"
                      onClick={() => copyText(message.content, String(index))}
                      aria-label="Скопировать ответ"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-primary"
                    >
                      {copiedKey === String(index) ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Скопировано
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Скопировать
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div>
                  {message.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- client-side data URL preview, not a static asset
                    <img
                      src={message.image}
                      alt="Прикреплённое фото товара"
                      className="mb-2 max-h-48 rounded-lg object-cover"
                    />
                  )}
                  {message.content && <span className="whitespace-pre-wrap">{message.content}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm border border-primary/15 bg-primary/5 px-4 py-2.5 text-sm text-text-secondary">
              Печатает…
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      {!limitReached && messages.length === 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              disabled={loading}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {limitReached ? (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-text-secondary">Лимит тестовой версии исчерпан.</p>
          <Link href="/contacts" className={cn(buttonVariants({ variant: "primary" }), "shrink-0")}>
            Связаться с нами <Send className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-5 border-t border-border pt-5">
          {pendingImage && (
            <div className="mb-3 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- client-side data URL preview, not a static asset */}
              <img src={pendingImage} alt="Предпросмотр фото" className="h-14 w-14 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                aria-label="Убрать фото"
                className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-error"
              >
                <X className="h-3.5 w-3.5" /> Убрать фото
              </button>
            </div>
          )}
          {imageError && <p className="mb-2 text-xs text-error">{imageError}</p>}

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || attachingImage}
              aria-label="Прикрепить фото товара"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && sendMessage()}
              placeholder="Спросите что угодно о вашем бизнесе с Китаем"
              aria-label="Сообщение для Panda AI"
              maxLength={accessCode ? undefined : FREE_MESSAGE_MAX_LENGTH}
              className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || attachingImage || (!input.trim() && !pendingImage)}
              aria-label="Отправить сообщение"
              className={cn(buttonVariants({ variant: "primary" }), "shrink-0")}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {!accessCode && (
            <p
              className={cn(
                "mt-1.5 text-right text-[11px]",
                input.length >= FREE_MESSAGE_MAX_LENGTH ? "text-error" : "text-text-secondary",
              )}
            >
              {input.length}/{FREE_MESSAGE_MAX_LENGTH}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export { PandaAiChat };
