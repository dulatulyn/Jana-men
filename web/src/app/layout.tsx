import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-jm-sans",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
});

const mono = JetBrains_Mono({
  variable: "--font-jm-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "JanaMen · HR-платформа Jana Post",
  description: "Профиль, заявки, обучение и HR-ассистент сотрудника Jana Post в одном месте",
};

export const viewport: Viewport = {
  themeColor: "#1b8918",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-jm-page font-sans text-jm-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
