"use client";

import { Toaster } from "sonner";
import { I18nProvider } from "@/i18n";
import { SessionProvider } from "@/lib/session";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SessionProvider>
        <AssistantProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AssistantProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border-jm-line !font-sans !text-[14px] !shadow-[0_8px_30px_rgba(22,33,27,0.10)]",
              success: "[&_[data-icon]]:!text-jm-green",
            },
          }}
        />
      </SessionProvider>
    </I18nProvider>
  );
}
