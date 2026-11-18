import { useTranslations } from "@/features/marketing/model/translations";

export default function PricingFAQ() {
  const t = useTranslations("Marketing");
  const FAQ_ITEMS = [
    {
      "q": t("PricingFAQ.doINeedMarketingExperience"),
      "a": t("PricingFAQ.noBusmoraIsDesignedForArabicfirstBusinessOwnersStart")
    },
    {
      "q": t("PricingFAQ.doINeedAWebsiteToGetStarted"),
      "a": t("PricingFAQ.aWebsiteIsOptionalThePlannedSetupSupportsA")
    },
    {
      "q": t("PricingFAQ.whatLanguageCanIWorkIn"),
      "a": t("PricingFAQ.theInterfaceSupportsArabicAndEnglishContentIsPlanned")
    },
    {
      "q": t("PricingFAQ.willBusmoraPublishOrSpendWithoutMe"),
      "a": t("PricingFAQ.publishingRequiresYourApprovalOfTheExactPostDestination")
    },
    {
      "q": t("PricingFAQ.canISubscribeToday"),
      "a": t("PricingFAQ.thisPagePresentsAProductInDevelopmentPricingUsage")
    }
  ];

  return (
    <section id="faq" className="relative w-full bg-transparent px-5 pb-24 sm:px-8">
      <details className="faq-group mx-auto w-full max-w-[890px] overflow-hidden rounded-2xl border border-white/[.06] bg-cosmic-active/45">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-5 text-[15px] font-medium text-white marker:hidden sm:px-8 sm:text-lg">{t("PricingFAQ.questionsAboutBusmora")}<span className="faq-chevron ml-5 text-xl text-stage-muted transition-transform" aria-hidden="true">⌄</span>
        </summary>
        <div className="px-5 pb-5 sm:px-8">
          {FAQ_ITEMS.map((item, index) => (
            <details key={item.q} name="pricing-faq" open={index === 0} className="faq-item border-t border-white/10 py-1">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 py-4 text-[15px] leading-relaxed text-white/90 marker:hidden sm:text-[17px]">
                <span><span className="mr-2 text-purple-focus">?</span>{item.q}</span>
                <span className="faq-plus relative mt-2 h-3 w-3 shrink-0" aria-hidden="true" />
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-stage-muted">
                <span className="mr-2 text-purple-focus">↳</span>{item.a}
              </p>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}
