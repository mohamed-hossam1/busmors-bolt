// Intercepted browser behavior. PostgreSQL acceptance is tested separately.
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { installFixtures, workspace } = require('./ui-fixtures.cjs')
async function main() {
 const root=path.resolve(__dirname,'..'), base='http://127.0.0.1:4185'
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4185','--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:'https://busmora-ui-preview.supabase.co',VITE_SUPABASE_ANON_KEY:'fictional-preview-key'}})
 let browser
 try {
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break}catch{}if(i===79)throw Error('Vite did not start');await new Promise(r=>setTimeout(r,250))}
  browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{}),args:['--no-sandbox']})
  const context=await browser.newContext(),tables=await installFixtures(context)
  Object.assign(tables.workspace_settings[0],{onboarding_state:'awaiting_url',country:'',currency:'',timezone:'UTC',target_market:'',updated_at:'2026-11-18T09:00:00Z'})
  tables.business_drafts=[]
  let failSave=false,staleConfirm=false,confirmCount=0
  await context.route('**/rest/v1/rpc/*',async route=>{
   const name=new URL(route.request().url()).pathname.split('/').pop(),body=route.request().postDataJSON()
   const ok=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
   const fail=message=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message})})
   if(name==='bootstrap_workspace')return ok(tables.workspace_settings[0])
   if(name==='save_business_draft'){
    if(failSave)return fail('Save unavailable')
    const old=tables.business_drafts[0]
    assert.equal(body.p_expected_version,old?.version??0)
    const draft={id:'33333333-3333-4333-8333-333333333333',workspace_id:workspace,version:(old?.version??0)+1,status:'draft',path:body.p_path,form:body.p_form,field_sources:body.p_field_sources}
    tables.business_drafts=[draft];return ok(draft)
   }
   if(name==='confirm_business_draft'){
    if(staleConfirm)return fail('STALE_VERSION')
    assert.equal(body.p_expected_version,tables.business_drafts[0].version)
    confirmCount++;tables.business_drafts[0].status='confirmed';tables.workspace_settings[0].onboarding_state='complete'
    return ok({draftId:body.p_draft_id,version:body.p_expected_version})
   }
   if(name==='save_workspace_preferences'){
    Object.assign(tables.workspace_settings[0],{country:body.p_country,currency:body.p_currency,timezone:body.p_timezone,target_market:body.p_target_market,updated_at:'2026-11-18T10:00:00Z'})
    return ok(tables.workspace_settings[0])
   }
   return route.fallback()
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message)})
  await page.goto(base+'/brain',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Set up manually/}).click()
  await page.getByLabel('Business name').fill('Fictional repair studio')
  await page.getByLabel('What do you do?').fill('We repair and customize everyday ceramics.')
  await page.getByLabel('Offering name').fill('Custom repairs')
  await page.getByLabel('Pricing model').selectOption('quote_required')
  await page.getByLabel(/^Country/).fill('Egypt')
  await page.getByLabel('Service area / online availability').fill('Cairo and online')
  await page.getByRole('button',{name:'Save draft',exact:true}).click()
  await page.getByText('Saved',{exact:true}).waitFor()
  await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('Business name').waitFor()
  assert.equal(await page.getByLabel('Business name').inputValue(),'Fictional repair studio')
  assert.equal(await page.getByLabel(/^Contact route/).inputValue(),'not_ready')
  failSave=true;await page.getByLabel('Business name').fill('Owner correction')
  await page.getByRole('button',{name:'Save draft',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Draft could not be saved'}).waitFor()
  assert.equal(await page.getByLabel('Business name').inputValue(),'Owner correction')
  failSave=false;await page.getByRole('button',{name:'Review business',exact:true}).click()
  await page.getByRole('heading',{name:'Make it yours. Then confirm.'}).waitFor()
  staleConfirm=true;await page.getByRole('button',{name:'Confirm business context'}).click()
  await page.getByRole('alert').filter({hasText:'This summary is outdated'}).waitFor();assert.equal(confirmCount,0)
  staleConfirm=false;await page.getByRole('button',{name:'Confirm business context'}).click()
  await page.getByRole('heading',{name:'Your business context is ready.'}).waitFor();assert.equal(confirmCount,1)
  mkdirSync(path.join(root,'artifacts/competition'),{recursive:true})
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'artifacts/competition/intake-confirmed-mobile.png')})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.goto(base+'/settings',{waitUntil:'domcontentloaded'});await page.getByLabel('Business country').fill('Egypt')
  await page.getByLabel('Currency code').fill('USD');await page.getByLabel('Target market').fill('Independent Gulf shops')
  await page.getByLabel(/^Timezone/).selectOption('America/New_York')
  await page.getByRole('button',{name:'Save preferences'}).click();await page.getByText('Region preferences saved.').waitFor()
  await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel(/^Timezone/).waitFor()
  assert.equal(await page.getByLabel('Currency code').inputValue(),'USD')
  assert.equal(await page.getByLabel(/^Timezone/).inputValue(),'America/New_York')
  const dates=await page.evaluate(async()=>{const {formatWorkspaceTime}=await import('/src/lib/region.ts');return ['2026-01-15T12:00:00Z','2026-07-15T12:00:00Z'].map(date=>formatWorkspaceTime(date,'America/New_York'))})
  assert(dates[0].includes('7:00'));assert(dates[1].includes('8:00'))
  const late=await page.evaluate(async()=>{
   const {mergeWebsiteFields,emptyBusiness}=await import('/src/features/onboarding/types.ts')
   const baseline=emptyBusiness();return mergeWebsiteFields({...baseline,name:'Owner edit'},baseline,{name:'Late source',description:'Supported description'})
  })
  assert.equal(late.name,'Owner edit');assert.equal(late.description,'Supported description')
  assert.deepEqual(errors,[])
  console.log('PASS: manual/no-website intake, persisted reload, save failure keeps edits, stale confirmation recovery, confirmation completion, mobile layout, independent region persistence, seasonal timezone, late source preserves edits')
 }catch(error){
  const page=browser?.contexts()[0]?.pages()[0]
  if(page){console.error('Failure at:',page.url(),(await page.locator('body').innerText()).slice(0,5000));await page.screenshot({path:'/tmp/busmora-intake-failure.png'})}
  throw error
 }finally{await browser?.close();server.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1})
