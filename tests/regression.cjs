const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
function context(options={}) {
  const elements=new Map(), data=new Map(Object.entries(options.storage||{}));
  class Element {
    constructor(){this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.children=[];this.dataset={};this.options=[];this.classList={toggle(){},add(){},remove(){},contains(){return false}};}
    addEventListener(){} setAttribute(){} removeAttribute(){} append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v} focus(){} click(){} closest(){return null} querySelectorAll(){return []} querySelector(){return new Element()} matches(){return false} contains(){return false}
  }
  const document={querySelector(key){if(!elements.has(key))elements.set(key,new Element());return elements.get(key)},querySelectorAll(){return []},createElement(){return new Element()},createTextNode(s){return s},addEventListener(){},body:new Element(),baseURI:'https://example.test/'};
  const storage={getItem:k=>data.get(k)??null,setItem(k,v){if(options.failWrites)throw Error('quota');data.set(k,String(v))},removeItem:k=>data.delete(k)};
  const ctx=vm.createContext({console,document,localStorage:storage,structuredClone,performance:options.performance||performance,setTimeout,clearTimeout,Map,Set,URL,Blob,TextEncoder,TextDecoder,Worker:options.Worker,navigator:{},confirm:()=>true,...options.globals});
  vm.runInContext(fs.readFileSync(path.join(repo,'engine.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(repo,'script.js'),'utf8').replace(/boot\(\);\s*$/u,''),ctx);
  vm.runInContext(`for(const name of ['renderSavedSettings','renderDraftStats','renderGroups','renderAudit','renderResultHistory','renderCandidates','renderSummary','syncTwoStageControls','updateUndoButtonState','updateBulkControls'])globalThis[name]=()=>{};groupCountInput.value='2';rollCountInput.value='1';searchTimeInput.value='3000';searchOperationsInput.value='1000000';`,ctx);
  return {ctx,data,elements,run:code=>vm.runInContext(code,ctx),storage};
}

function fixture(extra={}) {
  const participants=['A','B','C','D','E','F'];
  return {participants,profiles:participants.map((name,i)=>({name,attributes:{skill:i===0?1:0},preferences:[],restrictions:[],requiredRole:''})),groupCount:2,capacities:null,roles:[],twoStage:false,seed:'regression',attempts:100,maxMs:30000,maxOperations:10000000,togetherRules:[],separateRules:[],fixedRules:[],attributeRules:[],errors:[],...extra};
}
function engine(extra={}) {
  const ctx=vm.createContext({performance,setTimeout,...extra});vm.runInContext(fs.readFileSync(path.join(repo,'engine.js'),'utf8'),ctx);
  return {ctx,run:(code,input)=>{ctx.input=input;return vm.runInContext(code,ctx)}};
}
let checks=0;
async function test(name, action) { await action();checks++;console.log('PASS '+name); }
function record(t) {t.run(`participantsInput.value='A,B,C,D';seedInput.value='saved-seed';lockedAssignments=new Map([['A',0]]);lastPlan=[['A','B'],['C','D']];lastRoleAssignments=null;lastCapacities=null;lastQuality=scoreAssignment(lastPlan,getInputs(),null);resultInputSignature=getInputSignature();recordResultHistory()`);}
(async()=>{
await test('balanced capacities, constraints and seeded determinism',()=>{
  const e=engine();
  for(let seed=0;seed<20;seed++) for(const changes of [{},{capacities:[2,4]},{togetherRules:[{members:['A','B']}],separateRules:[{members:['C','D']}],fixedRules:[{member:'A',groupIndex:1}]}]) {
    const value=fixture({...changes,seed:String(seed)}),a=e.run('globalThis.result=buildPlan(input);result',value),b=e.run('buildPlan(input)',value);
    assert.equal(a.status,'success');assert.equal(e.run('validateAssignmentResult(result.plan,input,result.roleAssignments).length',value),0);
    assert.equal(JSON.stringify(a),JSON.stringify(b));
  }
});
await test('MRV and forward checking retain all small feasible assignments',()=>{
  const e=engine();
  for(let mask=0;mask<32;mask++) {
    const value=fixture({capacities:[3,3],togetherRules:mask&1?[{members:['A','B']}]:[],separateRules:[...(mask&2?[{members:['B','C']}]:[]),...(mask&4?[{members:['D','E','F']}]:[])],fixedRules:[...(mask&8?[{member:'A',groupIndex:0}]:[]),...(mask&16?[{member:'C',groupIndex:1}]:[])]});
    let possible=false;
    for(let bits=0;bits<64;bits++) {
      const groups=value.participants.map((_,i)=>(bits>>i)&1);
      if(groups.filter(x=>x===0).length!==3)continue;
      const group=name=>groups[value.participants.indexOf(name)];
      if(value.togetherRules.some(r=>new Set(r.members.map(group)).size!==1)||value.separateRules.some(r=>new Set(r.members.map(group)).size!==r.members.length)||value.fixedRules.some(r=>group(r.member)!==r.groupIndex))continue;
      possible=true;break;
    }
    assert.equal(e.run('buildPlan(input).status',value),possible?'success':'impossible');
  }
});
await test('required/optional/restricted/preferred roles and cache isolation',()=>{
  const e=engine();
  const value=fixture({participants:['A','B','C','D'],profiles:[{name:'A',requiredRole:'R',preferences:['R']},{name:'B',requiredRole:'R'},{name:'C',restrictions:['R'],preferences:['S']},{name:'D',restrictions:['R'],preferences:['S']}],twoStage:true,roles:['R','S','T'],requiredRoles:['R'],optionalRoles:['S','T']});
  const result=e.run('globalThis.result=buildPlan(input);result',value);assert.equal(result.status,'success');assert.equal(e.run('validateAssignmentResult(result.plan,input,result.roleAssignments).length',value),0);assert.equal(result.quality.role,100);
  value.profiles[2].restrictions=[];value.profiles[2].requiredRole='R';assert.equal(e.run('buildPlan(input).status',value),'impossible');
});
await test('time/operation limits preserve validated candidates',()=>{
  for(const reason of ['time','operations']) {
    const e=engine();e.run(`const original=checkSearchBudget;checkSearchBudget=function(s,n){if(s.bestResult){${reason==='time'?'s.start=performance.now()-s.maxMs':'s.maxOperations=s.operations'}}return original(s,n)}`,fixture());
    const result=e.run('globalThis.result=buildPlan(input);result',fixture());assert.equal(result.status,'success');assert.equal(result.limitReason,reason);assert.equal(result.quality.valid,true);assert.ok(Number.isFinite(result.score));
    assert.equal(e.run('validateAssignmentResult(result.plan,input,result.roleAssignments).length',fixture()),0);
  }
  assert.equal(engine().run('buildPlan(input).status',fixture({maxMs:0.000001})),'limit');
});
await test('cooperative search matches sync execution and can cancel',async()=>{
  const e=engine(),value=fixture();const sync=e.run('buildPlan(input)',value),asyncResult=await e.run('buildPlanAsync(input)',value);assert.equal(JSON.stringify(sync),JSON.stringify(asyncResult));
  let cancelled=false,heartbeats=0;const task=engine({shouldCancel:()=>cancelled}).run('buildPlanAsync(input,{shouldCancel})',fixture({attempts:100000,maxMs:5000}));
  const pulse=setInterval(()=>heartbeats++,2);setTimeout(()=>cancelled=true,25);
  try{assert.equal((await task).status,'cancelled');assert.ok(heartbeats>0)}finally{clearInterval(pulse)}
});
await test('Worker success, constructor/runtime/protocol failure and cancellation',async()=>{
  const e=engine();let terminated=0;
  const modes=[class{postMessage(input){setTimeout(()=>this.onmessage?.({data:{type:'result',result:e.run('buildPlan(input)',input)}}),0)}terminate(){terminated++}},undefined,class{constructor(){throw Error('blocked')}},class{postMessage(){setTimeout(()=>this.onerror?.({preventDefault(){}}),0)}terminate(){terminated++}},class{postMessage(){setTimeout(()=>this.onmessage?.({data:{type:'bad'}}),0)}terminate(){terminated++}}];
  for(const Worker of modes){const t=context({Worker});t.ctx.input=fixture();assert.equal((await t.run('computePlan(input,()=>{})')).status,'success');}
  const t=context({Worker:class{postMessage(){}terminate(){terminated++}}});t.ctx.input=fixture();const task=t.run('computePlan(input,()=>{})');t.run('isGenerating=true;cancelGeneration()');assert.equal((await task).status,'cancelled');assert.ok(terminated>=4);
});
await test('saved IDs, locks, CRUD, legacy migration and corrupt entry isolation',()=>{
  const legacy=[{id:12,name:'Legacy',settings:{participants:'A,B,C,D',groupCount:2}},null,{id:'12',name:'Locked',settings:{participants:'A,B,C,D',groupCount:'2',locks:[['A',1]]}}];
  let t=context({storage:{'teambuilder.savedSettings.v1':JSON.stringify(legacy)}});t.run('loadSavedSettings()');assert.equal(t.run('savedSettings.length'),2);t.run("loadSavedSetting(savedSettings[1]);renameSavedSetting(activeSavedSettingId,'Renamed')");assert.equal(t.run("lockedAssignments.get('A')"),1);assert.ok(t.data.get('teambuilder.savedSettings.recovery'));
  t=context({storage:Object.fromEntries(t.data)});t.run('loadSavedSettings();loadSavedSetting(savedSettings[1])');assert.equal(t.run('savedSettings[1].name'),'Renamed');assert.equal(t.run("lockedAssignments.get('A')"),1);
  t.run("participantsInput.value='A,B,C,D,E,F';lockedAssignments.clear();updateCurrentSavedSetting();deleteSavedSetting(activeSavedSettingId)");assert.equal(t.run('savedSettings.length'),1);
});
await test('storage failures leave existing settings and history untouched',()=>{
  const raw=JSON.stringify([{id:'legacy',name:'Keep',settings:{participants:'A,B',groupCount:'2',locks:[]}}]);const t=context({failWrites:true,storage:{'teambuilder.savedSettings.v2':raw}});t.run('loadSavedSettings();loadSavedSetting(savedSettings[0])');
  const before=t.run('JSON.stringify(savedSettings)');for(const action of ['saveCurrentSettings()','updateCurrentSavedSetting()','renameSavedSetting(activeSavedSettingId,"Changed")','deleteSavedSetting(activeSavedSettingId)']){t.run(action);assert.equal(t.run('JSON.stringify(savedSettings)'),before);assert.match(t.run('statusMessage.textContent'),/저장하지 못/)}
  record(t);assert.equal(t.run('resultHistory.length'),0);
});
await test('invalid saved drafts are rejected before storage and deletion never prunes unrelated history',()=>{
  const t=context();t.run('participantsInput.value="A,B";groupCountInput.value="";saveCurrentSettings()');assert.equal(t.run('savedSettings.length'),0);assert.equal(t.data.has('teambuilder.savedSettings.v2'),false);
  t.run('groupCountInput.value="2"');record(t);record(t);const id=t.run('resultHistory[0].id'),before=t.run('JSON.stringify(resultHistory)');
  t.storage.setItem=()=>{const error=Error('quota');error.name='QuotaExceededError';throw error};assert.equal(t.run(`deleteResultHistory(${JSON.stringify(id)})`),false);assert.equal(t.run('JSON.stringify(resultHistory)'),before);
});
await test('JSON v1/v2, draft locks and CSV compatibility',()=>{
  const t=context();record(t);assert.equal(t.run('parseSettingsJSON(buildSettingsJSON()).locks[0][1]'),0);t.run('saveDraft();lockedAssignments.clear();recoverDraft(localStorage.getItem(DRAFT_STORAGE_KEY))');assert.equal(t.run("lockedAssignments.get('A')"),0);
  assert.equal(t.run('parseSettingsJSON(JSON.stringify({app:"TeamBuilder",version:1,settings:{participants:"A,B",groupCount:2}})).locks.length'),0);
  assert.equal(t.run('parseParticipantCSV(\'name,attr:skill,preferences\\n"A, Team",2,R|S\\nB,3,S\\n\')[0].name'),'A, Team');assert.equal(t.run('encodeCSVCell("=1+1")'),"'=1+1");assert.match(t.run('buildResultCSV([["A","B"],["C","D"]],["Red","Blue"])'),/Red/);
});
await test('history restore verifies locks, seed, roles; deletes are transactional',()=>{
  let t=context();record(t);const rows=JSON.parse(t.data.get('teambuilder.resultHistory.v2'));rows.push({...rows[0],id:'broken',snapshot:{...rows[0].snapshot,locks:[['A',1]]}});
  t=context({storage:{'teambuilder.resultHistory.v2':JSON.stringify(rows)}});t.run('loadResultHistory()');assert.equal(t.run('resultHistory.length'),1);assert.equal(t.run('restoreResultHistory(resultHistory[0].id)'),true);assert.equal(t.run('seedInput.value'),'saved-seed');assert.equal(t.run("lockedAssignments.get('A')"),0);
  t.ctx.confirm=()=>false;assert.equal(t.run('clearResultHistory()'),false);t.ctx.confirm=()=>true;assert.equal(t.run('clearResultHistory()'),true);assert.equal(t.run('resultHistory.length'),0);assert.ok(t.data.get('teambuilder.resultHistory.recovery').includes('broken'));
});
await test('manual swap, locks, rejected moves, Undo/Redo and display rename',()=>{
  const t=context();record(t);t.run('lockedAssignments.clear();resultInputSignature=getInputSignature()');assert.equal(t.run('swapMembers("A","C")'),true);assert.equal(t.run('undoLastEdit()'),true);assert.equal(t.run('lastPlan[0].includes("A")'),true);assert.equal(t.run('redoLastEdit()'),true);
  t.run('toggleMemberLock("A",1)');assert.equal(t.run('swapMembers("A","B")'),false);assert.equal(t.run('moveMember("B",0,1)'),false);
  t.run('groupNamesInput.value="Red\\nBlue";handleDraftInput({currentTarget:groupNamesInput})');assert.equal(t.run('isResultCurrent()'),true);assert.match(t.run('buildResultJSON()'),/Red/);t.run('participantsInput.value="A,B,C,E"');assert.equal(t.run('isResultCurrent()'),false);
});
console.log(`${checks} regression groups passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
