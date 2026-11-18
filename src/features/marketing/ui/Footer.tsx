
import { useTranslations } from "@/features/marketing/model/translations";
import { Link } from "@/shared/i18n";
import { ROUTES } from "@/shared/routes";
import Brand from "@/components/Brand";

export default function Footer() {
  const t = useTranslations("Marketing");
  return (
    <footer className="relative w-full bg-cosmic-deep text-stage-muted py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5 flex flex-col items-center text-center">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        {/* Complete brand lockup */}
        <div className="relative p-[1.5px] rounded-xl overflow-hidden mb-8">
          <span className="absolute inset-[-100%] border-gradient" />
          <div className="relative z-10 bg-cosmic-card rounded-xl flex items-center justify-center px-4 py-2">
            <Brand light href={ROUTES.MARKETING.HOME} />
          </div>
        </div>

        {/* Footer Navigation Link Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8">
          <Link
            href={ROUTES.MARKETING.PROCESS}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-full bg-cosmic-card border border-white/5 text-xs text-stage-muted hover:text-white hover:border-white/20 transition-all"
          >{t("Footer.ownerControl")}</Link>
          <Link
            href={ROUTES.MARKETING.FAQ}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-full bg-cosmic-card border border-white/5 text-xs text-stage-muted hover:text-white hover:border-white/20 transition-all"
          >{t("Footer.questions")}</Link>
          <Link
            href={ROUTES.MARKETING.HOME}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-full bg-cosmic-card border border-white/5 text-xs text-stage-muted hover:text-white hover:border-white/20 transition-all"
          >{t("Footer.home")}</Link>
          <Link
            href={ROUTES.MARKETING.FEATURES}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-full bg-cosmic-card border border-white/5 text-xs text-stage-muted hover:text-white hover:border-white/20 transition-all"
          >{t("Footer.features")}</Link>
          <Link
            href={ROUTES.MARKETING.PRICING}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-full bg-cosmic-card border border-white/5 text-xs text-stage-muted hover:text-white hover:border-white/20 transition-all"
          >{t("Footer.plans")}</Link>
        </div>

        {/* Legal Text & Copyright */}
        <div className="space-y-1.5 text-xs text-stage-subtle">
          <p>{t("Footer.busmoraYourAIMarketingDirector")}</p>
          <p>{t("Footer.arabicFirstYourBusinessAtTheCenter")}</p>
          <p className="pt-2 text-stage-subtle/80">{t("Footer.2026BusmoraProductInDevelopment")}</p>
        </div>
      </div>
    </footer>
  );
}
