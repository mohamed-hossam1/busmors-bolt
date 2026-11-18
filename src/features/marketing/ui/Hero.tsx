
import { useTranslations } from "@/features/marketing/model/translations";
import { useRef } from "react";
import { ROUTES } from "@/shared/routes";
import { interpolate, useScrollScene } from "@/shared/ui/motion/use-scroll-scene";
import { MARKETING_ASSETS } from "../model/assets";
import { MarketingCta } from "./MarketingCta";
import BrandOutline from "./BrandOutline";

const CURVES = [
  "M0 92 C124 164 254 251 366 278 C476 305 590 291 786 291",
  "M0 153 C130 213 258 278 370 302 C481 326 600 309 786 309",
  "M0 214 C135 255 268 311 374 324 C492 339 606 327 786 327",
  "M0 274 C145 303 278 333 379 343 C500 355 612 345 786 345",
  "M0 334 C151 342 283 355 386 358 C507 361 620 362 786 363",
  "M0 393 C151 382 283 367 386 373 C507 379 620 378 786 380",
  "M0 453 C143 423 275 394 379 390 C498 386 613 395 786 397",
  "M0 513 C134 465 266 420 374 406 C490 390 608 407 786 415",
  "M0 574 C124 509 257 445 366 423 C478 401 596 419 786 433",
] as const;

function PlatformRow({ reverse = false }: { reverse?: boolean }) {
  const t = useTranslations("Marketing");
  const labels = [
    t("Hero.businessBrain"), t("Hero.directorChat"), t("Hero.roadmap"),
    t("Hero.deliverables"), t("Hero.scheduling"), t("Hero.ownerApproval"),
  ];

  return (
    <div className={`flex w-max ${reverse ? "animate-marquee-right" : "animate-marquee-left"}`}>
      {[...labels, ...labels, ...labels].map((name, index) => (
        <div
          key={`${name}-${index}`}
          className="mx-2 flex items-center gap-2.5 rounded-full border border-white/[0.055] bg-cosmic-card/90 px-5 py-2.5 text-sm font-medium text-stage-muted"
        >
          <img src={MARKETING_ASSETS.contextIcon} alt="" className="h-4 w-4 object-contain opacity-70" />
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
}

function CurveSet({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <g transform={mirrored ? "translate(1908 0) scale(-1 1)" : undefined}>
      {CURVES.map((path, index) => (
        <path
          key={`base-${index}`}
          d={path}
          fill="none"
          stroke="#536078"
          strokeOpacity={index === 4 ? 0.34 : 0.28}
          strokeWidth="0.85"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {CURVES.map((path, index) => {
        if (index === 1 || index === 4 || index === 7) return null;

        const animationStyle = {
          animationDelay: `${-(index * 1.19 + (mirrored ? 2.7 : 0))}s`,
          animationDuration: `${6.2 + (index % 3) * 0.75}s`,
        };

        return (
          <g key={`pulse-${index}`}>
            <path
              d={path}
              pathLength="100"
              fill="none"
              stroke="url(#hero-led-gradient)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="13 87"
              vectorEffect="non-scaling-stroke"
              className="hero-led-pulse hero-led-pulse-glow"
              style={animationStyle}
            />
            <path
              d={path}
              pathLength="100"
              fill="none"
              stroke="url(#hero-led-gradient)"
              strokeWidth="1.15"
              strokeLinecap="round"
              strokeDasharray="13 87"
              vectorEffect="non-scaling-stroke"
              className="hero-led-pulse"
              style={animationStyle}
            />
          </g>
        );
      })}
    </g>
  );
}

function HeroCurves() {
  return (
    <svg viewBox="0 0 1908 936" preserveAspectRatio="none" aria-hidden="true" className="h-full w-full">
      <defs>
        <linearGradient id="hero-led-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7153ff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#7153ff" stopOpacity="0.62" />
          <stop offset="0.72" stopColor="#8d72ff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#79a9ff" stopOpacity="0" />
        </linearGradient>
        <filter id="hero-led-glow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>
      <CurveSet />
      <CurveSet mirrored />
    </svg>
  );
}

export default function Hero() {
  const t = useTranslations("Marketing");
  const root = useRef<HTMLElement>(null);
  const curves = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const marquees = useRef<HTMLDivElement>(null);

  useScrollScene(root, (progress, reducedMotion) => {
    const elements = [curves.current, copy.current, dashboard.current, outline.current, marquees.current];
    if (reducedMotion || window.innerHeight < 900) {
      elements.forEach((element) => element?.removeAttribute("style"));
      return;
    }

    const viewport = window.innerHeight;
    if (curves.current) {
      curves.current.style.transform = `translate3d(0, ${interpolate(progress, [0, 1], [0, -0.14 * viewport])}px, 0)`;
    }
    if (copy.current) {
      const y = interpolate(progress, [0, 0.42, 1], [0, -0.61 * viewport, -0.84 * viewport]);
      copy.current.style.transform = `translate3d(0, ${y}px, 0)`;
      copy.current.style.opacity = String(interpolate(progress, [0, 0.44, 0.62], [1, 1, 0]));
    }
    if (dashboard.current) {
      const y = interpolate(progress, [0, 0.62, 1], [0, -0.61 * viewport, -1.14 * viewport]);
      const scale = interpolate(progress, [0, 0.56, 1], [1, 1.045, 0.98]);
      dashboard.current.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
    }
    if (outline.current) {
      outline.current.style.opacity = String(interpolate(progress, [0.08, 0.42, 0.84], [0, 0.65, 0.25]));
    }
    if (marquees.current) {
      const y = interpolate(progress, [0.34, 0.92], [0.18 * viewport, -0.38 * viewport]);
      marquees.current.style.transform = `translate3d(0, ${y}px, 0)`;
      marquees.current.style.opacity = String(interpolate(progress, [0.34, 0.57, 0.9], [0, 1, 0.25]));
    }
  }, { disabledBelow: 1280 });

  return (
    <section ref={root} id="home" className="marketing-hero relative h-[295svh] bg-cosmic-canvas">
      <div className="marketing-hero-stage sticky top-0 h-svh">
        <div className="marketing-hero-surface relative h-full overflow-hidden rounded-b-[47.7px] border-x border-b border-slate-structure/40 bg-cosmic-card mx-[3.125vw] max-sm:mx-0 max-sm:rounded-b-[34px] max-sm:border-x-0">
        <div
          ref={curves}
          className="pointer-events-none absolute inset-0 z-0 opacity-90"
        >
          <HeroCurves />
        </div>

        <div
          ref={copy}
          className="marketing-hero-copy relative z-10 mx-auto flex max-w-[1420px] flex-col items-center px-5 pt-[25.2vh] text-center"
        >
          <h1 className="max-w-full [text-wrap:balance] text-[clamp(2.25rem,1rem+4.8vw,7.75rem)] font-normal leading-[1.12] tracking-[-0.045em] text-white xl:leading-[1]">{t("Hero.marketingDirection")}<br />{t("Hero.builtAroundYou")}</h1>
          <p className="mt-[18px] max-w-[65ch] [text-wrap:pretty] text-[clamp(1rem,.9rem+.35vw,1.35rem)] font-normal leading-[1.5] text-white/95">{t("Hero.yourAIMarketingDirectorUnderstandYourPrioritiesPrepareThe")}</p>
          <MarketingCta
            href={ROUTES.MARKETING.DEMO}
            size="lg"
            className="mt-[33px]"
          >
            {t("Hero.startFreeTrial")}
          </MarketingCta>
          <div className="mt-10 flex max-w-[690px] flex-col items-center xl:mt-[96px]">
            <p className="text-[clamp(.88rem,.94vw,1.12rem)] leading-[1.45] tracking-[.006em] text-stage-muted">{t("Hero.startWithYourBusinessChooseAUsefulNextStep")}{" "}<br className="hidden sm:block" />{t("Hero.reviewTheWorkBeforeAnythingGoesLive")}</p>
            <span className="mt-[13px] text-sm font-semibold tracking-wide text-purple-focus">{t("Hero.directorLabel")}</span>
          </div>
        </div>

        <div
          ref={outline}
          aria-hidden="true"
          dir="ltr"
          className="marketing-hero-wordmark pointer-events-none absolute left-1/2 top-[44vh] z-[1] w-[80vw] max-w-[1450px] text-stage-muted opacity-0"
        >
          <BrandOutline />
        </div>

        <div className="marketing-hero-dashboard absolute left-1/2 top-[88.4vh] z-20 w-[min(67vw,1280px)]">
          <div ref={dashboard} className="origin-top will-change-transform">
            <div className="rounded-[24px] border border-slate-structure/75 bg-cosmic-card p-[11px] shadow-[0_34px_105px_rgba(0,0,0,.7),0_0_46px_rgba(100,55,252,.1)] sm:rounded-[29px] sm:p-[13px]">
              <div className="overflow-hidden rounded-[17px] sm:rounded-[20px]">
                <img
                  src={MARKETING_ASSETS.heroDashboard}
                  alt={t("Hero.dashboardPreview")}
                  width={1440}
                  height={960}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </div>
            </div>
            <img
              src={MARKETING_ASSETS.heroScreenBottomMask}
              alt=""
              className="pointer-events-none absolute -bottom-5 left-1/2 w-3/4 -translate-x-1/2 opacity-70"
            />
          </div>
        </div>

        <div
          ref={marquees}
          className="marketing-hero-marquees absolute inset-x-0 top-[108vh] z-10 space-y-4 overflow-hidden"
        >
          <PlatformRow />
          <PlatformRow reverse />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-cosmic-card to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-cosmic-card to-transparent" />
        </div>
        </div>
      </div>
    </section>
  );
}
