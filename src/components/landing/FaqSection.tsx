import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  ['What can I try without an account?', 'The full interactive sample: choose a fictional business, edit its Business Brain, run either sample task, switch between post and calendar views, edit copy, copy it, and change approval states. No email, payment, or API key is required.'],
  ['What is the Business Brain?', 'It is the company knowledge you review and approve so marketing tasks have useful context—things like your products, audience, brand voice, positioning, and goals.'],
  ['Can I edit the output?', 'Yes. In the sample you can edit captions, copy them, and mark them approved or return them to draft. The authenticated product also keeps human review central to the workflow.'],
  ['Does BusMora publish posts automatically?', 'No. The current workflow helps you review planned posts and content, then you publish them manually. We do not claim automatic social publishing.'],
  ['What setup is needed for live AI generation?', 'The guest sample uses local, deterministic templates. In the authenticated product, live generation requires you to add a supported provider API key in Settings. The repository currently supports Groq, OpenAI, Anthropic, Google, OpenRouter, and a custom compatible provider.'],
]

export default function FaqSection() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.7fr_1.3fr]"><div><div className="section-kicker">FAQ</div><h2 className="mt-5 text-4xl font-bold tracking-[-0.045em] text-ink-900">Clear answers before you start.</h2><p className="mt-4 max-w-sm leading-7 text-ink-600">The sample and the live workspace are intentionally different. Here is exactly what each needs.</p></div><div className="divide-y divide-ink-200 border-y border-ink-200">{faqs.map(([question, answer], index) => <div key={question}><button type="button" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index} className="flex w-full items-center justify-between gap-5 py-5 text-left font-bold text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"><span>{question}</span><ChevronDown size={18} className={`shrink-0 transition-transform ${open === index ? 'rotate-180' : ''}`} /></button>{open === index && <p className="animate-fade-up pb-6 pr-10 text-sm leading-7 text-ink-600">{answer}</p>}</div>)}</div></div></section>
  )
}
