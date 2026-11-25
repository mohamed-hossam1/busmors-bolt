import type { TraceEventLike } from './trace-projection'

const TOOL_LABELS_AR: Readonly<Record<string, string>> = {
  read_business_brain: 'قراءة ذاكرة المشروع...',
  read_workspace_context: 'مراجعة بيانات الحساب والسوق...',
  read_deliverables: 'مراجعة الملفات والتقارير السابقة...',
  read_calendar: 'مراجعة جدول المحتوى والنشر...',
  propose_brain_change: 'إعداد اقتراح لتحديث ذاكرة المشروع...',
  ask_clarification: 'تجهيز أسئلة توضيحية سريعة...',
  create_or_version_deliverable: 'حفظ التقرير في الملفات...',
  create_or_update_post_draft: 'حفظ مسودة المنشور في الجدول...',
  tavily_search: 'البحث في مصادر السوق الخارجية...',
  exa_search: 'البحث المتعمق في مصادر الويب...',
  firecrawl_scrape: 'قراءة تفاصيل صفحة الويب...',
  delegate_to_director: 'التحويل إلى مدير التسويق...',
  delegate_agent: 'إسناد مهمة بحث إلى المختص...',
  read_skill: 'تحميل إرشادات التنفيذ...',
}

const TOOL_LABELS_EN: Readonly<Record<string, string>> = {
  read_business_brain: 'Reading Business Brain...',
  read_workspace_context: 'Checking workspace context...',
  read_deliverables: 'Reviewing prior deliverables...',
  read_calendar: 'Checking content calendar...',
  propose_brain_change: 'Preparing Business Brain update...',
  ask_clarification: 'Preparing clarification questions...',
  create_or_version_deliverable: 'Saving document to deliverables...',
  create_or_update_post_draft: 'Saving post draft to calendar...',
  tavily_search: 'Searching external market sources...',
  exa_search: 'Searching web intelligence...',
  firecrawl_scrape: 'Reading source webpage...',
  delegate_to_director: 'Handing off to Marketing Director...',
  delegate_agent: 'Delegating specialist research...',
  read_skill: 'Loading execution playbook...',
}

/**
 * Derive a concise, customer-safe live status label from an emitted trace event.
 * Returns null for events that shouldn't overwrite the current indicator text.
 */
export function describeLiveTraceStep(event: TraceEventLike, isArabic: boolean): string | null {
  if (event.event_type === 'agent') {
    const role = event.agent_role ?? event.agent_id
    if (event.status === 'running') {
      if (role === 'orchestrator') return isArabic ? 'فهم طلبك ومراجعة السياق...' : 'Understanding your request...'
      if (role === 'director') return isArabic ? 'مدير التسويق يضع الخطة ويراجع البيانات...' : 'Marketing Director is analyzing and planning...'
      if (role === 'research') return isArabic ? 'الباحث يجمع أدلة السوق والمنافسين...' : 'Research specialist is gathering market evidence...'
    }
    return null
  }

  if (event.event_type === 'tool') {
    const name = event.tool_name ?? event.agent_id ?? ''
    if (event.status === 'completed' || event.status === 'failed') {
      return isArabic ? 'تحليل النتائج وصياغة الخطوة التالية...' : 'Analyzing tool results...'
    }
    const dict = isArabic ? TOOL_LABELS_AR : TOOL_LABELS_EN
    return dict[name] ?? (isArabic ? `تنفيذ خطوة (${name})...` : `Running ${name}...`)
  }

  if (event.event_type === 'skill') {
    const skill = event.agent_id ?? ''
    if (!skill) return null
    return isArabic ? `تطبيق دليل العمل: ${skill}...` : `Applying playbook: ${skill}...`
  }

  if (event.event_type === 'model') {
    return isArabic ? 'صياغة الرد والمخرجات...' : 'Drafting response and outputs...'
  }

  return null
}
