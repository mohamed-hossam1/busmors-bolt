import 'server-only'
import type { ExecutionTask, TaskContext } from '../../features/tasks/types'
import { callAi } from '../call-ai'

export interface AiProfileResult {
  companyName: string
  sector: string
  category: string
  categoryAr: string
  searchQueries: string[]
  knownCompetitors: string[]
  offeringsSummary: string
  targetAudience: string
  governorates: string[]
}

function cleanJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : text
}

/**
 * AI-First Intelligence Profiler:
 * Analyzes 100% of the company's approved Brain facts and the user's research request.
 * Strictly generates service/offering/pricing search queries WITHOUT the startup's brand name.
 */
export async function profileBusinessWithAi(options: {
  task: ExecutionTask
  context: TaskContext
  signal?: AbortSignal
  token?: string
}): Promise<AiProfileResult> {
  const { task, context, signal, token } = options
  const company = context.facts.find(fact => fact.category === 'company_profile')
  const offerings = context.facts.filter(fact => fact.category === 'offering')
  const audienceFact = context.facts.find(fact => fact.category === 'audience')
  const brandRules = context.facts.filter(fact => fact.category === 'brand_rule')

  let companyName = company?.title ?? 'The business'
  if (companyName.includes(' - ')) {
    const parts = companyName.split(' - ').map(p => p.trim()).filter(Boolean)
    const latinPart = parts.find(p => /[A-Za-z]/.test(p))
    companyName = latinPart || parts[parts.length - 1] || companyName
  }

  const offeringsText = offerings.map(o => `${o.title}: ${o.summary}`).join('. ')
  const factsSummary = [
    `Company Profile: ${company?.title ?? ''} - ${company?.summary ?? ''}`,
    `Offerings & Services: ${offeringsText || 'None listed'}`,
    `Target Audience: ${audienceFact?.summary ?? 'None listed'}`,
    `Brand Guidelines: ${brandRules.map(b => b.summary).join(' | ') || 'None'}`,
    `Country/Market: ${context.region?.country ?? 'EG'} (${context.region?.target_market ?? 'Egypt'})`,
    `User Task Request: ${task.user_request}`,
  ].join('\n')

  const prompt = `Analyze this startup/business Brain context and user request to determine the intelligence research plan:\n\n${factsSummary}`

  let aiData: Partial<AiProfileResult> = {}
  try {
    const res = await callAi({
      operation: 'research_profile',
      taskId: task.id,
      runId: task.run_id!,
      userPrompt: prompt,
      jsonMode: true,
      maxTokens: 1200,
      signal,
    }, token)

    if (res.ok && res.text) {
      const parsed = JSON.parse(cleanJson(res.text))
      if (parsed && typeof parsed === 'object') {
        aiData = parsed
      }
    }
  } catch {
    // If AI network call is unavailable (e.g. offline testing), aiData remains empty
  }

  // Filter queries: STRICT RULE: DO NOT INCLUDE THE STARTUP'S BRAND NAME IN SEARCH QUERIES
  const brandWords = [companyName.toLowerCase(), ...(company?.title ? company.title.toLowerCase().split(/\W+/).filter(w => w.length > 3) : [])]
  const rawQueries = Array.isArray(aiData.searchQueries) ? aiData.searchQueries : []
  const sanitizedQueries = rawQueries
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 3)
    .filter(q => {
      const lower = q.toLowerCase()
      // Remove any query that includes the startup brand name
      return !brandWords.some(w => lower.includes(w))
    })

  const sector = (typeof aiData.sector === 'string' && aiData.sector.trim()) ? aiData.sector.trim().toLowerCase() : 'saas'
  const category = (typeof aiData.category === 'string' && aiData.category.trim()) ? aiData.category.trim() : 'ai marketing platform'
  const categoryAr = (typeof aiData.categoryAr === 'string' && aiData.categoryAr.trim()) ? aiData.categoryAr.trim() : 'منصة تسويق ذكية'

  const finalQueries = sanitizedQueries.length >= 4 ? sanitizedQueries : [
    `أفضل ${categoryAr} في مصر`,
    `أسعار باقات ${categoryAr} مصر`,
    `شركات ${categoryAr} في مصر`,
    `أدوات ${categoryAr} للشركات في مصر`,
    `${category} platforms Egypt`,
    `${category} pricing plans Egypt`,
    `${category} alternatives Egypt`,
    ...offerings.slice(0, 3).map(o => `أفضل شركات ${o.title} في مصر`),
  ]

  const knownCompetitors = Array.isArray(aiData.knownCompetitors)
    ? aiData.knownCompetitors.filter((c): c is string => typeof c === 'string' && c.trim().length > 1)
    : []

  const isEgypt = context.region?.country === 'EG' ||
    /egypt|مصر/i.test(`${context.region?.target_market ?? ''} ${company?.properties?.country ?? ''}`) ||
    (context.region?.currency === 'EGP')

  return {
    companyName,
    sector,
    category,
    categoryAr,
    searchQueries: finalQueries.slice(0, 8),
    knownCompetitors: knownCompetitors.slice(0, 5),
    offeringsSummary: offeringsText || company?.summary || '',
    targetAudience: aiData.targetAudience || audienceFact?.summary || 'Egyptian businesses and consumers',
    governorates: isEgypt ? ['Cairo', 'Giza', 'Alexandria'] : [],
  }
}
