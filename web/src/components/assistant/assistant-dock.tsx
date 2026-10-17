"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { Chat } from "./chat";

export function AssistantDock({ label, icon }: { label: string; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-8 bottom-8 z-30 hidden h-[52px] items-center gap-2 rounded-full bg-jm-green pr-6 pl-5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(27,137,24,0.55)] transition-transform hover:-translate-y-0.5 lg:flex [&_svg]:size-5"
      >
        {icon}
        {label}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 border-0 bg-jm-page p-0 sm:max-w-[460px]">
          <div className="flex h-14 shrink-0 items-center border-b border-jm-line bg-white px-5">
            <SheetTitle className="text-[16px] font-semibold">{t.assistant.title}</SheetTitle>
          </div>
          <div className="min-h-0 flex-1">
            <Chat compact onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
