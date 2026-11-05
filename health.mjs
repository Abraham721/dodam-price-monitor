import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {APPROVED_PRODUCTS} from './approved-products.mjs';

const REPOSITORY = 'Abraham721/dodam-price-monitor';
export const MAX_HEALTH_AGE_MS = 12 * 60 * 1000;
const safe = value => String(value).replace(/[`<>@]/g, '').slice(0,400);

export function assessHealth(live, {now=Date.now(), error, snapshot}={}) {
  const problems=[];
  if (!live) problems.push({code:'public_unreachable',message:'공개 시세 API를 조회하지 못했습니다.'});
  else {
    const age=now-Date.parse(live.fetchedAt);
    if (!Number.isFinite(age)||age < -60000||age>MAX_HEALTH_AGE_MS||live.status!=='fresh'||live.pricesExpired)
      problems.push({code:'prices_not_fresh',message:'최신 가격 확인이 12분 이상 지연되었거나 가격이 만료됐습니다.'});
    if (live.integrationStatus!=='connected'||!Array.isArray(live.rows)||live.rows.length!==APPROVED_PRODUCTS.length||APPROVED_PRODUCTS.some(p=>!live.rows.some(r=>r.id===p.id&&r.face===p.face)))
      problems.push({code:'public_catalog_mismatch',message:'공개 상품 목록이 검토된 72개 목록과 다릅니다.'});
    if (Array.isArray(live.rows)&&live.rows.some(row=>!row.buy&&!row.sell||[row.buy,row.sell].some(q=>q&&(!Number.isSafeInteger(q.price)||q.price<=0))))
      problems.push({code:'public_prices_missing',message:'공개 상품의 가격이 비어 있거나 올바른 금액이 아닙니다.'});
  }
  if (error&&['receiver_rejected','source_incomplete','source_denomination','verification_prices','verification_status'].includes(error.code))
    problems.push({code:error.code,message:safe(error.error||error.message||error.code)});
  const pending=snapshot?.ok&&snapshot.publicVerified ? snapshot.quarantinedProducts||[] : null;
  return {problems,pending,healthy:problems.length===0};
}

export async function reconcileIssue({kind,problems,context,repository=REPOSITORY,token,fetcher=fetch}) {
  if (repository!==REPOSITORY||!token) throw new Error('Unexpected health repository or missing token');
  const base='https://api.github.com/repos/'+repository;
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  async function api(path,method='GET',body) {
    const r=await fetcher(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error('Health issue API failed: '+r.status);
    return r.status===204?null:r.json();
  }
  const title=kind==='outage'?'도담티켓 가격연동 장애':'도담티켓 신규 상품 검토';
  const marker='<!-- dodam-monitor:'+kind+':';
  const open=await api('/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100');
  const issue=open.find(i=>!i.pull_request&&i.user?.login==='github-actions[bot]'&&i.title===title&&i.body?.includes(marker));
  if(!problems.length) {
    // A still-fresh cached price is not evidence that a rejected collector has
    // recovered. Independent checks close an outage only after a newer public
    // observation; the collector can also supply an explicitly verified result.
    const previousObserved=Date.parse(issue?.body?.match(/<!-- dodam-observed:([^ ]*) -->/)?.[1]||issue?.created_at);
    if(issue&&kind==='outage'&&!context.verified&&!(Date.parse(context.lastObservedAt)>previousObserved))return {action:'unchanged',number:issue.number};
    if(issue) {await api('/issues/'+issue.number,'PATCH',{state:'closed',state_reason:'completed'});return {action:'closed',number:issue.number};}
    return {action:'none'};
  }
  const key=createHash('sha256').update(JSON.stringify(problems)).digest('hex');
  if(issue?.body?.includes(marker+key+' -->'))return {action:'unchanged',number:issue.number};
  const body=marker+key+' -->\n<!-- dodam-observed:'+(context.lastObservedAt||'')+' -->\n'+(kind==='outage'?'가격연동 확인이 필요합니다. 30분 만료 보호는 유지됩니다.':'아래 신규 상품은 자동 등록하지 않았습니다. 기존 72개 상품의 가격연동은 계속됩니다.')+
    '\n\n'+problems.map(p=>'- '+safe(p.message)).join('\n')+
    '\n\n마지막 공개 가격 확인: '+safe(context.lastObservedAt||'조회 불가')+
    '\n확인 실행: https://github.com/'+repository+'/actions/runs/'+safe(context.runId||'')+
    '\n\n동일 상태에서는 반복 댓글이나 알림을 만들지 않습니다. 정상 확인 후 자동으로 닫습니다.';
  const result=await api(issue?'/issues/'+issue.number:'/issues',issue?'PATCH':'POST',{title,body});
  return {action:issue?'updated':'opened',number:result.number,url:result.html_url};
}

export async function checkHealth({token,repository=REPOSITORY,runId,now=Date.now(),error,snapshot,fetcher=fetch}={}) {
  let live;
  try {const r=await fetcher('https://dodamticket.com/api/market-rates',{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});if(r.ok)live=await r.json();}catch{}
  const assessment=assessHealth(live,{now,error,snapshot});
  const context={lastObservedAt:live?.fetchedAt,runId,verified:!!(snapshot?.ok&&snapshot.publicVerified)};
  const outage=await reconcileIssue({kind:'outage',problems:assessment.problems,context,token,repository,fetcher});
  let catalog={action:'not_checked'};
  if(assessment.pending!==null)catalog=await reconcileIssue({kind:'catalog',problems:assessment.pending.map(p=>({code:p.id,message:p.id+' · '+p.name})),context,token,repository,fetcher});
  return {ok:true,healthy:assessment.healthy,lastObservedAt:live?.fetchedAt,problems:assessment.problems,quarantinedProducts:assessment.pending,outage,catalog};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const parse=value=>{try{return JSON.parse(value||'null');}catch{return null;}};
    const result=await checkHealth({token:process.env.GH_TOKEN,repository:process.env.REPOSITORY,runId:process.env.GITHUB_RUN_ID,error:parse(process.env.COLLECTOR_ERROR),snapshot:parse(process.env.SNAPSHOT)});
    console.log(JSON.stringify(result));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,(result.healthy?'가격연동 정상':'가격연동 확인 필요')+'\n\n'+result.problems.map(p=>'- '+safe(p.message)).join('\n')+'\n');
  } catch(error) {console.error(JSON.stringify({ok:false,phase:'health_report',error:error.message}));process.exitCode=1;}
}
