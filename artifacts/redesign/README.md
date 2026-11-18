# Redesign verification

All captured product data belongs to the fictional **Luma Studio** fixture. No personal data, real account, production Supabase request, or AI provider call is used in these images.

The reproducible browser checks run with `npm run test:ui`. Use `-- --capture-products` to rebuild the WebP assets used by the landing page. `results.json` records the last successful run.

## Screenshots

| Area | Desktop | Mobile |
| --- | --- | --- |
| Landing | [Hero](landing-desktop.png), [full page](landing-full.png), [features](landing-features.png), [product tour](landing-product-tour.png) | [Hero](landing-mobile.png) |
| Marketing Director | [Conversation and canvas](employee-desktop.png) | [Conversation](employee-mobile.png), [canvas](canvas-mobile.png) |
| Brain | [List](brain-desktop.png), [graph](brain-graph-desktop.png) | [List](brain-mobile.png) |
| Calendar & Publishing | [Posts](calendar-desktop.png) | [Posts](calendar-mobile.png) |
| Deliverables | [Library](deliverables-desktop.png), [report](report-dialog.png) | [Library](deliverables-mobile.png) |
| Settings | [Settings](settings-desktop.png) | [Settings](settings-mobile.png) |
| Auth | [Sign in](signin-desktop.png), [signup](signup-desktop.png), [recovery](reset-desktop.png) | [Sign in](signin-mobile.png), [signup](signup-mobile.png), [recovery](reset-mobile.png) |
| Onboarding | [Onboarding](onboarding-desktop.png) | [Onboarding](onboarding-mobile.png) |
| Dialogs and navigation | [Knowledge editor](knowledge-dialog.png) | [Navigation](mobile-navigation.png) |
| Normal motion | [Hero scroll scene](landing-scroll-scene.png), [workflow](landing-workflow-scene.png) | Reduced-motion/document-flow layouts are captured above. |

## Scope and remaining live validation

The suite verifies desktop, tablet, and 390px/320px mobile layouts, navigation, no page-level horizontal overflow, conversation-specific graphs, node positions and viewport after switching and reloading, Brain dragging without moving/hiding other nodes, keyboard inspection, opaque dialogs, focus trapping, report download, knowledge creation, post editing/approval, guest demo actions, protected redirects, auth errors, local images, tabs/FAQ, and normal/reduced motion.

Live Supabase auth, email delivery, real AI provider execution, permissions/RLS, website crawling, and manual publishing need a real-account smoke test in the configured deployment. Their existing integrations and operations are retained. No schema or Edge Function change was made.

The build passes. Source lint exits successfully with eight existing warnings in the auth/context exports and existing data-loading/event patterns. Generated `dist` assets are excluded from linting.
