"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Message = {
  role: "assistant",
  content:
    "Привет! Я Panda AI. Спросите меня о запуске бизнеса с Китаем, поиске товара, логистике или любом продукте Panda Bridge.",
};

function PandaAiChat() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/panda-ai", {
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
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="text-sm font-bold text-text">Panda AI</div>
      </div>

      <div ref={scrollRef} className="mt-6 flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                message.role === "user"
                  ? "rounded-tr-sm bg-black/5 text-text"
                  : "rounded-tl-sm border border-primary/15 bg-primary/5 text-text",
              )}
            >
              {message.content}
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

      <div className="mt-5 flex items-center gap-3 border-t border-border pt-5">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && sendMessage()}
          placeholder="Спросите что угодно о вашем бизнесе с Китаем"
          className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className={cn(buttonVariants({ variant: "primary" }), "shrink-0")}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

export { PandaAiChat };
