export type DemoBusinessId = 'cafe' | 'skincare' | 'saas'
export type DemoTone = 'Warm' | 'Bold' | 'Expert'
export type DemoTask = 'posts' | 'week'
export type ApprovalState = 'Draft' | 'Approved'

export interface DemoBusiness {
  id: DemoBusinessId
  shortName: string
  name: string
  audience: string
  tone: DemoTone
  goal: string
  category: string
  accent: string
}

export interface DemoPost {
  id: string
  channel: 'Instagram' | 'LinkedIn' | 'Facebook'
  day: string
  time: string
  theme: string
  caption: string
}

export const demoBusinesses: DemoBusiness[] = [
  {
    id: 'cafe',
    shortName: 'Corner café',
    name: 'Juniper & Grain',
    audience: 'Neighbors, commuters, and weekend brunch regulars',
    tone: 'Warm',
    goal: 'Bring more locals in for the new autumn menu',
    category: 'Neighborhood café',
    accent: '#f59e0b',
  },
  {
    id: 'skincare',
    shortName: 'Skincare store',
    name: 'Dewdrop Studio',
    audience: 'Ingredient-conscious shoppers with sensitive skin',
    tone: 'Expert',
    goal: 'Introduce the barrier-care starter set',
    category: 'Independent skincare store',
    accent: '#60a5fa',
  },
  {
    id: 'saas',
    shortName: 'B2B software',
    name: 'Relayboard',
    audience: 'Operations leads at growing service businesses',
    tone: 'Bold',
    goal: 'Drive demo interest for the weekly planning workspace',
    category: 'Small B2B software company',
    accent: '#a78bfa',
  },
]

const concepts: Record<DemoBusinessId, Array<{ theme: string; detail: string; channel: DemoPost['channel'] }>> = {
  cafe: [
    { theme: 'Menu reveal', detail: 'maple-cardamom latte and pear toast', channel: 'Instagram' },
    { theme: 'Behind the counter', detail: 'the first batch coming out of the oven', channel: 'Facebook' },
    { theme: 'Weekend invitation', detail: 'a slow Saturday brunch around the shared table', channel: 'Instagram' },
    { theme: 'Meet the maker', detail: 'the local roaster behind the house blend', channel: 'Facebook' },
    { theme: 'Community prompt', detail: 'customers choosing the next seasonal pastry', channel: 'Instagram' },
  ],
  skincare: [
    { theme: 'Problem education', detail: 'three signs your skin barrier needs a simpler routine', channel: 'Instagram' },
    { theme: 'Ingredient focus', detail: 'why ceramides and oat extract work well together', channel: 'Instagram' },
    { theme: 'Routine builder', detail: 'a calm three-step evening routine', channel: 'Facebook' },
    { theme: 'Founder note', detail: 'why the starter set leaves fragrance out', channel: 'LinkedIn' },
    { theme: 'Product FAQ', detail: 'how to introduce one new product at a time', channel: 'Instagram' },
  ],
  saas: [
    { theme: 'Pain point', detail: 'the hidden cost of planning work across six disconnected tabs', channel: 'LinkedIn' },
    { theme: 'Workflow tip', detail: 'turning Monday priorities into one shared operating view', channel: 'LinkedIn' },
    { theme: 'Product moment', detail: 'a 90-second look at weekly planning in Relayboard', channel: 'LinkedIn' },
    { theme: 'Operator insight', detail: 'why ownership beats another status meeting', channel: 'LinkedIn' },
    { theme: 'Demo invitation', detail: 'seeing next week clearly before Friday afternoon', channel: 'LinkedIn' },
  ],
}

const toneOpeners: Record<DemoTone, string[]> = {
  Warm: ['A small good thing for your week:', 'Come take a seat—', 'Made with your everyday in mind:'],
  Bold: ['Busywork is not a strategy.', 'Your next move should be obvious.', 'Stop letting the week run you.'],
  Expert: ['A useful rule of thumb:', 'Here is what matters most:', 'A clearer way to think about it:'],
}

const toneClosers: Record<DemoTone, string[]> = {
  Warm: ['We would love to see you there.', 'Save this for later—and share it with a friend.', 'Drop by when you need a little lift.'],
  Bold: ['Make the switch this week.', 'See the difference in one focused workflow.', 'Ready to move? Take the next step.'],
  Expert: ['Start small, stay consistent, and notice what changes.', 'Use this as your practical starting point.', 'Save this checklist for your next review.'],
}

export function createDemoPosts(business: DemoBusiness): DemoPost[] {
  const items = concepts[business.id]
  return items.map((item, index) => ({
    id: `${business.id}-${index}`,
    channel: item.channel,
    day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][index],
    time: ['9:00 AM', '11:30 AM', '2:00 PM', '10:00 AM', '4:30 PM'][index],
    theme: item.theme,
    caption: `${toneOpeners[business.tone][index % 3]} At ${business.name}, we are sharing ${item.detail} for ${business.audience.toLowerCase()}. Our focus: ${business.goal.toLowerCase()}. ${toneClosers[business.tone][index % 3]}`,
  }))
}
