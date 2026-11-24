import test from 'node:test'
import assert from 'node:assert/strict'
import { isSimpleGreeting, extractFallbackTitle, cleanChatTitle, formatConversationTitle } from '../../src/server/chat-title'

test('isSimpleGreeting correctly identifies greetings in Arabic and English', () => {
  // Arabic greetings
  assert.equal(isSimpleGreeting('ازيك'), true)
  assert.equal(isSimpleGreeting('ازيك؟'), true)
  assert.equal(isSimpleGreeting('كيفك'), true)
  assert.equal(isSimpleGreeting('كيفك؟'), true)
  assert.equal(isSimpleGreeting('عامل ايه'), true)
  assert.equal(isSimpleGreeting('مرحبا'), true)
  assert.equal(isSimpleGreeting('أهلاً وسهلاً'), false)
  assert.equal(isSimpleGreeting('أهلاً'), true)
  assert.equal(isSimpleGreeting('صباح الخير!'), true)
  assert.equal(isSimpleGreeting('السلام عليكم'), true)
  assert.equal(isSimpleGreeting('سلام عليكم'), true)
  assert.equal(isSimpleGreeting('هاي'), true)

  // English greetings
  assert.equal(isSimpleGreeting('hello'), true)
  assert.equal(isSimpleGreeting('hi!'), true)
  assert.equal(isSimpleGreeting('hey'), true)
  assert.equal(isSimpleGreeting('how are you?'), true)

  // Meaningful tasks/queries should NOT be greetings
  assert.equal(isSimpleGreeting('عايز خطة تسويق لمنتج جديد في مصر'), false)
  assert.equal(isSimpleGreeting('أنا محتاج أعمل إعلان على فيسبوك'), false)
  assert.equal(isSimpleGreeting('ما هي أسعار الإعلانات في السوق المصري؟'), false)
  assert.equal(isSimpleGreeting('Help me build a marketing plan'), false)
})

test('extractFallbackTitle creates concise fallback titles', () => {
  // Greetings become 'محادثة جديدة' or 'New Chat'
  assert.equal(extractFallbackTitle('ازيك يا غالي'), 'ازيك يا غالي')
  assert.equal(extractFallbackTitle('ازيك'), 'محادثة جديدة')
  assert.equal(extractFallbackTitle('hello'), 'New Chat')

  // Real requests are clamped to 4 words max
  const title1 = extractFallbackTitle('عايز خطة تسويق كاملة لإطلاق كافيه جديد في التجمع')
  assert.equal(title1, 'عايز خطة تسويق كاملة')

  const title2 = extractFallbackTitle('Launch a B2B SaaS startup in Egypt')
  assert.equal(title2, 'Launch a B2B SaaS')
})

test('cleanChatTitle strips noise, conversational filler, and prefixes', () => {
  // Strips prefixes like "بدء محادثة:" or "Title:"
  assert.equal(cleanChatTitle('بدء محادثة: استراتيجية إطلاق منتج'), 'استراتيجية إطلاق منتج')
  assert.equal(cleanChatTitle('Title: Marketing Strategy 2026'), 'Marketing Strategy 2026')
  assert.equal(cleanChatTitle('العنوان: باقات اشتراك المنصة'), 'باقات اشتراك المنصة')

  // Strips quotes and markdown
  assert.equal(cleanChatTitle('**"خطة الحملة الإعلانية"**'), 'خطة الحملة الإعلانية')
  assert.equal(cleanChatTitle('`دراسة السوق المصري`'), 'دراسة السوق المصري')

  // Catches conversational persona chatter and falls back cleanly
  const chatter1 = 'أنا بخير، شكرًا لسؤالك! إزيك إنت؟ إيه اللي ممكن أساعدك بيه النهاردة؟'
  assert.equal(cleanChatTitle(chatter1, 'ازيك'), 'محادثة جديدة')

  const chatter2 = 'Sure, here is the marketing strategy for your new business'
  assert.equal(cleanChatTitle(chatter2, 'Marketing plan'), 'Marketing plan')

  // Empty or whitespace falls back
  assert.equal(cleanChatTitle('', 'خطة تسويق كافيه'), 'خطة تسويق كافيه')
  assert.equal(cleanChatTitle('   '), 'محادثة جديدة')

  // Limits word count to at most 4 words
  const longTitle = 'خطة تسويقية شاملة جداً ومفصلة للمطاعم والكافيهات في القاهرة الجديدة'
  const cleaned = cleanChatTitle(longTitle)
  assert.ok(cleaned.split(/\s+/).length <= 4)
  assert.ok(cleaned.length <= 32)
})

test('titles never keep the assistant greeting after a real topic', () => {
  // Regression: a stored title used to be the topic glued to the reply greeting.
  const bad = 'معرفة تفاصيل البزنس أهلاً بيك! علشان اقدر اساعدك بأفضل طريق'
  assert.equal(cleanChatTitle(bad, 'تعرف ايه عن البزنس بتاعي؟'), 'معرفة تفاصيل البزنس')
  assert.equal(extractFallbackTitle(bad), 'معرفة تفاصيل البزنس')

  // Old rows are cleaned on read too, so the header never shows the sentence.
  assert.equal(formatConversationTitle(bad, 'محادثة جديدة'), 'معرفة تفاصيل البزنس')

  // A leading greeting is dropped only when a real topic follows it.
  assert.equal(cleanChatTitle('أهلاً بيك! عايز خطة تسويق لمنتج جديد'), 'عايز خطة تسويق لمنتج')
  assert.equal(formatConversationTitle('أهلاً بيك', 'محادثة جديدة'), 'محادثة جديدة')
  assert.equal(formatConversationTitle('مرحباً بيك!', 'New Chat'), 'New Chat')

  // Normal titles pass through unchanged.
  assert.equal(formatConversationTitle('دراسة السوق المصري', 'محادثة جديدة'), 'دراسة السوق المصري')
  assert.equal(formatConversationTitle(null, 'محادثة جديدة'), 'محادثة جديدة')
})
