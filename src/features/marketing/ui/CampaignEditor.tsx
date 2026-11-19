'use client'


import { useTranslations } from "@/features/marketing/model/translations";
import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  MarketingCard,
  MarketingCardHeader,
  MarketingCardTitle,
  MarketingCardDescription,
} from "./MarketingCard";

export default function CampaignEditor() {
  const t = useTranslations("Marketing");
  const [postText, setPostText] = useState<string | null>(null);
  const [scheduledTime, setScheduledTime] = useState("10:00");

  return (
    <MarketingCard className="p-[22px_20px_32px] xl:col-span-1 xl:min-h-[363px]">
      <div className="flex flex-col items-center">
        <div className="h-[9px] w-[191px] rounded-t-xl border-[0.5px] border-white bg-stage-muted/40" />
        <div className="w-full overflow-hidden rounded-xl border border-white">
          <div className="flex h-12 items-center justify-between border-b-[0.5px] border-white bg-white/40 px-4">
            <span className="text-[12px] font-semibold leading-none text-slate-structure">
              {t("CampaignEditor.illustrativePostDraft")}
            </span>
            <Pencil className="h-[18px] w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="px-4 pb-4">
            <div className="h-[19px]" />
            <label className="sr-only" htmlFor="demo-post-text">
              {t("CampaignEditor.postText")}
            </label>
            <input
              id="demo-post-text"
              type="text"
              value={postText ?? t("CampaignEditor.anIntroductionToYourService")}
              onChange={(event) => setPostText(event.target.value)}
              className="h-11 min-w-0 w-full rounded-lg border-[0.5px] border-white bg-white ps-4 text-[12px] leading-[1.2] text-slate-structure outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="h-4" />
            <div className="flex min-h-11 flex-wrap gap-y-2 py-2 items-center rounded-lg border-[0.5px] border-white bg-white ps-4 text-[12px] text-stage-muted">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-cosmic-canvas">{t("CampaignEditor.time")}</span>
                <span>{t("CampaignEditor.cairo")}</span>
              </div>
              <span className="mx-4 h-5 w-px bg-lavender-tint" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-cosmic-canvas">◷</span>
                <label className="sr-only" htmlFor="demo-post-time">
                  {t("CampaignEditor.scheduledTime")}
                </label>
                <input
                  id="demo-post-time"
                  inputMode="text"
                  value={scheduledTime}
                  onChange={(event) => setScheduledTime(event.target.value)}
                  className="min-h-11 w-12 bg-transparent text-[12px] text-slate-structure outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <MarketingCardHeader className="mt-4 ps-4">
        <MarketingCardTitle>{t("CampaignEditor.prepare")}</MarketingCardTitle>
        <MarketingCardDescription>
          {t("CampaignEditor.editThisIllustrativeDraftChangesHereAreNotSaved")}
        </MarketingCardDescription>
      </MarketingCardHeader>
    </MarketingCard>
  );
}
