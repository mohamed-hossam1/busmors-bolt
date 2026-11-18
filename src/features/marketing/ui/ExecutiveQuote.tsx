import { useTranslations } from "@/features/marketing/model/translations";
export default function ExecutiveQuote() {
  const t = useTranslations("Marketing");
  return <section className="relative w-full bg-transparent py-20 px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
    <div className="max-w-3xl mx-auto flex flex-col items-center">
      <span dir="ltr" className="h-8 w-auto mb-8 text-2xl font-bold text-cosmic-deep">Busmora.</span>
      <blockquote className="text-xl sm:text-2xl lg:text-3xl font-semibold text-cosmic-deep leading-relaxed tracking-tight mb-8">{t("ExecutiveQuote.youKnowYourBusinessYourMarketingDirectorHelpsYou")}</blockquote>
      <div className="flex items-center gap-3"><span aria-hidden className="w-11 h-11 rounded-full border border-border bg-primary/10 flex items-center justify-center text-primary">B.</span>
        <div className="text-start"><span className="text-sm font-bold text-cosmic-deep block">{t("ExecutiveQuote.theIdeaBehindBusmora")}</span><span className="text-xs text-muted-foreground font-medium">{t("ExecutiveQuote.clarityContinuityAndOwnerControl")}</span></div>
      </div>
    </div>
  </section>;
}
