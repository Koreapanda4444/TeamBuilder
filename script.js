const participantsInput = document.querySelector("#participantsInput");
const groupCountInput = document.querySelector("#groupCountInput");
const groupNamesInput = document.querySelector("#groupNamesInput");
const togetherInput = document.querySelector("#togetherInput");
const separateInput = document.querySelector("#separateInput");
const fixedInput = document.querySelector("#fixedInput");
const attributesInput = document.querySelector("#attributesInput");
const generateButton = document.querySelector("#generateButton");
const shuffleButton = document.querySelector("#shuffleButton");
const resetButton = document.querySelector("#resetButton");
const copyButton = document.querySelector("#copyButton");
const statusMessage = document.querySelector("#statusMessage");
const groupsGrid = document.querySelector("#groupsGrid");
const emptyState = document.querySelector("#emptyState");
const auditList = document.querySelector("#auditList");
const participantCount = document.querySelector("#participantCount");
const participantPreview = document.querySelector("#participantPreview");
const ruleCount = document.querySelector("#ruleCount");
const resultState = document.querySelector("#resultState");
const summaryParticipants = document.querySelector("#summaryParticipants");
const summaryGroups = document.querySelector("#summaryGroups");
const summaryRules = document.querySelector("#summaryRules");
const savedSettingsCount = document.querySelector("#savedSettingsCount");
const savedSettingsList = document.querySelector("#savedSettingsList");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const savedSettingsNameInput = document.querySelector("#savedSettingsNameInput");

let lastPlan = null;
let savedSettings = [];
let lockedAssignments = new Map();
const DEFAULT_ATTEMPTS = 1800;
const SAVED_SETTINGS_STORAGE_KEY = "teambuilder.savedSettings.v1";

function splitLines(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = item.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }

  return copy;
}

function setStatus(text, type = "default") {
  statusMessage.textContent = text;
  statusMessage.classList.toggle("is-error", type === "error");
  statusMessage.classList.toggle("is-success", type === "success");
}

function setResultState(text, type = "default") {
  resultState.textContent = text;
  resultState.classList.toggle("is-ready", type === "ready");
  resultState.classList.toggle("is-error", type === "error");
}

function getStorage() {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

function getDraftSettings() {
  return {
    participants: participantsInput.value,
    groupCount: groupCountInput.value,
    groupNames: groupNamesInput.value,
    together: togetherInput.value,
    separate: separateInput.value,
    fixed: fixedInput.value,
    attributes: attributesInput.value,
  };
}

function applyDraftSettings(settings) {
  participantsInput.value = settings?.participants || "";
  groupCountInput.value = settings?.groupCount || "3";
  groupNamesInput.value = settings?.groupNames || "";
  togetherInput.value = settings?.together || "";
  separateInput.value = settings?.separate || "";
  fixedInput.value = settings?.fixed || "";
  attributesInput.value = settings?.attributes || "";
}

function persistSavedSettings() {
  const storage = getStorage();

  if (!storage) {
    setStatus("브라우저 저장소를 사용할 수 없습니다.", "error");
    return;
  }

  try {
    storage.setItem(SAVED_SETTINGS_STORAGE_KEY, JSON.stringify(savedSettings));
  } catch {
    setStatus("저장값을 저장하지 못했습니다.", "error");
  }
}

function loadSavedSettings() {
  const storage = getStorage();

  if (!storage) {
    savedSettings = [];
    return;
  }

  try {
    const raw = storage.getItem(SAVED_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    savedSettings = Array.isArray(parsed) ? parsed : [];
  } catch {
    savedSettings = [];
  }
}

function parseRuleLine(line) {
  return line
    .split(/\s*(?:-|,|\/|>|→|↔|와|과)\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRules(value, names, kind) {
  const known = new Set(names);
  const rules = [];
  const errors = [];

  splitLines(value).forEach((line, lineIndex) => {
    const members = uniqueItems(parseRuleLine(line));

    if (members.length < 2) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄은 이름을 2개 이상 입력해야 합니다.`);
      return;
    }

    const missing = members.filter((member) => !known.has(member));
    if (missing.length) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${missing.join(", ")}`);
      return;
    }

    rules.push({ members, raw: line });
  });

  return { rules, errors };
}

function parseFixedRules(value, names, groupCount) {
  const known = new Set(names);
  const rules = [];
  const errors = [];

  splitLines(value).forEach((line, lineIndex) => {
    const match = line.match(/^(.+?)\s*(?:=|:|->|>|,|\s)\s*(\d+)\s*(?:그룹)?$/u);

    if (!match) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄은 이름과 그룹 번호를 입력해야 합니다.`);
      return;
    }

    const member = match[1].trim();
    const groupNumber = Number(match[2]);

    if (!known.has(member)) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${member}`);
      return;
    }

    if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > groupCount) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄의 그룹 번호가 범위를 벗어났습니다.`);
      return;
    }

    rules.push({ member, groupIndex: groupNumber - 1, raw: line });
  });

  return { rules, errors };
}

function parseAttributeRules(value, names) {
  const known = new Set(names);
  const rules = [];
  const errors = [];

  splitLines(value).forEach((line, lineIndex) => {
    const match = line.match(/^(.+?)\s*(?:=|:|,|\s)\s*(.+)$/u);

    if (!match) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄은 이름과 값을 입력해야 합니다.`);
      return;
    }

    const member = match[1].trim();
    const value = match[2].trim();

    if (!known.has(member)) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${member}`);
      return;
    }

    if (!value) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄의 값이 비어 있습니다.`);
      return;
    }

    rules.push({ member, value, raw: line });
  });

  return { rules, errors };
}

function getGroupNames(groupCount) {
  const names = splitLines(groupNamesInput.value);
  const count = Number.isInteger(groupCount) && groupCount > 0 ? groupCount : 0;

  return Array.from({ length: count }, (_, index) => names[index] || `${index + 1}그룹`);
}

function getInputs() {
  const participants = uniqueItems(splitLines(participantsInput.value));
  const duplicateCount = splitLines(participantsInput.value).length - participants.length;
  const groupCount = Number(groupCountInput.value);
  const attempts = DEFAULT_ATTEMPTS;
  const errors = [];

  if (participants.length < 2) {
    errors.push("참가자는 최소 2명 이상이어야 합니다.");
  }

  if (!Number.isInteger(groupCount) || groupCount < 2) {
    errors.push("그룹 수는 2 이상이어야 합니다.");
  }

  if (groupCount > participants.length) {
    errors.push("그룹 수는 참가자 수보다 많을 수 없습니다.");
  }

  if (!Number.isInteger(attempts) || attempts < 100) {
    errors.push("시도 횟수는 100 이상이어야 합니다.");
  }

  const together = parseRules(togetherInput.value, participants, "함께 배정");
  const separate = parseRules(separateInput.value, participants, "분리 배정");
  const fixed = parseFixedRules(fixedInput.value, participants, groupCount);
  const attributes = parseAttributeRules(attributesInput.value, participants);

  errors.push(...together.errors, ...separate.errors, ...fixed.errors, ...attributes.errors);

  return {
    participants,
    groupCount,
    groupNames: getGroupNames(groupCount),
    attempts,
    togetherRules: together.rules,
    separateRules: separate.rules,
    fixedRules: fixed.rules,
    attributeRules: attributes.rules,
    duplicateCount,
    errors,
  };
}

class DisjointSet {
  constructor(items) {
    this.parent = new Map(items.map((item) => [item, item]));
  }

  find(item) {
    const parent = this.parent.get(item);
    if (parent === item) {
      return item;
    }

    const root = this.find(parent);
    this.parent.set(item, root);
    return root;
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);

    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function createComponents(participants, togetherRules) {
  const set = new DisjointSet(participants);

  for (const rule of togetherRules) {
    const [first, ...rest] = rule.members;
    for (const member of rest) {
      set.union(first, member);
    }
  }

  const groups = new Map();

  for (const participant of participants) {
    const root = set.find(participant);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(participant);
  }

  return [...groups.values()].map((members, index) => ({
    id: index,
    members,
    size: members.length,
  }));
}

function createSeparatedComponentPairs(components, separateRules) {
  const componentByName = new Map();
  const errors = [];
  const pairs = [];

  for (const component of components) {
    for (const member of component.members) {
      componentByName.set(member, component.id);
    }
  }

  for (const rule of separateRules) {
    for (let left = 0; left < rule.members.length; left += 1) {
      for (let right = left + 1; right < rule.members.length; right += 1) {
        const leftId = componentByName.get(rule.members[left]);
        const rightId = componentByName.get(rule.members[right]);

        if (leftId === rightId) {
          errors.push(`${rule.members[left]}와 ${rule.members[right]}는 함께 배정과 분리 배정이 충돌합니다.`);
          continue;
        }

        pairs.push([leftId, rightId]);
      }
    }
  }

  return { pairs, errors };
}

function createFixedComponentTargets(components, fixedRules) {
  const componentByName = new Map();
  const targets = new Map();
  const errors = [];

  for (const component of components) {
    for (const member of component.members) {
      componentByName.set(member, component.id);
    }
  }

  for (const rule of fixedRules) {
    const componentId = componentByName.get(rule.member);
    const existingTarget = targets.get(componentId);

    if (existingTarget !== undefined && existingTarget !== rule.groupIndex) {
      const component = components.find((item) => item.id === componentId);
      errors.push(`${component.members.join(", ")}의 고정 배정이 서로 충돌합니다.`);
      continue;
    }

    targets.set(componentId, rule.groupIndex);
  }

  return { targets, errors };
}

function getTargetSizes(total, groupCount) {
  const base = Math.floor(total / groupCount);
  const extra = total % groupCount;
  const sizes = Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0));
  return shuffle(sizes);
}

function hasSeparationConflict(group, component, separatedPairs) {
  const groupComponentIds = new Set(group.components.map((item) => item.id));

  return separatedPairs.some(([left, right]) => {
    if (component.id === left && groupComponentIds.has(right)) {
      return true;
    }

    if (component.id === right && groupComponentIds.has(left)) {
      return true;
    }

    return false;
  });
}

function assignComponents(components, groupCount, targetSizes, separatedPairs, fixedTargets) {
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: index,
    targetSize: targetSizes[index],
    members: [],
    components: [],
  }));

  const orderedComponents = shuffle(components).sort((left, right) => {
    const leftFixed = fixedTargets.has(left.id) ? 1 : 0;
    const rightFixed = fixedTargets.has(right.id) ? 1 : 0;
    return rightFixed - leftFixed || right.size - left.size;
  });

  function place(index) {
    if (index === orderedComponents.length) {
      return groups.every((group) => group.members.length === group.targetSize);
    }

    const component = orderedComponents[index];
    const fixedTarget = fixedTargets.get(component.id);
    const candidates = shuffle(groups).filter((group) => {
      if (fixedTarget !== undefined && group.id !== fixedTarget) {
        return false;
      }

      const fits = group.members.length + component.size <= group.targetSize;
      return fits && !hasSeparationConflict(group, component, separatedPairs);
    });

    for (const group of candidates) {
      group.components.push(component);
      group.members.push(...shuffle(component.members));

      if (place(index + 1)) {
        return true;
      }

      group.components.pop();
      group.members.splice(group.members.length - component.size, component.size);
    }

    return false;
  }

  return place(0) ? groups.map((group) => shuffle(group.members)) : null;
}

function getAttributeBalanceScore(plan, attributeRules = []) {
  if (!attributeRules.length) {
    return 0;
  }

  const groupIndexByName = new Map();
  const valueCounts = new Map();

  plan.forEach((group, groupIndex) => {
    group.forEach((member) => groupIndexByName.set(member, groupIndex));
  });

  attributeRules.forEach((rule) => {
    const groupIndex = groupIndexByName.get(rule.member);

    if (groupIndex === undefined) {
      return;
    }

    if (!valueCounts.has(rule.value)) {
      valueCounts.set(rule.value, Array.from({ length: plan.length }, () => 0));
    }

    valueCounts.get(rule.value)[groupIndex] += 1;
  });

  let score = 0;

  valueCounts.forEach((counts) => {
    score += Math.max(...counts) - Math.min(...counts);
  });

  return score;
}

function validatePlan(plan, togetherRules, separateRules, fixedRules = [], attributeRules = []) {
  const groupIndexByName = new Map();
  const audit = [];

  plan.forEach((group, groupIndex) => {
    group.forEach((member) => groupIndexByName.set(member, groupIndex));
  });

  for (const rule of togetherRules) {
    const [first, ...rest] = rule.members;
    const firstGroup = groupIndexByName.get(first);
    const passed = rest.every((member) => groupIndexByName.get(member) === firstGroup);

    audit.push({
      type: passed ? "ok" : "error",
      title: passed ? "함께 배정 만족" : "함께 배정 실패",
      detail: rule.members.join(", "),
    });
  }

  for (const rule of separateRules) {
    let passed = true;

    for (let left = 0; left < rule.members.length; left += 1) {
      for (let right = left + 1; right < rule.members.length; right += 1) {
        if (groupIndexByName.get(rule.members[left]) === groupIndexByName.get(rule.members[right])) {
          passed = false;
        }
      }
    }

    audit.push({
      type: passed ? "ok" : "error",
      title: passed ? "분리 배정 만족" : "분리 배정 실패",
      detail: rule.members.join(", "),
    });
  }

  for (const rule of fixedRules) {
    const actualGroup = groupIndexByName.get(rule.member);
    const passed = actualGroup === rule.groupIndex;

    audit.push({
      type: passed ? "ok" : "error",
      title: passed ? "고정 배정 만족" : "고정 배정 실패",
      detail: `${rule.member} → ${rule.groupIndex + 1}그룹`,
    });
  }

  if (attributeRules.length) {
    const score = getAttributeBalanceScore(plan, attributeRules);

    audit.push({
      type: score === 0 ? "ok" : "warning",
      title: score === 0 ? "속성 균형 만족" : "속성 균형 반영",
      detail: `${attributeRules.length}명 기준`,
    });
  }

  return audit;
}

function buildPlan(input) {
  const components = createComponents(input.participants, input.togetherRules);
  const maxTargetSize = Math.ceil(input.participants.length / input.groupCount);
  const componentTooLarge = components.find((component) => component.size > maxTargetSize);

  if (componentTooLarge) {
    return {
      error: `함께 묶인 인원이 너무 많습니다: ${componentTooLarge.members.join(", ")}`,
      audit: [],
    };
  }

  const separated = createSeparatedComponentPairs(components, input.separateRules);
  const fixed = createFixedComponentTargets(components, input.fixedRules);

  if (separated.errors.length) {
    return {
      error: separated.errors[0],
      audit: separated.errors.map((detail) => ({
        type: "error",
        title: "규칙 충돌",
        detail,
      })),
    };
  }

  if (fixed.errors.length) {
    return {
      error: fixed.errors[0],
      audit: fixed.errors.map((detail) => ({
        type: "error",
        title: "규칙 충돌",
        detail,
      })),
    };
  }

  let bestPlan = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    const targetSizes = getTargetSizes(input.participants.length, input.groupCount);
    const plan = assignComponents(components, input.groupCount, targetSizes, separated.pairs, fixed.targets);

    if (plan) {
      const score = getAttributeBalanceScore(plan, input.attributeRules);

      if (score < bestScore) {
        bestPlan = plan;
        bestScore = score;
      }

      if (score === 0) {
        break;
      }
    }
  }

  if (bestPlan) {
    return {
      plan: bestPlan,
      audit: validatePlan(bestPlan, input.togetherRules, input.separateRules, input.fixedRules, input.attributeRules),
    };
  }

  return {
    error: "입력한 내용을 만족하는 배정을 찾지 못했습니다.",
    audit: [
      {
        type: "warning",
        title: "생성 실패",
        detail: "그룹 수를 늘리거나 분리 배정을 줄여 다시 시도하세요.",
      },
    ],
  };
}

function renderSummary(participantCount, groupCount, ruleCount) {
  summaryParticipants.textContent = String(participantCount);
  summaryGroups.textContent = String(groupCount);
  summaryRules.textContent = String(ruleCount);
}

function renderDraftStats() {
  const participants = uniqueItems(splitLines(participantsInput.value));
  const rules =
    splitLines(togetherInput.value).length +
    splitLines(separateInput.value).length +
    splitLines(fixedInput.value).length +
    splitLines(attributesInput.value).length;

  participantCount.textContent = `${participants.length}명`;
  ruleCount.textContent = `${rules}개`;
  renderSummary(participants.length, Number(groupCountInput.value) || 0, rules);

  participantPreview.innerHTML = "";
  participants.slice(0, 18).forEach((participant) => {
    const chip = document.createElement("span");
    chip.textContent = participant;
    participantPreview.append(chip);
  });

  if (participants.length > 18) {
    const chip = document.createElement("span");
    chip.textContent = `+${participants.length - 18}`;
    participantPreview.append(chip);
  }
}

function toggleMemberLock(member, groupIndex) {
  if (lockedAssignments.get(member) === groupIndex) {
    lockedAssignments.delete(member);
  } else {
    lockedAssignments.set(member, groupIndex);
  }

  renderGroups(lastPlan);
}

function renderGroups(plan) {
  groupsGrid.innerHTML = "";
  emptyState.classList.toggle("is-hidden", Boolean(plan));

  if (!plan) {
    return;
  }

  const groupNames = getGroupNames(plan.length);

  plan.forEach((members, index) => {
    const card = document.createElement("article");
    card.className = "group-card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    const count = document.createElement("span");
    const list = document.createElement("ul");

    title.textContent = groupNames[index];
    count.textContent = `${members.length}명`;
    list.className = "member-list";

    members.forEach((member) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const lockButton = document.createElement("button");
      const locked = lockedAssignments.get(member) === index;

      name.textContent = member;
      lockButton.className = "lock-button";
      lockButton.classList.toggle("is-locked", locked);
      lockButton.type = "button";
      lockButton.textContent = locked ? "해제" : "고정";
      lockButton.addEventListener("click", () => toggleMemberLock(member, index));

      item.append(name, lockButton);
      list.append(item);
    });

    header.append(title, count);
    card.append(header, list);
    groupsGrid.append(card);
  });
}

function getSettingsMeta(settings) {
  const participantCount = splitLines(settings.participants).length;
  const ruleCount =
    splitLines(settings.together).length +
    splitLines(settings.separate).length +
    splitLines(settings.fixed).length +
    splitLines(settings.attributes || "").length;
  const groupCount = Number(settings.groupCount) || 0;

  return { participantCount, ruleCount, groupCount };
}

function renderSavedSettings() {
  savedSettingsCount.textContent = String(savedSettings.length);
  savedSettingsList.innerHTML = "";

  if (!savedSettings.length) {
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "저장값 없음";
    savedSettingsList.append(empty);
    return;
  }

  savedSettings.forEach((item, index) => {
    const row = document.createElement("div");
    const loadButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    const meta = getSettingsMeta(item.settings);

    row.className = "saved-item";
    loadButton.className = "saved-load";
    loadButton.type = "button";
    deleteButton.className = "saved-delete";
    deleteButton.type = "button";

    title.textContent = item.name || `${index + 1}. ${meta.groupCount}그룹`;
    detail.textContent = `${meta.participantCount}명 / 규칙 ${meta.ruleCount}개`;
    deleteButton.textContent = "삭제";

    loadButton.append(title, detail);
    loadButton.addEventListener("click", () => loadSavedSetting(item));
    deleteButton.addEventListener("click", () => deleteSavedSetting(item.id));
    row.append(loadButton, deleteButton);
    savedSettingsList.append(row);
  });
}

function saveCurrentSettings() {
  const settings = getDraftSettings();
  const meta = getSettingsMeta(settings);
  const name = savedSettingsNameInput.value.trim() || `저장값 ${savedSettings.length + 1}`;

  if (meta.participantCount === 0 && meta.ruleCount === 0) {
    setStatus("저장할 입력값이 없습니다.", "error");
    return;
  }

  savedSettings.unshift({
    id: Date.now() + Math.random(),
    name,
    settings,
  });

  savedSettings = savedSettings.slice(0, 12);
  savedSettingsNameInput.value = "";
  persistSavedSettings();
  renderSavedSettings();
  setStatus("현재 입력값을 저장했습니다.", "success");
}

function loadSavedSetting(item) {
  applyDraftSettings(item.settings);
  lastPlan = null;
  lockedAssignments = new Map();
  renderDraftStats();
  renderGroups(null);
  renderAudit([]);
  setResultState("대기");
  setStatus("저장값을 불러왔습니다.", "success");
}

function deleteSavedSetting(id) {
  savedSettings = savedSettings.filter((item) => item.id !== id);
  persistSavedSettings();
  renderSavedSettings();
  setStatus("저장값을 삭제했습니다.", "success");
}

function applyLockedRules(input) {
  const participantSet = new Set(input.participants);
  const lockedRules = [];
  const nextLocks = new Map();

  lockedAssignments.forEach((groupIndex, member) => {
    if (participantSet.has(member) && groupIndex >= 0 && groupIndex < input.groupCount) {
      lockedRules.push({ member, groupIndex, raw: `${member}=${groupIndex + 1}`, locked: true });
      nextLocks.set(member, groupIndex);
    }
  });

  lockedAssignments = nextLocks;
  input.fixedRules = [...input.fixedRules, ...lockedRules];
}

function renderAudit(items, input = null) {
  auditList.innerHTML = "";

  if (input?.duplicateCount) {
    items = [
      {
        type: "warning",
        title: "중복 이름 제거",
        detail: `${input.duplicateCount}개의 중복 참가자를 한 번만 반영했습니다.`,
      },
      ...items,
    ];
  }

  if (!items.length) {
    items = [
      {
        type: "ok",
        title: "대기 중",
        detail: "검토 없음",
      },
    ];
  }

  for (const item of items) {
    const element = document.createElement("div");
    element.className = `audit-item is-${item.type}`;

    const title = document.createElement("strong");
    const detail = document.createElement("span");

    title.textContent = item.title;
    detail.textContent = item.detail;
    element.append(title, detail);
    auditList.append(element);
  }
}

function generate({ preserveLocks = false } = {}) {
  const input = getInputs();
  if (!preserveLocks) {
    lockedAssignments = new Map();
  } else {
    applyLockedRules(input);
  }

  const ruleCount = input.togetherRules.length + input.separateRules.length + input.fixedRules.length + input.attributeRules.length;
  renderDraftStats();
  renderSummary(input.participants.length, Number.isFinite(input.groupCount) ? input.groupCount : 0, ruleCount);

  if (input.errors.length) {
    lastPlan = null;
    renderGroups(null);
    renderAudit(
      input.errors.map((detail) => ({
        type: "error",
        title: "입력 확인",
        detail,
      })),
      input,
    );
    setResultState("오류", "error");
    setStatus(input.errors[0], "error");
    return;
  }

  const result = buildPlan(input);

  if (result.error) {
    lastPlan = null;
    renderGroups(null);
    renderAudit(result.audit, input);
    setResultState("실패", "error");
    setStatus(result.error, "error");
    return;
  }

  lastPlan = result.plan;
  renderGroups(result.plan);
  renderAudit(result.audit, input);
  setResultState("완료", "ready");
  setStatus(`${input.participants.length}명을 ${input.groupCount}개 그룹으로 배정했습니다.`, "success");
}

async function copyResult() {
  if (!lastPlan) {
    setStatus("복사할 결과가 없습니다.", "error");
    return;
  }

  const groupNames = getGroupNames(lastPlan.length);
  const text = lastPlan
    .map((group, index) => `${groupNames[index]}\n${group.map((member) => `- ${member}`).join("\n")}`)
    .join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("결과를 클립보드에 복사했습니다.", "success");
  } catch {
    setStatus("브라우저에서 클립보드 접근을 허용하지 않았습니다.", "error");
  }
}

function reset() {
  applyDraftSettings(null);
  lastPlan = null;
  lockedAssignments = new Map();
  savedSettingsNameInput.value = "";
  renderDraftStats();
  renderGroups(null);
  renderAudit([]);
  renderSavedSettings();
  setResultState("대기");
  setStatus("");
}

function boot() {
  loadSavedSettings();
  reset();
}

generateButton.addEventListener("click", () => generate());
shuffleButton.addEventListener("click", () => generate({ preserveLocks: true }));
resetButton.addEventListener("click", () => reset());
copyButton.addEventListener("click", copyResult);
saveSettingsButton.addEventListener("click", saveCurrentSettings);
[participantsInput, groupCountInput, groupNamesInput, togetherInput, separateInput, fixedInput, attributesInput].forEach((input) => {
  input.addEventListener("input", () => {
    renderDraftStats();
    if (lastPlan) {
      if (input === groupNamesInput) {
        renderGroups(lastPlan);
      }
      setResultState("수정됨");
    }
  });
});

boot();
