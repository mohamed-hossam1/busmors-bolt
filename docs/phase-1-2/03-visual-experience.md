# Visual and interaction brief

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

Goal: a coherent, premium product demonstration that feels useful within the first minute. Preserve the current identity. Improve composition and behavior before adding animation.

## 1. Shared visual system

Use `DESIGN.md` and existing tokens: dark outer canvas `#080911`, navigation/card `#121520`, work surface `#edf0fe`, primary purple `#6437fc`, light secondary text `#42516b`, dark secondary text `#bdc5e6`. Use the local Inter font. Do not introduce another font family or unrelated accent palette.

- Page header: clear title, one short explanatory sentence, one dominant action, optional secondary actions. Do not fill every header with badges and statistics.
- Cards: 16–22px corners, restrained border/shadow, clear title/body/footer. Primary content gets whitespace, not giant decorative headers.
- Desktop: persistent dark sidebar and light work surface. Use 24–32px page gutters and a readable content width. Mobile: 12–16px gutters, full-width sheets and touch targets around 44px.
- Motion: 150–250ms for drawers/state transitions; limited entrance motion. Honor reduced motion. Never delay a completed result for theatrical progress.
- Loading: content skeletons for reads; actual step labels for tasks. Empty states explain the next action. Errors preserve input and offer a specific recovery action.
- Status text always accompanies color. Show saving/saved/error states on editable drafts. A toast is not the only place important failures appear.
- Destructive actions show the exact subject. Preserve the current per-workspace Brain delete preference; do not copy that preference to consequential publishing approvals.
- Mixed-script URLs, emails, numbers and dates use explicit LTR islands or bidi isolation inside LTR layouts.

## 2. Navigation and shell

Desktop order: **Director, Roadmap, Business Brain, Deliverables, Scheduling**, then Settings. Header contains workspace identity, notification bell/unread count, and workspace control. No Today Dashboard or performance dashboard.

On mobile, avoid seven cramped tabs: primary tabs Director/Roadmap/Scheduling, with a More sheet for Brain/Documents/Settings. Keep the existing menu if adapting it is faster, but every destination must remain easy to reach. Selected state and route title must agree.

Resource links open exact items: conversation/task, document/version, Post/version, roadmap step, question, or proposal. A back action returns to the originating surface when possible. No dead CTA, empty modal, or navigation that loses saved work.

## 3. Screen-by-screen specification

### Authentication

Retain the existing branded two-column AuthLayout. Left: compact form and Google button; right: one polished product visual and short benefit. Signup asks only email/password. Verification has a clear email destination, resend cooldown and change-email/back option. Reset completion has new password/confirmation. Localize every error and success message.

### Onboarding

First screen: three clear cards: Import Website, Manual Setup, Social Import with disabled Coming Soon/Phase 3 label. Website field has a real example and an explanation of public-page reading. On failure, retain partial data and offer Continue manually.

Shared form sections: Business basics, Offerings, Where you serve, How customers contact you. Offering cards support Add another; pricing type is a dropdown and amount appears only when appropriate. Not-ready contact route is a first-class option.

Before confirmation show a compact summary with source chips and Edit links. Confirmation button says Confirm business context. Completion screen offers two equally discoverable choices: Chat with my Director and Create my Roadmap; Brain remains accessible as a secondary link.

### Director Chat

Desktop: conversation history in a compact collapsible area, main conversation, contextual Canvas pane. Mobile: Chat default with Canvas sheet/tab. Opening a document or Post uses a focused detail sheet, not a new disconnected app.

Empty state suggests four goal-oriented prompts, such as improve inquiries, research customers, draft one Post, create a Roadmap. The greeting must not claim to have reviewed facts before retrieval happened.

Structured form cards have 3–4 meaningful choices, custom answer, and appropriate Unknown/Skip/N/A actions. Submitted choices remain visible. Exact pending question can be reached from Canvas or notifications. Budget requests show what extra work is proposed, not an unexplained credit counter.

### Agent Canvas

Keep React Flow, with nodes generated from actual step instances. Node hierarchy: agent/tool name, brief work label, status, source/result count. Clicking opens safe detail: input summary, timestamps, evidence and output links. Include a chronological List tab with the same information.

Task selector lives inside the current conversation. Use queued/processing/awaiting input/held/complete/partial/failed/cancelled labels. Show a useful result even when the run is partial. Never invent a percentage, fake a tool call, or expose private reasoning.

### Business Brain

Keep List as mobile default. Desktop Graph/List switch, search, category/status filters, pending-proposal count. Graph node details show statement, source type/date, owner approval status, evidence/uncertainty, related items and Edit action.

Pending proposals use a clear old/new comparison with approve/edit-and-approve/reject. Relationships are edited in a form with source/target/relation, not a complex diagram authoring tool. A changed price produces a visible affected-work notice with links to held Posts.

### Discovery Wizard

Use a focused center column: compact progress by answered questions, goal label, one primary question card, optional context sidebar, saved indicator. Do not show a mandatory 20-question survey. Goal changes adapt subsequent questions while preserving saved incompatible answers as historical, not silently deleting them.

Each card explains why an indispensable answer matters. Reused Brain information appears as Already known with Edit. Research with Director saves and opens linked Chat. Return highlights the exact question and selected source-aware answer; the user still confirms it.

### Roadmap

The primary showcase screen: a full vertical step timeline, optional plan sections, and a compact goal/constraint summary. Each step card shows title, rationale, responsibility, expected result, effort, status and main action. Expand for evidence/dependencies/checklist.

Review proposal before activation. Active plan header has Revise plan and View history. Progress separates completed, owner-reported, skipped and blocked. Do not use a Kanban board or imply a business goal is achieved because tasks are checked off.

Step detail: Run with Director / Mark as Done according to mode; Skip/Revisit secondary; Cancel Task separately for running work. Blocked steps name the exact unmet dependency and a useful alternative. Revision review shows added/modified/removed steps and dependency changes, with Accept/Reject.

### Research and Deliverables

Research report begins with the question, strongest finding, sources/limitations, and recommended next action. Expandable source cards show URL, access/publication date, excerpt, and original wording versus translation. No decorative source count without actual support.

Library cards show document title/type/origin/date and short excerpt. Search/type/date filters are visible. Detail/editor includes version selector, sources/context label and Edit/Copy/Export/Reuse/Continue/Delete. A Post belongs to Scheduling; campaign plans may link to Posts.

### Scheduling and Post editor

Desktop defaults to Month. Toolbar: previous/today/next, current range, Month/Week/List, filters, New Post. Unscheduled is an explicit tab/tray. Mobile defaults may favor List, but Month remains available.

Calendar items use status chips and readable title/platform/time. Unapproved proposed times are visually distinct from scheduled sends. Published history uses actual publication time. Selecting an item opens a detail panel with version, preview, destination, local date/time/zone and delivery allowance.

Editor: content on the left, Facebook preview on the right; image upload/replace/remove; optional link; destination and schedule section. Draft saving works without a Page. Show missing requirements beside approval. Every content/time/Page/media change resets approval clearly.

Batch review shows the exact selected set, a compact per-Post preview and version, Approve selected/Approve all displayed. Display per-item conflicts without losing successful decisions. Include reschedule form even if drag/drop is implemented.

Real publish success includes the actual permalink and Open on Facebook. Uncertain result says Verification needed and offers refresh/check/recovery; it must never display a fake green success card.

### File analysis

Chat attachment opens a three-step flow: Upload → Map and validate → Review result. Provide CSV and XLSX example downloads. Show a few preview rows, mapped fields, period/currency and warnings before confirmation.

Result: compact metrics table with definitions/source period and unavailable explanations, followed by model interpretation and limitations. A simple funnel or bar chart is optional only when it clarifies valid data. No recurring performance page or invented growth score.

### Settings and notifications

Settings groups: Account, Region, Connections, AI/Usage, Data. Keep advanced model/key configuration collapsed so judges do not have to understand API providers before using the product. Explain disconnected/reconnect-needed consequences.

Notification panel groups unread/recent items; exact subject link, timestamp, read control and mark-all-read. No noisy notification for a recovered internal retry.

### Landing page

Preserve the existing visual direction and interactive product sections. Make the hero communicate the actual product: business context, useful direction, executable work. Main CTA enters the real app; a clearly labeled preview can remain separate.

Replace outdated screenshots with working Roadmap/Brain/Calendar views. Avoid unfinished pricing or claims of automated Ads/Instagram/images. Show planned capabilities honestly. Keep illustrative examples labeled; use business/use-case icons rather than implying unrelated people's photos are customer endorsements.

## 4. Visual acceptance checklist

- [ ] Critical screens look intentional at 1440×900 and 390×844; check 320px for overflow.
- [ ] No horizontal overflow, clipped menus, covered approval button, or tiny calendar interactions.
- [ ] English LTR layout, URLs, dates and charts remain readable at every supported width.
- [ ] Sidebar, breadcrumbs, headings and active item agree.
- [ ] Dialog focus, Escape, tab order, labels, errors and keyboard alternatives work.
- [ ] Loading/empty/error/partial/success states are designed on every new surface.
- [ ] Buttons have one clear consequence and remain disabled only for an explained reason.
- [ ] Saved drafts survive navigation/reload; expensive task/browser limitations are explained only where relevant.
- [ ] Real sources, current versions and actual publishing evidence are inspectable.
- [ ] Motion adds clarity and polish without blocking reading or faking activity.

Do not add new ornamental sections until this checklist passes for the core demo journey.
