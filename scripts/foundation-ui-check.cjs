// Local UI behavior only. All remote APIs are intercepted; no live auth claim.
const { chromium, startTestApp } = require('./next-test-utils.cjs')
const { existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures } = require('./ui-fixtures.cjs')
async function main() {
 const root=path.resolve(__dirname,'..'), base='http://127.0.0.1:4184'
 const server=await startTestApp(4184, 'busmora-ui-preview')
 let browser
 try {
  for(let i=0;i<80;i++){try {if((await fetch(base)).ok)break}catch{} if(i===79)throw Error('Next.js did not start');await new Promise(r=>setTimeout(r,250))}
  browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{}),args:['--no-sandbox']})
  const context=await browser.newContext();const tables=await installFixtures(context)
  tables.workspace_settings[0].ui_language='en'
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  mkdirSync(path.join(root,'artifacts/next-migration'),{recursive:true})
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
  await page.screenshot({path:path.join(root,'artifacts/next-migration/brain-en-mobile.png')})
  const { createHarness } = require('./crawl-test-utils.cjs')
  const { safeReturnPath } = createHarness().load('src/lib/authRouting.ts')
  assert.deepEqual(['https://evil.example','//evil.example','/brain?item=owned','/app/calendar?post=owned'].map(safeReturnPath),[null,null,'/brain?item=owned','/app/calendar?post=owned'])
  const anonymous=await browser.newContext();const authPage=await anonymous.newPage()
  let signup
  await anonymous.route('https://busmora-ui-preview.supabase.co/auth/v1/signup**',async route=>{
   signup=route.request().postDataJSON()
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'fictional-ui-token',refresh_token:'fictional-ui-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:tables.workspace_settings[0].workspace_id,email:signup.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},identities:[]}})})
  })
  await authPage.goto(base+'/signup');await authPage.getByLabel(/Email/).fill('fictional@example.com');await authPage.getByLabel(/Password/).fill('fixture-password')
  assert.equal(await authPage.getByLabel('Company name').count(),0)
  await authPage.getByRole('button',{name:'Create account',exact:true}).click()
  await authPage.waitForURL('**/onboarding')
  assert.equal(signup.email,'fictional@example.com')
  await authPage.waitForLoadState('domcontentloaded')
  await authPage.waitForTimeout(500)
  assert(!/verify.*email|email.*verif|confirm.*email/i.test(await authPage.locator('body').innerText()))
  await authPage.goto(base+'/auth/callback?error=access_denied')
  await authPage.getByRole('alert').filter({hasText:'Sign-in could not be completed.'}).waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS: canonical deep links, 1440/768/390/320 overflow, English-only interface with legacy-preference regression, safe return paths, email/password signup, immediate signup without email confirmation, cancelled callback')
 }finally{await browser?.close();server.kill('SIGTERM')}
}
main().catch(e=>{console.error(e);process.exitCode=1})
