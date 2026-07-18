"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { submitContactForm } from "@/app/actions/contact";
import { contactFormInitialState } from "@/app/actions/contact-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-error" role="alert">
      {messages[0]}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending}>
      {pending ? (
        <>
          Отправляем… <Loader2 className="h-4 w-4 animate-spin" />
        </>
      ) : (
        <>
          Отправить сообщение <Send className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}

function ContactForm() {
  const [state, formAction] = useActionState(submitContactForm, contactFormInitialState);

  useEffect(() => {
    if (state.status === "error" && !state.errors) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-text">Отправьте нам сообщение</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Расскажите о задаче — мы предложим лучшее решение
      </p>

      {state.status === "success" ? (
        <div className="mt-6 rounded-xl bg-success/10 p-4 text-sm font-medium text-success" role="status">
          {state.message}
        </div>
      ) : (
        // Keyed on the returned values so a failed submission remounts the
        // inputs with the freshly echoed values as defaultValue — React
        // doesn't re-apply defaultValue to an already-mounted uncontrolled
        // input on its own.
        <form
          key={JSON.stringify(state.values ?? {})}
          className="mt-6 space-y-4"
          action={formAction}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Ваше имя</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Введите ваше имя"
                defaultValue={state.values?.name}
                className="mt-1.5"
              />
              <FieldError messages={state.errors?.name} />
            </div>
            <div>
              <Label htmlFor="company">Компания</Label>
              <Input
                id="company"
                name="company"
                type="text"
                placeholder="Название компании"
                defaultValue={state.values?.company}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="contact">Email или телефон</Label>
            <Input
              id="contact"
              name="contact"
              type="text"
              required
              placeholder="Введите email или телефон"
              defaultValue={state.values?.contact}
              className="mt-1.5"
            />
            <FieldError messages={state.errors?.contact} />
          </div>

          <div>
            <Label htmlFor="message">Расскажите о вашем проекте</Label>
            <Textarea
              id="message"
              name="message"
              rows={4}
              placeholder="Опишите вашу задачу или проект"
              defaultValue={state.values?.message}
              className="mt-1.5"
            />
          </div>

          <SubmitButton />

          <p className="text-center text-xs text-text-secondary">
            Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
          </p>
        </form>
      )}
    </Card>
  );
}

export { ContactForm };
