import { Link } from "@/shared/i18n";
import { useTranslations } from "@/features/marketing/model/translations";
import { ROUTES } from "@/shared/routes";
import { MARKETING_ASSETS } from "../model/assets";
import {
  MarketingCard,
  MarketingCardTitle,
  MarketingCardDescription,
} from "./MarketingCard";
import { SectionHeader } from "@/shared/ui/section-header";

export default function FeaturesInstantAds() {
  const t = useTranslations("Marketing");
  const AUDIENCES = [
    t("FeaturesInstantAds.yourOfferings"),
    t("FeaturesInstantAds.yourAudience"),
    t("FeaturesInstantAds.yourServiceArea"),
    t("FeaturesInstantAds.yourDecisions"),
  ];

  return (
    <section className="relative w-full bg-transparent px-[clamp(16px,3.125vw,59.625px)] py-20 text-cosmic-canvas">
      <SectionHeader
        theme="lavender"
        eyebrow={t("FeaturesInstantAds.yourStartingPoint")}
        title={
          <>
            {t("FeaturesInstantAds.yourContext")}
            <br />
            {t("FeaturesInstantAds.usefulWork")}
          </>
        }
        description={t("FeaturesInstantAds.tellBusmoraWhatYouDoBuildSharedContextAsk")}
      />

      <div className="mx-auto mt-12 grid max-w-[1193px] grid-cols-1 gap-7 pt-12 lg:grid-cols-2">
        {/* Card 1: Listening Director */}
        <MarketingCard className="overflow-hidden py-8 pl-0 pr-0 lg:col-span-2 lg:min-h-[344px] lg:flex-row lg:items-center lg:justify-between lg:pl-12">
          <div className="w-full shrink-0 px-4 lg:w-[514px] lg:shrink lg:px-0 lg:pl-4">
            <div className="inline-flex h-[39px] w-[96px] flex-col items-center justify-center rounded-lg bg-white text-cosmic-canvas">
              <span className="text-[6.5px] leading-[1.1]">{t("FeaturesInstantAds.designedFor")}</span>
              <span className="text-[9.5px] font-bold leading-[1.15]">{t("FeaturesInstantAds.yourBusiness")}</span>
            </div>
            <MarketingCardTitle className="mt-4">
              {t("FeaturesInstantAds.aDirectorWhoStartsByListening")}
            </MarketingCardTitle>
            <MarketingCardDescription className="mt-4">
              {t("FeaturesInstantAds.startFromYourWebsiteOrEnterYourBusinessDetails")}
              <br />
              {t("FeaturesInstantAds.illustrativeProductExperienceInDevelopment")}
            </MarketingCardDescription>
          </div>

          <div className="mt-8 w-full px-4 lg:mt-0 lg:w-[52%] lg:shrink-0 lg:pe-0">
            <img src={MARKETING_ASSETS.marketingDirector} width={1440} height={960} alt={t("FeaturesInstantAds.marketingDirectorAlt")} loading="lazy" className="rounded-xl border border-white shadow-lg lg:-translate-x-5" />
          </div>
        </MarketingCard>

        {/* Card 2: Business Brain Context */}
        <MarketingCard className="w-full overflow-hidden pb-12">
          <div className="flex shrink-0 flex-col pt-12 lg:min-h-[396px]">
            <div className="px-4 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-5 py-4">
                <span className="text-[14px] font-semibold text-slate-structure">{t("FeaturesInstantAds.websiteImportIllustrativeExample")}</span>
                <span className="text-[14px] font-semibold text-primary">{t("FeaturesInstantAds.draftReady")}</span>
              </div>
              <div className="mb-5 mt-3 grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                {AUDIENCES.map((audience, idx) => (
                  <div
                    key={idx}
                    className="scroll-reveal flex items-center rounded-xl bg-white/40 px-5 py-4"
                    style={{ transitionDelay: `${idx * 60}ms` }}
                  >
                    <span className="text-[14px] font-semibold text-slate-structure">{audience}</span>
                  </div>
                ))}
              </div>
            </div>

            <img
              src={MARKETING_ASSETS.aiFeaturesWrap}
              alt=""
              loading="lazy"
              className="mt-5 h-auto w-full shrink-0 object-contain"
            />
          </div>

          <div className="mt-8 w-full px-8 text-center">
            <MarketingCardTitle>
              {t("FeaturesInstantAds.yourBusinessBrain")}
            </MarketingCardTitle>
            <MarketingCardDescription className="mt-2">
              {t("FeaturesInstantAds.keepConfirmedBusinessInformationInOnePlaceReviewProposed")}
            </MarketingCardDescription>
          </div>
        </MarketingCard>

        {/* Card 3: Approval First */}
        <MarketingCard className="w-full items-center overflow-hidden px-5 pb-12">
          <div className="flex w-full shrink-0 flex-col items-center lg:min-h-[396px] [&>svg]:shrink-0 [&>div]:shrink-0">
            <img
              src={MARKETING_ASSETS.connectorFourImages}
              alt=""
              loading="lazy"
              className="-mt-12 h-[109px] w-[473px] max-w-full shrink-0 object-contain"
            />

            <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 367.596 41" className="h-[41px] w-[364px] max-w-full overflow-hidden">
              <g transform="translate(-1083.203 -3274)">
                <path d="M174.1,31h0V20.5a7.5,7.5,0,0,0-7.5-7.5H8A7.5,7.5,0,0,1,.5,5.5V-10" transform="translate(1083.203 3284)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M.5,31h0V20.5A7.5,7.5,0,0,1,8,13H166.6a7.5,7.5,0,0,0,7.5-7.5V-10" transform="translate(1276.203 3284)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M55.1,31h0V14.5A7.5,7.5,0,0,0,47.6,7H6A7.5,7.5,0,0,1-1.5-.5V-10" transform="translate(1208.203 3284)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M.5,31h0V14.5A7.5,7.5,0,0,1,8,7H49.6A7.5,7.5,0,0,0,57.1-.5V-10" transform="translate(1270.203 3284)" fill="none" stroke="white" strokeWidth="1" />
              </g>
              <g transform="translate(-1083.203 -3274)">
                <path d="M174.1,31h0V20.5a7.5,7.5,0,0,0-7.5-7.5H8A7.5,7.5,0,0,1,.5,5.5V-10" transform="translate(1083.203 3284)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" />
                <path d="M.5,31h0V20.5A7.5,7.5,0,0,1,8,13H166.6a7.5,7.5,0,0,0,7.5-7.5V-10" transform="translate(1276.203 3284)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "0.4s" }} />
                <path d="M55.1,31h0V14.5A7.5,7.5,0,0,0,47.6,7H6A7.5,7.5,0,0,1-1.5-.5V-10" transform="translate(1208.203 3284)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "0.8s" }} />
                <path d="M.5,31h0V14.5A7.5,7.5,0,0,1,8,7H49.6A7.5,7.5,0,0,0,57.1-.5V-10" transform="translate(1270.203 3284)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "1.2s" }} />
              </g>
            </svg>

            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl p-px">
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.7em" height="1.7em" viewBox="0 0 22.13 21.017">
                  <g transform="translate(-0.002 0)">
                    <path d="M582.35,393.628l-1.736-.848-7.578,3.99a2.808,2.808,0,0,1-2.616,0l-7.578-3.989-1.736.848a.789.789,0,0,0-.021,1.407l9.335,4.915a2.808,2.808,0,0,0,2.616,0l9.335-4.915a.789.789,0,0,0-.021-1.407Z" transform="translate(-560.661 -379.256)" fill="currentColor" className="text-cosmic-canvas" opacity="0.4" />
                    <path d="M582.352,308.459l-1.719-.839-7.6,4a2.808,2.808,0,0,1-2.616,0l-7.6-4-1.718.839a.789.789,0,0,0-.021,1.407l9.335,4.915a2.808,2.808,0,0,0,2.616,0l9.335-4.915a.789.789,0,0,0-.021-1.407Z" transform="translate(-560.664 -297.266)" fill="currentColor" className="text-cosmic-canvas" opacity="0.6" />
                    <path d="M582.394,35.747l-9.335,4.915a2.808,2.808,0,0,1-2.616,0l-9.335-4.915a.789.789,0,0,1,.022-1.407l9.389-4.585a2.807,2.807,0,0,1,2.464,0l9.39,4.585a.789.789,0,0,1,.022,1.407Z" transform="translate(-560.683 -29.47)" fill="currentColor" className="text-cosmic-canvas" />
                    <path d="M582.35,223.518l-1.717-.838-7.6,4a2.808,2.808,0,0,1-2.616,0l-7.6-4-1.717.838a.789.789,0,0,0-.021,1.407l9.335,4.914a2.808,2.808,0,0,0,2.616,0l9.335-4.914a.789.789,0,0,0-.021-1.407Z" transform="translate(-560.662 -215.488)" fill="currentColor" className="text-cosmic-canvas" opacity="0.8" />
                  </g>
                </svg>
              </div>
            </div>

            <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 468.596 41" className="h-[41px] w-[464px] max-w-full overflow-hidden">
              <g transform="translate(51)">
                <path d="M.5-10h0V.5A7.5,7.5,0,0,0,8,8H212.6a7.5,7.5,0,0,1,7.5,7.5V31" transform="translate(197 10)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M220.1-10h0V.5A7.5,7.5,0,0,1,212.6,8H8A7.5,7.5,0,0,0,.5,15.5V31" transform="translate(-51 10)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M55.1-10h0V30.5" transform="translate(128.404 10)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M.5-10h0V6.5A7.5,7.5,0,0,0,8,14h93.6a7.5,7.5,0,0,1,7.5,7.5V31" transform="translate(190 10)" fill="none" stroke="white" strokeWidth="1" />
                <path d="M109.1-10h0V6.5a7.5,7.5,0,0,1-7.5,7.5H8A7.5,7.5,0,0,0,.5,21.5V31" transform="translate(67 10)" fill="none" stroke="white" strokeWidth="1" />
              </g>
              <g transform="translate(51)">
                <path d="M.5-10h0V.5A7.5,7.5,0,0,0,8,8H212.6a7.5,7.5,0,0,1,7.5,7.5V31" transform="translate(197 10)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" />
                <path d="M220.1-10h0V.5A7.5,7.5,0,0,1,212.6,8H8A7.5,7.5,0,0,0,.5,15.5V31" transform="translate(-51 10)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "0.3s" }} />
                <path d="M55.1-10h0V30.5" transform="translate(128.404 10)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "0.6s" }} />
                <path d="M.5-10h0V6.5A7.5,7.5,0,0,0,8,14h93.6a7.5,7.5,0,0,1,7.5,7.5V31" transform="translate(190 10)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "0.9s" }} />
                <path d="M109.1-10h0V6.5a7.5,7.5,0,0,1-7.5,7.5H8A7.5,7.5,0,0,0,.5,21.5V31" transform="translate(67 10)" fill="none" stroke="currentColor" strokeWidth="1" pathLength={100} strokeDasharray="4 100" className="connector-travel text-primary" style={{ animationDelay: "1.2s" }} />
              </g>
            </svg>

            <div className="relative flex h-[171px] w-[541px] max-w-full items-center justify-center">
              <img
                src={MARKETING_ASSETS.approvalFiveImages}
                alt=""
                loading="lazy"
                className="h-[171px] w-[541px] max-w-full object-contain"
              />
              <Link
                href={ROUTES.MARKETING.DEMO}
                className="absolute z-[2] inline-flex items-center justify-center rounded-full bg-primary px-5 py-4 text-base text-white shadow-lg shadow-primary/35 transition-colors hover:bg-purple-hover"
              >
                {t("FeaturesInstantAds.reviewTheDraft")}
              </Link>
            </div>
          </div>

          <div className="mt-8 w-full px-3 text-center">
            <MarketingCardTitle>
              {t("FeaturesInstantAds.yourApprovalComesFirst")}
            </MarketingCardTitle>
            <MarketingCardDescription className="mt-2">
              {t("FeaturesInstantAds.thePlannedFacebookPublishingFlowAsksYouToApprove")}
            </MarketingCardDescription>
          </div>
        </MarketingCard>
      </div>
    </section>
  );
}
