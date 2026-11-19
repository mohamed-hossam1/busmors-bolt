'use client'

import { useDialog } from '@/hooks/useDialog';


import { useTranslations } from "@/features/marketing/model/translations";
import { useState, useEffect, useRef } from "react";
import { Link } from "@/shared/i18n";

import { ROUTES } from "@/shared/routes";
import Brand from "@/components/Brand";

const navigationLinks = [
  { href: ROUTES.MARKETING.HOME, label: "Navbar.home" },
  { href: ROUTES.MARKETING.FEATURES, label: "Navbar.features" },
  { href: ROUTES.MARKETING.PRICING, label: "Navbar.plans" },
] as const;

export default function Navbar() {
  const t = useTranslations("Marketing");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useDialog(mobileMenuOpen, () => setMobileMenuOpen(false));
  const [scrolled, setScrolled] = useState(false);
  const [overLight, setOverLight] = useState(false);
  const [hidden, setHidden] = useState(false);
  const stateRef = useRef({ scrolled: false, overLight: false, hidden: false });

  useEffect(() => {
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const scrollY = window.scrollY;
        const hasHeroScene = window.matchMedia("(min-width: 1280px) and (min-height: 900px) and (prefers-reduced-motion: no-preference)").matches;
        const hasWorkflowScene = window.matchMedia("(min-width: 1280px) and (min-height: 850px) and (prefers-reduced-motion: no-preference)").matches;

        const featureSurface = document.getElementById("feature-surface");
        const featureRect = featureSurface?.getBoundingClientRect();

        const workflow = document.getElementById("workflow");
        const workflowRect = workflow?.getBoundingClientRect();

        // 1. Hero Takeover:
        // After initial hero scroll, hide during the dashboard zoom until #feature-surface reaches top
        const isHeroTakeover = hasHeroScene && scrollY > 80 && (featureRect ? featureRect.top > 160 : false);

        // 2. Workflow Takeover:
        // Hide during the pinned 5-step process flow stage when the full scene fits
        const isWorkflowTakeover = hasWorkflowScene && workflowRect
          ? workflowRect.top <= 80 && workflowRect.bottom >= window.innerHeight * 0.35
          : false;

        const nextHidden = isHeroTakeover || isWorkflowTakeover;
        const nextOverLight = featureRect ? featureRect.top < 145 && featureRect.bottom > 48 : false;
        const nextScrolled = scrollY > 20;

        if (nextHidden !== stateRef.current.hidden) setHidden(nextHidden);
        if (nextOverLight !== stateRef.current.overLight) setOverLight(nextOverLight);
        if (nextScrolled !== stateRef.current.scrolled) setScrolled(nextScrolled);

        stateRef.current = {
          scrolled: nextScrolled,
          overLight: nextOverLight,
          hidden: nextHidden,
        };
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (query.matches) setMobileMenuOpen(false); };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      {/* Desktop floating navigation */}
      <header
        className={`pointer-events-none fixed left-0 right-0 z-40 hidden justify-center px-5 navbar-floating xl:flex ${
          overLight ? "top-[60px]" : "top-[51px]"
        } ${hidden ? "is-hidden" : "is-visible"}`}
      >
        <nav
          className={`pointer-events-auto flex min-h-[78px] w-[min(1100px,calc(100vw-40px))] items-center justify-between gap-4 rounded-[24.8438px] border px-6 [&_a]:min-h-11 transition-[background-color,border-color,box-shadow] duration-300 ${
            overLight
              ? "border-slate-structure bg-cosmic-active/80 shadow-none backdrop-blur-[11px]"
              : scrolled
                ? "border-slate-structure/80 bg-cosmic-active/95 shadow-[0_18px_48px_rgba(10,12,20,.28)] backdrop-blur-xl"
                : "border-slate-structure/85 bg-cosmic-active/96 backdrop-blur-md"
          }`}
        >
          {/* Logo */}
          <Brand light href={ROUTES.MARKETING.HOME} />

          {/* Nav Links */}
          <div className="flex shrink-0 items-center gap-3 text-[15.9px] font-medium leading-[1.5] text-white">
            {navigationLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="p-[15.9px] hover:text-white transition-colors">
                {t(label)}
              </Link>
            ))}
          </div>

          {/* Right Links + CTA */}
          <div className="flex shrink-0 items-center gap-4">
            
            <Link
              href="/signin"

              className="p-[15.9px] text-[15.9px] font-medium leading-[19.08px] text-stage-muted transition-colors hover:text-white"
            >{t("Navbar.login")}</Link>
            <Link
              href="/signup"

              className="inline-flex h-[52px] w-[148px] items-center justify-center rounded-[47.7px] bg-cosmic-canvas text-[15.9px] font-normal text-white transition-colors duration-200 hover:bg-cosmic-active"
            >{t("Navbar.getStarted")}</Link>
          </div>
        </nav>
      </header>

      {/* Mobile Top Navigation */}
      <header
        className={`fixed inset-x-0 top-0 z-40 flex isolate items-center justify-between gap-3 border-b border-white/10 bg-cosmic-deep/90 px-4 py-3 backdrop-blur-lg xl:hidden navbar-mobile-floating [&>a]:min-h-11 ${
          hidden && !mobileMenuOpen ? "is-hidden" : "is-visible"
        }`}
      >
        <Brand light href={ROUTES.MARKETING.HOME} />

        {/* 4-dot Grid Icon */}
        
          <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-cosmic-card p-2.5 text-white"
          aria-label={t("Navbar.toggleNavigationMenu")}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
        >
          <div className="grid grid-cols-2 gap-1 w-4 h-4">
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
          </div>
        </button>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div id="mobile-navigation" role="dialog" aria-modal="true" aria-label={t("Navbar.mobileNavigation")} className="mobile-menu-enter fixed inset-0 z-30 flex h-dvh flex-col justify-between gap-6 overflow-y-auto overscroll-contain bg-cosmic-deep px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-20 backdrop-blur-2xl xl:hidden">
          <div className="flex flex-col gap-6 text-lg font-medium text-slate-200 pt-6">
            {navigationLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-white/5 hover:text-white"
              >
                {t(label)}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-3 pt-6">
            <Link
              href="/signin"
                onClick={() => setMobileMenuOpen(false)}

              className="w-full text-center py-3 rounded-full text-sm font-medium text-cyan-electric bg-cosmic-card border border-white/10"
            >{t("Navbar.login")}</Link>
            <Link
              href="/signup"
                onClick={() => setMobileMenuOpen(false)}

              className="w-full text-center py-3 rounded-full text-sm font-semibold text-white bg-primary hover:bg-purple-hover shadow-lg shadow-primary/30"
            >{t("Navbar.getStarted")}</Link>
          </div>
        </div>
      )}
    </>
  );
}
