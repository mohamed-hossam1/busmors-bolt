'use client'


import { useTranslations } from "@/features/marketing/model/translations";
import { useState } from "react";
import { ROUTES } from "@/shared/routes";
import { MARKETING_ASSETS } from "../model/assets";
import { MarketingCta } from "./MarketingCta";

export default function InteractiveTabs() {
  const t = useTranslations("Marketing");
  const TABS = [
    { id: "chat", label: t("InteractiveTabs.directorChat"), title: t("InteractiveTabs.directorChat"), image: MARKETING_ASSETS.tabs.chat, description: t("InteractiveTabs.askForHelpWithASpecificMarketingTaskThe") },
    { id: "brain", label: t("InteractiveTabs.businessBrain"), title: t("InteractiveTabs.businessBrain"), image: MARKETING_ASSETS.tabs.brain, description: t("InteractiveTabs.keepYourOfferingsAudienceAndConfirmedDecisionsConnectedReview") },
    { id: "calendar", label: "Calendar", title: "Calendar & Publishing", image: "/marketing/product/calendar.webp", description: "Review drafts, approve the work, and keep track of your publishing schedule." }
  ];

  const [activeTab, setActiveTab] = useState(0);
  const current = TABS[activeTab];

  return (
    <section id="product-demo" className="relative w-full bg-transparent px-5 pb-20 md:px-8">
      <div className="mx-auto max-w-[1501px]">
        <div className="interactive-tabs-bg relative overflow-hidden rounded-[20.65px] pb-10 ps-4 pe-0 pt-10 sm:ps-6 lg:grid lg:grid-cols-[minmax(0,560fr)_minmax(0,766fr)] lg:gap-x-[min(0.8334vw,16px)] lg:rounded-[40px] lg:pb-[min(5.2084vw,100px)] lg:ps-[7%] lg:pe-0 lg:pt-[min(6.25vw,120px)]">
          <div className="relative flex min-w-0 flex-col justify-between pe-4 sm:pe-6 lg:pe-0">
            {/* Tab Button Selector */}
            <div role="tablist" aria-label={t("InteractiveTabs.productAreas")} className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-3xl border border-slate-structure/40 bg-cosmic-canvas p-1 shadow-[0_15px_50px_rgba(100,55,252,.2)] lg:flex-wrap lg:gap-[min(.52vw,10px)] lg:p-[min(.3125vw,6px)]">
              {TABS.map((tab, idx) => {
                const isActive = activeTab === idx;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onKeyDown={(event) => {
                      const next = event.key === 'ArrowRight' ? (idx + 1) % TABS.length : event.key === 'ArrowLeft' ? (idx + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
                      if (next !== null) { event.preventDefault(); setActiveTab(next); document.getElementById(`tab-${TABS[next].id}`)?.focus(); }
                    }}
                    onClick={() => setActiveTab(idx)}
                    className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-slate-structure/40 px-3 text-xs font-medium leading-[1.2] text-white transition-colors lg:min-h-[max(44px,min(2.9167vw,56px))] lg:px-[min(1.25vw,24px)] lg:text-[clamp(12px,.9375vw,18px)] ${
                      isActive ? "bg-cosmic-active" : "bg-cosmic-raised hover:bg-cosmic-raised/80"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Left Info Content */}
            <div id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="mt-10 lg:mt-12">
              <h3 className="mb-4 text-[32px] font-medium leading-[1.3] tracking-normal text-white lg:mb-[min(.8334vw,16px)] lg:text-[clamp(44px,4.1667vw,80px)]">
                {current.title}
              </h3>

              <p className="mb-6 text-[15px] leading-[1.4545] text-stage-muted lg:mb-[min(1.25vw,24px)] lg:text-[clamp(13px,1vw,19.2px)]">
                {current.description}
              </p>

                <MarketingCta
                  href={ROUTES.MARKETING.PROCESS}
                  size="default"
                  className="lg:h-[min(3.75vw,72px)] lg:w-[min(13.75vw,264px)] lg:text-[clamp(12px,.9375vw,18px)]"
                  lang="en"
                  dir="ltr"
                >
                  {t("Hero.startFreeTrial")}
                </MarketingCta>
            </div>
          </div>

          {/* Right Screenshot Column */}
          <div className="mt-[31px] w-full lg:mt-0 lg:h-full lg:min-h-[min(38.3334vw,736px)]">
            <img src={current.image} alt={`${current.title} interface with fictional sample business data`} loading="lazy" className="block h-auto w-full select-none rounded-s-xl border border-slate-structure" />
          </div>
        </div>
      </div>
    </section>
  );
}
