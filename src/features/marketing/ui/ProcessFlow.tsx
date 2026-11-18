
import { useTranslations } from "@/features/marketing/model/translations";

import React, { useRef } from "react";
import { Brain } from "lucide-react";
import { useScrollScene } from "@/shared/ui/motion/use-scroll-scene";
import {
  AD_TYPES_LEFT,
  AD_TYPES_RIGHT,
  OBJECTIVES,
  PLATFORM_COLUMNS,
} from "../model/process-flow";
import { MARKETING_ASSETS } from "../model/assets";
import { Arrow, CardHeader, CardShell, Chevron, CloseIcon, ProcessItemCard, RocketIcon } from "./process-flow/ui";
import { SectionHeader } from "@/shared/ui/section-header";

const CARD_COUNT = 5;
const CARD_HEIGHT = 430;
const HIDDEN_Y = CARD_HEIGHT * 1.3;

function getCardMotion(progress: number, index: number) {
  const land = index / (CARD_COUNT - 1);
  const start = index === 0 ? -1 : Math.max(0, land - 0.25);
  const recoilY = -(CARD_COUNT - 1 - index) * 8.6;
  const recoilScale = 1 - (CARD_COUNT - 1 - index) * 0.05;

  let y: number;
  if (progress <= start) {
    y = HIDDEN_Y;
  } else if (progress < land) {
      const t = (progress - start) / (land - start);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      y = HIDDEN_Y * (1 - eased);
  } else {
    const denom = Math.max(1 - land, 1e-6);
    y = recoilY * Math.min(1, Math.max(0, (progress - land) / denom));
  }

  let scale = 1;
  if (progress > land) {
    const denom = Math.max(1 - land, 1e-6);
    const t = Math.min(1, Math.max(0, (progress - land) / denom));
    scale = 1 + (recoilScale - 1) * t;
  }

  return { y, scale };
}

function StepMotion({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div data-process-step style={{ zIndex: index + 1 }} className="pointer-events-auto will-change-transform">
        {children}
      </div>
    </div>
  );
}

export default function ProcessFlow() {
  const t = useTranslations("Marketing");
  const MOBILE_STEPS = [
  ["01", t("ProcessFlow.confirmYourContext"), t("ProcessFlow.importYourWebsiteOrEnterTheEssentialsThenConfirm")],
  ["02", t("ProcessFlow.chooseYourGoal"), t("ProcessFlow.useChatDirectlyOrExploreTheObjectiveYouWant")],
  ["03", t("ProcessFlow.buildYourRoadmap"), t("ProcessFlow.chooseCompleteStepsThatFitYourSituationTimeAnd")],
  ["04", t("ProcessFlow.prepareUsefulWork"), t("ProcessFlow.draftDocumentsResponseGuidesOrPostsInspectTheResult")],
  ["05", t("ProcessFlow.reviewBeforeApproval"), t("ProcessFlow.forPlannedFacebookPublishingApproveTheExactPostVersion")],
] as const;

  const root = useRef<HTMLElement>(null);

  useScrollScene(root, (progress, reducedMotion) => {
    const enhanced = !reducedMotion && window.innerHeight >= 850;
    root.current?.toggleAttribute("data-process-enhanced", enhanced);
    const cards = root.current?.querySelectorAll<HTMLElement>("[data-process-step]");
    cards?.forEach((card, index) => {
      if (!enhanced) {
        card.style.transform = index === 0 ? "none" : `translate3d(0, ${HIDDEN_Y}px, 0)`;
        return;
      }
      const { y, scale } = getCardMotion(progress, index);
      card.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
    });
  }, { disabledBelow: 1280 });

  return (
    <section ref={root} id="workflow" className="marketing-workflow relative bg-transparent text-cosmic-canvas">
      <div className="marketing-workflow-steps px-4 sm:px-6">
        <SectionHeader
          theme="lavender"
          title={t("ProcessFlow.fromYourBusinessToAClearNextStep")}
          titleClassName="text-[clamp(2.55rem,12vw,4rem)]"
        />
        <div className="mt-12 space-y-3">
          {MOBILE_STEPS.map(([step, title, description]) => (
            <article key={step} className="marketing-light-card rounded-[24px] border border-white p-5 shadow-[0_16px_50px_rgba(66,81,107,.08)] backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">{step}</span>
                <h3 className="text-xl font-semibold tracking-[-0.025em]">{title}</h3>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-structure">{description}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="marketing-workflow-presentation sticky top-0 h-[100svh] items-center justify-center overflow-hidden px-6 pt-8">
        <div className="w-full max-w-[1193px]">
          <h2 className="text-center text-[39.75px] font-semibold leading-[1.2] tracking-[-0.03em] text-cosmic-canvas">{t("ProcessFlow.understandPlanPrepare")}<br />{t("ProcessFlow.reviewBeforeAnythingGoesLive")}</h2>
          <div className="h-[31.8px]" />

          <div className="marketing-light-card rounded-[15.9px] border border-white p-[13.9125px]">
            <div className="rounded-[13.9125px] border border-white">
              <div className="flex items-center gap-[11.925px] border-b border-white px-[31.8px] py-[26.8312px] text-slate-structure">
                <RocketIcon />
                <div className="text-[21.8625px] font-bold leading-[1.2] text-slate-structure">{t("ProcessFlow.yourWorkWithBusmora")}</div>
                <div className="text-[17.8875px] leading-[1.2] text-slate-structure">{t("ProcessFlow.illustrativeProductFlowInDevelopment")}</div>
              </div>

              <div className="marketing-light-card relative flex h-[558.4px] items-center justify-center overflow-hidden">
                <img src={MARKETING_ASSETS.process.background} alt="" className="pointer-events-none absolute left-1/2 top-0 w-[801px] max-w-none -translate-x-1/2" />

                <StepMotion index={0}>
                  <CardShell>
                    <CardHeader step={1} title={t("ProcessFlow.confirmYourBusiness")} subtitle={t("ProcessFlow.keepOnlyTheInformationYouHaveReviewed")} />
                    <div className="h-[23.85px]" />
                    <div className="flex justify-between">
                      {PLATFORM_COLUMNS.map((column, columnIndex) => (
                        <div key={columnIndex} className="flex w-[304.09px] flex-col gap-[19.875px]">
                          {column.map((item, itemIndex) =>
                            item ? (
                              <div key={itemIndex} className="flex h-[51px] items-center justify-between rounded-[11.925px] border border-white bg-white py-[6.36px] pl-[19.08px] pr-[6.36px]">
                                <span className="text-[13px] font-semibold">{t(item.name)}</span>
                                {item.select ? (
                                  <div className="flex h-9 w-[129px] items-center justify-between rounded-[9.9375px] bg-primary px-[15.9px] text-[13.9125px] leading-none text-white">
                                    <span>{t("ProcessFlow.review")}</span>
                                    <Chevron />
                                  </div>
                                ) : (
                                  <span className="px-4 text-sm text-slate-structure">{t("ProcessFlow.confirm")}</span>
                                )}
                              </div>
                            ) : (
                              <div key={itemIndex} className="h-[51px] rounded-[11.925px] border border-white/60 bg-white/35" />
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </CardShell>
                </StepMotion>

                <StepMotion index={1}>
                  <CardShell>
                    <CardHeader step={2} title={t("ProcessFlow.chooseAnObjective")} subtitle={t("ProcessFlow.whatWouldYouLikeToWorkToward")} />
                    <div className="h-[23.85px]" />
                    <div className="flex justify-between">
                      {OBJECTIVES.map((objective) => (
                        <ProcessItemCard key={objective.label} title={t(objective.label)} icon={objective.icon} className="w-[304.09px]" />
                      ))}
                    </div>
                    <div className="mt-[27.825px] flex justify-between">
                      {[
                        [t("ProcessFlow.whatDoesYourBusinessOffer"), t("ProcessFlow.exampleWebsiteDesignForServiceBusinesses")],
                        [t("ProcessFlow.whatDoYouKnowAboutYourAudience"), t("ProcessFlow.exampleLocalOwnersWhoNeedInquiries")],
                      ].map(([label, placeholder]) => (
                        <div key={label} className="relative w-[467px] rounded-[11.925px] border border-white bg-lavender-canvas/50 p-[19.875px]">
                          <img src={MARKETING_ASSETS.process.fieldDecoration} alt="" className="absolute left-[19px] top-[14px] h-[31px] w-5" />
                          <div className="flex items-center justify-between pl-[15.9px] text-[12.72px] leading-[1.2] text-cosmic-canvas">
                            <span>{label}</span>
                            <span className="text-stage-muted">{t("ProcessFlow.illustrativeExample")}</span>
                          </div>
                          <div className="h-[23.85px]" />
                          <div className="rounded-[11.925px] border border-white bg-white px-[19.08px] py-[15.9px] text-[12.72px] leading-[1.5] text-stage-muted">
                            {placeholder}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardShell>
                </StepMotion>

                <StepMotion index={2}>
                  <CardShell>
                    <CardHeader step={3} title={t("ProcessFlow.aRoadmapThatFits")} subtitle={t("ProcessFlow.yourObjectiveCapacityAndConstraintsShapeTheSteps")} />
                    <div className="h-[23.85px]" />
                    <div className="flex flex-col gap-[23.85px]">
                      <div className="flex h-[49px] items-center justify-end rounded-[11.925px] border border-white bg-white/50 p-[4.96875px]">
                        <div className="flex items-center gap-[15.9px] rounded-[11.925px] bg-white px-[15.9px] py-[11.13px] text-[12.72px] font-bold text-cosmic-canvas">{t("ProcessFlow.exploreWithTheDirector")}<Brain className="h-[19px] w-[19px] text-slate-structure" strokeWidth={1.6} />
                        </div>
                      </div>

                      <div className="flex h-[49px] items-center rounded-[11.925px] border border-white bg-white/50 p-[4.96875px]">
                        <div className="flex w-[139px] items-center gap-[15.9px] pl-[15.9px] text-[12.72px] text-cosmic-canvas">{t("ProcessFlow.focus")}<span className="h-[22px] w-px bg-stage-muted/40" />
                        </div>
                        <div className="ml-auto flex items-center gap-[7.95px]">
                          {[t("ProcessFlow.offer"), t("ProcessFlow.audience"), t("ProcessFlow.followup")].map((city) => (
                            <div key={city} className="flex h-8 items-center gap-[11.925px] rounded-[9.54px] bg-primary px-[9.54px] text-[12.72px] text-white">
                              {city}
                              <CloseIcon />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex h-[49px] items-center rounded-[11.925px] border border-white bg-white/50 p-[4.96875px]">
                        <div className="flex w-[139px] items-center gap-[15.9px] pl-[15.9px] text-[12.72px] text-cosmic-canvas">{t("ProcessFlow.weeklyTime")}<span className="h-[22px] w-px bg-stage-muted/40" />
                        </div>
                        <div className="ml-auto flex w-[501px] items-center gap-[15.9px]">
                          <span className="text-[14.31px] leading-none text-cosmic-canvas">{t("ProcessFlow.1h")}</span>
                          <div className="relative h-[3px] flex-1 rounded-full bg-cosmic-canvas">
                            <span className="absolute -top-[5px] left-0 h-[13px] w-[13px] rounded-full border-2 border-white bg-cosmic-canvas shadow-sm" />
                            <span className="absolute -top-[5px] right-0 h-[13px] w-[13px] rounded-full border-2 border-white bg-cosmic-canvas shadow-sm" />
                          </div>
                          <span className="text-[14.31px] leading-none text-cosmic-canvas">{t("ProcessFlow.5h")}</span>
                        </div>
                      </div>

                      <div className="flex h-[49px] items-center rounded-[11.925px] border border-white bg-white/50 p-[4.96875px]">
                        <div className="flex w-[139px] items-center gap-[15.9px] pl-[15.9px] text-[12.72px] text-cosmic-canvas">{t("ProcessFlow.nextStep")}<span className="h-[22px] w-px bg-stage-muted/40" />
                        </div>
                        <div className="ml-auto flex items-center">
                          <div className="flex h-8 items-center gap-[11.925px] rounded-[9.54px] bg-primary px-[9.54px] text-[12.72px] text-white">{t("ProcessFlow.clarifyTheServiceOffer")}<CloseIcon />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardShell>
                </StepMotion>

                <StepMotion index={3}>
                  <CardShell>
                    <CardHeader step={4} title={t("ProcessFlow.prepareAUsefulOutput")} subtitle={t("ProcessFlow.chooseWorkThatServesTheObjective")} />
                    <div className="h-[23.85px]" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex w-[315px] flex-col gap-[14.9062px] pt-[9px]">
                        {AD_TYPES_LEFT.map((item) => (
                          <div key={t(item.label)} className="flex items-center gap-[3.18px]">
                            <ProcessItemCard title={t(item.label)} icon={item.icon} className="flex-1" />
                            <Arrow />
                          </div>
                        ))}
                      </div>

                      <img src={MARKETING_ASSETS.featurePhone} alt="" width={261} height={386} className="relative -mt-[167px] h-[445px] w-[301px] shrink-0 object-contain" />

                      <div className="flex w-[315px] flex-col gap-[14.9062px]">
                        {AD_TYPES_RIGHT.map((item) => (
                          <div key={t(item.label)} className="flex items-center gap-[3.18px]">
                            <Arrow flip />
                            <ProcessItemCard title={t(item.label)} icon={item.icon} className="flex-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardShell>
                </StepMotion>

                <StepMotion index={4}>
                  <CardShell>
                    <CardHeader step={5} title={t("ProcessFlow.reviewTheExactPost")} subtitle={t("ProcessFlow.checkTheContentDestinationTimeAndDeliveryWindow")} />
                    <div className="h-[23.85px]" />
                    <div className="relative flex items-end justify-between">
                      <div className="flex w-[315px] flex-col">
                        <div className="relative mb-[20px] w-[177px]">
                          <svg viewBox="0 0 177 98" className="h-[92px] w-[177px]" aria-hidden>
                            <defs>
                              <linearGradient id="budget-arc" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0" stopColor="var(--primary)" />
                                <stop offset="0.72" stopColor="var(--purple-accent)" />
                                <stop offset="1" stopColor="var(--lavender-canvas)" />
                              </linearGradient>
                            </defs>
                            <path d="M12 92a76.5 76.5 0 0 1 153 0" fill="none" stroke="var(--lavender-canvas)" strokeWidth="15" />
                            <path d="M12 92a76.5 76.5 0 0 1 153 0" fill="none" stroke="url(#budget-arc)" strokeWidth="15" strokeDasharray="240" strokeDashoffset="72" />
                          </svg>
                          <div className="absolute inset-x-0 bottom-[6px] text-center">
                            <div className="text-[12.72px] leading-none text-stage-muted">{t("ProcessFlow.approval")}</div>
                            <div className="mt-[4px] text-[23.85px] font-medium leading-none text-cosmic-canvas">{t("ProcessFlow.yourDecision")}</div>
                          </div>
                        </div>
                        {[0, 1].map((i) => (
                          <div key={i} className="mb-[15px] flex h-[51px] items-center justify-between rounded-[11.925px] border border-white bg-white py-[6.36px] pl-[19.08px] pr-[6.36px] last:mb-0">
                            <span className="text-[12.72px] text-cosmic-canvas">{t("ProcessFlow.postDetails")}</span>
                            <span className="px-4 text-sm text-primary">{t("ProcessFlow.toReview")}</span>
                          </div>
                        ))}
                      </div>

                      <img src={MARKETING_ASSETS.process.reviewPhone} alt="" width={454} height={668} className="relative -mt-[167px] h-[445px] w-auto shrink-0 object-contain" />

                      <div className="flex w-[315px] flex-col justify-end gap-[15px] pb-[3px]">
                        {[0, 1].map((i) => (
                          <div key={i} className="flex h-[51px] items-center justify-between rounded-[11.925px] border border-white bg-white py-[6.36px] pl-[19.08px] pr-[6.36px]">
                            <span className="text-[12.72px] text-cosmic-canvas">{t("ProcessFlow.postDetails")}</span>
                            <span className="px-4 text-sm text-primary">{t("ProcessFlow.toReview")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardShell>
                </StepMotion>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
