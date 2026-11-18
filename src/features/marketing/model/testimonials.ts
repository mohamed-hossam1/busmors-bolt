
type Source = "linkedin" | "g2";

export type Review = {
  name: string;
  handle: string;
  source: Source;
  title: string;
  content: string;
  avatar: string;
};

export const LINKEDIN_LOGO = `/marketing/testimonials/64ba29da4a0de66a335188f2_linkedin.svg`;
export const G2_LOGO = `/marketing/testimonials/6479feb92e0297d81e7c87ad_g2-logo.svg`;

export const LEFT_REVIEWS: Review[] = [
  {
    name: "testimonials.firstCustomer",
    handle: "testimonials.illustrativeExample",
    source: "linkedin",
    title: "testimonials.whereShouldIStart",
    content: "testimonials.explainYourServiceAndWhoItHelpsExploreA",
    avatar: `/marketing/testimonials/64ba29db4ea0e4d87bf6e3cf_Sasha.webp`,
  },
  {
    name: "testimonials.moreInquiries",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.makeTheOfferClearer",
    content: "testimonials.prepareOfferCopyThatExplainsTheValueWhoIt",
    avatar: `/marketing/testimonials/64ba29db4ea0e4d87bf6e412_rarah.svg`,
  },
  {
    name: "testimonials.betterFollowup",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.prepareUsefulReplies",
    content: "testimonials.draftAResponseGuideForCommonQuestionsAndObjections",
    avatar: `/marketing/testimonials/64ba29da8fe384c6dc2b96bc_omar.webp`,
  },
];

export const CENTER_REVIEWS: Review[] = [
  {
    name: "testimonials.anOfferingLaunch",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.giveTheLaunchDirection",
    content: "testimonials.workOnTheAudienceMessageAndNextActionsFor",
    avatar: `/marketing/testimonials/64ba2aac192f7a51adc0e1c3_redon2.webp`,
  },
  {
    name: "testimonials.limitedTime",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.chooseWorkYouCanFinish",
    content: "testimonials.buildPrioritiesAroundYourAvailableTimeAndResourcesInstead",
    avatar: `/marketing/testimonials/64ba29db6beddb56d467769b_shane.webp`,
  },
  {
    name: "testimonials.businessContext",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.stopRepeatingTheBasics",
    content: "testimonials.keepConfirmedInformationInYourBusinessBrainSoThe",
    avatar: `/marketing/testimonials/64ba2b3e7e77798c552610e2_max2.webp`,
  },
  {
    name: "testimonials.contentPreparation",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.draftWithAPurpose",
    content: "testimonials.prepareAPostAroundAClearMessageUsingYour",
    avatar: `/marketing/testimonials/64ba29da4ea0e4d87bf6e39e_alecia.webp`,
  },
  {
    name: "testimonials.ownerControl",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.reviewBeforePublishing",
    content: "testimonials.inspectTheExactPostDestinationAndScheduledTimeBefore",
    avatar: `/marketing/testimonials/64ba29da8fe384c6dc2b968d_michael.webp`,
  },
];

export const RIGHT_REVIEWS: Review[] = [
  {
    name: "testimonials.requestedAnalysis",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.understandYourData",
    content: "testimonials.askForAScopedAnalysisOfASupportedCSV",
    avatar: `/marketing/testimonials/64ba29daa6e0ed80048c8182_ifoma.webp`,
  },
  {
    name: "testimonials.taskVisibility",
    handle: "testimonials.illustrativeExample",
    source: "linkedin",
    title: "testimonials.followTheWork",
    content: "testimonials.thePlannedAgentCanvasShowsRecordedTaskActivityPartial",
    avatar: `/marketing/testimonials/64ba29dcb03f44e6bd4f73b9_elodie.webp`,
  },
  {
    name: "testimonials.yourNextStep",
    handle: "testimonials.illustrativeExample",
    source: "g2",
    title: "testimonials.useChatOrARoadmap",
    content: "testimonials.startWithADirectRequestOrExploreYourObjective",
    avatar: `/marketing/testimonials/64ba29db3b619fe50e21f851_patricia.webp`,
  },
];