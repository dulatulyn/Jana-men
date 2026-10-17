"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { LogoMark } from "@/components/brand/logo";
import { Chat } from "./chat";
import { useAssistant } from "./assistant-context";

export function AssistantDock({ label, icon }: { label: string; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { messages, reset } = useAssistant();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-8 bottom-8 z-30 hidden h-[52px] items-center gap-2 rounded-full bg-jm-green pr-6 pl-5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(27,137,24,0.55)] transition-transform hover:-translate-y-0.5 lg:flex [&_svg]:size-5"
      >
        {icon}
        {label}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 border-0 bg-white p-0 sm:max-w-[460px]">
          <div className="flex h-(--header-h) shrink-0 items-center gap-3 border-b border-jm-line px-5 pr-14">
            <LogoMark size={28} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[15px] font-semibold">{t.assistant.title}</SheetTitle>
              <SheetDescription className="truncate text-[12px] text-jm-muted">{t.assistant.dockHint}</SheetDescription>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-jm-muted transition-colors hover:bg-jm-page hover:text-jm-green"
              >
                <RotateCcw className="size-3.5" /> {t.assistant.newChat}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <Chat variant="dock" onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
