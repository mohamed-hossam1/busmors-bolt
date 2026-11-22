import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../../index.css";
import { defaultLocale, getDictionary, hasLocale, locales, type Locale } from "./dictionaries";
import { dirForLocale } from "@/lib/i18n";
import { I18nProvider } from "@/context/I18nContext";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

const titles: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "BusMora — Turn business knowledge into marketing work",
    description:
      "Turn your business knowledge into research, social posts, and content plans with BusMora, your AI Marketing Director.",
  },
  ar: {
    title: "Busmora — حوّل معرفة نشاطك التجاري إلى تسويق",
    description:
      "حوّل معرفة نشاطك التجاري إلى أبحاث ومنشورات وخطط محتوى مع Busmora، مدير التسويق الذكي.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = hasLocale(lang) ? lang : defaultLocale;
  const copy = titles[locale];
  return {
    title: copy.title,
    description: copy.description,
    icons: { icon: "/brand/busmora-logo.svg" },
    openGraph: {
      title: copy.title,
      description: copy.description,
      type: "website",
    },
    twitter: { card: "summary" },
  };
}

export const viewport: Viewport = { themeColor: "#171926" };

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getDictionary(lang);
  return (
    <html lang={lang} dir={dirForLocale(lang)}>
      <body>
        <div id="root">
          <I18nProvider locale={lang} dictionary={dictionary}>
            {children}
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
