// Local UI behavior only. All remote APIs are intercepted; no live auth claim.
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures } = require('./ui-fixtures.cjs')
async function main() {
 const root=path.resolve(__dirname,'..'), base='http://127.0.0.1:4184'
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4184','--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:'https://busmora-ui-preview.supabase.co',VITE_SUPABASE_ANON_KEY:'fictional-preview-key'}})
 let browser
 try {
  for(let i=0;i<80;i++){try {if((await fetch(base)).ok)break}catch{} if(i===79)throw Error('Vite did not start');await new Promise(r=>setTimeout(r,250))}
  browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{}),args:['--no-sandbox']})
  const context=await browser.newContext();const tables=await installFixtures(context)
  tables.workspace_settings[0].ui_language='en'
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  mkdirSync(path.join(root,'artifacts/competition'),{recursive:true})
  await page.goto(base+'/app/brain');await page.getByRole('button',{name:'Delete',exact:true}).first().waitFor()
  assert.equal(new URL(page.url()).pathname,'/brain')
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(150)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`)
  }
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.getByRole('button',{name:'Interface language'}).count(),0)
  await page.evaluate(()=>localStorage.setItem('busmora:ui-language','legacy-locale'))
  await page.reload();await page.getByRole('button',{name:'Delete',exact:true}).first().waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.lang),'en')
  assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr')
  await page.screenshot({path:path.join(root,'artifacts/competition/brain-en-mobile.png')})
  const cleaned=await page.evaluate(async()=>{
   const {safeMarkdown}=await import('/src/components/chat/MarkdownContent.tsx')
   return safeMarkdown('<script>window.injected=1</script><img src=x onerror="window.injected=1"><svg onload="window.injected=1"></svg>[bad](javascript:alert(1)) <a href="https://example.com" onclick="evil()">Good</a>')
  })
  assert(!/<script|<img|<svg|\sonerror=|\sonclick=|href=["']javascript:/i.test(cleaned));assert(cleaned.includes('noopener noreferrer'))
  const routing=await page.evaluate(async()=>{const {safeReturnPath}=await import('/src/lib/authRouting.ts');return ['https://evil.example','//evil.example','/\\evil.example','/brain?item=owned','/app/calendar?post=owned'].map(safeReturnPath)})
  assert.deepEqual(routing,[null,null,null,'/brain?item=owned','/app/calendar?post=owned'])
  const anonymous=await browser.newContext();const authPage=await anonymous.newPage()
  let signup
  await anonymous.route('https://busmora-ui-preview.supabase.co/**',async route=>{
   const url=new URL(route.request().url())
   if(url.pathname.endsWith('/signup')){signup=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'33333333-3333-4333-8333-333333333333',email:signup.email,identities:[]})})}
   return route.fulfill({status:200,contentType:'application/json',body:'{}'})
  })
  await authPage.goto(base+'/signup');await authPage.getByLabel(/Email/).fill('fictional@example.com');await authPage.getByLabel(/Password/).fill('fixture-password')
  assert.equal(await authPage.getByLabel('Company name').count(),0)
  await authPage.getByRole('button',{name:'Create account',exact:true}).click();await authPage.getByRole('heading',{name:'Check your email'}).waitFor()
  assert.equal(signup.email,'fictional@example.com');assert.equal(signup.data.company_name,undefined)
  await authPage.setViewportSize({width:1440,height:900});await authPage.screenshot({path:path.join(root,'artifacts/competition/verify-email-desktop.png')})
  await authPage.goto(base+'/auth/callback?error=access_denied');await authPage.getByRole('heading',{name:'This link could not be completed'}).waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS: canonical deep links, 1440/768/390/320 overflow, English-only interface with legacy-preference regression, safe Markdown/links, safe return paths, email/password signup, verification screen, cancelled callback')
 }finally{await browser?.close();server.kill('SIGTERM')}
}
main().catch(e=>{console.error(e);process.exitCode=1})
