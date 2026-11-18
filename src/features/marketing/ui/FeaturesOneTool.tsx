import { useTranslations } from "@/features/marketing/model/translations";
import { ROUTES } from "@/shared/routes";
import {
  ScanLine,
  ClipboardList,
  ShieldCheck,
  FileText,
  Compass,
} from "lucide-react";
import { MARKETING_ASSETS } from "../model/assets";
import CampaignEditor from "./CampaignEditor";
import {
  MarketingCard,
  MarketingCardHeader,
  MarketingCardTitle,
  MarketingCardDescription,
} from "./MarketingCard";
import { MarketingCta } from "./MarketingCta";
import { SectionHeader } from "@/shared/ui/section-header";

function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <circle cx="6" cy="6" r="6" fill="currentColor" />
      <path
        d="M3.55 6.05 5.05 7.55 8.4 4.2"
        fill="none"
        stroke="white"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const bars = [95, 32, 64, 111, 51, 80, 127, 95];

export default function FeaturesOneTool() {
  const t = useTranslations("Marketing");
  const stats = [
    {
      label: t("FeaturesOneTool.businessFacts"),
      value: t("FeaturesOneTool.12"),
      icon: ScanLine,
      colorClass: "text-primary",
    },
    {
      label: t("FeaturesOneTool.toReview"),
      value: t("FeaturesOneTool.3"),
      icon: ClipboardList,
      colorClass: "text-slate-structure",
    },
    {
      label: t("FeaturesOneTool.approvedPosts"),
      value: t("FeaturesOneTool.2"),
      icon: ShieldCheck,
      colorClass: "text-slate-structure",
    },
    {
      label: t("FeaturesOneTool.postVersion"),
      value: t("FeaturesOneTool.1"),
      icon: FileText,
      colorClass: "text-primary",
    },
  ];

  const steps = [
    { step: t("FeaturesOneTool.step15"), label: t("FeaturesOneTool.business"), active: false, last: false },
    { step: t("FeaturesOneTool.step25"), label: t("FeaturesOneTool.goal"), active: false, last: false },
    { step: t("FeaturesOneTool.step35"), label: t("FeaturesOneTool.roadmap"), active: false, last: false },
    { step: t("FeaturesOneTool.step45"), label: t("FeaturesOneTool.create"), active: true, last: false },
    { step: t("FeaturesOneTool.step55"), label: t("FeaturesOneTool.approval"), active: false, last: true },
  ];

  return (
    <section
      id="features"
      className="w-full px-4 pb-20 pt-[clamp(4rem,8vw,9.9375rem)] text-cosmic-canvas sm:px-6"
    >
      <div className="mx-auto w-full max-w-[1192.5px]">
        {/* Header */}
        <SectionHeader
          theme="lavender"
          className="mb-[clamp(2.5rem,5vw,6rem)] max-w-[588px]"
          title={
            <>
              {t("FeaturesOneTool.yourBusiness")}
              <br />
              {t("FeaturesOneTool.oneSharedContext")}
            </>
          }
          description={t("FeaturesOneTool.fromTheFirstQuestionToTheFinishedDraftYour")}
        />

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-x-7 gap-y-12 md:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Plan */}
          <MarketingCard className="justify-between pt-6 pb-0 pl-5 pr-2.5 md:col-span-2 xl:col-span-2 xl:min-h-[363px]">
            <div className="flex w-full flex-col items-start justify-between min-[500px]:flex-row">
              <div className="w-full shrink-0 pb-8 min-[500px]:w-[50%]">
                <div className="space-y-[7px]">
                  {steps.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex min-h-8 items-center justify-between rounded-lg border-[0.5px] border-white pe-2 transition-transform hover:scale-[1.02] ${
                        item.active ? "text-white bg-gradient-to-r from-primary to-primary/60" : "text-slate-structure bg-white/70"
                      } ${item.last ? "opacity-60" : ""}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="h-[19px] w-[5px] rounded-r-[3px] bg-white" />
                        <span className="text-[12px] font-semibold leading-none">
                          {item.label}
                        </span>
                      </span>
                      <span
                        className={`flex h-[21px] w-[65px] items-center justify-center gap-1 rounded-full px-2 ${
                          item.active ? "bg-primary" : "bg-white"
                        }`}
                      >
                        <span className="text-[8px] font-semibold leading-none">
                          {item.step}
                        </span>
                        <Tick
                          className={`h-3 w-3 ${
                            item.last ? "text-lavender-tint" : "text-primary"
                          }`}
                        />
                      </span>
                    </div>
                  ))}
                </div>

                <MarketingCardHeader className="mt-4 ps-4">
                  <MarketingCardTitle>{t("FeaturesOneTool.plan")}</MarketingCardTitle>
                  <MarketingCardDescription>
                    {t("FeaturesOneTool.practicalSteps")}
                  </MarketingCardDescription>
                </MarketingCardHeader>
              </div>

              <div className="flex w-full flex-1 justify-center min-[500px]:w-auto min-[500px]:justify-end">
                <img
                  src={MARKETING_ASSETS.featurePhone}
                  alt=""
                  width={261}
                  height={386}
                  className="product-phone w-[180px] max-w-full min-[500px]:-mt-8"
                />
              </div>
            </div>
          </MarketingCard>

          {/* Card 2: Campaign Editor */}
          <CampaignEditor />

          {/* Card 3: Remember */}
          <MarketingCard className="overflow-hidden p-[22px_19px_32px] xl:col-span-1 xl:min-h-[363px]">
            <span aria-hidden className="pointer-events-none absolute left-0 top-0 w-[320px] text-7xl text-primary/5">Busmora</span>
            <div className="relative overflow-hidden rounded-xl border border-white">
              <div className="h-[135px] overflow-hidden bg-gradient-to-b from-[#f5f7fe] to-[#eceffe] px-5">
                <div className="grid grid-cols-4 gap-x-0.5 gap-y-3.5 pt-5">
                  {MARKETING_ASSETS.platforms.map((icon, idx) => (
                    <div
                      key={idx}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-2 shadow-sm transition-transform hover:scale-105"
                    >
                      <img src={icon} alt="" className="h-5 w-5 object-contain" />
                    </div>
                  ))}
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={`blank-${idx}`}
                      className="h-9 w-9 rounded-lg bg-white"
                    />
                  ))}
                </div>
              </div>
              <div className="flex h-12 items-center justify-between border-t-[0.5px] border-white bg-white/40 px-4">
                <span className="text-[12px] font-semibold leading-none text-slate-structure">{t("FeaturesOneTool.businessBrain")}</span>
                <Compass className="h-[22px] w-[22px] text-slate-structure" />
              </div>
            </div>

            <MarketingCardHeader className="mt-4 ps-4">
              <MarketingCardTitle>{t("FeaturesOneTool.remember")}</MarketingCardTitle>
              <MarketingCardDescription>
                {t("FeaturesOneTool.yourOffersAudienceAndDecisionsStayConnected")}
              </MarketingCardDescription>
            </MarketingCardHeader>
          </MarketingCard>

          {/* Card 4: Approve */}
          <MarketingCard className="p-[22px_20px_32px] xl:col-span-1 xl:min-h-[363px]">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 flex h-12 items-center justify-between rounded-xl bg-white px-4">
                <span className="text-[12px] font-semibold leading-none text-slate-structure">{t("FeaturesOneTool.illustrativeReview")}</span>
                <img
                  src={MARKETING_ASSETS.tickSvg}
                  alt=""
                  className="h-8 w-8"
                />
              </div>
              {stats.map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={idx}
                    className="h-[60px] rounded-xl border-[0.5px] border-white bg-white/40 px-3.5 py-3"
                  >
                    <span className="block text-[10px] font-semibold leading-none text-stage-subtle">
                      {stat.label}
                    </span>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[12px] font-semibold leading-none text-slate-structure">
                        {stat.value}
                      </span>
                      <Icon
                        className={`h-3.5 w-3.5 ${stat.colorClass}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <MarketingCardHeader className="mt-4 ps-4">
              <MarketingCardTitle>{t("FeaturesOneTool.approve")}</MarketingCardTitle>
              <MarketingCardDescription>
                {t("FeaturesOneTool.reviewTheExactPostAndTimingBeforeApproval")}
              </MarketingCardDescription>
            </MarketingCardHeader>
          </MarketingCard>

          {/* Card 5: Understand */}
          <MarketingCard className="p-[22px_0px_32px] xl:col-span-1 xl:min-h-[363px]">
            <div className="relative h-[191px] w-full overflow-hidden">
              <img
                src={MARKETING_ASSETS.graphFeature}
                alt=""
                className="pointer-events-none absolute left-0 top-0 h-auto w-[486px] max-w-none"
              />
              <div className="absolute bottom-0 left-0 right-0 flex h-[127px] items-end justify-between px-4">
                {bars.map((h, idx) => (
                  <div
                    key={idx}
                    style={{ height: `${h}px` }}
                    className="w-[14px] rounded-[4px] bg-gradient-to-t from-transparent to-white"
                  />
                ))}
              </div>
            </div>

            <MarketingCardHeader className="mt-4 ps-6 pe-5">
              <MarketingCardTitle>{t("FeaturesOneTool.understand")}</MarketingCardTitle>
              <MarketingCardDescription>
                {t("FeaturesOneTool.askForAnAnalysisOfTheEvidenceYouProvide")}
              </MarketingCardDescription>
            </MarketingCardHeader>
          </MarketingCard>

          {/* Card 6: See the bigger picture */}
          <MarketingCard
            theme="trial"
            className="justify-between p-[39px_20px_32px] md:col-span-2 xl:col-span-2 xl:min-h-[363px]"
          >
            <div className="ps-4">
              <h3 className="text-[32px] font-semibold leading-[1.4] text-white">
                {t("FeaturesOneTool.seeTheBiggerPicture")}
              </h3>
              <p className="mt-2 text-[16px] leading-[1.5] tracking-[-0.02em] text-white">
                {t("FeaturesOneTool.exploreHowChatTheRoadmapAndYourBusinessBrain")}
              </p>
            </div>
            <MarketingCta
              href={ROUTES.MARKETING.DEMO}
              size="wide"
              className="mt-8"
            >
              {t("Hero.startFreeTrial")}
            </MarketingCta>
          </MarketingCard>
        </div>
      </div>
    </section>
  );
}
