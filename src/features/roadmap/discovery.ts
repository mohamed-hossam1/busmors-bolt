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

export function goalDefinition(goal: string): DiscoveryGoalDefinition | undefined {
  return DISCOVERY_GOALS.find((item) => item.value === goal)
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

  return plan
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
