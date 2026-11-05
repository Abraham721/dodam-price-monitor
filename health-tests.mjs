import assert from 'node:assert/strict';
import {APPROVED_PRODUCTS} from './approved-products.mjs';
import {assessHealth,checkHealth,MAX_HEALTH_AGE_MS} from './health.mjs';
const now=Date.now();
const fresh={status:'fresh',integrationStatus:'connected',pricesExpired:false,fetchedAt:new Date(now).toISOString(),rows:APPROVED_PRODUCTS.map(p=>({...p,buy:{price:p.face||100}}))};
assert.equal(assessHealth(fresh,{now}).healthy,true);
assert.equal(assessHealth(fresh,{now:now+MAX_HEALTH_AGE_MS+1}).healthy,false);
assert.equal(assessHealth({...fresh,rows:fresh.rows.slice(1)},{now}).healthy,false);
assert.equal(assessHealth(null,{now}).healthy,false);
assert.equal(assessHealth({...fresh,rows:APPROVED_PRODUCTS},{now}).healthy,false);
assert.equal(assessHealth(fresh,{now,error:{code:'source_incomplete',error:'Approved products missing: woo-104'}}).healthy,false);

let live={...fresh,status:'stale',pricesExpired:true};
const issues=[],mutations=[];
const fetcher=async(url,options={})=>{
 if(url==='https://dodamticket.com/api/market-rates')return Response.json(live);
 const base='https://api.github.com/repos/Abraham721/dodam-price-monitor';
 assert(url.startsWith(base));
 assert.equal(options.headers.Authorization,'Bearer test-only');
 if(!options.method||options.method==='GET')return Response.json(issues.filter(i=>i.state==='open'));
 const body=JSON.parse(options.body);mutations.push({method:options.method,body});
 if(options.method==='POST') {const issue={...body,number:issues.length+1,state:'open',user:{login:'github-actions[bot]'}};issues.push(issue);return Response.json(issue,{status:201});}
 const issue=issues.find(i=>url.endsWith('/'+i.number));Object.assign(issue,body);return Response.json(issue);
};
const options={token:'test-only',now,runId:123,fetcher};
assert.equal((await checkHealth(options)).outage.action,'opened');
assert.equal((await checkHealth(options)).outage.action,'unchanged');
assert.equal(mutations.length,1,'No repeated notification while the outage is unchanged');
live=fresh;
assert.equal((await checkHealth(options)).outage.action,'closed');
const snapshot={ok:true,publicVerified:true,quarantinedProducts:[{id:'woo-168',name:'RCE-TEST-DO-NOT-BUY'}]};
assert.equal((await checkHealth({...options,snapshot})).catalog.action,'opened');
assert.equal((await checkHealth({...options,snapshot})).catalog.action,'unchanged');
assert.equal((await checkHealth(options)).catalog.action,'not_checked','An independent health run must not close an unresolved catalog review');
assert.equal(issues.find(i=>i.title==='도담티켓 신규 상품 검토').state,'open');
assert.equal((await checkHealth({...options,snapshot:{...snapshot,quarantinedProducts:[]}})).catalog.action,'closed');
await assert.rejects(()=>checkHealth({...options,repository:'other/repo'}));
console.log('PASS: 12-minute freshness detection, unreachable/mismatched API detection, actionable rejection diagnostics, single outage notification, quiet unchanged state, recovery close, quarantined-catalog review, independent monitoring does not clear pending review.');
