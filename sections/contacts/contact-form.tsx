"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-text">Отправьте нам сообщение</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Расскажите о задаче — мы предложим лучшее решение
      </p>

      {submitted ? (
        <div className="mt-6 rounded-xl bg-success/10 p-4 text-sm font-medium text-success">
          Спасибо! Мы свяжемся с вами в ближайшее время.
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="text-sm font-medium text-text">
                Ваше имя
              </label>
              <input
                id="name"
                type="text"
                required
                placeholder="Введите ваше имя"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="company" className="text-sm font-medium text-text">
                Компания
              </label>
              <input
                id="company"
                type="text"
                placeholder="Название компании"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contact" className="text-sm font-medium text-text">
              Email или телефон
            </label>
            <input
              id="contact"
              type="text"
              required
              placeholder="Введите email или телефон"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="message" className="text-sm font-medium text-text">
              Расскажите о вашем проекте
            </label>
            <textarea
              id="message"
              rows={4}
              placeholder="Опишите вашу задачу или проект"
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <Button type="submit" variant="primary" className="w-full">
            Отправить сообщение <Send className="h-4 w-4" />
          </Button>

          <p className="text-center text-xs text-text-secondary">
            Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
          </p>
        </form>
      )}
    </Card>
  );
}

export { ContactForm };
