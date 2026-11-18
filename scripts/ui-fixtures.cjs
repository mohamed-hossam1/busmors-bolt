// Fictional presentation fixtures. Only the browser test imports these; the app never does.
const workspace = '11111111-1111-4111-8111-111111111111'
const date = '2026-11-17T09:00:00Z'
const conversations = [
  { id: 'conversation-launch', workspace_id: workspace, title: 'A thoughtful launch for Luma Studio', created_at: date },
  { id: 'conversation-research', workspace_id: workspace, title: 'Understanding our audience', created_at: '2026-11-16T09:00:00Z' },
]
const knowledge = [
  ['company_profile', 'Luma Studio', 'A fictional independent ceramics studio. Thoughtful objects, made by hand.'],
  ['offering', 'The Everyday Collection', 'Small-batch cups and bowls designed to bring a little calm to daily rituals.'],
  ['audience', 'Design-conscious home lovers', 'People who value lasting quality, natural materials, and a personal story.'],
  ['brand_rule', 'Warm, considered, human', 'Speak simply. Share the process. Invite curiosity without pressure.'],
  ['positioning', 'Everyday objects, a little more meaningful', 'Hand-finished ceramics that connect beautiful design with everyday use.'],
  ['strategic_goal', 'Introduce the new collection', 'Build awareness with a coherent launch story and useful social content.'],
  ['company_fact', 'Made in small batches', 'Each piece is individually finished. Natural variations are part of its character.'],
  ['channel', 'Instagram & Facebook', 'Tell visual stories about the makers, materials, and everyday rituals.'],
  ['competitor', 'Independent homeware studios', 'An illustrative category for comparing messaging and customer expectations.'],
].map(([category, title, summary], index) => ({ id: `knowledge-${index}`, workspace_id: workspace, category, title, summary, properties: {}, status: 'approved', source: 'manual', source_detail: 'Fictional sample business', confidence: 1, created_at: date, updated_at: date }))
const edges = knowledge.slice(1).map((node, index) => ({ id: `relationship-${index}`, workspace_id: workspace, source_node_id: knowledge[0].id, target_node_id: node.id, relation_type: 'RELATED_TO', status: 'approved', weight: 1, created_at: date }))
const report = `# A considered launch for the Everyday Collection

## Direction
Introduce the collection through the rituals it belongs to: the first coffee, a slow lunch, a table shared with friends.

## What matters to the audience
- Lasting quality and natural materials.
- A personal connection to the people behind the work.
- Useful, beautiful objects that feel at home.

## Recommended next steps
1. Share the story behind the collection.
2. Show the making process, from clay to finished piece.
3. Invite the audience to discover their everyday favorite.

## Creative brief
Keep the tone warm, the language simple, and the message specific. Focus each post on one idea. Review every draft before using it.

*Fictional presentation data. This example makes no claims about a real business or market research.*`
const deliverables = [
  { id: 'report-launch', title: 'Everyday Collection · Launch direction', type: 'research_report', content: report },
  { id: 'report-market', title: 'Audience & positioning notes', type: 'competitor_analysis', content: '# Audience & positioning\n\nA warm, human story about thoughtful objects.\n\n## Opportunity\nConnect the materials, making process, and everyday use in one clear narrative.\n\n*Fictional presentation example.*' },
  { id: 'report-brief', title: 'A week of thoughtful content', type: 'general', content: '# Creative direction\n\n## The story\nFrom our studio to your everyday.\n\n## The approach\nA collection introduction, a behind-the-scenes story, and an invitation to explore.\n\n*Fictional presentation example.*' },
  { id: 'report-review', title: 'Brand voice · A practical guide', type: 'general', content: '# Brand voice\n\nWarm. Considered. Human.\n\n## Writing principles\nShare the process. Use simple language. Make room for curiosity.\n\n*Fictional presentation example.*' },
].map((item) => ({ ...item, workspace_id: workspace, task_id: 'task-launch', created_at: date }))
const posts = [
  ['instagram', 'A small ritual, beautifully made. Meet the Everyday Collection: hand-finished ceramics for the moments that make a day feel like yours.', 'pending_approval', '2026-11-19T09:00:00Z'],
  ['facebook', 'Every piece begins with a pair of hands and a little patience. Here’s a closer look at the process behind our new collection.', 'pending_approval', '2026-11-20T10:00:00Z'],
  ['instagram', 'Your morning coffee deserves a favorite cup. Discover the shapes, textures, and little details of the Everyday Collection.', 'approved', '2026-11-21T09:00:00Z'],
  ['facebook', 'Made slowly. Made to be used. A few everyday favorites from the studio, ready to find a place at your table.', 'published', '2026-11-16T09:00:00Z'],
].map(([platform, caption, status, scheduled_for], index) => ({ id: `post-${index}`, workspace_id: workspace, deliverable_id: 'report-launch', task_id: 'task-launch', platform, caption, hashtags: '#LumaStudio #EverydayCollection #MadeByHand', image_url: null, status, scheduled_for, idempotency_key: `sample-${index}`, publish_result: null, created_at: date }))
const tasks = [
  { id: 'task-launch', conversation_id: conversations[0].id, status: 'completed', created_at: date },
  { id: 'task-research', conversation_id: conversations[1].id, status: 'completed', created_at: date },
]
function workflow(task, agents) {
  let seq = 0
  return agents.flatMap((agent, index) => [
    { event_type: 'agent_started', agent_id: agent, payload: { task_summary: 'Preparing a useful next step' } },
    ...(index ? [{ event_type: 'flow_connection', agent_id: agent, payload: { from: agents[index - 1], to: agent } }] : []),
    { event_type: 'agent_completed', agent_id: agent, payload: { result_summary: 'Work prepared for review' } },
  ]).map((event) => ({ ...event, id: `${task}-${seq}`, task_id: task, seq: seq++, created_at: date }))
}
const events = [...workflow('task-launch', ['user', 'orchestrator', 'market_research', 'content_writer', 'campaign_planner']), ...workflow('task-research', ['user', 'orchestrator', 'competitor_analysis'])]
const messages = [
  { conversation_id: conversations[0].id, role: 'user', type: 'text', content: 'Help me introduce the Everyday Collection. I want the launch to feel warm and thoughtful, just like our studio.', payload: null },
  { conversation_id: conversations[0].id, role: 'agent', type: 'text', content: 'Let’s build the launch around the small rituals your collection belongs to. I used your **Business Brain** to keep the direction grounded in Luma’s voice.\n\nHere’s what I prepared:\n- A clear launch direction and audience notes\n- Three connected stories for your social channels\n- Draft posts ready for your review\n\n**The idea:** thoughtful objects, made for your everyday.' , payload: null },
  { conversation_id: conversations[0].id, role: 'agent', type: 'deliverable_card', content: 'Your launch direction is ready to review.', payload: { deliverable_id: 'report-launch', title: deliverables[0].title, content: report, type: 'research_report' } },
  { conversation_id: conversations[1].id, role: 'user', type: 'text', content: 'Help me understand how our audience chooses independent ceramics.' , payload: null },
  { conversation_id: conversations[1].id, role: 'agent', type: 'text', content: 'I prepared a focused positioning note based on the context in your Business Brain. Let’s start with materials, craftsmanship, and everyday use.', payload: null },
].map((message, index) => ({ ...message, id: `message-${index}`, workspace_id: workspace, created_at: date }))

async function installFixtures(context) {
  await context.addInitScript(({ workspace }) => {
    localStorage.setItem('sb-busmora-ui-preview-auth-token', JSON.stringify({ access_token: 'fictional-ui-token', refresh_token: 'fictional-ui-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: workspace, aud: 'authenticated', role: 'authenticated', email: 'hello@luma.example', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  }, { workspace })
  const tables = { conversations: structuredClone(conversations), brain_nodes: structuredClone(knowledge), brain_edges: edges, messages, tasks, agent_events: events, deliverables, planned_posts: structuredClone(posts), audit_log: [], workspace_settings: [{ workspace_id: workspace, company_url: 'https://luma.example', onboarding_state: 'complete' }], ai_keys: [] }
  await context.route('https://busmora-ui-preview.supabase.co/**', async (route) => {
    const request = route.request(), url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    let rows = tables[table] ?? []
    const matches = (row) => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3))
    if (request.method() === 'POST') {
      const payload = request.postDataJSON()
      const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: `created-${Date.now()}`, created_at: date, ...row }))
      if (tables[table]) tables[table].push(...inserted)
      rows = inserted
    } else if (request.method() === 'PATCH') {
      rows = rows.filter(matches)
      rows.forEach((row) => Object.assign(row, request.postDataJSON()))
    } else if (request.method() === 'DELETE') {
      tables[table] = rows.filter((row) => !matches(row)); rows = []
    } else { rows = rows.filter(matches) }
    if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')))
    const body = request.headers().accept?.includes('object') ? rows[0] ?? null : rows
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return tables
}
module.exports = { installFixtures, workspace }
