// Fictional API responses exercise browser behavior; SQL acceptance is separate.
const { chromium, startTestApp }=require('./next-test-utils.cjs')
const { existsSync,mkdirSync }=require('node:fs')
const path=require('node:path'),assert=require('node:assert/strict')
const { installFixtures }=require('./ui-fixtures.cjs')
async function main(){
 const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4186'
 const server=await startTestApp(4186, 'busmora-ui-preview')
 let browser
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break}catch{}if(i===79)throw Error('Next.js did not start');await new Promise(r=>setTimeout(r,250))}
  browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/google-chrome')?{executablePath:'/usr/bin/google-chrome'}:{}),args:['--no-sandbox']})
  const context=await browser.newContext(),tables=await installFixtures(context)
  tables.brain_nodes=tables.brain_nodes.slice(0,2);tables.brain_edges=[]
  tables.brain_nodes[1].properties={pricingModel:'fixed',amount:'100',currency:'EGP'}
  tables.brain_versions=tables.brain_nodes.map(node=>({id:`version-${node.id}-1`,node_id:node.id,version:1,snapshot:structuredClone(node),created_at:node.created_at}))
  tables.brain_proposals=[{id:'proposal-1',node_id:tables.brain_nodes[1].id,base_version:1,status:'pending',diff:{title:'Imported offering change',summary:'A website claim awaiting owner review.',category:'offering',properties:{evidence_quote:'A real retrieval would supply this excerpt; this is fictional test data.'}},source_refs:[],created_at:tables.brain_nodes[1].created_at}]
  let failDelete=true
  await context.route('**/rest/v1/brain_nodes?*',async route=>{
   if(route.request().method()==='DELETE'&&failDelete)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Unavailable'})})
   return route.fallback()
  })
  await context.route('**/rest/v1/rpc/*',async route=>{
   const name=new URL(route.request().url()).pathname.split('/').pop(),body=route.request().postDataJSON()
   const ok=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
   const fail=()=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'STALE_VERSION'})})
   if(name==='update_brain_item'){
    const node=tables.brain_nodes.find(n=>n.id===body.p_node_id)
    if(node.version!==body.p_expected_version)return fail()
    Object.assign(node,{title:body.p_title,summary:body.p_summary,category:body.p_category,properties:body.p_properties,version:node.version+1,status:body.p_status,approval_state:'approved',verification_state:'owner_reported'})
    tables.brain_versions.push({id:`version-${node.id}-${node.version}`,node_id:node.id,version:node.version,snapshot:structuredClone(node),created_at:new Date().toISOString()})
    return ok(node)
   }
   if(name==='decide_brain_proposal'){
    const proposal=tables.brain_proposals.find(p=>p.id===body.p_proposal_id),node=tables.brain_nodes.find(n=>n.id===proposal.node_id)
    if(body.p_decision==='approved'&&node.version!==body.p_expected_version)return fail()
    proposal.status=body.p_decision;return ok(node)
   }
   if(name==='save_brain_relationship'){
    tables.brain_edges.push({id:'new-relation',source_node_id:body.p_source,target_node_id:body.p_target,relation_type:body.p_type,status:'approved',weight:1,provenance:{source:body.p_source_note}})
    return ok(tables.brain_edges.at(-1))
   }
   return route.fallback()
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(base+'/brain',{waitUntil:'domcontentloaded'})
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1500)
  const offering=page.locator('.card').filter({has:page.getByRole('heading',{name:'The Everyday Collection',exact:true})})
  await offering.getByRole('button',{name:'Edit',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'Edit knowledge'})
  await editor.getByLabel('Title',{exact:true}).fill('Owner corrected offering')
  await editor.getByLabel('Amount (optional)').fill('125')
  await editor.getByRole('button',{name:'Save',exact:true}).click();await editor.waitFor({state:'detached'})
  assert.equal(tables.brain_nodes[1].properties.amount,'125');assert.equal(tables.brain_nodes[1].version,2)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1000)
  await page.getByRole('button',{name:'Evidence for Owner corrected offering'}).click()
  const evidence=page.getByRole('dialog',{name:'Knowledge evidence and history'})
  await evidence.getByText('fixed · 100 EGP').waitFor();await evidence.getByText('fixed · 125 EGP').waitFor()
  await page.setViewportSize({width:390,height:844});mkdirSync(path.join(root,'artifacts/next-migration'),{recursive:true})
  await page.screenshot({path:path.join(root,'artifacts/next-migration/brain-history-mobile.png')})
  await evidence.getByRole('button',{name:'Close evidence'}).click()
  await page.getByRole('button',{name:'Approve for use',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'This item changed'}).waitFor()
  assert.equal(tables.brain_nodes[1].title,'Owner corrected offering')
  await page.getByRole('button',{name:'Reject',exact:true}).click();await page.getByRole('heading',{name:'Imported offering change'}).waitFor({state:'detached'})
  await page.getByRole('button',{name:'Relationships',exact:true}).click()
  const relationships=page.getByRole('dialog',{name:'Knowledge relationships'})
  await relationships.getByLabel('Source or explanation').fill('Owner confirms these items are related.')
  await relationships.getByRole('button',{name:'Add relationship'}).click()
  await relationships.getByRole('button',{name:/Owner approved · click to edit/}).waitFor()
  assert.equal(tables.brain_edges.length,1)
  await relationships.getByRole('button',{name:'Close relationships'}).click()
  await page.getByRole('button',{name:'Delete',exact:true}).first().click()
  const deletion=page.getByRole('dialog',{name:'Delete knowledge card?'})
  await deletion.getByRole('button',{name:'Delete',exact:true}).click()
  await deletion.getByText('Could not delete this knowledge card. Please try again.').waitFor();assert.equal(tables.brain_nodes.length,2)
  failDelete=false;await deletion.getByRole('button',{name:'Delete',exact:true}).click();await deletion.waitFor({state:'detached'});assert.equal(tables.brain_nodes.length,1)
  assert.deepEqual(errors,[])
  console.log('PASS: owner price edit/reload/history, stale proposal preserves fact, rejection, relationship persistence, failed deletion keeps card, retry succeeds, mobile evidence panel')
 }catch(error){const page=browser?.contexts()[0]?.pages()[0];if(page){console.error((await page.locator('body').innerText()).slice(-3000));await page.screenshot({path:'/tmp/busmora-brain-governance-failure.png'})}throw error}
 finally{await browser?.close();server.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1})
