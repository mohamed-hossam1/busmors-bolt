import { useTranslations } from "@/features/marketing/model/translations";
import { Sparkles, ArrowDownRight, RefreshCw } from "lucide-react";
import { MarketingCard } from "./MarketingCard";
import { PondRipple } from "./PondRipple";
import { MARKETING_ASSETS } from "../model/assets";
import { SectionHeader } from "@/shared/ui/section-header";

const CONTEXT_ITEMS = [
  { name: "offerContext", x: 32 },
  { name: "audienceContext", x: 141 },
  { name: "decisionsContext", x: 250 },
  { name: "tasksContext", x: 359 },
  { name: "postsContext", x: 468 },
] as const;

function ContextIconRow({ className }: { className: string }) {
  return (
    <div className={className}>
      {CONTEXT_ITEMS.map(({ name }) => (
        <div key={name} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <img src={MARKETING_ASSETS.contextIcon} alt="" className="h-4 w-4 object-contain" />
        </div>
      ))}
    </div>
  );
}

export default function FeaturesInfiniteReach() {
  const t = useTranslations("Marketing");
  return (
    <section className="relative w-full bg-transparent px-4 py-[clamp(4rem,8vw,9.375rem)] text-cosmic-canvas sm:px-6">
      <div className="mx-auto max-w-[1192.5px]">
        <SectionHeader
          theme="lavender"
          className="mb-[clamp(2.5rem,5vw,6.25rem)]"
          title={
            <>
              {t("FeaturesInfiniteReach.clearPriorities")}{" "}
              <br className="hidden sm:inline" />
              {t("FeaturesInfiniteReach.workYouCanFollow")}
            </>
          }
          description={t("FeaturesInfiniteReach.aPracticalRoadmapVisibleTaskProgressAndDecisionsThat")}
        />

        {/* Top feature banner card */}
        <MarketingCard className="mb-7 flex min-h-[345px] flex-col items-center gap-10 p-5 sm:p-8 transition-shadow hover:shadow-md lg:flex-row lg:p-[52px]">
          <div className="space-y-4 lg:w-1/2">
            <h3 className="max-w-[480px] text-[34px] font-semibold leading-[1.18] tracking-[-0.035em] text-cosmic-canvas">
              {t("FeaturesInfiniteReach.startWithTheGoalThenChooseTheWork")}
            </h3>
            <p className="max-w-[470px] text-[17px] leading-[1.48] text-slate-structure">
              {t("FeaturesInfiniteReach.discoverWhatMattersForYourBusinessBeforeChoosingChannels")}
            </p>
          </div>

          <div className="relative flex min-h-[240px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white bg-white/40 p-3 sm:p-6 lg:w-1/2">
            <PondRipple size="lg" />

            <ContextIconRow className="relative z-10 mb-4 grid w-full max-w-sm grid-cols-5 items-center justify-items-center gap-1 sm:gap-3" />

            <div className="group relative z-10 my-2">
              <div className="absolute -inset-1 rounded-full bg-primary/30 blur-md transition-all group-hover:bg-primary/50" />
              <div className="relative flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/40">
                <Sparkles className="h-4 w-4 text-purple-200" />
                <span>{t("FeaturesInfiniteReach.businessBrain")}</span>
              </div>
            </div>

            <ContextIconRow className="relative z-10 mt-4 grid w-full max-w-sm grid-cols-5 items-center justify-items-center gap-1 sm:gap-3" />
          </div>
        </MarketingCard>

        {/* Two-column sub-cards */}
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
          {/* Card 1: Small Steps */}
          <MarketingCard className="flex min-h-[478px] flex-col justify-between p-5 sm:p-8 transition-shadow hover:shadow-md lg:p-12">
            <div className="mb-8 space-y-3 rounded-xl border border-white bg-white/40 p-3 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="text-xs font-medium text-slate-800">{t("FeaturesInfiniteReach.clarifyTheOffer")}</span>
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  {t("FeaturesInfiniteReach.toReview")}
                  <ArrowDownRight className="h-3 w-3 text-rose-500" />
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <span className="text-xs font-medium text-slate-800">{t("FeaturesInfiniteReach.prepareAResponseGuide")}</span>
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  {t("FeaturesInfiniteReach.toReview")}
                  <ArrowDownRight className="h-3 w-3 text-rose-500" />
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 shadow-sm">
                <span className="px-3 py-3 text-xs font-medium text-slate-800">{t("FeaturesInfiniteReach.draftAUsefulPost")}</span>
                <span className="inline-flex items-center gap-1 pe-3 text-[11px] font-medium text-primary">
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                  {t("FeaturesInfiniteReach.illustrativeTaskInProgress")}
                </span>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[34px] font-semibold leading-[1.18] tracking-[-0.035em] text-cosmic-canvas">
                {t("FeaturesInfiniteReach.smallSteps")}
                <br />
                {t("FeaturesInfiniteReach.aClearReasonForEach")}
              </h3>
              <p className="text-[17px] leading-[1.48] text-slate-structure">
                {t("FeaturesInfiniteReach.eachRoadmapStepExplainsWhatToDoWhyIt")}
              </p>
            </div>
          </MarketingCard>

          {/* Card 2: Connected Context */}
          <MarketingCard className="flex min-h-[478px] flex-col justify-between p-5 sm:p-8 transition-shadow hover:shadow-md lg:p-12">
            <div className="mb-8 overflow-hidden rounded-xl border border-white bg-white/40 p-3 sm:p-6">
              <div className="relative mx-auto h-[240px] w-full max-w-[500px]">
                <div className="absolute inset-x-0 top-0 z-10 grid grid-cols-5 items-start gap-1">
                  {CONTEXT_ITEMS.map((platform) => (
                    <div key={platform.name} className="flex min-w-0 flex-col items-center gap-1 rounded-[10px] border border-white bg-white px-1 py-2 text-center shadow-sm sm:gap-2">
                      <img src={MARKETING_ASSETS.contextIcon} alt="" className="h-4 w-4 object-contain" />
                      <div className="min-w-0 leading-tight [overflow-wrap:anywhere]">
                        <div className="text-[9px] font-semibold text-cosmic-canvas">{t(`FeaturesInfiniteReach.${platform.name}`)}</div>
                        <div className="text-[8px] text-stage-subtle">{t("FeaturesInfiniteReach.context")}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <svg viewBox="0 0 500 240" preserveAspectRatio="none" className="absolute inset-0 z-0 h-full w-full overflow-visible">
                  <g fill="none" stroke="#fff" strokeWidth="16" opacity="0.55">
                    {CONTEXT_ITEMS.map(({ name, x }) => (
                      <path key={name} d={x === 250 ? "M250,50 L250,150" : `M${x},50 C${x},128 250,96 250,150`} />
                    ))}
                  </g>
                  <g fill="none" stroke="currentColor" strokeWidth="4" className="text-stage-muted">
                    {CONTEXT_ITEMS.map(({ name, x }) => (
                      <path key={name} d={x === 250 ? "M250,50 L250,150" : `M${x},50 C${x},128 250,96 250,150`} className="path-dash" />
                    ))}
                  </g>
                </svg>

                <div className="absolute left-1/2 top-[150px] z-10 flex -translate-x-1/2 flex-col items-center">
                  <div className="relative flex h-[56px] w-[56px] items-center justify-center">
                    <PondRipple size="md" />
                    <div className="relative z-10 flex h-[52px] w-[52px] items-center justify-center rounded-[13px] bg-white shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="23" viewBox="0 0 35.053 19.781">
                        <path d="M253.9,6.39a.72.72,0,0,0-.543-.23H237.969a.7.7,0,0,0-.543.23.766.766,0,0,0-.216.557v3.682a.736.736,0,0,0,.216.529.7.7,0,0,0,.543.23h15.389a.72.72,0,0,0,.543-.23.736.736,0,0,0,.216-.529V6.947A.828.828,0,0,0,253.9,6.39Z" transform="translate(-219.064 -6.16)" fill="currentColor" className="text-primary" />
                        <path d="M227.831,6.39a.72.72,0,0,0-.543-.23H211.9a.7.7,0,0,0-.543.23.766.766,0,0,0-.216.557v3.682a.736.736,0,0,0,.216.529.7.7,0,0,0,.543.23h15.389a.72.72,0,0,0,.543-.23.736.736,0,0,0,.216-.529V6.947A.766.766,0,0,0,227.831,6.39Z" transform="translate(-211.14 -6.16)" fill="currentColor" className="text-primary" />
                        <path d="M253.9,27.3a.72.72,0,0,0-.543-.23H237.969a.7.7,0,0,0-.543.23.766.766,0,0,0-.216.557v3.682a.736.736,0,0,0,.216.529.7.7,0,0,0,.543.23h15.389a.72.72,0,0,0,.543-.23.736.736,0,0,0,.216-.529V27.857A.828.828,0,0,0,253.9,27.3Z" transform="translate(-219.064 -12.516)" fill="currentColor" className="text-primary" />
                        <path d="M227.831,27.3a.72.72,0,0,0-.543-.23H211.9a.7.7,0,0,0-.543.23.766.766,0,0,0-.216.557v3.682a.736.736,0,0,0,.216.529.7.7,0,0,0,.543.23h15.389a.72.72,0,0,0,.543-.23.736.736,0,0,0,.216-.529V27.857A.766.766,0,0,0,227.831,27.3Z" transform="translate(-211.14 -12.516)" fill="currentColor" className="text-primary" />
                        <path d="M242.7,16.79a.723.723,0,0,0-.529-.23H220.219a.786.786,0,0,0-.759.759v3.633a.751.751,0,0,0,.23.557.723.723,0,0,0,.529.23h21.953a.723.723,0,0,0,.529-.23.751.751,0,0,0,.23-.557V17.319A.723.723,0,0,0,242.7,16.79Z" transform="translate(-213.668 -9.321)" fill="currentColor" className="text-primary" />
                      </svg>
                    </div>
                  </div>
                  <span className="mt-3 w-max max-w-[200px] text-center text-[15.9px] font-medium text-primary">
                    {t("FeaturesInfiniteReach.oneConnectedBusinessContext")}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[34px] font-semibold leading-[1.18] tracking-[-0.035em] text-cosmic-canvas">
                {t("FeaturesInfiniteReach.seeTheWork")}
                <br />
                {t("FeaturesInfiniteReach.keepTheDecision")}
              </h3>
              <p className="text-[17px] leading-[1.48] text-slate-structure">
                {t("FeaturesInfiniteReach.theAgentCanvasIsDesignedToShowActualTask")}
              </p>
            </div>
          </MarketingCard>
        </div>
      </div>
    </section>
  );
}
