'use client'


import { useTranslations } from "@/features/marketing/model/translations";
import { useRef } from "react";
import { ROUTES } from "@/shared/routes";
import { interpolate, useScrollScene } from "@/shared/ui/motion/use-scroll-scene";
import { MARKETING_ASSETS } from "../model/assets";
import { MarketingCta } from "./MarketingCta";
import BrandOutline from "./BrandOutline";

export default function BottomCTA({ isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  const t = useTranslations("Marketing");
  const root = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);

  useScrollScene(root, (progress, reducedMotion) => {
    if (reducedMotion) {
      [panel.current, screen.current].forEach((element) => element?.removeAttribute("style"));
      if (outline.current) {
        outline.current.style.transform = "translate3d(-50%, 0, 0)";
        outline.current.style.opacity = "1";
      }
      return;
    }
    if (panel.current) {
      panel.current.style.transform = `translate3d(0, ${interpolate(progress, [0, 0.45, 1], [80, 0, -20])}px, 0)`;
    }
    if (screen.current) {
      const y = interpolate(progress, [0, 0.55, 1], [220, 25, -15]);
      const rotate = interpolate(progress, [0, 0.55, 1], [18, 8, 3]);
      screen.current.style.transform = `translate3d(0, ${y}px, 0) rotateX(${rotate}deg)`;
    }
    if (outline.current) {
      const y = interpolate(progress, [0.02, 0.42, 1], [180, -15, -25]);
      outline.current.style.transform = `translate3d(-50%, ${y}px, 0)`;
      outline.current.style.opacity = String(interpolate(progress, [0.04, 0.32, 1], [0, 1, 1]));
    }
  }, { mode: "cover" });

  return (
    <section ref={root} className="marketing-closing-scene relative w-full overflow-x-clip bg-cosmic-card px-4 pb-16 text-center sm:px-6 lg:px-8">
      <div
        ref={outline}
        aria-hidden="true"
        dir="ltr"
        className="marketing-closing-wordmark pointer-events-none absolute left-1/2 top-[clamp(2rem,4.5vw,4rem)] z-0 w-[min(92vw,1400px)] opacity-0"
      >
        <BrandOutline />
      </div>
      <div
        ref={panel}
        className="bottom-cta-panel-bg relative z-10 mx-auto min-h-[620px] sm:min-h-[760px] max-w-[1500px] overflow-hidden rounded-[38px] border border-stage-muted/20 px-4 pb-[280px] pt-12 sm:px-5 sm:pb-[360px] sm:pt-20 shadow-[0_40px_100px_rgba(0,0,0,.45)] sm:rounded-[50px]"
      >
        <div className="relative z-20 mx-auto max-w-4xl">
          <h2 className="[text-wrap:balance] text-[clamp(2rem,1rem+3.7vw,5.1rem)] font-normal leading-[1.02] tracking-[-.045em] text-white">{t("BottomCTA.giveYourMarketing")}<br />{t("BottomCTA.aClearNextStep")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-stage-muted sm:text-base">{t("BottomCTA.meetTheIdeaBehindBusmoraBusinessContextUsefulDirection")}</p>
          <MarketingCta
            href={isAuthenticated ? "/employee" : ROUTES.MARKETING.PROCESS}
            size="default"
            className="mt-8"
          >
            {isAuthenticated ? t("Navbar.dashboard") : t("BottomCTA.exploreHowItWorks")}
          </MarketingCta>
        </div>
        <div className="pointer-events-none absolute inset-x-[8%] bottom-[-3%] h-[240px] sm:h-[340px] [perspective:1300px]">
          <div ref={screen} className="h-full origin-bottom overflow-hidden rounded-[28px] border border-white/15 bg-cosmic-card p-2 shadow-[0_-20px_80px_rgba(84,41,224,.38)] [transform-style:preserve-3d] will-change-transform">
            <img src={MARKETING_ASSETS.ctaScreenPreview} alt="" loading="lazy" className="h-auto w-full rounded-[20px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
