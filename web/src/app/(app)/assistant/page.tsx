"use client";

import Link from "next/link";
import { Library } from "lucide-react";
import { useI18n } from "@/i18n";
import { Btn } from "@/components/shared/button";
import { PageHeader } from "@/components/shell/page-header";
import { Chat } from "@/components/assistant/chat";

export default function AssistantPage() {
  const { t } = useI18n();
  return (
    <div className="stack">
      <PageHeader
        title={t.assistant.title}
        subtitle={t.assistant.subtitle}
        inlineSubtitle={false}
        actions={
          <Btn variant="outline" size="sm" asChild>
            <Link href="/assistant/kb">
              <Library /> {t.assistant.kbTitle}
            </Link>
          </Btn>
        }
      />
      <Chat />
    </div>
  );
}
