import { MARKETING_ASSETS } from "./assets";

type Platform = {
  name: string;
  select?: boolean;
};

type ProcessItem = {
  label: string;
  icon: string;
};

export const PLATFORM_COLUMNS: (Platform | null)[][] = [
  [
    { name: "processflow.businessName", select: true },
    { name: "processflow.offering", select: true },
    { name: "processflow.serviceArea" },
    null,
  ],
  [
    { name: "processflow.description", select: true },
    { name: "processflow.pricingIfKnown" },
    { name: "processflow.contactRoute" },
    null,
  ],
  [
    { name: "processflow.ownerReview", select: true },
    { name: "processflow.confirmedFacts" },
    { name: "processflow.businessBrain" },
    null,
  ],
];

export const OBJECTIVES: ProcessItem[] = [
  { label: "processflow.firstCustomer", icon: MARKETING_ASSETS.process.firstCustomer },
  { label: "processflow.moreInquiries", icon: MARKETING_ASSETS.process.inquiries },
  { label: "processflow.betterInquiryConversion", icon: MARKETING_ASSETS.process.conversion },
];

export const AD_TYPES_LEFT: ProcessItem[] = [
  { label: "processflow.offerBrief", icon: MARKETING_ASSETS.process.firstCustomer },
  { label: "processflow.responseGuide", icon: MARKETING_ASSETS.process.inquiries },
  { label: "processflow.postDraft", icon: MARKETING_ASSETS.process.postDraft },
];

export const AD_TYPES_RIGHT: ProcessItem[] = [
  { label: "processflow.researchSummary", icon: MARKETING_ASSETS.process.research },
  { label: "processflow.pageCopy", icon: MARKETING_ASSETS.process.firstCustomer },
  { label: "processflow.visualBrief", icon: MARKETING_ASSETS.process.firstCustomer },
];
