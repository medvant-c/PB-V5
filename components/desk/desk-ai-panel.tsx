"use client";

import { Bot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatTab } from "@/components/desk/tabs/chat-tab";

function DeskAiPanel() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Открыть Panda AI"
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        >
          <Bot className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
              <Bot className="h-4 w-4" />
            </span>
            <SheetTitle>Panda AI</SheetTitle>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <ChatTab />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { DeskAiPanel };
