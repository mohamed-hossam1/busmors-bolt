import type { BrainNode } from '../../lib/types'
import type {
  DiscoveryGoal,
  DiscoveryPlanContext,
  DiscoveryPrefill,
  DiscoveryQuestionOption,
  DiscoveryQuestionSchema,
  PlannedQuestion,
} from './types'

export interface DiscoveryGoalDefinition {
  value: DiscoveryGoal
  label: string
  description: string
  icon: string
}

/**
 * Business-situation challenges. These replace marketing jargon with plain,
 * recognizable situations a small-business owner can self-identify with. The
 * `value` keys are the persisted goal keys; legacy keys are normalized to these.
 */
export const DISCOVERY_GOALS: DiscoveryGoalDefinition[] = [
  {
    value: 'validate_idea',
    label: 'Validate my business idea',
    description: 'I have a business idea and want to know whether there is a real market for it before investing more time or money.',
    icon: 'lightbulb',
  },
  {
    value: 'win_first_customers',
    label: 'Get my first customers',
    description: 'I have launched my business, but I am struggling to acquire my first customers.',
    icon: 'user-plus',
  },
  {
    value: 'grow_customers',
    label: 'Grow my customer base',
    description: 'I already have customers, but growth is slow or inconsistent.',
    icon: 'trending-up',
  },
  {
    value: 'convert_inquiries',
    label: 'Convert more leads into customers',
    description: 'People are interested in my product or service, but not enough of them actually buy.',
    icon: 'target',
  },
  {
    value: 'unprofitable_marketing',
    label: 'Make my marketing profitable',
    description: 'I spend money or effort on marketing, but the results are not producing the profit I expected.',
    icon: 'coins',
  },
  {
    value: 'launch_offer',
    label: 'Launch a new product or offer',
    description: 'I want to launch a new product, service, or offer and need a strategy to make it successful.',
    icon: 'rocket',
  },
  {
    value: 'increase_repeat_referral',
    label: 'Increase repeat purchases and referrals',
    description: 'I have customers, but I struggle to get them to return or recommend my business.',
    icon: 'repeat',
  },
  {
    value: 'something_else',
    label: 'I am not sure what is wrong',
    description: 'I know my business could perform better, but I do not know where the problem is.',
    icon: 'help-circle',
  },
]

export const DISCOVERY_GOALS_AR: DiscoveryGoalDefinition[] = [
  {
    value: 'validate_idea',
    label: 'التحقق من جدوى فكرتي',
    description: 'لدي فكرة مشروع وأريد معرفة ما إذا كان هناك طلب حقيقي عليها قبل استثمار المزيد من الوقت أو المال.',
    icon: 'lightbulb',
  },
  {
    value: 'win_first_customers',
    label: 'الحصول على أول عملاء',
    description: 'أطلقت مشروعي، لكنني أواجه صعوبة في اكتساب أول عملائي.',
    icon: 'user-plus',
  },
  {
    value: 'grow_customers',
    label: 'تنمية قاعدة عملائي',
    description: 'لدي عملاء بالفعل، لكن النمو بطيء أو غير مستقر.',
    icon: 'trending-up',
  },
  {
    value: 'convert_inquiries',
    label: 'تحويل المزيد من الاهتمامات إلى عملاء',
    description: 'الناس مهتمون بمنتجي أو خدمتي، لكن ليس بالعدد الكافي من يشترون فعلياً.',
    icon: 'target',
  },
  {
    value: 'unprofitable_marketing',
    label: 'جعل تسويقي مربحاً',
    description: 'أنفق مالاً أو جهداً على التسويق، لكن النتائج لا تحقق الربح الذي توقعته.',
    icon: 'coins',
  },
  {
    value: 'launch_offer',
    label: 'إطلاق منتج أو عرض جديد',
    description: 'أريد إطلاق منتج أو خدمة أو عرض جديد وأحتاج استراتيجية لإنجاحه.',
    icon: 'rocket',
  },
  {
    value: 'increase_repeat_referral',
    label: 'زيادة الشراء المتكرر والترشيحات',
    description: 'لدي عملاء، لكنني أعاني في جعلهم يعودون أو يرشحون نشاطي.',
    icon: 'repeat',
  },
  {
    value: 'something_else',
    label: 'لست متأكداً من المشكلة',
    description: 'أعرف أن نشاطي يمكن أن يؤدي بشكل أفضل، لكنني لا أعرف أين تكمن المشكلة.',
    icon: 'help-circle',
  },
]

/** Legacy goal keys (pre-challenge taxonomy) mapped to their challenge key. */
const LEGACY_GOAL_MAP: Readonly<Record<string, DiscoveryGoal>> = {
  acquire_first_customers: 'win_first_customers',
  repeat_referral: 'increase_repeat_referral',
  custom: 'something_else',
}

/** Map any stored/legacy goal key to a current challenge key. */
export function normalizeGoal(goal: string): DiscoveryGoal {
  const mapped = LEGACY_GOAL_MAP[goal]
  if (mapped) return mapped
  if (DISCOVERY_GOALS.some((item) => item.value === goal)) return goal as DiscoveryGoal
  return 'something_else'
}

export function getDiscoveryGoals(locale?: string): DiscoveryGoalDefinition[] {
  return locale === 'ar' ? DISCOVERY_GOALS_AR : DISCOVERY_GOALS
}

export function goalDefinition(goal: string, locale?: string): DiscoveryGoalDefinition | undefined {
  const normalized = normalizeGoal(goal)
  return getDiscoveryGoals(locale).find((item) => item.value === normalized) ?? DISCOVERY_GOALS.find((item) => item.value === normalized)
}

export function eligibleBrainFacts(facts: BrainNode[]): BrainNode[] {
  return facts.filter((fact) =>
    fact.status === 'approved'
    && (fact.approval_state === undefined || fact.approval_state === 'approved')
    && fact.is_current !== false
    && fact.verification_state !== 'contradicted'
  )
}

function option(value: string, label: string, detail?: string): DiscoveryQuestionOption {
  return { value, label, detail, source: 'standard' }
}

function brainOption(node: BrainNode): DiscoveryQuestionOption {
  const price = typeof node.properties?.amount === 'string' && typeof node.properties?.currency === 'string'
    ? `${node.properties.amount} ${node.properties.currency}`
    : ''
  return {
    value: node.title,
    label: node.title,
    detail: [node.summary, price].filter(Boolean).join(' · '),
    source: 'brain',
    nodeId: node.id,
  }
}

function uniqueOptions(options: DiscoveryQuestionOption[]): DiscoveryQuestionOption[] {
  const seen = new Set<string>()
  return options.filter((item) => {
    const key = item.value.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function prefillFromNode(node: BrainNode): DiscoveryPrefill {
  return {
    status: 'confirmed',
    value: { choice: node.title },
    provenance: {
      kind: 'brain',
      nodeId: node.id,
      title: node.title,
      version: node.version,
      category: node.category,
      verificationState: node.verification_state ?? 'unverified',
    },
  }
}

/**
 * Deterministic question planner. It only reuses eligible, current, approved
 * Brain facts. Missing information becomes a question or an explicit unknown;
 * it is never filled with invented content.
 */
export function buildDiscoveryPlan(context: DiscoveryPlanContext): PlannedQuestion[] {
  const goal = normalizeGoal(context.goal)
  const facts = eligibleBrainFacts(context.facts)
  const audience = facts.find((fact) => fact.category === 'audience')
  const offerings = facts.filter((fact) => fact.category === 'offering').slice(0, 4)
  const profile = facts.find((fact) => fact.category === 'company_profile')
  const plan: PlannedQuestion[] = []
  let position = 0
  const add = (question_key: string, schema: DiscoveryQuestionSchema, prefill?: DiscoveryPrefill) => {
    plan.push({ question_key, position: position++, branch: goal, schema, prefill })
  }

  if (!profile && offerings.length === 0) {
    add('company_one_liner', {
      label: 'In one sentence, what do you sell and who is it for?',
      why: 'Your Brain has no confirmed company profile yet, so this keeps the plan anchored to a real business.',
      type: 'long_text',
      placeholder: 'For example: A small ceramics studio selling everyday tableware to local households.',
    })
  }

  if (goal === 'something_else') {
    add('custom_goal', {
      label: 'What outcome do you want?',
      why: 'A clear outcome keeps every later step tied to a real result instead of activity.',
      type: 'long_text',
      placeholder: 'Describe the result you want, in your own words.',
    })
  }

  if (!context.hasWebsite) {
    add('no_website_route', {
      label: 'With no website connected, where should a ready buyer go next?',
      why: 'A plan is only useful if an interested customer has a real next step.',
      type: 'choice',
      allowOther: true,
      options: uniqueOptions([
        option('Direct messages or WhatsApp', 'Direct messages or WhatsApp', 'Use an account you already monitor.'),
        option('A social profile', 'A social profile', 'Point people to the profile you actually maintain.'),
        option('Phone or in person', 'Phone or in person', 'Use a number or location you can answer.'),
        option('A marketplace listing', 'A marketplace listing', 'Use a listing that accepts real orders.'),
        option('No route yet', 'No route yet', 'The plan will mark this as an open unknown.'),
      ]),
    })
  }

  add('priority_audience', {
    label: 'Who is the priority customer for this goal?',
    why: 'Different customers need different proof, channels and offers.',
    type: 'choice',
    allowOther: true,
    options: uniqueOptions([
      option('People who already know us', 'People who already know us', 'Existing contacts, past customers or followers.'),
      option('A specific local customer group', 'A specific local customer group', 'A group you can name and reach directly.'),
      option('A new customer segment', 'A new customer segment', 'A group you have not served yet.'),
      option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
      ...(audience ? [brainOption(audience)] : []),
    ]),
  }, audience ? prefillFromNode(audience) : undefined)

  const leadOffering = offerings[0]
  add('lead_offer', {
    label: 'Which offer should lead the plan?',
    why: 'The plan needs one clear thing to sell before it can choose channels or proof.',
    type: 'choice',
    allowOther: true,
    options: uniqueOptions([
      option('Main service or product', 'Main service or product', 'Lead with what already exists.'),
      option('A new or revised offer', 'A new or revised offer', 'Shape the offer before promoting it.'),
      option('A low-risk starter offer', 'A low-risk starter offer', 'Make the first purchase easier to try.'),
      option('Not settled yet', 'Not settled yet', 'This will stay an open unknown.'),
      ...offerings.map(brainOption),
    ]),
  }, leadOffering ? prefillFromNode(leadOffering) : undefined)

  add('truthful_proof', {
    label: 'What can we truthfully show or say to support the offer?',
    why: 'The plan may only use evidence you can stand behind. Unsupported claims will be avoided.',
    type: 'choice',
    allowOther: true,
    options: uniqueOptions([
      option('Owner testimonials', 'Owner testimonials', 'Real customer words you can quote with permission.'),
      option('Samples or before/after', 'Samples or before/after', 'Work you can show without inventing results.'),
      option('Experience or credentials', 'Experience or credentials', 'Verifiable background or qualifications.'),
      option('A clear guarantee or policy', 'A clear guarantee or policy', 'A promise you can actually keep.'),
      option('Nothing usable yet', 'Nothing usable yet', 'The plan will not invent proof.'),
    ]),
  })

  add('practical_constraint', {
    label: 'What practical limit matters most right now?',
    why: 'A plan that ignores your real limits creates work you cannot finish.',
    type: 'choice',
    allowOther: true,
    options: uniqueOptions([
      option('Time', 'Time', 'Keep the work small enough to complete.'),
      option('Budget', 'Budget', 'Avoid assuming spend that is not available.'),
      option('Delivery capacity', 'Delivery capacity', 'Do not promise more than you can fulfil.'),
      option('Approvals or licences', 'Approvals or licences', 'Name the external approval before acting.'),
      option('No major limit right now', 'No major limit right now', 'Still respect the other answers.'),
    ]),
  })

  switch (goal) {
    case 'validate_idea':
      add('idea_problem', {
        label: 'What problem are you trying to solve?',
        why: 'A clear problem statement keeps validation focused on a real need, not a feature list.',
        type: 'long_text',
        placeholder: 'Describe the problem in one or two sentences.',
      })
      add('idea_who', {
        label: 'Who do you believe experiences this problem?',
        why: 'Naming the people who feel the problem makes the market check concrete.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('A specific group of people', 'A specific group of people', 'A group you can describe and reach.'),
          option('Local households or community', 'Local households or community', 'People in a specific area.'),
          option('Businesses', 'Businesses', 'Companies with this problem.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('idea_alternatives', {
        label: 'What are people using instead today?',
        why: 'The alternatives reveal whether a real market already exists and how you differ.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('Nothing — they do without', 'Nothing — they do without', 'No current solution.'),
          option('A competitor product or service', 'A competitor product or service', 'An existing business already serves them.'),
          option('A manual or improvised process', 'A manual or improvised process', 'They cope with a workaround.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('idea_validation', {
        label: 'Have you tested this with real potential customers?',
        why: 'Real contact beats assumptions; this separates a hypothesis from a proven demand.',
        type: 'choice',
        options: uniqueOptions([
          option('Not yet', 'Not yet', 'No real contact so far.'),
          option('Informal conversations', 'Informal conversations', 'Talked to some people, no commitment.'),
          option('Pre-orders or a small pilot', 'Pre-orders or a small pilot', 'People committed time or money.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      break
    case 'win_first_customers':
      add('first_customer_route', {
        label: 'Where are the first customers most likely to come from?',
        why: 'A first-customer plan should start with a route you can actually reach.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('People I already know', 'People I already know', 'Warm contacts and past conversations.'),
          option('Local community or partners', 'Local community or partners', 'Groups, neighbours or complementary businesses.'),
          option('Social content', 'Social content', 'A consistent public presence on a platform you use.'),
          option('Paid promotion', 'Paid promotion', 'Only if a real budget exists.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('first_channels_tried', {
        label: 'What have you tried so far to reach customers?',
        why: 'Knowing what already happened avoids repeating what did not work.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('Word of mouth', 'Word of mouth', 'Referrals and personal recommendations.'),
          option('Social media', 'Social media', 'Posts, reels or a page you maintain.'),
          option('Local or in-person', 'Local or in-person', 'Visits, events or local listings.'),
          option('Paid ads', 'Paid ads', 'Any paid promotion so far.'),
          option('Nothing yet', 'Nothing yet', 'No outreach so far.'),
        ]),
      })
      break
    case 'grow_customers':
      add('growth_motion', {
        label: 'Which growth motion should the plan test first?',
        why: 'Testing one motion is more useful than spreading effort across five.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('Repeat purchase', 'Repeat purchase', 'Bring an existing customer back.'),
          option('Referrals', 'Referrals', 'Ask happy customers to introduce someone.'),
          option('Higher average order', 'Higher average order', 'Increase value per purchase.'),
          option('A new customer segment', 'A new customer segment', 'Reach a group you have not served.'),
          option('Paid acquisition', 'Paid acquisition', 'Only if a real budget exists.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('growth_customer_count', {
        label: 'About how many active customers do you have right now?',
        why: 'A rough baseline lets the plan measure growth instead of guessing.',
        type: 'text',
        placeholder: 'For example: around 40 regulars, or a few hundred a year.',
      })
      add('growth_trend', {
        label: 'Is your customer base growing, stable, or declining?',
        why: 'The trend decides whether the plan should defend, accelerate or repair.',
        type: 'choice',
        options: uniqueOptions([
          option('Growing', 'Growing', 'More customers than before.'),
          option('Stable', 'Stable', 'About the same over time.'),
          option('Declining', 'Declining', 'Fewer customers than before.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      break
    case 'convert_inquiries':
      add('inquiry_response', {
        label: 'Where does the inquiry path break most often?',
        why: 'Conversion work should target the actual break, not a generic funnel.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('Slow replies', 'Slow replies', 'The next step does not happen quickly.'),
          option('Unclear pricing', 'Unclear pricing', 'People cannot judge whether it fits.'),
          option('Weak qualification', 'Weak qualification', 'Time goes to people who cannot buy.'),
          option('Not enough proof', 'Not enough proof', 'People are interested but not convinced.'),
          option('Too many steps', 'Too many steps', 'The path asks for too much before buying.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('inquiry_volume', {
        label: 'Roughly how many inquiries do you get in a typical month?',
        why: 'Volume shows whether the issue is too few leads or poor conversion.',
        type: 'text',
        placeholder: 'For example: about 15 messages a month.',
      })
      add('inquiry_response_time', {
        label: 'How quickly do you respond to an inquiry?',
        why: 'Response speed is often the cheapest conversion lever to fix.',
        type: 'choice',
        options: uniqueOptions([
          option('Within an hour', 'Within an hour', 'Fast, same-session replies.'),
          option('Same day', 'Same day', 'Replies later the same day.'),
          option('A few days', 'A few days', 'Replies take several days.'),
          option('It varies', 'It varies', 'No consistent response time.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      break
    case 'unprofitable_marketing':
      add('profit_channels', {
        label: 'Which marketing channels do you pay for, and roughly how much each month?',
        why: 'Profitability starts from the real spend per channel; no numbers means no profit claim.',
        type: 'long_text',
        placeholder: 'For example: Facebook ads 1,500 EGP, printed flyers 300 EGP.',
      })
      add('profit_outcome', {
        label: 'What would "profitable marketing" look like for you?',
        why: 'We will not calculate profit without real revenue, cost and margin data; this captures your target instead.',
        type: 'long_text',
        placeholder: 'Describe the result you want, e.g. covering ad spend and earning a set margin.',
      })
      break
    case 'launch_offer':
      add('launch_scope', {
        label: 'What launch shape fits your capacity?',
        why: 'A launch that matches delivery capacity protects the customer experience.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('Small pilot first', 'Small pilot first', 'Test with a limited group before scaling.'),
          option('Full launch', 'Full launch', 'You can deliver at the full stated scope.'),
          option('Waitlist first', 'Waitlist first', 'Prove demand before delivery.'),
          option('Bundle with an existing offer', 'Bundle with an existing offer', 'Attach the new offer to something proven.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('launch_offer_detail', {
        label: 'Describe the new product or offer in a sentence or two.',
        why: 'The plan needs a concrete offer to build positioning and channels around.',
        type: 'long_text',
        placeholder: 'What it is, who it is for, and the main benefit.',
      })
      add('launch_timing', {
        label: 'When do you want to launch?',
        why: 'A target date turns the plan into a schedule instead of a wish.',
        type: 'text',
        placeholder: 'For example: in six weeks, or before a specific season.',
      })
      break
    case 'increase_repeat_referral':
      add('repeat_trigger', {
        label: 'When should repeat or referral work happen?',
        why: 'A trigger makes follow-up part of the customer journey instead of a one-off campaign.',
        type: 'choice',
        allowOther: true,
        options: uniqueOptions([
          option('After the first purchase', 'After the first purchase', 'Follow up while the experience is fresh.'),
          option('A fixed time later', 'A fixed time later', 'Use a realistic interval, not a made-up one.'),
          option('Around a seasonal moment', 'Around a seasonal moment', 'Tie the ask to a real occasion.'),
          option('When a customer asks', 'When a customer asks', 'Make the next step easy at the moment of interest.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      add('repeat_frequency', {
        label: 'How often does a typical customer buy from you?',
        why: 'Purchase frequency decides whether a loyalty or win-back motion makes sense.',
        type: 'text',
        placeholder: 'For example: once a month, or once a year.',
      })
      add('repeat_feedback', {
        label: 'Do you collect feedback or have a follow-up process?',
        why: 'Repeat and referral work needs a reason and a moment, which start with listening.',
        type: 'choice',
        options: uniqueOptions([
          option('Yes, both feedback and follow-up', 'Yes, both feedback and follow-up', 'You ask and you follow up.'),
          option('Feedback only', 'Feedback only', 'You collect opinions but rarely follow up.'),
          option('Follow-up only', 'Follow-up only', 'You reach out but do not ask for feedback.'),
          option('Neither yet', 'Neither yet', 'No structured listening or follow-up.'),
          option('Not sure yet', 'Not sure yet', 'This will stay an open unknown.'),
        ]),
      })
      break
    case 'something_else':
      add('custom_first_step', {
        label: 'What is the first result you need?',
        why: 'A plan needs one real first result, even when the outcome is not yet clear.',
        type: 'long_text',
        placeholder: 'Describe the first useful result, not the whole transformation.',
      })
      break
  }

  add('success_signal', {
    label: 'What would count as progress in the next 8 weeks?',
    why: 'A success signal lets the plan separate real progress from activity.',
    type: 'long_text',
    placeholder: 'For example: five qualified conversations and two paid pilots.',
  })

  if (context.locale === 'ar') {
    return plan.map((item) => ({
      ...item,
      schema: localizeQuestionSchema(item.question_key, item.schema, 'ar'),
    }))
  }

  return plan
}

interface QuestionLocalization {
  label: string
  why: string
  placeholder?: string
  options?: Record<string, { label: string; detail?: string }>
}

export const QUESTION_TRANSLATIONS_AR: Record<string, QuestionLocalization> = {
  company_one_liner: {
    label: 'في جملة واحدة، ماذا تبيع ولمن تقدم خدماتك؟',
    why: 'لا تحتوي ذاكرة مشروعك على ملف تعريفي مؤكد بعد، لذا يساعد هذا في ربط الخطة بنشاطك الفعلي.',
    placeholder: 'مثال: استوديو خزف محلي يصنع أدوات المائدة اليومية للمنازل.',
  },
  custom_goal: {
    label: 'ما النتيجة التي تريد تحقيقها؟',
    why: 'وضوح النتيجة المرجوة يضمن ربط كل الخطوات اللاحقة بأثر حقيقي بدلاً من مجرد أنشطة.',
    placeholder: 'صف النتيجة التي تريدها بأسلوبك وكلماتك الخاصة.',
  },
  no_website_route: {
    label: 'في ظل عدم ربط موقع إلكتروني، أين يتجه العميل المستعد للشراء كخطوة تالية؟',
    why: 'تكون الخطة مفيدة فقط عندما يجد العميل المهتم خطوة تالية حقيقية للتواصل أو الشراء.',
    options: {
      'Direct messages or WhatsApp': { label: 'رسائل مباشرة أو واتساب', detail: 'استخدم حساباً تتابعه وتجيب عليه بانتظام.' },
      'A social profile': { label: 'الملف الشخصي على مواقع التواصل', detail: 'وجّه الأشخاص إلى الحساب الذي تنشط عليه فعلاً.' },
      'Phone or in person': { label: 'الهاتف أو زيارة المكان', detail: 'استخدم رقماً أو موقعاً متاحاً للرد.' },
      'A marketplace listing': { label: 'صفحة متجر أو منصة بيع', detail: 'استخدم منصة تقبل الطلبات الحقيقية.' },
      'No route yet': { label: 'لا يوجد مسار محدد بعد', detail: 'ستسجل الخطة هذا كأمر غير محدد حالياً.' },
    },
  },
  priority_audience: {
    label: 'من هو العميل ذو الأولوية القصوى لهذا الهدف؟',
    why: 'العملاء المختلفون يحتاجون إلى أدلة وقنوات وعروض مختلفة.',
    options: {
      'People who already know us': { label: 'أشخاص يعرفوننا بالفعل', detail: 'جهات اتصال حالية، عملاء سابقون، أو متابعون.' },
      'A specific local customer group': { label: 'فئة محلية محددة من العملاء', detail: 'مجموعة يمكنك تسميتها والوصول إليها مباشرة.' },
      'A new customer segment': { label: 'شريحة عملاء جديدة تماماً', detail: 'فئة لم يسبق لك خدمتهم من قبل.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  lead_offer: {
    label: 'أي عرض أو خدمة يجب أن تقود خطة العمل؟',
    why: 'تحتاج الخطة إلى منتج أو خدمة واضحة للتركيز عليها قبل تحديد القنوات والأدلة.',
    options: {
      'Main service or product': { label: 'المنتج أو الخدمة الأساسية', detail: 'التركيز على ما هو موجود ويعمل بالفعل.' },
      'A new or revised offer': { label: 'عرض جديد أو مطوّر', detail: 'صياغة العرض جيداً قبل البدء في ترويجه.' },
      'A low-risk starter offer': { label: 'عرض تمهيدي منخفض المخاطر', detail: 'تسهيل عملية الشراء الأولى لتشجيع التجربة.' },
      'Not settled yet': { label: 'لم يتم الاستقرار عليه بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  truthful_proof: {
    label: 'ما الإثبات الحقيقي الذي يمكننا عرضه لدعم هذا العرض؟',
    why: 'تعتمد الخطة فقط على أدلة حقيقية يمكنك إثباتها وتجنب أي ادعاءات غير مدعومة.',
    options: {
      'Owner testimonials': { label: 'آراء وتجارب عملاء حقيقيين', detail: 'كلمات حقيقية من عملائك يمكنك اقتباسها بإذنهم.' },
      'Samples or before/after': { label: 'نماذج أعمال أو صور قبل/بعد', detail: 'أعمال فعلية يمكنك عرضها دون افتعال نتائج.' },
      'Experience or credentials': { label: 'الخبرة والمؤهلات السابقة', detail: 'خلفية مهنية أو اعتمادات قابلة للتحقق.' },
      'A clear guarantee or policy': { label: 'ضمان أو سياسة واضحة', detail: 'وعد محدد يمكنك الالتزام به فعلياً.' },
      'Nothing usable yet': { label: 'لا يوجد إثبات جاهز حالياً', detail: 'لن تقوم الخطة باختلاق أدلة غير موجودة.' },
    },
  },
  practical_constraint: {
    label: 'ما هو القيد أو التحدي العملي الأهم بالنسبة لك الآن؟',
    why: 'تجاهل القيود الواقعية ينتج خطة عمل لن تستطيع إكمالها أو الالتزام بها.',
    options: {
      'Time': { label: 'الوقت المتاح', detail: 'إبقاء حجم العمل صغيراً ومناسباً لإكماله.' },
      'Budget': { label: 'الميزانية', detail: 'تجنب افتراض نفقات مالية غير متوفرة.' },
      'Delivery capacity': { label: 'طاقة التنفيذ والتسليم', detail: 'عدم الوعد بأكثر مما تستطيع إنجازه.' },
      'Approvals or licences': { label: 'الموافقات أو التراخيص', detail: 'تحديد الموافقات الخارجية المطلوبة قبل البدء.' },
      'No major limit right now': { label: 'لا توجد قيود كبيرة حالياً', detail: 'مع مراعاة الإجابات الأخرى.' },
    },
  },
  first_customer_route: {
    label: 'من أين يُتوقع أن يأتي أول العملاء؟',
    why: 'خطة العملاء الأوائل يجب أن تبدأ بمسار يمكنك الوصول إليه عملياً.',
    options: {
      'People I already know': { label: 'أشخاص أعرفهم بالفعل', detail: 'معارف وتواصل سابق.' },
      'Local community or partners': { label: 'المجتمع المحلي أو الشركاء', detail: 'مجموعات أو جيران أو أنشطة تجارية مكملة.' },
      'Social content': { label: 'محتوى مواقع التواصل', detail: 'حضور عام ومنتظم على منصة تستخدمها بالفعل.' },
      'Paid promotion': { label: 'الإعلانات الممولة', detail: 'فقط في حال وجود ميزانية مخصصة لذلك.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  growth_motion: {
    label: 'أي أسلوب نمو يجب اختباره أولاً في الخطة؟',
    why: 'اختبار مسار واحد والتركيز عليه أكثر فائدة من تشتيت الجهد بين خمسة مسارات.',
    options: {
      'Repeat purchase': { label: 'تكرار الشراء', detail: 'تشجيع العميل الحالي على الشراء مجدداً.' },
      'Referrals': { label: 'الترشيحات والإحالات', detail: 'طلب ترشيح معارف من العملاء الراضين.' },
      'Higher average order': { label: 'رفع متوسط قيمة الطلب', detail: 'زيادة القيمة الشرائية في كل معاملة.' },
      'A new customer segment': { label: 'شريحة عملاء جديدة', detail: 'الوصول إلى فئة لم تخدمها بعد.' },
      'Paid acquisition': { label: 'اكتساب العملاء المدفوع', detail: 'فقط في حال وجود ميزانية حقيقية.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  inquiry_response: {
    label: 'أين يحدث التعثر الأكبر في مسار الاستفسارات؟',
    why: 'تحسين التحويل يجب أن يستهدف نقطة التعثر الفعلية بدلاً من إجراءات عامة.',
    options: {
      'Slow replies': { label: 'بطء الرد والتأخر', detail: 'الخطوة التالية لا تتم بالسرعة الكافية.' },
      'Unclear pricing': { label: 'عدم وضوح الأسعار', detail: 'يصعب على العميل معرفة ما إذا كان السعر مناسباً.' },
      'Weak qualification': { label: 'ضعف تأهيل الاستفسارات', detail: 'استهلاك الوقت مع من لا يستطيع الشراء.' },
      'Not enough proof': { label: 'قلة الأدلة والإثباتات', detail: 'العملاء مهتمون ولكن غير مقتنعين تماماً.' },
      'Too many steps': { label: 'كثرة الخطوات المطلوبة', detail: 'المسار يطلب الكثير من العميل قبل الشراء.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  launch_scope: {
    label: 'ما هو حجم وطريقة الإطلاق الأنسب لطاقتك الاستيعابية؟',
    why: 'الإطلاق الذي يتناسب مع طاقتك الفعلية يحمي تجربة العميل وجودة الخدمة.',
    options: {
      'Small pilot first': { label: 'إطلاق تجريبي صغير أولاً', detail: 'التجربة مع مجموعة محدودة قبل التوسع.' },
      'Full launch': { label: 'إطلاق كامل وشامل', detail: 'أنت جاهز للتنفيذ بالطاقة الكاملة المعلنة.' },
      'Waitlist first': { label: 'قائمة انتظار أولاً', detail: 'التحقق من حجم الطلب قبل بدء التنفيذ.' },
      'Bundle with an existing offer': { label: 'دمجه مع عرض حالي', detail: 'ربط العرض الجديد بمنتج أو خدمة مثبتة بالفعل.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  repeat_trigger: {
    label: 'متى يجب أن تبدأ جهود تكرار الشراء أو طلب الترشيح؟',
    why: 'وجود توقيت محدد يجعل المتابعة جزءاً من رحلة العميل بدلاً من حملة عشوائية.',
    options: {
      'After the first purchase': { label: 'عقب الشراء الأول مباشرة', detail: 'المتابعة بينما التجربة ما زالت حاضرة في ذهنه.' },
      'A fixed time later': { label: 'بعد فترة زمنية محددة', detail: 'استخدام فاصل زمني واقعي يناسب طبيعة الخدمة.' },
      'Around a seasonal moment': { label: 'في مناسبة أو موسم معين', detail: 'ربط التواصل بمناسبة أو حدث حقيقي.' },
      'When a customer asks': { label: 'عندما يسأل أو يستفسر العميل', detail: 'تسهيل الخطوة التالية في لحظة اهتمامه.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر مفتوح للبحث.' },
    },
  },
  custom_first_step: {
    label: 'ما هي أول نتيجة مفيدة تحتاج إلى تحقيقها؟',
    why: 'الخطة التمهيدية تحتاج إلى نتيجة أولى حقيقية، حتى عندما يكون الهدف مخصصاً.',
    placeholder: 'صف أول نتيجة مفيدة وملموسة، وليس التحول الكامل.',
  },
  success_signal: {
    label: 'ما الذي سيُعتبر دليلاً على التقدم الحقيقي في الأسابيع الثمانية القادمة؟',
    why: 'تحديد إشارة النجاح يسمح للخطة بفصل التقدم الفعلي عن مجرد الانشغال بأنشطة.',
    placeholder: 'مثال: 5 محادثات مع عملاء مؤهلين وتجربتين مدفوعتين.',
  },
  idea_problem: {
    label: 'ما المشكلة التي تحاول حلها؟',
    why: 'وضوح المشكلة يحافظ على تركيز التحقق على حاجة حقيقية وليس قائمة ميزات.',
    placeholder: 'صف المشكلة في جملة أو جملتين.',
  },
  idea_who: {
    label: 'من برأيك يعاني من هذه المشكلة؟',
    why: 'تحديد من يشعر بالمشكلة يجعل فحص السوق ملموساً.',
    options: {
      'A specific group of people': { label: 'فئة محددة من الناس', detail: 'مجموعة يمكنك وصفها والوصول إليها.' },
      'Local households or community': { label: 'أسر محلية أو مجتمع', detail: 'أشخاص في منطقة محددة.' },
      'Businesses': { label: 'شركات ومؤسسات', detail: 'شركات لديها هذه المشكلة.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
  idea_alternatives: {
    label: 'ماذا يستخدم الناس بدلاً من ذلك حالياً؟',
    why: 'تكشف البدائل ما إذا كان هناك سوق حقيقي وكيف تختلف أنت.',
    options: {
      'Nothing — they do without': { label: 'لا شيء — يستغنون عنها', detail: 'لا يوجد حل حالي.' },
      'A competitor product or service': { label: 'منتج أو خدمة منافسة', detail: 'نشاط تجاري موجود يخدمهم بالفعل.' },
      'A manual or improvised process': { label: 'عملية يدوية أو مؤقتة', detail: 'يتعاملون معها بطريقة بدائية.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
  idea_validation: {
    label: 'هل اختبرت الفكرة مع عملاء محتملين حقيقيين؟',
    why: 'التواصل الحقيقي أقوى من الافتراضات؛ وهذا يفصل الفرضية عن الطلب المثبت.',
    options: {
      'Not yet': { label: 'ليس بعد', detail: 'لا تواصل حقيقي حتى الآن.' },
      'Informal conversations': { label: 'محادثات غير رسمية', detail: 'تحدثت مع بعضهم دون التزام.' },
      'Pre-orders or a small pilot': { label: 'طلبات مسبقة أو تجربة صغيرة', detail: 'التزم أشخاص بوقت أو مال.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
  first_channels_tried: {
    label: 'ماذا جربت حتى الآن للوصول إلى العملاء؟',
    why: 'معرفة ما حدث بالفعل تتجنب تكرار ما لم ينجح.',
    options: {
      'Word of mouth': { label: 'التوصيات الشفهية', detail: 'إحالات وتوصيات شخصية.' },
      'Social media': { label: 'وسائل التواصل الاجتماعي', detail: 'منشورات أو صفحة تديرها.' },
      'Local or in-person': { label: 'محلي أو حضوري', detail: 'زيارات أو فعاليات أو إعلانات محلية.' },
      'Paid ads': { label: 'إعلانات ممولة', detail: 'أي ترويج مدفوع حتى الآن.' },
      'Nothing yet': { label: 'لا شيء حتى الآن', detail: 'لا تواصل فعلي حتى الآن.' },
    },
  },
  growth_customer_count: {
    label: 'كم عدد العملاء النشطين لديك حالياً تقريباً؟',
    why: 'خط أساس تقريبي يسمح للخطة بقياس النمو بدلاً من التخمين.',
    placeholder: 'مثال: حوالي 40 عميلاً دائماً، أو بضع مئات سنوياً.',
  },
  growth_trend: {
    label: 'هل قاعدة عملائك تنمو أم مستقرة أم تتناقص؟',
    why: 'الاتجاه يحدد ما إذا كان على الخطة أن تدافع أو تتسارع أو تعالج تراجعاً.',
    options: {
      'Growing': { label: 'تنمو', detail: 'عملاء أكثر من السابق.' },
      'Stable': { label: 'مستقرة', detail: 'تقريباً كما هي عبر الوقت.' },
      'Declining': { label: 'تتناقص', detail: 'عملاء أقل من السابق.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
  inquiry_volume: {
    label: 'كم عدد الاستفسارات التي تصلك في شهر نموذجي تقريباً؟',
    why: 'الحجم يوضح ما إذا كانت المشكلة قلة العملاء المحتملين أم ضعف التحويل.',
    placeholder: 'مثال: حوالي 15 رسالة شهرياً.',
  },
  inquiry_response_time: {
    label: 'ما مدى سرعة ردك على الاستفسار؟',
    why: 'سرعة الرد غالباً أرخص رافعة يمكن إصلاحها لتحسين التحويل.',
    options: {
      'Within an hour': { label: 'خلال ساعة', detail: 'ردود سريعة في نفس الجلسة.' },
      'Same day': { label: 'في نفس اليوم', detail: 'ردود في وقت لاحق من نفس اليوم.' },
      'A few days': { label: 'خلال أيام', detail: 'الردود تستغرق عدة أيام.' },
      'It varies': { label: 'يختلف', detail: 'لا يوجد وقت رد ثابت.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
  profit_channels: {
    label: 'ما قنوات التسويق التي تدفع مقابلها، وكم تقريباً كل شهر؟',
    why: 'الربحية تبدأ من المصروف الحقيقي لكل قناة؛ وبدون أرقام لا يمكن ادعاء ربح.',
    placeholder: 'مثال: إعلانات فيسبوك 1500 جنيه، مطبوعات 300 جنيه.',
  },
  profit_outcome: {
    label: 'كيف سيبدو "التسويق المربح" بالنسبة لك؟',
    why: 'لن نحسب الربح دون بيانات حقيقية للإيراد والتكلفة والهامش؛ هذا يسجل هدفك بدلاً من ذلك.',
    placeholder: 'صف النتيجة التي تريدها، مثل تغطية تكلفة الإعلانات وتحقيق هامش محدد.',
  },
  launch_offer_detail: {
    label: 'صف المنتج أو العرض الجديد في جملة أو جملتين.',
    why: 'تحتاج الخطة إلى عرض ملموس لبناء التموضع والقنوات حوله.',
    placeholder: 'ما هو، ولمن، وما الفائدة الأساسية.',
  },
  launch_timing: {
    label: 'متى تريد الإطلاق؟',
    why: 'التاريخ المستهدف يحول الخطة إلى جدول زمني بدلاً من أمنية.',
    placeholder: 'مثال: خلال ستة أسابيع، أو قبل موسم معين.',
  },
  repeat_frequency: {
    label: 'كم مرة يشتري العميل النموذجي منك؟',
    why: 'تكرار الشراء يحدد ما إذا كان برنامج ولاء أو استرجاع العملاء منطقياً.',
    placeholder: 'مثال: مرة شهرياً، أو مرة سنوياً.',
  },
  repeat_feedback: {
    label: 'هل تجمع ملاحظات العملاء أو لديك عملية متابعة؟',
    why: 'عمل التكرار والإحالة يحتاج سبباً ولحظة، وكلاهما يبدأ بالاستماع.',
    options: {
      'Yes, both feedback and follow-up': { label: 'نعم، ملاحظات ومتابعة', detail: 'تسأل وتتابع.' },
      'Feedback only': { label: 'ملاحظات فقط', detail: 'تجمع الآراء لكنك نادراً ما تتابع.' },
      'Follow-up only': { label: 'متابعة فقط', detail: 'تتواصل لكنك لا تطلب ملاحظات.' },
      'Neither yet': { label: 'لا هذا ولا ذاك', detail: 'لا استماع أو متابعة منظمة.' },
      'Not sure yet': { label: 'غير متأكد بعد', detail: 'سيبقى هذا كأمر غير محدد.' },
    },
  },
}

export function localizeQuestionSchema(questionKey: string, schema: DiscoveryQuestionSchema, locale: string): DiscoveryQuestionSchema {
  if (locale !== 'ar') return schema
  const tr = QUESTION_TRANSLATIONS_AR[questionKey]
  if (!tr) return schema

  return {
    ...schema,
    label: tr.label,
    why: tr.why,
    placeholder: tr.placeholder ?? schema.placeholder,
    options: schema.options?.map((opt) => {
      if (opt.source === 'brain') return opt
      const optTr = tr.options?.[opt.value]
      if (!optTr) return opt
      return {
        ...opt,
        label: optTr.label,
        detail: optTr.detail ?? opt.detail,
      }
    }),
  }
}

export function planToRpc(plan: PlannedQuestion[]) {
  return plan.map((item) => ({
    question_key: item.question_key,
    position: item.position,
    schema: item.schema,
    branch: item.branch,
  }))
}

export function planPrefill(plan: PlannedQuestion[]): Record<string, DiscoveryPrefill> {
  return Object.fromEntries(
    plan.filter((item) => item.prefill).map((item) => [item.question_key, item.prefill as DiscoveryPrefill])
  )
}

export function isOpenStatus(status: string): boolean {
  return ['unanswered', 'unknown', 'skipped', 'not_applicable', 'researching'].includes(status)
}

export function isPositiveStatus(status: string): boolean {
  return status === 'answered' || status === 'confirmed'
}

export function answerLabel(value: { text?: string; choice?: string } | null | undefined, schema: DiscoveryQuestionSchema): string {
  if (!value) return ''
  if (value.text?.trim()) return value.text.trim()
  if (!value.choice) return ''
  if (value.choice === '__other__') return value.text?.trim() ?? ''
  return schema.options?.find((item) => item.value === value.choice)?.label ?? value.choice
}
