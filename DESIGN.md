# Busmora interface system

Adapted from the local `busmora-web` reference. The target remains React + TypeScript + Vite; the reference repository was not modified.

| Role | Value |
| --- | --- |
| Deep outer canvas | `#080911` |
| Brand canvas | `#171926` |
| Dark cards / navigation | `#121520` |
| Raised dark surface | `#1b1d30` |
| Active dark surface | `#212936` |
| Work surface | `#edf0fe` |
| Primary action | `#6437fc` |
| Primary hover | `#5229db` |
| Focus on dark | `#8f70ff` |
| Secondary text on light | `#42516b` |
| Secondary text on dark | `#bdc5e6` |

Inter is the primary typeface, with IBM Plex Sans Arabic available as the Arabic fallback. Fonts are served locally; their OFL licenses are included in `public/fonts/`. Buttons use pill shapes, inputs use 12px corners, content cards use 16–22px corners, and large presentation canvases use 40–48px corners. App gutters are 22–32px on desktop and 10–16px on mobile.

Use `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input-field`, `.card`, `.badge`, `.workspace-page`, `.workspace-heading`, and `.workspace-description` for product surfaces. `LoadingState`, `EmptyState`, `Brand`, and `useDialog` own repeated behavior. Popups use `.modal-panel` with opaque white backgrounds; drawers use opaque dark or white surfaces.

Focus rings are visible globally. Dialogs trap Tab, close with Escape, and return focus to their trigger. Product tour tabs support arrow keys, Home, and End. Brain cards support Enter/Space to inspect. Motion obeys `prefers-reduced-motion`; pinned scenes are enhanced only when the viewport can accommodate them.

All marketing product imagery comes from the target UI, populated in the isolated browser suite with fictional data. Decorative SVGs come from the reference assets and its referenced decorative sources. No borrowed dashboard placeholder remains. Pricing remains explicitly unannounced; account creation routes to the actual signup flow and the primary marketing CTA opens the functional guest demo.
