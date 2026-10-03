const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
class Element {
  constructor() { this.value = ''; this.textContent = ''; this.children = []; this.disabled = false; this.checked = false; this.open = false; this.attrs = {}; this.handlers = {}; this.classes = new Set(); this.classList = { toggle: (k, v) => v ? this.classes.add(k) : this.classes.delete(k), add: k => this.classes.add(k), remove: k => this.classes.delete(k) }; }
  set innerHTML(value) { this.children = []; this._html = value; }
  get innerHTML() { return this._html || ''; }
  append(...items) { this.children.push(...items); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k, fn) { this.handlers[k] = fn; }
  click() { this.handlers.click?.({ target: this }); }
  remove() {}
}
const nodes = new Map();
const storage = new Map();
const context = vm.createContext({ console, setTimeout, clearTimeout, Blob, URL, Map, Set, document: { querySelector: id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement: () => new Element(), body: new Element() }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, navigator: { clipboard: { writeText: async value => context.copiedText = value } }, prompt: () => null });
vm.runInContext(fs.readFileSync(`${root}/script.js`, 'utf8'), context);
const run = code => vm.runInContext(code, context);
const json = code => JSON.parse(JSON.stringify(run(code)));
const check = (name, fn) => { fn(); console.log(`PASS ${name}`); };
const html = fs.readFileSync(`${root}/index.html`, 'utf8');
const css = fs.readFileSync(`${root}/styles.css`, 'utf8');
check('private rules panel', () => { assert.match(html, /<details[^>]*id="rulesPanel"/); assert.match(html, /<summary>규칙<\/summary>/); assert.doesNotMatch(html, /id="(?:ruleCount|summaryRules)"/); assert.match(css, /@media \(max-width: 520px\)/); run('togetherInput.value="A-B"; renderDraftStats()'); assert.equal(run('togetherInput.value'), 'A-B'); });
const stage = 10;
globalThis.harness = { assert, run, json, check, nodes, storage, context, html, css, stage, root };


{
const { assert, run, json, check, nodes, html, css, stage } = globalThis.harness;
check('result audit and copied audit hide rule details', () => {
  run('lastPlan=[["A","B"],["C","D"]]; renderAudit(validatePlan(lastPlan, [{members:["A","B"]}], [{members:["A","C"]}], [{member:"B",groupIndex:0}], [{member:"A",value:"SECRET_ATTRIBUTE"}]))');
  assert.equal(run('lastAudit.length'), 1);
  assert.deepEqual(json('lastAudit'), [{type:'ok',title:'배정 완료',detail:'입력 조건을 만족하는 결과입니다.'}]);
  const text = run('formatCopyResult(lastPlan,["1","2"],[{type:"ok",title:"분리 배정 만족",detail:"PRIVATE_RULE"}],"audit")');
  assert.doesNotMatch(text, /분리|PRIVATE_RULE/);
  run('renderAudit([{type:"error",title:"규칙 충돌",detail:"SECRET A-B"}])');
  assert.doesNotMatch(JSON.stringify(json('lastAudit')), /SECRET|규칙/);
  assert.equal(nodes.get('#ruleFeedback').children[0].textContent, 'SECRET A-B');
  run('reset()');
});
if (stage >= 3) check('explicit capacities and rule overflow', () => {
  run('reset(); participantsInput.value="A,B,C,D,E,F,G,H,I,J";groupCountInput.value="2";groupCapacitiesInput.value="4,6"');
  assert.deepEqual(json('buildPlan(getInputs()).plan.map(group=>group.length)'), [4,6]);
  for (const value of ['5', '0,10', '4.5,5.5', '4,5', ',10', '4,6,', '-4,14', '1e0,9']) assert.ok(json(`parseGroupCapacities(${JSON.stringify(value)},2,10).errors`).length);
  run('fixedInput.value="A=1\\nB=1\\nC=1\\nD=1\\nE=1"');
  assert.ok(run('buildPlan(getInputs()).error'));
  run('fixedInput.value="A=1";togetherInput.value="A-B-C-D-E"');
  assert.ok(run('buildPlan(getInputs()).error'));
  run('reset();participantsInput.value="A,B,C,D,E";groupCountInput.value="2"');
  assert.deepEqual(json('buildPlan(getInputs()).plan.map(group=>group.length).sort()'),[2,3]);
  run('reset()');
});
if (stage >= 4) check('two-stage controls stay private and disabled when off', () => {
  assert.ok(html.indexOf('id="twoStageInput"') > html.indexOf('<details'));
  assert.ok(html.indexOf('id="rolesInput"') < html.indexOf('</details>'));
  assert.equal(run('rolesInput.disabled'),true);
  run('rolesInput.value="1,2,3"; twoStageInput.checked=true;syncTwoStageControls()');
  assert.equal(run('rolesInput.disabled'),false);
  run('twoStageInput.checked=false;syncTwoStageControls();isGenerating=true;setGenerateBusy(true);isGenerating=false;setGenerateBusy(false)');
  assert.equal(run('rolesInput.disabled'),true);
  assert.equal(run('rolesInput.value'),'1,2,3');
  assert.match(css,/#rolesInput:disabled/);
  run('reset()');
});
if (stage >= 5) check('role parsing accepts arbitrary trimmed strings', () => {
  assert.deepEqual(json('parseRoleList(" TOP, JG, , MID, ADC, SUP, ").roles'),['TOP','JG','MID','ADC','SUP']);
  assert.deepEqual(json('parseRoleList("리더, 개발, 디자인").roles'),['리더','개발','디자인']);
  assert.deepEqual(json('parseRoleList("1,2,3").roles'),['1','2','3']);
  assert.equal(run('parseRoleList("1,2,3").roleCount'),3);
  for (const value of ['', ', ,', 'TOP,top', '1,1', 'first\nsecond']) assert.ok(json(`parseRoleList(${JSON.stringify(value)}).errors`).length);
  assert.equal(run('parseRoleList("TOP,TOP",false).errors.length'),0);
});
if (stage >= 6) check('nested roles preserve group assignment and copy output', () => {
  run('reset();participantsInput.value="A,B,C,D,E,F,G,H,I,J";groupCountInput.value="2";togetherInput.value="A-B";separateInput.value="A-C";fixedInput.value="A=1";const basePlan=buildPlan(getInputs()).plan;const rolePlan=assignRolesToPlan(basePlan,["TOP","JG","MID","ADC","SUP"])');
  assert.deepEqual(json('rolePlan.map(group=>group.map(entry=>entry.role))'),[['TOP','JG','MID','ADC','SUP'],['TOP','JG','MID','ADC','SUP']]);
  assert.deepEqual(json('rolePlan.map(group=>group.map(entry=>entry.member).sort())'),json('basePlan.map(group=>[...group].sort())'));
  assert.ok(run('basePlan[0].includes("A") && basePlan[0].includes("B") && basePlan[1].includes("C")'));
  assert.match(run('formatCopyResult(basePlan,["팀1","팀2"],[],"grouped",rolePlan)'),/TOP — /);
  assert.doesNotMatch(run('formatCopyResult(basePlan,["팀1","팀2"],[],"names",rolePlan)'),/TOP/);
  run('lastPlan=basePlan;lastRoleAssignments=rolePlan;pushEditHistory();lastRoleAssignments=null;undoLastEdit()');
  assert.deepEqual(json('lastRoleAssignments'),json('rolePlan'));
  assert.deepEqual(json('assignRolesToPlan([["A","B","C"]],["리더","개발","디자인"])[0].map(entry=>entry.role)'),['리더','개발','디자인']);
  run('reset()');
});
if (stage >= 7) check('nested capacities fail before generating', () => {
  run('reset();participantsInput.value="A,B,C,D,E,F,G,H,I,J";groupCountInput.value="2";twoStageInput.checked=true;rolesInput.value="TOP,JG,MID,ADC,SUP"');
  assert.equal(run('getInputs().errors.length'),0);
  run('rolesInput.value="1,2,3,4"');
  assert.ok(run('getInputs().errors.length'));
  run('rolesInput.value="1,2,3,4,5";groupCapacitiesInput.value="4,6"');
  assert.ok(run('getInputs().errors.length'));
  run('groupCapacitiesInput.value="5,5"');
  assert.equal(run('getInputs().errors.length'),0);
  assert.throws(()=>run('assignRolesToPlan([["A","B"]],["1"])'));
  run('twoStageInput.checked=false;groupCapacitiesInput.value="4,6";rolesInput.value="1,1"');
  assert.equal(run('getInputs().errors.length'),0);
  run('reset()');
});
if (stage >= 8) check('CSV import handles name/role and quoted data', () => {
  assert.deepEqual(json('parseParticipantCSV("name\\r\\n가\\r\\n나\\r\\n")'),[{name:'가',role:''},{name:'나',role:''}]);
  assert.deepEqual(json('parseParticipantCSV("\\uFEFFname,role\\nA,TOP\\nB,JG")'),[{name:'A',role:'TOP'},{name:'B',role:'JG'}]);
  const csv='name,role\r\n"Comma, Name",unused\r\n"Quote""Name",unused\r\n';
  run(`applyParticipantRecords(parseParticipantCSV(${JSON.stringify(csv)}))`);
  assert.deepEqual(json('getInputs().participants'),['Comma, Name','Quote"Name']);
  assert.equal(run('getDraftSettings().participantRecords[0].role'),'unused');
  assert.deepEqual(json('parseCSV("name\\n\\"line1\\nline2\\"\\n")'),[['name'],['line1\nline2']]);
  for (const value of ['wrong\nA','name,name\nA,B','name,role\n,TOP','name\n"A','name\n"A"tail','name,role\nA']) assert.throws(()=>run(`parseParticipantCSV(${JSON.stringify(value)})`));
  run('reset()');
});
if (stage >= 9) check('CSV exports only current groups and roles with escaped fields', () => {
  const csv=run('buildResultCSV([["A","B"],["C"]],["팀1","팀2"])');
  assert.deepEqual(json(`parseCSV(${JSON.stringify(csv)})`),[['group','name'],['팀1','A'],['팀1','B'],['팀2','C']]);
  const nested=run('buildResultCSV([["Comma, Name","Quote\\"Name"]],["Team,One"],[[{member:"Comma, Name",role:"리더"},{member:"Quote\\"Name",role:"개발"}]])');
  assert.deepEqual(json(`parseCSV(${JSON.stringify(nested)})`),[['group','role','name'],['Team,One','리더','Comma, Name'],['Team,One','개발','Quote"Name']]);
  assert.doesNotMatch(nested,/together|separate|fixed|attributes|규칙|분리/);
  assert.equal(run('exportCSVButton.disabled'),true);
  run('lastPlan=[["A"],["B"]];renderGroups(lastPlan)');
  assert.equal(run('exportCSVButton.disabled'),false);
  run('reset()');
});
if (stage >= 10) check('JSON settings round-trip and isolate local saved settings', () => {
  run('restoreSettings({participants:"A,B,C,D,E,F",groupCount:"2",rollCount:"3",groupNames:"팀1\\n팀2",groupCapacities:"3,3",together:"A-B",separate:"A-C",fixed:"A=1",attributes:"A=X",twoStage:true,roles:"리더,개발,디자인"});saveCurrentSettings();const draftBefore=getDraftSettings();const backupJSON=buildSettingsJSON();const parsedBackup=parseSettingsJSON(backupJSON);reset();restoreSettings(parsedBackup)');
  assert.deepEqual(json('getDraftSettings()'),json('draftBefore'));
  assert.equal(run('savedSettings.length'),1);
  assert.equal(run('activeSavedSettingId'),null);
  assert.equal(run('rolesInput.disabled'),false);
  assert.equal(run('rulesPanel.open'),false);
  for (const value of ['{}','[]','{"app":"TeamBuilder","version":2,"settings":{}}','{"app":"TeamBuilder","version":1,"settings":{"twoStage":"true"}}','{"app":"TeamBuilder","version":1,"settings":{"participants":[]}}']) assert.throws(()=>run(`parseSettingsJSON(${JSON.stringify(value)})`));
  run('applyParticipantRecords(parseParticipantCSV("name,role\\n\\"Comma, Name\\",TOP\\nB,JG"));const csvDraft=getDraftSettings();restoreSettings(parseSettingsJSON(buildSettingsJSON()))');
  assert.deepEqual(json('getDraftSettings()'),json('csvDraft'));
  assert.deepEqual(json('getInputs().participants'),['Comma, Name','B']);
  run('reset()');
});

}

async function checkAsync(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
}

function seedRandom(seed) {
  run(`globalThis.testSeed=${seed};Math.random=()=>{testSeed=(1664525*testSeed+1013904223)>>>0;return testSeed/4294967296}`);
}

function assertConsistentRoles() {
  const plan = json('lastPlan');
  const roles = json('lastRoleAssignments');
  assert.equal(roles.length,plan.length);
  plan.forEach((group,index)=>{
    assert.deepEqual(roles[index].map(entry=>entry.member).sort(),[...group].sort());
    assert.equal(new Set(roles[index].map(entry=>entry.role)).size,group.length);
    assert.ok(roles[index].every(entry=>entry.role));
  });
}

(async()=>{
  await checkAsync('78 seeded legacy results, including five-roll selection, are unchanged',async()=>{
    const baseline=JSON.parse(fs.readFileSync(`${root}/tests/legacy-results.json`,'utf8'));
    for(const fixture of baseline.fixtures){
      run(`reset();applyDraftSettings(${JSON.stringify(fixture.settings)})`);
      seedRandom(fixture.seed);
      assert.equal(run('getInputs().errors.length'),0);
      const result=await run('buildRolledPlan(getInputs())');
      assert.deepEqual(JSON.parse(JSON.stringify(result.plan)),fixture.plan,`${fixture.name}/${fixture.seed}`);
      assert.equal(result.score,fixture.score);
      if(fixture.selectedRoll!==undefined) assert.equal(result.selectedRoll,fixture.selectedRoll);
    }
  });
  await checkAsync('generation, group names, copying, locks, moves and undo preserve ordinary behavior',async()=>{
    run('restoreSettings({participants:"A,B,C,D",groupCount:"2",groupNames:"Alpha\\nBeta",rollCount:"3"})');
    await run('generate()');
    assert.equal(run('isGenerating'),false);
    assert.equal(nodes.get('#resultState').textContent,'완료');
    assert.equal(nodes.get('#groupsGrid').children[0].children[0].children[0].textContent,'Alpha');
    assert.equal(run('rolesInput.disabled'),true);
    assert.ok(nodes.get('#groupsGrid').children.every(card=>card.children[1].children.every(item=>item.children[1].children.every(control=>!control.disabled))));
    const before=json('lastPlan');
    const member=before[0][0];
    run(`toggleMemberLock(${JSON.stringify(member)},0)`);
    assert.equal(run(`lockedAssignments.get(${JSON.stringify(member)})`),0);
    await run('generate()');
    assert.ok(json('lastPlan[0]').includes(member));
    const beforeMove=json('lastPlan');
    run(`moveMember(${JSON.stringify(member)},0,1)`);
    assert.deepEqual(json('lastPlan.map(group=>group.length)'),[1,3]);
    run('undoLastEdit()');
    assert.deepEqual(json('lastPlan'),beforeMove);
    await run('copyResult()');
    assert.match(context.copiedText,/Alpha/);
    for(const mode of ['grouped','names','numbered','chat','compact','audit']) assert.ok(run(`formatCopyResult(lastPlan,getGroupNames(2),lastAudit,${JSON.stringify(mode)})`).includes(member));
    run('clearLockedAssignments()');
    assert.equal(run('lockedAssignments.size'),0);
  });
  await checkAsync('attribute balance and combined assignment constraints work',async()=>{
    run('restoreSettings({participants:"A,B,C,D,E,F,G,H",groupCount:"2",attributes:"A=X\\nB=X\\nC=X\\nD=X\\nE=Y\\nF=Y\\nG=Y\\nH=Y"})');
    await run('generate()');
    assert.equal(run('getAttributeBalanceScore(lastPlan,getInputs().attributeRules)'),0);
    run('restoreSettings({participants:"A,B,C,D,E,F,G,H,I,J",groupCount:"2",groupCapacities:"5,5",together:"A-B",separate:"A-C",fixed:"A=1",rollCount:"3",twoStage:true,roles:"TOP,JG,MID,ADC,SUP"})');
    await run('generate()');
    assert.ok(run('lastPlan[0].includes("A") && lastPlan[0].includes("B") && lastPlan[1].includes("C")'));
    assertConsistentRoles();
    assert.equal(run('lastAudit.length'),1);
    assert.doesNotMatch(JSON.stringify(json('lastAudit')),/분리|함께|고정|속성|TOP|JG/);
    assert.equal(run('rolesInput.disabled'),false);
  });
  await checkAsync('nested moves exchange members, preserve role slots, and undo restores both',async()=>{
    run('restoreSettings({participants:"A,B,C,D,E,F",groupCount:"2",twoStage:true,roles:"1,2,3"})');
    await run('generate()');
    const plan=json('lastPlan');
    const roles=json('lastRoleAssignments');
    const member=plan[0][0];
    const other=plan[1][0];
    run(`moveMember(${JSON.stringify(member)},0,1)`);
    assert.deepEqual(json('lastPlan.map(group=>group.length)'),[3,3]);
    assertConsistentRoles();
    assert.ok(json('lastPlan[0]').includes(other));
    assert.ok(json('lastPlan[1]').includes(member));
    assert.equal(run(`lastRoleAssignments[1].find(entry=>entry.member===${JSON.stringify(member)}).role`),roles[1].find(entry=>entry.member===other).role);
    run('undoLastEdit()');
    assert.deepEqual(json('lastPlan'),plan);
    assert.deepEqual(json('lastRoleAssignments'),roles);
    run('lastPlan[1].forEach(member=>lockedAssignments.set(member,1))');
    run(`moveMember(${JSON.stringify(member)},0,1)`);
    assert.deepEqual(json('lastPlan'),plan);
    assert.doesNotMatch(nodes.get('#statusMessage').textContent,/고정/);
  });
  await checkAsync('explicit unequal capacities remain valid through manual moves',async()=>{
    run('restoreSettings({participants:"A,B,C,D,E,F,G,H,I,J",groupCount:"2",groupCapacities:"4,6"})');
    await run('generate()');
    const before=json('lastPlan');
    run(`moveMember(${JSON.stringify(before[0][0])},0,1)`);
    assert.deepEqual(json('lastPlan.map(group=>group.length)'),[4,6]);
    run('undoLastEdit()');
    assert.deepEqual(json('lastPlan'),before);
  });
  await checkAsync('invalid rules and role counts expose details only inside rules',async()=>{
    run('restoreSettings({participants:"A,B,C,D",groupCount:"2",together:"A-B",separate:"A-B"})');
    await run('generate()');
    assert.equal(run('lastPlan'),null);
    assert.equal(run('rulesPanel.open'),false);
    assert.ok(nodes.get('#ruleFeedback').children.length);
    const publicText=JSON.stringify(json('lastAudit'))+nodes.get('#statusMessage').textContent;
    assert.doesNotMatch(publicText,/A|B|함께|분리|충돌/);
    run('restoreSettings({participants:"A,B,C,D,E,F,G,H,I,J",groupCount:"2",twoStage:true,roles:"1,2,3,4"})');
    await run('generate()');
    assert.equal(run('lastPlan'),null);
    assert.equal(run('rolesInput.disabled'),false);
    assert.equal(run('exportCSVButton.disabled'),true);
    assert.doesNotMatch(nodes.get('#statusMessage').textContent,/역할|2단계/);
    for(const count of ['NaN','Infinity','2.5','1000000000','-1']){
      run(`groupCountInput.value=${JSON.stringify(count)}`);
      assert.ok(run('getInputs().errors.length'));
      assert.deepEqual(json('getGroupNames(Number(groupCountInput.value))'),[]);
    }
  });
  await checkAsync('local saved settings retain all new fields and old defaults',async()=>{
    run('restoreSettings({participants:"A,B,C,D,E,F",groupCount:"2",groupCapacities:"3,3",twoStage:true,roles:"리더,개발,디자인"});savedSettingsNameInput.value="백업";saveCurrentSettings();const savedDraft=getDraftSettings();loadSavedSettings();loadSavedSetting(savedSettings[0])');
    assert.deepEqual(json('getDraftSettings()'),json('savedDraft'));
    assert.equal(run('lastRoleAssignments'),null);
    assert.equal(run('lastCapacities'),null);
    await run('generate()');
    assertConsistentRoles();
    run('loadSavedSetting({id:"legacy",settings:{participants:"A,B,C,D",groupCount:"2",rollCount:"1"}})');
    assert.equal(run('rolesInput.disabled'),true);
    assert.equal(run('lastRoleAssignments'),null);
    assert.equal(run('lastCapacities'),null);
    await run('generate()');
    assert.equal(run('lastRoleAssignments'),null);
    assert.equal(run('lastCapacities'),null);
  });
  await checkAsync('CSV/JSON file handlers, downloads and invalid imports are transactional',async()=>{
    await run('importParticipantCSV({target:{files:[{text:async()=>"name,role\\nA,TOP\\nB,JG\\nC,MID\\nD,ADC"}],value:"csv"}})');
    assert.deepEqual(json('getInputs().participants'),['A','B','C','D']);
    run('groupCountInput.value="2"');
    await run('generate()');
    const downloads=[];
    const originalDownload=run('downloadText');
    context.downloadCapture=(...args)=>downloads.push(args);
    run('downloadText=(...args)=>downloadCapture(...args);exportResultCSV();exportSettingsJSON()');
    assert.equal(downloads[0][0],'TeamBuilder-result.csv');
    assert.equal(downloads[1][0],'TeamBuilder-settings.json');
    assert.match(downloads[0][1],/^\uFEFFgroup,name/);
    context.importText=downloads[1][1];
    await run('importSettingsJSON({target:{files:[{text:async()=>importText}],value:"json"}})');
    const before=json('getDraftSettings()');
    await run('importSettingsJSON({target:{files:[{text:async()=>"bad json"}],value:"json"}})');
    assert.deepEqual(json('getDraftSettings()'),before);
    await run('importParticipantCSV({target:{files:[{text:async()=>"wrong\\nA"}],value:"csv"}})');
    assert.deepEqual(json('getDraftSettings()'),before);
    context.originalDownload=originalDownload;
    run('downloadText=originalDownload');
  });
  check('responsive layout declarations and collapsed-panel structure',()=>{
    assert.match(css,/\.input-panel\s*\{\s*overflow-y:\s*auto;/);
    assert.match(css,/@media \(max-width: 780px\)/);
    assert.match(css,/@media \(max-width: 520px\)/);
    const panel=html.slice(html.indexOf('<details'),html.indexOf('</details>'));
    for(const id of ['togetherInput','separateInput','fixedInput','attributesInput','twoStageInput','rolesInput','ruleFeedback']) assert.match(panel,new RegExp(`id="${id}"`));
    assert.doesNotMatch(panel.slice(0,panel.indexOf('</summary>')),/count|active|使用|사용/);
    assert.doesNotMatch(html,/id="(?:ruleCount|summaryRules)"/);
  });
  console.log('All regression checks passed. DOM behavior is tested with a Node harness; browser rendering requires a separate visual check.');
})().catch(error=>{console.error(error);process.exitCode=1});
