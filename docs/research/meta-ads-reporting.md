# Meta Ads Reporting في بزمورا: ملخص الريسيرش والقرار

**التاريخ:** 2026-11-24
**الحالة:** ريسيرش وتوصية، لسه ما اتنفذش كود.
**مرتبط بـ:** [composio.md](composio.md) (الريسيرش الأساسي لـ Composio وأسعاره وأدوات `metaads`).

> **الخلاصة في 5 سطور**
> 1. الهدف: صاحب البيزنس **يشوف بس** أداء حملاته على ميتا (أرقام وتقارير وcharts) بشكل بسيط ومنظم، **من غير ما يعمل أي action**.
> 2. **للـ MVP: Composio بيقوم بالواجب كله.** هو متركّب أصلًا في بزمورا للنشر على فيسبوك، وعنده toolkit اسمه `metaads` فيه `METAADS_GET_INSIGHTS`.
> 3. فيه جزئين: **الداشبورد** بتنادي `METAADS_GET_INSIGHTS` مباشرة من الباك إند، من غير LLM، وبـ **on-demand cache**: بتعمل sync بس لما اليوزر يفتح الصفحة والبيانات قديمة، ومفيش cron. و**الشات** ("اسأل عن إعلاناتك") بيدّي الأيجنت أدوات **قراءة بس**.
> 4. **MCP تاني جنب Composio مش هيضيف حاجة في الـ MVP**، بالعكس هيزوّد التعقيد: ربط مرتين وتوكنات في مكانين.
> 5. **للمشروع الحقيقي:** Meta App بتاعنا + App Review لـ `ads_read`، والداشبورد تتغذّى مباشرة من Marketing API. الشات يفضل على Composio أو يتنقل لـ Meta Ads MCP الرسمي.

---

## 1. المشكلة

- مدير الإعلانات (Ads Manager) معمول للـ media buyer، مش لصاحب البيزنس. اليوزر بيدخل يتوه بين Campaign › Ad set › Ad وعشرات الأعمدة.
- صاحب البيزنس عايز يعرف: **"صرفت كام؟ جالي إيه؟ أنهي إعلان شغال وأنهي لأ؟"**
- الـ media buyers نفسهم بقوا يعملوا تطبيقات بالـ vibe coding عشان يعرضوا الأرقام دي لعملائهم. وده دليل إن الاحتياج حقيقي.
- **النطاق:** قراءة بس. مفيش pause، مفيش تعديل ميزانية، مفيش إنشاء حملات.

---

## 2. السوق: 10 منتجات نتعلم منها

| # | المنتج | ناخد منه إيه |
|---|---|---|
| 1 | **Motion** | تحليل الكرييتف: hook rate و hold rate و retention curve واضح، ومقارنة الإعلانات بالصور جنب بعض |
| 2 | **AgencyAnalytics** | client portal، وروابط تقارير read-only من غير login، و white-label |
| 3 | **Madgicx** | AI insights بتقول "اعمل إيه"، وفكرة الـ scores للإعلان والـ audience |
| 4 | **Triple Whale** | الملخص من أول نظرة بالـ KPI tiles (ROAS، MER، الإنفاق)، وتجربة موبايل ممتازة |
| 5 | **Northbeam** | عرض الـ attribution ومقارنة الحملات ببساطة |
| 6 | **Porter Metrics** | قوالب Looker Studio جاهزة، و MCP قراءة بس |
| 7 | **Whatagraph** | تقارير شكلها حلو لغير التقنيين، وبتتبعت أوتوماتيك بالإيميل |
| 8 | **DashThis** | تقرير **قليل ومركّز**، أقل عدد أرقام ممكن |
| 9 | **Databox** | goals وتنبيهات زي "الـ CPA عدّى الحد"، و scorecard يومي |
| 10 | **Superads / Atria** | تصنيف الكرييتف بالـ AI حسب الـ hook والـ angle |

### أفكار UX لبزمورا

- **ملخص بالعربي من فوق خالص:** "صرفت X، جالك Y رسالة أو طلب، أحسن إعلان كان Z". ده أهم من أي chart.
- **إخفاء الهيكل:** ماتعرضش Campaign › Ad set › Ad. اعرض "إعلاناتك" بالصور على طول.
- **Traffic lights:** أخضر وأصفر وأحمر لكل إعلان مقارنة بمتوسط الحساب.
- **شرح المصطلحات:** tooltip يوضّح CTR و CPM و ROAS يعني إيه بكلام بسيط.
- **كيرف الفيديو** (زي الـ "Time watched" في مدير الإعلانات) مع جملة تفسير: "معظم الناس بيمشوا بعد أول 5 ثواني، جرّب hook أقوى".
- **شات "اسأل عن إعلاناتك":** يجاوب أسئلة زي "إعلان ذكرى عمل إيه الأسبوع ده مقارنة باللي قبله؟".

---

## 3. الخيارات التقنية اللي اتبحثت

| الخيار | إيه هو | المميزات | العيوب | الحكم |
|---|---|---|---|---|
| **Composio `metaads`** | Toolkit فيه managed OAuth وأدوات زي `METAADS_GET_INSIGHTS` | **متركّب أصلًا في بزمورا**. multi-tenant جاهز (connected account لكل بيزنس). التوكنات مشفّرة وبيعملها refresh. نقدر نبدأ من غير Meta App بتاعنا | الخطة المجانية فيها **20K call في الشهر** على الـ managed apps، مشتركة مع النشر. الـ toolkit فيه أدوات write وdestructive، فلازم نحدد الأدوات بالاسم | ✅ **ده اختيار الـ MVP** |
| **Meta Ads MCP الرسمي** (`mcp.facebook.com/ads`) | MCP مستضاف عند ميتا. نزل open beta في أبريل 2026، واتفتح لأي developer عنده Meta app في يوليو 2026 | مجاني، ومن المصدر نفسه، وبيتحدّث مع الـ API | محتاج Meta App بتاعنا و OAuth بتاعنا. ولسه beta | 🟡 بديل للشات في المشروع الحقيقي |
| **MCPs مفتوحة المصدر** (Pipeboard، GoMarble، flin، byadsco) | سيرفرات MCP بتشتغل local أو self-hosted | ممكن نقرأ كودها ونستعير منها الـ functions | معظمها **single-user** (توكن ثابت في `.env`)، فمحتاجة fork عشان تبقى multi-tenant. النسخة المرتبطة بـ Pipeboard رخصتها **BSL** وبتمنع تقدّمها كخدمة hosted منافسة. ومحتاجة سيرفر Python جنب الـ Next.js | ❌ مش محتاجينها |
| **Marketing API مباشرة** (`GET /act_{id}/insights`) | نكلّم ميتا بنفسنا | تحكم كامل، ومن غير وسيط ولا حد شهري لعدد الطلبات، وأسرع | لازم نعمل OAuth ونخزن التوكنات بنفسنا، ومحتاجين App Review | 🟡 ده المكان الصح للداشبورد في المشروع الحقيقي |

---

## 4. القرار للـ MVP

### المعمارية

```
صاحب البيزنس
  └─ "اربط حساب الإعلانات"  →  Composio Connect Link (auth config: metaads, managed)
                                  └─ connected account لكل بيزنس
  └─ اختيار الحساب الإعلاني  →  نجيب الـ Ad Accounts المتاحة، واليوزر يختار حساب البيزنس بتاعه
                                  └─ نخزن ad_account_id + currency + timezone_name

داشبورد التقارير (من غير LLM)، بـ On-Demand Cache (stale-while-revalidate)
  اليوزر يفتح الصفحة  →  نعرض الـ cache فورًا
     └─ لو عمره أكبر من ٤–٦ ساعات  →  sync في الخلفية:
          METAADS_GET_INSIGHTS (period totals + daily trend)
          + جلب الـ ads/creatives (الاسم والصورة)
        →  نحدّث الجدول عندنا
  زرار "تحديث"  →  sync يدوي مع cooldown، مثلًا مرة كل ٣٠ دقيقة
  الرسم  →  shadcn charts / Recharts بالعملة والـ timezone بتوع الحساب

شات "اسأل عن إعلاناتك"
  الأيجنت  →  Composio session بأدوات قراءة بس (allowlist بالاسم)
          →  اختياري: يرجّع JSON والشات يرسمه chart (generative UI)
```

**ليه شلنا الـ cron؟** الـ cron بيعمل sync حتى للي مش فاتحين الصفحة، وده بياكل الحد الشهري بسرعة. مثال: 20 بيزنس × 5 calls × 8 مرات sync في اليوم × 30 يوم = **24K call في الشهر**. ده لوحده أكتر من حد الـ 20K، وده قبل ما نحسب النشر أو الشات. الـ on-demand بيصرف calls بس على اليوزرز اللي فعلًا بيفتحوا الصفحة.

**ليه بنخزن `currency` و `timezone_name`؟** عشان الفلوس تتعرض بعملة الحساب الإعلاني نفسه، وحدود الأيام في الـ charts تمشي على توقيت الحساب، مش توقيت السيرفر.

### ليه كده

1. **مفيش حاجة من الصفر.** الـ OAuth وتخزين التوكنات والـ multi-tenancy بيتعملوا في Composio، بنفس الطريقة اللي النشر على فيسبوك شغّال بيها دلوقتي.
2. **الداشبورد ما بتعديش على LLM.** لو عدّت عليه الصفحة هتاخد 10–15 ثانية، وهندفع tokens على الفاضي، والموديل ممكن يهلوس في رقم. الـ LLM مكانه الشات بس.
3. **الـ cache ضروري** عشان الـ 20K call في الشهر، وعشان الصفحة تفتح فورًا. والـ **on-demand** أوفر من الـ cron لأنه مش بيعمل sync لحد مش بيبص.

### الأمان: القراءة بس

- **ماتدّيش الأيجنت toolkit `metaads` كله.** حدد الأدوات بالاسم: `METAADS_GET_INSIGHTS`، وأدوات الـ list والـ get (الحسابات، الحملات، الإعلانات، الكرييتف).
- **ممنوع** `METAADS_SET_AD_OBJECT_STATUS` وكل الأدوات اللي بتعمل create أو update أو delete.
- لو بقى عندنا Meta App بتاعنا، التوكن يكون بـ scope **`ads_read` بس**. كده القراءة بس تبقى مفروضة من ميتا نفسها، مش مجرد وعد في الكود.

### الأرقام اللي هنسحبها

**المستويات (`level`):** `account`، `campaign`، `ad`. الـ ad set نخفيه عن اليوزر.
**الفترة:** `date_preset` (last_7d و last_30d و this_month)، و `time_increment=1` عشان الـ trend اليومي.

| المجموعة | الـ fields |
|---|---|
| الأساسي | `spend`، `impressions`، `reach`، `frequency`، `clicks`، `ctr`، `cpc`، `cpm` |
| النتايج | `actions`، `cost_per_action_type`، `purchase_roas` (لو فيه pixel) |
| الفيديو | `video_play_curve_actions` (الكيرف اللي في مدير الإعلانات)، `video_p25/p50/p75/p100_watched_actions`، `video_avg_time_watched_actions`، `video_thruplay_watched_actions` |
| مشتقّة عندنا | **Hook rate** = مشاهدات 3 ثواني ÷ impressions، و **Hold rate** = ThruPlay ÷ مشاهدات 3 ثواني |

### ملاحظات parsing مهمة

**1. استعلامين، مش واحد: `reach` و `frequency` مينفعش تتجمع.**
- `reach` عدد ناس unique، والناس بتتكرر بين الأيام. لو عملنا `SUM()` على صفوف `time_increment=1` الرقم هيطلع أكبر من الحقيقي، و `frequency` هتبوظ معاه.
- **الحل:**
  - **كروت الملخص (KPI tiles):** استعلام على مستوى الفترة كلها (`date_preset` من غير `time_increment`)، ومنه نجيب `reach` و `frequency` صح.
  - **الـ trend اليومي (`time_increment=1`):** نعرض فيه بس الأرقام اللي بتتجمع: `spend`، `impressions`، `clicks`، النتايج.

**2. النتيجة الأساسية من `actions` حسب هدف الحملة (Objective → Action).**
`actions` array فيه عشرات الأنواع. الملخص العربي بيختار النتيجة الأساسية حسب `campaign.objective`:

| هدف الحملة | الـ `action_type` |
|---|---|
| رسايل (Messages) | `onsite_conversion.messaging_conversation_started_7d` |
| Leads | `lead` أو `onsite_conversion.lead_grouped` |
| مبيعات (Sales) | `purchase` |
| غير كده | نعرض clicks أو reach، ومن غير ما نقول "نتايج" |

والتكلفة بنجيبها من `cost_per_action_type` بنفس الـ `action_type`.

**3. مشاهدات الـ 3 ثواني (للـ Hook rate)** مش field لوحدها في الـ insights. بتتجاب من `actions` تحت `action_type: "video_view"`.

**4. كيرف الفيديو (`video_play_curve_actions`)** بيرجع array من 22 نقطة، **ومحور الـ X بتاعه مش خطّي**:
- من 0 لـ 15 ثانية: كل ثانية.
- من 20 لـ 30 ثانية: كل 5 ثواني.
- من 40 لـ 60+ ثانية: كل 10 ثواني.

عشان كده الـ chart component لازم يربط كل index بالـ timestamp بتاعه بالظبط. نفس اللي بيحصل في مدير الإعلانات: "0:00 … 0:15 0:20 0:25 … 1:00+". نتأكد من الـ mapping ده على response حقيقي.

**5. الصور والعناوين مش في الـ insights.**
- `METAADS_GET_INSIGHTS` مش بيرجّع صورة الإعلان ولا اسمه، فمحتاجين نجيب الـ Ad/Creative في call منفصل.
- ⚠️ **فخ `thumbnail_url`:** روابط صور ميتا (`fbcdn.net`) فيها توقيع بينتهي (`oe=...`)، والصورة بتقع بعد ساعات أو أيام لو خزّنا اللينك زي ما هو.
- **الحل (واحد من الاتنين):**
  - نرفع الصورة **مرة واحدة لكل `ad_id`** على الـ object storage بتاعنا ونستخدم لينكنا. ده الأفضل.
  - أو نجدّد لينكات الصور في كل sync.

> ⚠️ أسماء الـ parameters بالظبط في `METAADS_GET_INSIGHTS` لازم نتأكد منها من Composio dashboard أو CLI (`composio tools list --toolkit metaads`) قبل ما نكتب الكود.

### الـ UI

- **shadcn/ui Charts** (مبني على Recharts و Tailwind) أو **Tremor**. ننسخ كروت KPI و line chart و bar chart جاهزين. ماتعملوش UI من الصفر.
- صفحة واحدة في الـ MVP: ملخص فوق، وبعده KPI tiles، وبعده trend الإنفاق والنتايج، وبعده قايمة الإعلانات بالصور مع traffic light، ولما تدوس على إعلان يظهر كيرف الفيديو.

### حدود نطاق الـ MVP (عشان مانكبّرش)

الميزة دي أصلًا كانت في Phase 5، فلازم نمسك النطاق كويس:
- ✅ **جوه v1:** صفحة داشبورد واحدة، و on-demand cache، وزرار تحديث، وحساب إعلاني واحد لكل بيزنس.
- ❌ **برّه v1:** التنبيهات، والمقارنات التاريخية المعقدة (زي الشهر ده بالشهر اللي فاته)، والتقارير بالإيميل، وأكتر من حساب إعلاني، والـ cron.

---

## 5. للمشروع الحقيقي (بعد الـ MVP)

| الجزء | MVP | مشروع حقيقي | ليه نغيّر |
|---|---|---|---|
| **الربط (OAuth)** | Composio managed auth | **Meta App بتاعنا** + Business Verification + **App Review لـ Advanced Access على `ads_read`** | الـ branding يبقى بتاعنا، وماتبقاش الصلاحيات معتمدة على app حد تاني. ونبتدي الـ review **بدري** لأنه بياخد وقت |
| **بيانات الداشبورد** | `METAADS_GET_INSIGHTS` عن طريق Composio | **Marketing API مباشرة** + `async insights reports` للحسابات الكبيرة + جدول تاريخي عندنا | من غير حد شهري ولا تكلفة لكل call، وتحكم كامل في الـ rate limits والـ retries |
| **الشات** | Composio بأدوات قراءة بس | يفضل **Composio** (Composio ممكن يستخدم Meta App بتاعنا كـ custom auth config)، **أو** نتنقل لـ **Meta Ads MCP الرسمي** | الاتنين صح. الرسمي مجاني ومن المصدر، و Composio بيوحّد كل التكاملات في مكان واحد |
| **التخزين** | cache بسيط | جدول insights يومي لكل إعلان، يبقى عندنا history ومقارنات وتنبيهات | ميتا بتحدد البيانات التاريخية، والتنبيهات محتاجة بيانات عندنا |
| **المراقبة** | — | تنبيه لما الاتصال ينقطع، يعني لو الشخص اللي ربط الحساب فقد صلاحيته | دي أكتر حاجة بتبوّظ داشبوردات ميتا في المنتجات اللي زي دي |

---

## 6. هل MCP تاني مع Composio هيضيف حاجة؟

**في الـ MVP: لأ. Composio قايم بالواجب.**

- Composio **هو نفسه** طبقة الأدوات للأيجنت. `METAADS_GET_INSIGHTS` وأدوات الـ list بتغطي كل أسئلة الشات.
- لو ضفنا MCP تاني (الرسمي أو مفتوح المصدر):
  - اليوزر هيربط حساب ميتا **مرتين**، أو هنحتاج نخزن التوكن في مكانين.
  - هيبقى عندنا مسارين لنفس البيانات، ولو ما اتطابقوش هيطلع رقمين مختلفين لنفس الإعلان.
  - مفيش capability ناقصة في Composio تبرر ده لاستخدام قراءة بس.

**إمتى يبقى ليه معنى؟** في المشروع الحقيقي بس، ولو حصل واحد من دول:
- الحد الشهري أو تكلفة Composio بقت عالية مع عدد اليوزرز.
- MCP ميتا الرسمي نزّل capabilities مفيدة مش موجودة في Composio.
- بقى عندنا Meta App بتاعنا و OAuth بتاعنا أصلًا.

وحتى ساعتها هيكون **بديل** لـ Composio في جزء الشات، **مش إضافة جنبه**.

---

## 7. سجل القرارات (اتغيّرت إزاي خلال السيشن)

1. **في الأول** اتقال إن Composio ينفع، بس الأفضل للداشبورد تنادي ميتا مباشرة، و Composio يبقى للشات.
2. **بعدين** اتقال "مش محتاج Composio"، وإن MCP ميتا الرسمي المجاني أحسن. **ده كان غلط**، لأنه اتقال من غير ما نبص في المشروع.
3. **Gemini** نبّه إن Composio ينفع بدل أي tool تاني، ونبّه لمشكلة الـ multi-tenancy في الـ MCPs المفتوحة. **ده صح.** ولما بصّينا في الكود لقينا Composio متركّب أصلًا وشغّال للنشر، فبقى هو الاختيار الواضح.
4. **حاجات من اقتراح Gemini مارفضناهاش بس مش هنمشي بيها:**
   - fork لـ Pipeboard: مش محتاجينه لأن Composio بيحلّ الـ multi-tenancy، وكمان فيه مشكلة رخصة BSL.
   - LangGraph و NestJS: مش موجودين في المشروع، بزمورا Next.js 16.
5. **حاجات اتفقنا فيها مع Gemini:** الـ MCP للشات بس، والداشبورد تتجاب أرقامها مباشرة، و `video_play_curve_actions` للكيرف، و shadcn أو Tremor للـ UI.
6. **مراجعة تقنية للـ MVP (2026-11-24):**
   - **شلنا الـ cron** وحطينا **on-demand cache** (stale-while-revalidate، بعد 4–6 ساعات) + زرار تحديث بـ cooldown. السبب إن الـ cron لوحده ممكن يعدّي حد الـ 20K call.
   - **أضفنا خطوة اختيار الحساب الإعلاني** بعد الربط، وبنخزن `currency` و `timezone_name`.
   - **أضفنا ملاحظات parsing:**
     - `reach` و `frequency` مينفعش تتجمع، فبنعمل استعلامين.
     - النتيجة الأساسية من `actions` بتتحدد حسب هدف الحملة.
     - الـ 3s views بتتجاب من `video_view`.
     - كيرف الفيديو محوره مش خطّي.
     - الصور محتاجة call منفصل، ولينكاتها بتنتهي.
   - **أضفنا خطر شاشة الموافقة** في Composio، و**ثبّتنا حدود النطاق** لـ v1.

---

## 8. مخاطر وأسئلة مفتوحة

- [ ] **قرار الفريق:** الـ PRD حاطط ميتا ادز في **Phase 5**. هل هنقدّمه للـ MVP؟
- [ ] **صلاحيات Composio managed app:** هل واخد Advanced Access على `ads_read` ويقدر يقرأ حسابات إعلانية لعملاء حقيقيين؟ الدوكس مش واضحة (شوف [composio.md](composio.md)). **لازم نختبره بحساب إعلاني حقيقي لعميل.**
- [ ] **ربط واحد ولا اتنين؟** هل الـ connected account بتاع `facebook` (للنشر) ينفع لـ `metaads`، ولا محتاج auth config وربط منفصل؟
- [ ] **الحد الشهري:** 20K call مشتركة بين النشر وميتا ادز والشات. لو استخدمنا cron: 20 بيزنس × 5 calls × 8 مرات sync في اليوم = 24K في الشهر، وده أكتر من الحد. فاخترنا on-demand، ومحتاجين نراقب الاستهلاك الفعلي.
- [ ] **شاشة الموافقة (OAuth consent) بتاعة Composio:** هل الـ managed app بيطلب صلاحيات كتابة (`ads_management`) بدل القراءة بس؟ لو أيوه، صاحب البيزنس ممكن يقلق. فقدامنا اختيارين:
  - نكتب UI copy واضح ومطمّن قبل ما نحوّله لميتا: "بزمورا بتقرا الأرقام بس، ومش هتغيّر حاجة في إعلاناتك".
  - أو نعتبرها سبب نقدّم بيه عمل Meta App بتاعنا.
- [ ] **صور الإعلانات:** هنخزنها على أنهي object storage؟
- [ ] **الحسابات من غير pixel:** `purchase_roas` هيبقى فاضي. الملخص لازم يعتمد على "الرسايل" أو "النتايج" حسب هدف الحملة.

---

## 9. الخطوات الجاية للـ MVP

1. موافقة الفريق على إن ميتا ادز (قراءة بس) يدخل الـ MVP.
2. نعمل Auth Config لـ `metaads` (Composio managed) ونختبر الربط بحساب إعلاني حقيقي. **ونسجّل الصلاحيات اللي ظاهرة في شاشة الموافقة**: قراءة بس ولا فيها `ads_management`.
3. خطوة اختيار الحساب الإعلاني، وتخزين `ad_account_id` و `currency` و `timezone_name`.
4. نتأكد من الـ parameters بتاعة `METAADS_GET_INSIGHTS`، ونجرّب الاستعلامين (الفترة كلها واليومي)، ونتأكد من شكل `actions` و `video_play_curve_actions` على response حقيقي.
5. جلب الـ ads والـ creatives، وتخزين الصور عندنا مرة واحدة لكل `ad_id`.
6. جدول cache + on-demand sync (stale بعد 4–6 ساعات) + زرار تحديث بـ cooldown.
7. صفحة داشبورد واحدة بـ shadcn charts، في حدود النطاق المكتوبة فوق.
8. نضيف أدوات القراءة للشات أيجنت (allowlist).

---

## المصادر

- [Composio: Meta Ads toolkit](https://composio.dev/toolkits/metaads)
- [Composio docs: metaads](https://docs.composio.dev/toolkits/metaads.md)
- [Composio: meta ads insights use case](https://composio.dev/use-case/meta-ads-insights)
- [Meta: Ads MCP Server overview](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview)
- [Meta Developers blog: Ads MCP server (يوليو 2026)](https://developers.facebook.com/blog/post/2026/07/16/meta-ads-mcp-server/)
- [Meta: Marketing API authorization](https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization)
- [PPC Land: Meta opens Ads MCP to any app](https://ppc.land/meta-opens-ads-mcp-to-any-app-cutting-integration-code-to-zero/)
- [pipeboard-co/meta-ads-mcp](https://github.com/pipeboard-co/meta-ads-mcp)
- [meta-ads-mcp-python (PyPI، رخصة BSL)](https://pypi.org/project/meta-ads-mcp-python/1.0.81/)
- [flin-meta-ads-mcp (PyPI، قراءة بس)](https://pypi.org/project/flin-meta-ads-mcp/)
- [byadsco/meta-ads-mcp](https://github.com/byadsco/meta-ads-mcp/)
- [AgencyAnalytics: Meta Ads dashboard](https://agencyanalytics.com/templates/dashboards/meta-ads-dashboard)
- [AgencyAnalytics: connect Facebook Ads](https://help.agencyanalytics.com/en/articles/2018704-connect-and-filter-facebook-ads-meta-ads)
- [Madgicx: reporting tools for agencies](https://madgicx.com/blog/facebook-ads-reporting-tools-for-agencies)
- [Porter Metrics: Meta Ads MCP](https://portermetrics.com/en/connectors/general/meta-ads/)
