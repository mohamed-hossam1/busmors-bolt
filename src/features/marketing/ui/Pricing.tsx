
import { Link } from "@/shared/i18n";
import { useTranslations } from "@/features/marketing/model/translations";
import { useState } from "react";
import { ROUTES } from "@/shared/routes";
import { SectionHeader } from "@/shared/ui/section-header";

export default function Pricing() {
  const t = useTranslations("Marketing");
  const [isYearly, setIsYearly] = useState(false);
  const plans = [t("Pricing.starter"), t("Pricing.growth"), t("Pricing.director")];
  const rows = [t("Pricing.price"), t("Pricing.usageLimits"), t("Pricing.includedCapabilities"), t("Pricing.availability")];

  return (
    <section id="pricing" className="relative w-full overflow-hidden bg-transparent px-4 pb-0 pt-24 text-white sm:px-6 sm:pt-28 lg:px-8">
      <div className="mx-auto max-w-[1506.5px]">
        <SectionHeader
          theme="cosmic"
          className="mb-8 max-w-4xl sm:mb-10"
          title={
            <>
              {t("Pricing.clearExpectations")}
              <br />
              {t("Pricing.pricingToCome")}
            </>
          }
          description={t("Pricing.busmoraIsInDevelopmentPlanNamesAreIllustrativePrices")}
        >
          <div className="mx-auto mt-8 flex w-fit max-w-full flex-wrap justify-center items-center gap-2 rounded-xl bg-purple-accent/40 px-5 py-3 text-sm sm:mt-9 sm:gap-4 sm:px-7 sm:py-3.5">
            <button type="button" onClick={() => setIsYearly(false)} className={`min-h-11 transition ${!isYearly ? "text-white" : "text-white/55"}`}>{t("Pricing.monthlyPlan")}</button>
            <button
              type="button"
              role="switch"
              aria-checked={isYearly}
              aria-label={t("Pricing.toggleYearlyPricing")}
              onClick={() => setIsYearly((value) => !value)}
              className={`relative h-11 w-14 shrink-0 rounded-full border border-white/10 transition ${isYearly ? "bg-primary" : "bg-cosmic-active"}`}
            >
              <span className={`absolute top-2.5 h-6 w-6 rounded-full bg-white shadow transition-all ${isYearly ? "left-7" : "left-1"}`} />
            </button>
            <button type="button" onClick={() => setIsYearly(true)} className={`min-h-11 transition ${isYearly ? "text-white" : "text-white/55"}`}>{t("Pricing.yearlyPlan")}</button>
          </div>
        </SectionHeader>

        <div className="overflow-hidden rounded-[28px] border border-white/[.06] bg-cosmic-card p-4 shadow-2xl sm:p-7">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-h-44 items-center justify-between rounded-2xl bg-cosmic-raised px-4 py-6 sm:px-8">
              <div><div className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold">Busmora<span className="ml-1 text-sm">{t("Pricing.plans")}</span></div><p className="mt-2 max-w-36 text-sm leading-relaxed">{t("Pricing.noPricesOrDiscountsHaveBeenAnnounced")}</p></div><div className="text-4xl text-purple-accent">»</div>
            </div>
            {plans.map((plan, index) => (
              <div key={plan} className={`relative flex min-h-44 flex-col items-center justify-center rounded-2xl px-6 py-5 text-center ${index === 2 ? "mt-7 bg-gradient-to-br from-primary to-purple-accent shadow-[0_20px_50px_rgba(100,55,252,.28)] xl:mt-0" : "bg-cosmic-card"}`}>
                {index === 2 && <span className="absolute -top-7 left-1/2 w-[82%] -translate-x-1/2 rounded-t-xl bg-white py-1.5 text-sm font-bold text-cosmic-canvas">{t("Pricing.pROPOSEDPLAN")}</span>}
                <div className="text-lg uppercase tracking-wide">{plan}</div><div className="mt-1 text-sm text-white/35">{isYearly ? t("Pricing.annual") : t("Pricing.monthly")}</div>
                <div className="mt-1 flex items-start"><span className="text-6xl font-semibold leading-none">—</span></div>
                <div className="text-sm text-white/50">{t("Pricing.toBeAnnounced")}</div>
              </div>
            ))}
          </div>

          <div role="region" aria-label={t("Pricing.plans")} tabIndex={0} className="mt-5 overflow-x-auto overscroll-x-contain rounded-xl focus-visible:outline-2 focus-visible:outline-purple-focus">
            <table id="pricing-comparison" aria-label={t("Pricing.plans")} className="w-full min-w-[760px] border-collapse text-[15.9px] leading-[20.67px]">
              <thead className="sr-only">
                <tr><th scope="col">{t("Pricing.plans")}</th>{plans.map((plan) => <th key={plan} scope="col">{plan}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row} className={rowIndex % 2 ? "bg-cosmic-raised" : "bg-cosmic-card"}>
                    <th scope="row" className="w-1/4 px-8 py-4 text-start font-medium">
                      <span>{row}</span>
                    </th>
                    {plans.map((plan) => (
                      <td key={plan} className="w-1/4 px-6 py-3 text-center"><span>{t("Pricing.pending")}</span></td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-cosmic-raised">
                  <td />
                  {plans.map((plan, index) => <td key={plan} className="px-6 py-5 text-center"><Link href={ROUTES.MARKETING.DEMO} className={`inline-flex rounded-full px-10 py-3 font-semibold transition hover:-translate-y-0.5 ${index === 2 ? "bg-primary shadow-[0_10px_30px_rgba(100,55,252,.3)]" : "bg-purple-accent"}`}>{t("Pricing.exploreTheProduct")}</Link></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
