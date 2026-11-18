
import { useTranslations } from "@/features/marketing/model/translations";
import { useState } from "react";
import { ROUTES } from "@/shared/routes";
import { MARKETING_ASSETS } from "../model/assets";
import { MarketingCta } from "./MarketingCta";

function DashboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.38 31.366" className="h-auto w-[19.6px] lg:w-[37.75px]" fill="currentColor" aria-hidden="true">
      <g transform="translate(0)">
        <path d="M1027.815,286.6l.14-.205h0l-.167.176-.012-.011a1.572,1.572,0,0,0-2.192.01l-4.839,4.837-.156-.076a5.293,5.293,0,1,0,2.432,2.433l-.076-.155,4.84-4.84A1.551,1.551,0,0,0,1027.815,286.6Zm-9.545,11.659a2.179,2.179,0,0,1,0-4.358h0a2.179,2.179,0,0,1,0,4.358Z" transform="translate(-999.08 -276.424)" />
        <path d="M1035.062,309.524a1.561,1.561,0,0,0,1.028-.6,19.34,19.34,0,0,0,3.878-11.567v-.116a19.19,19.19,0,1,0-34.506,11.683,1.559,1.559,0,0,0,1.026.6,1.507,1.507,0,0,0,1.152-.3,1.556,1.556,0,0,0,.3-2.18,16.076,16.076,0,0,1,12.832-25.758h0a16.083,16.083,0,0,1,16.077,16.08,16.191,16.191,0,0,1-3.241,9.678,1.553,1.553,0,0,0,.282,2.164l.021.016a1.517,1.517,0,0,0,1.147.3Z" transform="translate(-1001.587 -278.174)" />
      </g>
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38.692 38.69" className="h-auto w-[19.6px] lg:w-[37.75px]" fill="currentColor" aria-hidden="true">
      <path d="M38.331,2.445l-.164-.9a1.248,1.248,0,0,0-1-1l-.9-.164a22.562,22.562,0,0,0-11.509.914A23.063,23.063,0,0,0,14.042,9.19l-1.463-.5A6.873,6.873,0,0,0,5.723,10.1L1.1,14.3a3.36,3.36,0,0,0,2.154,5.841l4.086.127a4.061,4.061,0,0,0,1.135,3.536l6.414,6.414a4.059,4.059,0,0,0,3.536,1.136l.127,4.086A3.36,3.36,0,0,0,24.4,37.6l4.2-4.62a6.874,6.874,0,0,0,1.416-6.856l-.5-1.463a22.974,22.974,0,0,0,7.905-10.706,22.561,22.561,0,0,0,.914-11.509ZM2.783,16.15l4.62-4.2a4.378,4.378,0,0,1,4.367-.9l.675.232a53.5,53.5,0,0,0-4.056,6.526l-5.052-.157a.861.861,0,0,1-.553-1.5ZM27.652,26.933a4.378,4.378,0,0,1-.9,4.367l-4.2,4.62a.861.861,0,0,1-1.5-.553l-.157-5.051a53.4,53.4,0,0,0,6.526-4.057ZM29.163,21.7a50.859,50.859,0,0,1-10.712,7.054,1.562,1.562,0,0,1-1.792-.3c.008,0,.058.058-6.414-6.414a1.562,1.562,0,0,1-.3-1.792q.48-.978,1-1.934l6.771,6.771a1.248,1.248,0,0,0,1.765-1.765l-7.244-7.243A50.766,50.766,0,0,1,17.1,9.419,20.063,20.063,0,0,1,35.864,2.837,20.06,20.06,0,0,1,29.163,21.7ZM22.068,9.025a5.379,5.379,0,1,0,7.609,0A5.385,5.385,0,0,0,22.068,9.025Zm5.844,5.844a2.884,2.884,0,1,1,0-4.078A2.887,2.887,0,0,1,27.912,14.868ZM1.918,29.2a1.248,1.248,0,0,1,0-1.765l1.616-1.616A1.248,1.248,0,0,1,5.3,27.583L3.683,29.2a1.248,1.248,0,0,1-1.765,0Zm11.028,4.265a1.248,1.248,0,0,1,0,1.765l-1.616,1.616a1.248,1.248,0,1,1-1.765-1.765l1.616-1.616a1.248,1.248,0,0,1,1.765,0Zm-2.726-3.217L4.731,35.736a1.248,1.248,0,0,1-1.765-1.765l5.488-5.488a1.248,1.248,0,1,1,1.765,1.765Z" transform="translate(-0.001 -0.009)" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36.117 41.585" className="h-auto w-[19.6px] lg:w-[37.75px]" fill="currentColor" aria-hidden="true">
      <path d="M31.255,3.859,21.168.5a9.966,9.966,0,0,0-6.219,0L4.861,3.861A7.091,7.091,0,0,0,0,10.6v8.045A23.715,23.715,0,0,0,11.675,38.985l2.8,1.627a7.1,7.1,0,0,0,3.578.973h.009v0h.026a7.118,7.118,0,0,0,3.557-.959l2.8-1.629A23.715,23.715,0,0,0,36.117,18.66V10.6a7.089,7.089,0,0,0-4.861-6.741m1.589,14.8A20.431,20.431,0,0,1,22.78,36.172l-2.8,1.629a3.861,3.861,0,0,1-3.873,0l-2.8-1.629A20.416,20.416,0,0,1,3.251,18.584V10.528A3.852,3.852,0,0,1,5.884,6.919L15.971,3.583a6.63,6.63,0,0,1,2.071-.332h.014l.112,0a6.571,6.571,0,0,1,1.975.346l10.068,3.4A3.85,3.85,0,0,1,32.845,10.6Z" />
      <path d="M19.607,8.765h0a1.683,1.683,0,0,0-1.114.418l-6.812,6.8L8.92,13.219a1.682,1.682,0,0,0-1.194-.494h0a1.691,1.691,0,0,0-1.194,2.887l3.96,3.96a1.7,1.7,0,0,0,2.389,0L20.8,11.652a1.691,1.691,0,0,0-1.194-2.887" transform="translate(4.391 6.377)" />
    </svg>
  );
}

export default function InteractiveTabs() {
  const t = useTranslations("Marketing");
  const TABS = [
    { id: "chat", label: t("InteractiveTabs.directorChat"), Icon: DashboardIcon, title: t("InteractiveTabs.directorChat"), image: MARKETING_ASSETS.tabs.chat, description: t("InteractiveTabs.askForHelpWithASpecificMarketingTaskThe") },
    { id: "roadmap", label: "Agent Canvas", Icon: RocketIcon, title: "Agent Canvas", image: MARKETING_ASSETS.tabs.roadmap, description: "Follow the recorded work, specialists, and handoffs for each conversation. Move around the canvas and return to it just as you left it." },
    { id: "brain", label: t("InteractiveTabs.businessBrain"), Icon: ShieldIcon, title: t("InteractiveTabs.businessBrain"), image: MARKETING_ASSETS.tabs.brain, description: t("InteractiveTabs.keepYourOfferingsAudienceAndConfirmedDecisionsConnectedReview") },
    { id: "calendar", label: "Calendar", Icon: RocketIcon, title: "Calendar & Publishing", image: "/marketing/product/calendar.webp", description: "Review drafts, approve the work, and keep track of your publishing schedule." },
    { id: "deliverables", label: "Deliverables", Icon: DashboardIcon, title: "Work, ready to use.", image: "/marketing/product/deliverables.webp", description: "Open your research, strategy, and content documents. Review the full report or download a copy." }
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
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-structure/40 text-primary lg:mb-[min(.6667vw,12.8px)] lg:h-[min(4.0625vw,78px)] lg:w-[min(4.0625vw,78px)] lg:rounded-[min(1vw,19.2px)]">
                <current.Icon />
              </div>

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
