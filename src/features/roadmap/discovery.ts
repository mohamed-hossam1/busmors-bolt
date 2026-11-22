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
}

export const DISCOVERY_GOALS: DiscoveryGoalDefinition[] = [
  {
    value: 'acquire_first_customers',
    label: 'Win my first customers',
    description: 'Find a believable first route to paying customers.',
  },
  {
    value: 'grow_customers',
    label: 'Grow customers from what already works',
    description: 'Improve the motion that already produces customers.',
  },
  {
    value: 'convert_inquiries',
    label: 'Turn more inquiries into customers',
    description: 'Fix the step between interest and a real purchase.',
  },
  {
    value: 'launch_offer',
    label: 'Launch a new offer',
    description: 'Prepare a launch that fits your real capacity.',
  },
  {
    value: 'repeat_referral',
    label: 'Increase repeat and referral revenue',
    description: 'Build a reason and a moment for customers to return.',
  },
  {
    value: 'custom',
    label: 'Something else',
    description: 'Describe the outcome in your own words.',
  },
]

export const DISCOVERY_GOALS_AR: DiscoveryGoalDefinition[] = [
  {
    value: 'acquire_first_customers',
    label: 'كسب أول عملاء',
    description: 'إيجاد مسار واقعي للوصول إلى أول عملاء يدفعون مقابل خدمتك.',
  },
  {
    value: 'grow_customers',
    label: 'تنمية العملاء من المسار الحالي',
    description: 'تطوير وتحسين الأسلوب الذي يجلب عملاء بالفعل الآن.',
  },
  {
    value: 'convert_inquiries',
    label: 'تحويل المزيد من الاستفسارات إلى عملاء',
    description: 'معالجة العقبات بين إبداء الاهتمام وإتمام الشراء الفعلي.',
  },
  {
    value: 'launch_offer',
    label: 'إطلاق عرض جديد',
    description: 'تجهيز خطة إطلاق تناسب طاقتك الاستيعابية وإمكانياتك الفعلية.',
  },
  {
    value: 'repeat_referral',
    label: 'زيادة الشراء المتكرر والترشيحات',
    description: 'خلق سبب وتوقيت مناسب لعودة العملاء وترشيحك للآخرين.',
  },
  {
    value: 'custom',
    label: 'هدف آخر',
    description: 'صف النتيجة المرجوة بأسلوبك وكلماتك الخاصة.',
  },
]

export function getDiscoveryGoals(locale?: string): DiscoveryGoalDefinition[] {
  return locale === 'ar' ? DISCOVERY_GOALS_AR : DISCOVERY_GOALS
}

export function goalDefinition(goal: string, locale?: string): DiscoveryGoalDefinition | undefined {
  return getDiscoveryGoals(locale).find((item) => item.value === goal) ?? DISCOVERY_GOALS.find((item) => item.value === goal)
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
  const facts = eligibleBrainFacts(context.facts)
  const audience = facts.find((fact) => fact.category === 'audience')
  const offerings = facts.filter((fact) => fact.category === 'offering').slice(0, 4)
  const profile = facts.find((fact) => fact.category === 'company_profile')
  const plan: PlannedQuestion[] = []
  let position = 0
  const add = (question_key: string, schema: DiscoveryQuestionSchema, prefill?: DiscoveryPrefill) => {
    plan.push({ question_key, position: position++, branch: context.goal, schema, prefill })
  }

  if (!profile && offerings.length === 0) {
    add('company_one_liner', {
      label: 'In one sentence, what do you sell and who is it for?',
      why: 'Your Brain has no confirmed company profile yet, so this keeps the plan anchored to a real business.',
      type: 'long_text',
      placeholder: 'For example: A small ceramics studio selling everyday tableware to local households.',
    })
  }

  if (context.goal === 'custom') {
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

  if (context.goal === 'acquire_first_customers') {
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
  } else if (context.goal === 'grow_customers') {
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
  } else if (context.goal === 'convert_inquiries') {
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
  } else if (context.goal === 'launch_offer') {
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
  } else if (context.goal === 'repeat_referral') {
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
  } else if (context.goal === 'custom') {
    add('custom_first_step', {
      label: 'What is the first result you need?',
      why: 'A preliminary plan needs one real first result, even when the outcome is custom.',
      type: 'long_text',
      placeholder: 'Describe the first useful result, not the whole transformation.',
    })
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
