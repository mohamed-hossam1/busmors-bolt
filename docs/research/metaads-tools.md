# Composio `metaads` tools: verified facts (Phase 0)

**Status:** ✅ **Phase 0 اتقفلت.** الجدول اتملا من مخرجات السكريبت، وصاحب المشروع أكّده.
**Source:** `.scratch/meta-ads/metaads-tools.json`. السكريبت `scripts/meta-ads/inspect-tools.mjs` طلّع 101 tool، وكلهم على نفس الـ version.
**Date verified:** 2026-11-24

## Tools

| Purpose | Slug | Exact argument names | Toolkit version |
|---|---|---|---|
| List ad accounts of the connected user (`me/adaccounts`) | `METAADS_GET_AD_ACCOUNTS` | fields: `fields` (string or array) · limit: `limit` (1–1000, default 25) · paging cursor: **none** | `20261116_00` |
| Insights at `account` / `ad` level | `METAADS_GET_INSIGHTS` | account/object id: `object_id` (required, `act_` prefix) · level: `level` · date preset: `date_preset` · time increment: `time_increment` (integer 1–90) · fields: `fields` (string or array) · limit: `limit` · paging cursor: `after` | `20261116_00` |

**ليه `METAADS_GET_AD_ACCOUNTS`:**
- هو الـ tool الوحيد اللي بيقرا وبيجيب حسابات اليوزر نفسه، وما بيحتاجش أي argument إجباري.
- التانيين `METAADS_LIST_BUSINESS_AD_ACCOUNTS` و `METAADS_LIST_CLIENT_AD_ACCOUNTS` محتاجين `business_id`، فمش مناسبين لخطوة الربط.
- مفيش في اسمه أي كلمة ممنوعة.

**الـ arguments اللي هنبعتها بالظبط:**
- `METAADS_GET_AD_ACCOUNTS`: `{ fields: 'id,name,currency,timezone_name,account_status', limit: 100 }`
- `METAADS_GET_INSIGHTS`: `{ object_id, level, date_preset, fields: '<comma-joined>', limit: 100 }`، ونضيف `time_increment: 1` للـ trend اليومي، و `after: '<cursor>'` للصفحة اللي بعدها.

## نوع `fields` في الـ schema

| Tool | JSON type بتاع `fields` | فيه `enum`؟ | الـ default | إحنا بنبعت إيه |
|---|---|---|---|---|
| `METAADS_GET_AD_ACCOUNTS` | `anyOf: [string, string[]]` | **لأ** | `"id,account_id,name"` (string) | string واحد مفصول بفواصل |
| `METAADS_GET_INSIGHTS` | `anyOf: [string, string[]]` | **لأ** | `["impressions","clicks","spend"]` (array) | string واحد مفصول بفواصل |

- الـ schema بيقبل النوعين في الاتنين. إحنا اخترنا **string مفصول بفواصل** عشان نبقى ماشيين بنفس الطريقة في الاتنين.
- `insightsArguments` و `listAccountsArguments` في Phase 5 اتظبطوا على كده.
- الـ `fields` بتاع `METAADS_GET_INSIGHTS` **free-form**: مفيش `enum` في أي مكان جوه الـ schema بتاعه.
  - القايمة اللي في الوصف ("Valid standalone fields include …") **أمثلة بس**، مش قيد.
  - عشان كده Phase 6 بقت فيها **fallback**: لو الـ ad call فشل بـ `invalid_request`، بنعيده مرة واحدة من غير حقلي الفيديو. يعني الـ sync عمره ما هيقع بسببهم.

## ملاحظات لازم تتعرف قبل Phase 1

1. **`METAADS_GET_AD_ACCOUNTS` مفيهوش pagination:** مفيش `after` ولا `cursor`، وبيرجّع صفحة واحدة بس.
   - ✅ **الخطة اتحدّثت (Phase 5):** `listAccountsArguments()` مبتاخدش أي parameter وبترجّع `{ fields, limit: 100 }`، و `listAdAccounts` بقت call واحدة من غير pagination.
2. **بيرجّع بس الحسابات "directly assigned"** لليوزر.
   - لو الحساب الإعلاني بتاع العميل واصل له عن طريق Business Manager بس، ممكن مايظهرش، والعميل يشوف رسالة `no_accounts`.
   - ده خطر لازم يتجرّب على حساب حقيقي.
3. **`action_attribution_windows` القيمة الافتراضية بتاعتها `[7d_click]`.**
   - مدير الإعلانات افتراضيًا بيستخدم `7d_click + 1d_view`، فأرقام النتايج عندنا ممكن تطلع **أقل شوية** من اللي في مدير الإعلانات.
   - في الـ MVP مش هنغيّرها، بس لازم ده يتعرف وقت مقارنة الأرقام في الـ checklist النهائي.
4. `time_increment` بيقبل كمان `'all_days'` و `'monthly'`. إحنا هنستخدم الرقم `1` بس.

## Insights fields

| Question | Answer | VERIFIED / UNVERIFIED |
|---|---|---|
| Does `METAADS_GET_INSIGHTS` accept any Graph `fields` string (incl. `video_play_curve_actions`, `video_thruplay_watched_actions`)? | الـ schema بيقبل أي string أو array. بس قايمة "Valid standalone fields" في الوصف **مفيهاش** الحقول دي ولا `cost_per_action_type`. الوصف كمان بيقول إن breakdowns بتتنقل لوحدها، ومش بيقول إن الحقول الغريبة بتترفض. | **UNVERIFIED**: لازم call حقيقي يتأكد منها. ولو Meta رفضتها، الـ sync **مش هيفشل**، لأن Phase 6 بتعيد الـ ad call مرة واحدة بـ `AD_BASE_FIELDS`. ساعتها كيرف الفيديو والـ hold rate بيبقوا `null`، والـ hook rate بيفضل شغال لأنه جاي من `actions`. |

## Response shape (optional, needs a real connected account; never commit samples)

| Question | Answer | VERIFIED / UNVERIFIED |
|---|---|---|
| Rows live under `data.data` or `data.response_data.data`? | الوصف بيقول "follow `paging.cursors.after` or `paging.next`"، وده بيرجّح شكل Graph الطبيعي `{ data: [...], paging }`. | UNVERIFIED |
| `video_play_curve_actions[0].value` is an array of 22 numbers? | — | UNVERIFIED |
| Those numbers are percentages (0–100)? | — | UNVERIFIED |

> الـ `unwrapRows()` في الخطة بيتعامل مع الشكلين (`data.data` و `response_data.data`)، و `toVideoCurve()` بيتعامل مع النسب والأعداد. فالخانات UNVERIFIED دي **مش بتوقف** Phase 1.

## Human confirmation

- [x] I checked this table against the JSON output, and I accept the plan updates (single-page account listing, comma-separated `fields`, video-field fallback). Confirmed by the project owner in chat on 2026-11-24.
