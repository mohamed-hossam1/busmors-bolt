/**
 * Centralized registry for original brand assets and actual product captures.
 * Keeps URLs consistent and prevents hardcoded strings scattered across components.
 */


export const MARKETING_ASSETS = {
  logo: "/brand/busmora-logo.svg",
  contextIcon: "/marketing/context.svg",
  platforms: [
    "/marketing/platform-meta.svg",
    "/marketing/platform-google.svg",
    "/marketing/platform-bing.svg",
    "/marketing/platform-linkedin.svg",
    "/marketing/platform-tiktok.svg",
    "/marketing/platform-pinterest.svg",
    "/marketing/platform-twitter.svg",
    "/marketing/platform-adwords.svg",
  ],
  // Captured from the real target UI with fictional test data.
  heroScreenBottomMask: `/marketing/decorations/screen-bottom-mask_line.svg`,
  heroDashboard: "/marketing/product/employee.webp",

  // Instant ads section
  aiFeaturesWrap: "/marketing/product/brain.webp",
  connectorFourImages: "/marketing/product/canvas.webp",
  approvalFiveImages: "/marketing/product/calendar.webp",

  // Infinite reach section
  waveEffect: `/marketing/decorations/wave-effect.svg`,

  // One tool section
  featurePhone: "/marketing/product/employee-mobile.webp",
  tickSvg: `/marketing/decorations/tick.svg`,
  graphFeature: "/marketing/product/brain.webp",

  process: {
    background: `/marketing/decorations/bg-process.svg`,
    fieldDecoration: `/marketing/decorations/left-upper-dec.svg`,
    reviewPhone: "/marketing/product/calendar-mobile.webp",
    firstCustomer: `/marketing/decorations/objective-1.svg`,
    inquiries: `/marketing/decorations/objective-2.svg`,
    conversion: `/marketing/decorations/objective-3.svg`,
    postDraft: `/marketing/decorations/step-4-3.svg`,
    research: `/marketing/decorations/step-4-4.svg`,
  },

  testimonialsBackground: `/marketing/decorations/testimonials-bg.svg`,

  // Real product screenshots
  tabs: {
    chat: "/marketing/product/employee.webp",
    roadmap: "/marketing/product/canvas.webp",
    brain: "/marketing/product/brain.webp",
  },

  // Bottom CTA
  ctaScreenPreview: "/marketing/product/employee.webp",
} as const;
