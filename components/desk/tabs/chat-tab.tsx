"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

const GREETING: Message = {
  role: "assistant",
  content: "Задайте вопрос ассистенту — например, попросите составить письмо поставщику.",
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Файл слишком большой (максимум 20MB).");
      return;
    }

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImage(reader.result as string);
        setPendingFileName(file.name);
      };
      reader.onerror = () => setError("Не удалось прочитать файл.");
      reader.readAsDataURL(file);
    } else {
      // Non-image attachments aren't parsed for content yet — the model only
      // sees the filename as context. Extend here once document parsing
      // (PDF/DOCX text extraction) is added.
      setPendingImage(null);
      setPendingFileName(file.name);
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed && !pendingFileName) return;
    if (loading) return;

    const attachmentNote = pendingFileName && !pendingImage ? ` [прикреплён файл: ${pendingFileName}]` : "";
    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed + attachmentNote, image: pendingImage ?? undefined },
    ];
    setMessages(nextMessages);
    setInput("");
    setPendingImage(null);
    setPendingFileName(null);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/desk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      } else {
        setError(data.error ?? "Что-то пошло не так. Попробуйте ещё раз.");
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <p className="mb-4 text-sm text-text-secondary">
        Рабочий ассистент менеджера. Отвечает на вопросы по услугам, письмам и расчётам.
      </p>
      <div ref={scrollRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
        {messages.map((message, index) => (
          <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                message.role === "user"
                  ? "rounded-tr-sm bg-black/5 text-text"
                  : "rounded-tl-sm border border-primary/15 bg-primary/5 text-text",
              )}
            >
              {message.image && (
                // eslint-disable-next-line @next/next/no-img-element -- client-side data URL preview, not a static asset
                <img src={message.image} alt="Прикреплённое изображение" className="mb-2 max-h-48 rounded-lg object-cover" />
              )}
              {message.role === "assistant" ? (
                <div className="prose-chat">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{message.content}</span>
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

      <div className="mt-5 border-t border-border pt-5">
        {pendingFileName && (
          <div className="mb-3 flex items-center gap-2">
            {pendingImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- client-side data URL preview, not a static asset
              <img src={pendingImage} alt="Предпросмотр" className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <span className="text-xs text-text-secondary">{pendingFileName}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setPendingImage(null);
                setPendingFileName(null);
              }}
              aria-label="Убрать файл"
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-error"
            >
              <X className="h-3.5 w-3.5" /> Убрать
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            aria-label="Прикрепить файл"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && sendMessage()}
            placeholder="Напишите сообщение…"
            aria-label="Напишите сообщение"
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || (!input.trim() && !pendingFileName)}
            aria-label="Отправить сообщение"
            className={cn(buttonVariants({ variant: "primary" }), "shrink-0")}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { ChatTab };
