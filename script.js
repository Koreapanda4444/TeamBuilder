const participantsInput = document.querySelector("#participantsInput");
const groupCountInput = document.querySelector("#groupCountInput");
const rollCountInput = document.querySelector("#rollCountInput");
const groupNamesInput = document.querySelector("#groupNamesInput");
const togetherInput = document.querySelector("#togetherInput");
const separateInput = document.querySelector("#separateInput");
const fixedInput = document.querySelector("#fixedInput");
const attributesInput = document.querySelector("#attributesInput");
const generateButton = document.querySelector("#generateButton");
const resetButton = document.querySelector("#resetButton");
const undoEditButton = document.querySelector("#undoEditButton");
const clearLocksButton = document.querySelector("#clearLocksButton");
const copyModeSelect = document.querySelector("#copyModeSelect");
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
const updateSettingsButton = document.querySelector("#updateSettingsButton");
const savedSettingsNameInput = document.querySelector("#savedSettingsNameInput");

let lastPlan = null;
let lastAudit = [];
let savedSettings = [];
let activeSavedSettingId = null;
let lockedAssignments = new Map();
let editHistory = [];
let isGenerating = false;
const DEFAULT_ATTEMPTS = 1800;
const DEFAULT_ROLL_COUNT = 1;
const MAX_ROLL_COUNT = 30;
const MAX_EDIT_HISTORY = 20;
const SAVED_SETTINGS_STORAGE_KEY = "teambuilder.savedSettings.v1";
const LIST_DELIMITER_PATTERN = /[\t,;，、|]+/u;
const WIDE_SPACE_PATTERN = /\s{2,}/u;
const RULE_DELIMITER_PATTERN = /\s*(?:<->|↔|->|=>|→|-|,|，|、|;|\/|>|와|과)\s*|\t+|\s{2,}/u;
const VALUE_SEPARATOR_PATTERN = /^\s*(?:=|＝|:|：|->|=>|→|>|,|，|、|\s)\s*(.+)$/u;
const FALLBACK_VALUE_PATTERN = /^(.+?)\s*(?:=|＝|:|：|->|=>|→|>|,|，|、|\s)\s*(.+)$/u;

function normalizeToken(value) {
  return value
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/u, "")
    .trim();
}

function splitLines(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .split("\n")
    .map(normalizeToken)
    .filter(Boolean);
}

function splitParticipants(value = "") {
  const participants = [];

  splitLines(value).forEach((line) => {
    line
      .split(LIST_DELIMITER_PATTERN)
      .flatMap((part) => part.split(WIDE_SPACE_PATTERN))
      .map(normalizeToken)
      .filter(Boolean)
      .forEach((participant) => participants.push(participant));
  });

  return participants;
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

function duplicateItems(items) {
  const seen = new Set();
  const duplicates = [];

  for (const item of items) {
    const key = item.toLocaleLowerCase();

    if (seen.has(key) && !duplicates.some((duplicate) => duplicate.toLocaleLowerCase() === key)) {
      duplicates.push(item);
      continue;
    }

    seen.add(key);
  }

  return duplicates;
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

function setGenerateBusy(active) {
  generateButton.disabled = active;
  resetButton.disabled = active;
  clearLocksButton.disabled = active;
  copyModeSelect.disabled = active;
  copyButton.disabled = active;
  saveSettingsButton.disabled = active;
  savedSettingsNameInput.disabled = active;
  getInputFields().forEach((field) => {
    field.disabled = active;
  });
  generateButton.textContent = active ? "생성 중" : "생성";
  renderSavedSettings();
  updateUndoButtonState();
}

function waitForResultPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 16);
      return;
    }

    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function getInputFields() {
  return [participantsInput, groupCountInput, rollCountInput, groupNamesInput, togetherInput, separateInput, fixedInput, attributesInput];
}

function clearFieldValidity() {
  getInputFields().forEach((field) => field.removeAttribute("aria-invalid"));
}

function markFieldInvalid(field) {
  field.setAttribute("aria-invalid", "true");
}

function markInvalidFields(errors) {
  clearFieldValidity();

  errors.map(String).forEach((error) => {
    if (error.includes("참가자") || error.includes("명단")) {
      markFieldInvalid(participantsInput);
    }

    if (error.includes("그룹 수")) {
      markFieldInvalid(groupCountInput);
    }

    if (error.includes("돌리기")) {
      markFieldInvalid(rollCountInput);
    }

    if (error.includes("그룹 이름")) {
      markFieldInvalid(groupNamesInput);
    }

    if (error.includes("함께")) {
      markFieldInvalid(togetherInput);
    }

    if (error.includes("분리")) {
      markFieldInvalid(separateInput);
    }

    if (error.includes("고정") || error.includes("그룹 번호")) {
      markFieldInvalid(fixedInput);
    }

    if (error.includes("속성")) {
      markFieldInvalid(attributesInput);
    }
  });
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
    rollCount: rollCountInput.value,
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
  rollCountInput.value = settings?.rollCount || String(DEFAULT_ROLL_COUNT);
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
  const members = line.split(RULE_DELIMITER_PATTERN).map(normalizeToken).filter(Boolean);

  if (members.length > 1) {
    return members;
  }

  return line.split(/\s+/u).map(normalizeToken).filter(Boolean);
}

function parseMemberValueLine(line, names) {
  const knownNames = [...names].sort((left, right) => right.length - left.length);

  for (const member of knownNames) {
    if (!line.startsWith(member)) {
      continue;
    }

    const match = line.slice(member.length).match(VALUE_SEPARATOR_PATTERN);
    if (match) {
      return { member, value: match[1].trim() };
    }
  }

  const fallback = line.match(FALLBACK_VALUE_PATTERN);

  if (!fallback) {
    return null;
  }

  return {
    member: normalizeToken(fallback[1]),
    value: fallback[2].trim(),
  };
}

function parseRules(value, names, kind) {
  const known = new Set(names);
  const rules = [];
  const errors = [];
  const seenRules = new Set();

  splitLines(value).forEach((line, lineIndex) => {
    const parsedMembers = parseRuleLine(line);
    const duplicateMembers = duplicateItems(parsedMembers);
    const members = uniqueItems(parsedMembers);

    if (duplicateMembers.length) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄에 같은 이름이 반복되어 있습니다: ${duplicateMembers.join(", ")}`);
      return;
    }

    if (members.length < 2) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄은 이름을 2개 이상 입력해야 합니다.`);
      return;
    }

    const missing = members.filter((member) => !known.has(member));
    if (missing.length) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${missing.join(", ")}`);
      return;
    }

    const ruleKey = members.map((member) => member.toLocaleLowerCase()).sort().join("\u0001");
    if (seenRules.has(ruleKey)) {
      errors.push(`${kind} ${lineIndex + 1}번째 줄은 앞의 규칙과 중복됩니다: ${members.join(", ")}`);
      return;
    }

    seenRules.add(ruleKey);
    rules.push({ members, raw: line });
  });

  return { rules, errors };
}

function getIssueDetail(issue) {
  return typeof issue === "string" ? issue : issue.detail;
}

function createAuditItemFromIssue(issue, fallbackTitle = "규칙 충돌") {
  if (typeof issue === "string") {
    return {
      type: "error",
      title: fallbackTitle,
      detail: issue,
    };
  }

  return {
    type: "error",
    title: issue.title || fallbackTitle,
    detail: issue.detail,
    hint: issue.hint,
  };
}

function parseFixedRules(value, names, groupCount) {
  const known = new Set(names);
  const rules = [];
  const errors = [];
  const fixedByMember = new Map();

  splitLines(value).forEach((line, lineIndex) => {
    const parsed = parseMemberValueLine(line, names);

    if (!parsed) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄은 이름과 그룹 번호를 입력해야 합니다.`);
      return;
    }

    const member = parsed.member;
    const groupNumber = Number(parsed.value.replace(/\s*(?:그룹|번)$/u, "").trim());

    if (!known.has(member)) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${member}`);
      return;
    }

    if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > groupCount) {
      errors.push(`고정 배정 ${lineIndex + 1}번째 줄의 그룹 번호가 범위를 벗어났습니다.`);
      return;
    }

    const groupIndex = groupNumber - 1;
    const existingGroupIndex = fixedByMember.get(member);

    if (existingGroupIndex !== undefined) {
      if (existingGroupIndex === groupIndex) {
        errors.push(`고정 배정 ${lineIndex + 1}번째 줄은 ${member}를 이미 ${groupNumber}그룹에 고정했습니다.`);
      } else {
        errors.push(`${member}가 ${existingGroupIndex + 1}그룹과 ${groupIndex + 1}그룹에 동시에 고정되어 있습니다.`);
      }
      return;
    }

    fixedByMember.set(member, groupIndex);
    rules.push({ member, groupIndex, raw: line });
  });

  return { rules, errors };
}

function parseAttributeRules(value, names) {
  const known = new Set(names);
  const rules = [];
  const errors = [];
  const attributeByMember = new Map();

  splitLines(value).forEach((line, lineIndex) => {
    const parsed = parseMemberValueLine(line, names);

    if (!parsed) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄은 이름과 값을 입력해야 합니다.`);
      return;
    }

    const member = parsed.member;
    const value = parsed.value;

    if (!known.has(member)) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄의 이름을 참가자에서 찾을 수 없습니다: ${member}`);
      return;
    }

    if (!value) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄의 값이 비어 있습니다.`);
      return;
    }

    if (attributeByMember.has(member)) {
      errors.push(`속성 균형 ${lineIndex + 1}번째 줄은 ${member}의 값이 이미 입력되어 있습니다.`);
      return;
    }

    attributeByMember.set(member, value);
    rules.push({ member, value, raw: line });
  });

  return { rules, errors };
}

function getGroupNames(groupCount) {
  const names = splitLines(groupNamesInput.value);
  const count = Number.isInteger(groupCount) && groupCount > 0 ? groupCount : 0;

  return Array.from({ length: count }, (_, index) => names[index] || `${index + 1}그룹`);
}

function validateGroupNames(groupCount) {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    return [];
  }

  const names = getGroupNames(groupCount);
  const duplicates = duplicateItems(names);

  return duplicates.length ? [`그룹 이름이 중복되어 있습니다: ${duplicates.join(", ")}`] : [];
}

function getInputs() {
  const parsedParticipants = splitParticipants(participantsInput.value);
  const participants = uniqueItems(parsedParticipants);
  const duplicateCount = parsedParticipants.length - participants.length;
  const groupCount = Number(groupCountInput.value);
  const rollCount = Number(rollCountInput.value || DEFAULT_ROLL_COUNT);
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

  if (!Number.isInteger(rollCount) || rollCount < 1 || rollCount > MAX_ROLL_COUNT) {
    errors.push(`돌리기는 1부터 ${MAX_ROLL_COUNT} 사이로 입력해야 합니다.`);
  }

  if (!Number.isInteger(attempts) || attempts < 100) {
    errors.push("시도 횟수는 100 이상이어야 합니다.");
  }

  const together = parseRules(togetherInput.value, participants, "함께 배정");
  const separate = parseRules(separateInput.value, participants, "분리 배정");
  const fixed = parseFixedRules(fixedInput.value, participants, groupCount);
  const attributes = parseAttributeRules(attributesInput.value, participants);
  const groupNameErrors = validateGroupNames(groupCount);

  errors.push(...groupNameErrors, ...together.errors, ...separate.errors, ...fixed.errors, ...attributes.errors);

  return {
    participants,
    groupCount,
    rollCount,
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
          errors.push({
            title: "함께/분리 충돌",
            detail: `${rule.members[left]}와 ${rule.members[right]}가 함께 배정과 분리 배정에 동시에 들어 있습니다.`,
            hint: "둘 중 하나의 규칙에서 이 조합을 지우세요.",
          });
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
      errors.push({
        title: "고정 배정 충돌",
        detail: `${component.members.join(", ")} 묶음이 ${existingTarget + 1}그룹과 ${rule.groupIndex + 1}그룹에 동시에 고정되어 있습니다.`,
        hint: "같이 묶인 멤버는 같은 그룹 번호로 고정하세요.",
      });
      continue;
    }

    targets.set(componentId, rule.groupIndex);
  }

  return { targets, errors };
}

function getComponentLookup(components) {
  const componentByName = new Map();

  for (const component of components) {
    for (const member of component.members) {
      componentByName.set(member, component);
    }
  }

  return componentByName;
}

function validatePreflight(input, components, fixedTargets, maxTargetSize) {
  const errors = [];
  const componentByName = getComponentLookup(components);

  for (const rule of input.separateRules) {
    const componentIds = uniqueItems(
      rule.members
        .map((member) => componentByName.get(member))
        .filter(Boolean)
        .map((component) => String(component.id)),
    );

    if (componentIds.length > input.groupCount) {
      errors.push(`${rule.members.join(", ")}는 ${input.groupCount}개 그룹에 모두 분리할 수 없습니다.`);
    }
  }

  const fixedSizeByGroup = Array.from({ length: input.groupCount }, () => 0);

  fixedTargets.forEach((groupIndex, componentId) => {
    const component = components.find((item) => item.id === componentId);

    if (component) {
      fixedSizeByGroup[groupIndex] += component.size;
    }
  });

  fixedSizeByGroup.forEach((size, groupIndex) => {
    if (size > maxTargetSize) {
      errors.push(`${groupIndex + 1}그룹에 고정된 인원이 너무 많습니다.`);
    }
  });

  if (!errors.length) {
    return null;
  }

  return {
    error: errors[0],
    audit: errors.map((detail) => ({
      type: "error",
      title: "사전 확인",
      detail,
    })),
  };
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
    const detail = `함께 묶인 인원이 너무 많습니다: ${componentTooLarge.members.join(", ")}`;

    return {
      error: detail,
      audit: [
        {
          type: "error",
          title: "함께 배정 확인",
          detail,
        },
      ],
    };
  }

  const separated = createSeparatedComponentPairs(components, input.separateRules);
  const fixed = createFixedComponentTargets(components, input.fixedRules);

  if (separated.errors.length) {
    return {
      error: getIssueDetail(separated.errors[0]),
      audit: separated.errors.map((issue) => createAuditItemFromIssue(issue)),
    };
  }

  if (fixed.errors.length) {
    return {
      error: getIssueDetail(fixed.errors[0]),
      audit: fixed.errors.map((issue) => createAuditItemFromIssue(issue)),
    };
  }

  const preflight = validatePreflight(input, components, fixed.targets, maxTargetSize);

  if (preflight) {
    return preflight;
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
      score: bestScore,
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

async function buildRolledPlan(input, onProgress = null) {
  const rollCount = input.rollCount || DEFAULT_ROLL_COUNT;

  if (rollCount <= 1) {
    return buildPlan(input);
  }

  let bestResult = null;
  let successCount = 0;
  let lastError = null;
  const attemptsPerRoll = Math.max(300, Math.floor(input.attempts / Math.min(rollCount, 4)));
  const rollInput = { ...input, attempts: attemptsPerRoll };

  if (onProgress) {
    onProgress({ current: 0, total: rollCount, successCount });
    await waitForResultPaint();
  }

  for (let rollIndex = 1; rollIndex <= rollCount; rollIndex += 1) {
    const result = buildPlan(rollInput);

    if (result.error) {
      lastError = result;
      if (onProgress) {
        onProgress({ current: rollIndex, total: rollCount, successCount, error: result.error });
        await waitForResultPaint();
      }
      continue;
    }

    successCount += 1;
    const score = Number.isFinite(result.score) ? result.score : getAttributeBalanceScore(result.plan, input.attributeRules);
    const currentResult = {
      ...result,
      score,
      selectedRoll: rollIndex,
    };
    const shouldReplace =
      !bestResult || score < bestResult.score || (score === bestResult.score && Math.random() < 0.5);

    if (shouldReplace) {
      bestResult = currentResult;
    }

    if (onProgress) {
      onProgress({ current: rollIndex, total: rollCount, successCount, result: currentResult, bestResult });
      await waitForResultPaint();
    }
  }

  if (bestResult) {
    const detail = `${rollCount}회 중 ${successCount}회 생성, ${bestResult.selectedRoll}번째 결과 반영`;
    const hint = bestResult.score === 0 ? "가장 균형이 맞는 결과를 선택했습니다." : "속성 차이가 가장 작은 결과를 선택했습니다.";

    return {
      ...bestResult,
      audit: [
        {
          type: "ok",
          title: "돌리기",
          detail,
          hint,
        },
        ...bestResult.audit,
      ],
    };
  }

  return lastError || buildPlan(input);
}

function renderSummary(participantCount, groupCount, ruleCount) {
  summaryParticipants.textContent = String(participantCount);
  summaryGroups.textContent = String(groupCount);
  summaryRules.textContent = String(ruleCount);
}

function renderDraftStats() {
  const participants = uniqueItems(splitParticipants(participantsInput.value));
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

function getRuleCountFromInput(input, extraRules = []) {
  return (
    input.togetherRules.length +
    input.separateRules.length +
    input.fixedRules.length +
    input.attributeRules.length +
    extraRules.length
  );
}

function getValidLockedRules(participants, groupCount) {
  const participantSet = new Set(participants);
  const lockedRules = [];
  const nextLocks = new Map();

  lockedAssignments.forEach((groupIndex, member) => {
    if (participantSet.has(member) && groupIndex >= 0 && groupIndex < groupCount) {
      lockedRules.push({ member, groupIndex, raw: `${member}=${groupIndex + 1}`, locked: true });
      nextLocks.set(member, groupIndex);
    }
  });

  return { lockedRules, nextLocks };
}

function clonePlan(plan) {
  return plan ? plan.map((group) => [...group]) : null;
}

function createResultSnapshot() {
  if (!lastPlan) {
    return null;
  }

  return {
    plan: clonePlan(lastPlan),
    locks: [...lockedAssignments.entries()],
  };
}

function updateUndoButtonState() {
  undoEditButton.disabled = isGenerating || !lastPlan || editHistory.length === 0;
}

function clearEditHistory() {
  editHistory = [];
  updateUndoButtonState();
}

function pushEditHistory() {
  const snapshot = createResultSnapshot();

  if (!snapshot) {
    return;
  }

  editHistory.push(snapshot);

  if (editHistory.length > MAX_EDIT_HISTORY) {
    editHistory.shift();
  }

  updateUndoButtonState();
}

function undoLastEdit() {
  const snapshot = editHistory.pop();

  if (!snapshot) {
    setStatus("되돌릴 수정이 없습니다.", "error");
    updateUndoButtonState();
    return;
  }

  lastPlan = clonePlan(snapshot.plan);
  lockedAssignments = new Map(snapshot.locks);
  renderGroups(lastPlan);
  refreshAuditForCurrentPlan([
    {
      type: "warning",
      title: "되돌리기",
      detail: "직전 결과 수정을 되돌렸습니다.",
    },
  ]);
  setResultState("수정됨");
  setStatus("직전 결과 수정을 되돌렸습니다.", "success");
  updateUndoButtonState();
}

function refreshAuditForCurrentPlan(extraItems = []) {
  if (!lastPlan) {
    return;
  }

  const input = getInputs();

  if (input.errors.length) {
    renderAudit(
      input.errors.map((detail) => ({
        type: "error",
        title: "입력 확인",
        detail,
      })),
      input,
    );
    return;
  }

  const { lockedRules, nextLocks } = getValidLockedRules(input.participants, input.groupCount);
  lockedAssignments = nextLocks;

  const audit = validatePlan(
    lastPlan,
    input.togetherRules,
    input.separateRules,
    [...input.fixedRules, ...lockedRules],
    input.attributeRules,
  );

  renderSummary(input.participants.length, input.groupCount, getRuleCountFromInput(input, lockedRules));
  renderAudit([...extraItems, ...audit], input);
}

function toggleMemberLock(member, groupIndex) {
  const groupNames = getGroupNames(lastPlan?.length || 0);
  const wasLocked = lockedAssignments.get(member) === groupIndex;

  if (wasLocked) {
    pushEditHistory();
    lockedAssignments.delete(member);
  } else {
    pushEditHistory();
    lockedAssignments.set(member, groupIndex);
  }

  renderGroups(lastPlan);
  refreshAuditForCurrentPlan([
    {
      type: "warning",
      title: wasLocked ? "고정 해제" : "고정 적용",
      detail: `${member} → ${groupNames[groupIndex] || `${groupIndex + 1}그룹`}`,
      hint: wasLocked ? "다음 생성부터 이 멤버는 다시 움직일 수 있습니다." : "다음 생성에도 이 위치를 유지합니다.",
    },
  ]);
  setResultState("수정됨");
  setStatus(wasLocked ? `${member}의 고정을 해제했습니다.` : `${member}를 고정했습니다.`, "success");
}

function moveMember(member, fromGroupIndex, toGroupIndex) {
  if (!lastPlan || fromGroupIndex === toGroupIndex) {
    renderGroups(lastPlan);
    return;
  }

  const source = lastPlan[fromGroupIndex];
  const target = lastPlan[toGroupIndex];

  if (!source || !target) {
    renderGroups(lastPlan);
    return;
  }

  const memberIndex = source.indexOf(member);

  if (memberIndex === -1) {
    renderGroups(lastPlan);
    return;
  }

  pushEditHistory();
  source.splice(memberIndex, 1);
  target.push(member);
  lockedAssignments.set(member, toGroupIndex);

  const groupNames = getGroupNames(lastPlan.length);

  renderGroups(lastPlan);
  refreshAuditForCurrentPlan([
    {
      type: "warning",
      title: "직접 수정",
      detail: `${member} → ${groupNames[toGroupIndex]}`,
      hint: "다음 생성에도 유지되도록 고정했습니다.",
    },
  ]);
  setResultState("수정됨");
  setStatus(`${member}를 ${groupNames[toGroupIndex]}으로 옮겼습니다.`, "success");
}

function renderGroups(plan) {
  groupsGrid.innerHTML = "";
  emptyState.classList.toggle("is-hidden", Boolean(plan));
  updateUndoButtonState();

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
    card.setAttribute("aria-label", `${groupNames[index]}, ${members.length}명`);
    list.className = "member-list";
    list.setAttribute("role", "list");

    members.forEach((member) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const actions = document.createElement("div");
      const moveSelect = document.createElement("select");
      const lockButton = document.createElement("button");
      const locked = lockedAssignments.get(member) === index;

      name.textContent = member;
      actions.className = "member-actions";
      moveSelect.className = "member-move-select";
      moveSelect.setAttribute("aria-label", `${member} 이동할 그룹`);

      groupNames.forEach((groupName, groupIndex) => {
        const option = document.createElement("option");
        option.value = String(groupIndex);
        option.textContent = groupName;
        moveSelect.append(option);
      });

      moveSelect.value = String(index);
      moveSelect.disabled = isGenerating;
      moveSelect.addEventListener("change", (event) => moveMember(member, index, Number(event.target.value)));

      lockButton.className = "lock-button";
      lockButton.classList.toggle("is-locked", locked);
      lockButton.type = "button";
      lockButton.disabled = isGenerating;
      lockButton.textContent = locked ? "해제" : "고정";
      lockButton.setAttribute("aria-pressed", String(locked));
      lockButton.setAttribute("aria-label", locked ? `${member} 고정 해제` : `${member} 현재 그룹에 고정`);
      lockButton.addEventListener("click", () => toggleMemberLock(member, index));

      actions.append(moveSelect, lockButton);
      item.append(name, actions);
      list.append(item);
    });

    header.append(title, count);
    card.append(header, list);
    groupsGrid.append(card);
  });
}

function getSettingsMeta(settings) {
  const participantCount = splitParticipants(settings.participants).length;
  const ruleCount =
    splitLines(settings.together).length +
    splitLines(settings.separate).length +
    splitLines(settings.fixed).length +
    splitLines(settings.attributes || "").length;
  const groupCount = Number(settings.groupCount) || 0;
  const rollCount = Number(settings.rollCount) || DEFAULT_ROLL_COUNT;

  return { participantCount, ruleCount, groupCount, rollCount };
}

function renderSavedSettings() {
  savedSettingsCount.textContent = String(savedSettings.length);
  savedSettingsList.innerHTML = "";
  updateSettingsButton.disabled = isGenerating || !savedSettings.some((item) => item.id === activeSavedSettingId);

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
    const renameButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    const meta = getSettingsMeta(item.settings);

    row.className = "saved-item";
    row.classList.toggle("is-active", item.id === activeSavedSettingId);
    loadButton.className = "saved-load";
    loadButton.type = "button";
    renameButton.className = "saved-rename";
    renameButton.type = "button";
    deleteButton.className = "saved-delete";
    deleteButton.type = "button";
    loadButton.disabled = isGenerating;
    renameButton.disabled = isGenerating;
    deleteButton.disabled = isGenerating;

    title.textContent = item.name || `${index + 1}. ${meta.groupCount}그룹`;
    detail.textContent = `${meta.participantCount}명 / ${meta.rollCount}회 / 규칙 ${meta.ruleCount}개`;
    renameButton.textContent = "수정";
    deleteButton.textContent = "삭제";
    loadButton.setAttribute("aria-label", `${title.textContent} 불러오기`);
    renameButton.setAttribute("aria-label", `${title.textContent} 이름 수정`);
    deleteButton.setAttribute("aria-label", `${title.textContent} 삭제`);

    loadButton.append(title, detail);
    loadButton.addEventListener("click", () => loadSavedSetting(item));
    renameButton.addEventListener("click", () => renameSavedSetting(item.id));
    deleteButton.addEventListener("click", () => deleteSavedSetting(item.id));
    row.append(loadButton, renameButton, deleteButton);
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

  const item = {
    id: Date.now() + Math.random(),
    name,
    settings,
  };

  savedSettings.unshift(item);

  savedSettings = savedSettings.slice(0, 12);
  activeSavedSettingId = item.id;
  savedSettingsNameInput.value = "";
  persistSavedSettings();
  renderSavedSettings();
  setStatus("현재 입력값을 저장했습니다.", "success");
}

function updateCurrentSavedSetting() {
  const item = savedSettings.find((savedItem) => savedItem.id === activeSavedSettingId);

  if (!item) {
    setStatus("갱신할 저장값을 먼저 불러오세요.", "error");
    return;
  }

  const settings = getDraftSettings();
  const meta = getSettingsMeta(settings);

  if (meta.participantCount === 0 && meta.ruleCount === 0) {
    setStatus("갱신할 입력값이 없습니다.", "error");
    return;
  }

  const nextName = savedSettingsNameInput.value.trim();

  if (nextName) {
    item.name = nextName;
    savedSettingsNameInput.value = "";
  }

  item.settings = settings;
  persistSavedSettings();
  renderSavedSettings();
  setStatus("저장값을 갱신했습니다.", "success");
}

function loadSavedSetting(item) {
  applyDraftSettings(item.settings);
  activeSavedSettingId = item.id;
  lastPlan = null;
  lockedAssignments = new Map();
  clearEditHistory();
  renderDraftStats();
  renderGroups(null);
  renderAudit([]);
  setResultState("대기");
  renderSavedSettings();
  setStatus("저장값을 불러왔습니다.", "success");
}

function deleteSavedSetting(id) {
  savedSettings = savedSettings.filter((item) => item.id !== id);
  if (activeSavedSettingId === id) {
    activeSavedSettingId = null;
  }
  persistSavedSettings();
  renderSavedSettings();
  setStatus("저장값을 삭제했습니다.", "success");
}

function renameSavedSetting(id, nextName = null) {
  const item = savedSettings.find((savedItem) => savedItem.id === id);

  if (!item) {
    return;
  }

  let name = nextName;

  if (name === null) {
    if (typeof prompt !== "function") {
      return;
    }

    name = prompt("저장값 이름", item.name || "");
  }

  if (name === null) {
    return;
  }

  const trimmed = String(name).trim();

  if (!trimmed) {
    setStatus("저장값 이름을 입력하세요.", "error");
    return;
  }

  item.name = trimmed;
  persistSavedSettings();
  renderSavedSettings();
  setStatus("저장값 이름을 수정했습니다.", "success");
}

function applyLockedRules(input) {
  const { lockedRules, nextLocks } = getValidLockedRules(input.participants, input.groupCount);
  lockedAssignments = nextLocks;
  input.fixedRules = [...input.fixedRules, ...lockedRules];
}

function getAuditHint(item) {
  if (!["error", "warning"].includes(item.type)) {
    return "";
  }

  const text = `${item.title} ${item.detail}`;

  if (text.includes("최소 2명")) {
    return "명단에 참가자를 더 추가하세요.";
  }

  if (text.includes("그룹 수는 2")) {
    return "그룹 수를 2 이상으로 입력하세요.";
  }

  if (text.includes("돌리기")) {
    return "높게 잡을수록 더 오래 걸릴 수 있습니다.";
  }

  if (text.includes("참가자 수보다")) {
    return "그룹 수를 줄이거나 참가자를 더 추가하세요.";
  }

  if (text.includes("이름을 2개 이상")) {
    return "한 줄에 A-B처럼 2명 이상 입력하세요.";
  }

  if (text.includes("찾을 수 없습니다")) {
    return "명단과 규칙의 표기를 같게 맞추세요.";
  }

  if (text.includes("반복") || text.includes("중복됩니다") || text.includes("이미 입력")) {
    return "같은 이름이나 같은 줄을 한 번만 남기세요.";
  }

  if (text.includes("그룹 이름이 중복")) {
    return "각 그룹 이름을 서로 다르게 입력하세요.";
  }

  if (text.includes("그룹 번호") || text.includes("범위를 벗어")) {
    return "고정 배정은 A=1처럼 1부터 현재 그룹 수 사이의 번호를 쓰세요.";
  }

  if (text.includes("고정된 인원이 너무 많")) {
    return "해당 그룹의 고정 배정을 줄이거나 그룹 수를 줄여 한 그룹당 인원을 늘리세요.";
  }

  if (text.includes("함께 묶인 인원이 너무 많")) {
    return "함께 배정 줄을 나누거나 그룹 수를 줄여 한 그룹당 인원을 늘리세요.";
  }

  if (text.includes("모두 분리할 수")) {
    return "분리 대상을 줄이거나 그룹 수를 늘리세요.";
  }

  if (text.includes("충돌")) {
    return "함께 배정, 분리 배정, 고정 배정 중 서로 맞지 않는 줄을 줄이세요.";
  }

  if (text.includes("생성 실패") || text.includes("찾지 못했습니다")) {
    return "분리 배정이나 고정 배정을 줄인 뒤 다시 생성하세요.";
  }

  if (text.includes("속성 균형 반영")) {
    return "완전 균등이 아니면 속성 값을 더 고르게 입력하거나 그룹 수를 조정하세요.";
  }

  return "";
}

function renderAudit(items, input = null) {
  lastAudit = items;
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

  lastAudit = items;

  for (const item of items) {
    const element = document.createElement("div");
    element.className = `audit-item is-${item.type}`;

    const title = document.createElement("strong");
    const detail = document.createElement("span");
    const hintText = item.hint || getAuditHint(item);

    title.textContent = item.title;
    detail.textContent = item.detail;
    element.append(title, detail);

    if (hintText) {
      const hint = document.createElement("em");
      hint.textContent = hintText;
      element.append(hint);
    }

    auditList.append(element);
  }
}

async function generate() {
  if (isGenerating) {
    return;
  }

  isGenerating = true;
  setGenerateBusy(true);

  try {
    const input = getInputs();
    applyLockedRules(input);
    const ruleCount = getRuleCountFromInput(input);
    renderDraftStats();
    renderSummary(input.participants.length, Number.isFinite(input.groupCount) ? input.groupCount : 0, ruleCount);

    if (input.errors.length) {
      lastPlan = null;
      lastAudit = [];
      markInvalidFields(input.errors);
      clearEditHistory();
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

    const result = await buildRolledPlan(input, ({ current, total, successCount, result: currentResult, error }) => {
      if (total <= 1) {
        return;
      }

      if (current === 0) {
        setResultState("진행 중");
        setStatus(`${total}회 돌리기를 시작합니다.`, "default");
        return;
      }

      if (currentResult?.plan) {
        renderGroups(currentResult.plan);
      }

      setResultState(`${current}/${total}`);
      setStatus(
        error ? `${total}회 중 ${current}번째 실패, ${successCount}회 생성` : `${current}번째 결과 표시 중`,
        "default",
      );
    });

    if (result.error) {
      lastPlan = null;
      lastAudit = result.audit;
      markInvalidFields([result.error]);
      clearEditHistory();
      renderGroups(null);
      renderAudit(result.audit, input);
      setResultState("실패", "error");
      setStatus(result.error, "error");
      return;
    }

    lastPlan = result.plan;
    lastAudit = result.audit;
    clearFieldValidity();
    clearEditHistory();
    renderGroups(result.plan);
    renderAudit(result.audit, input);
    setResultState("완료", "ready");
    setStatus(
      input.rollCount > 1
        ? `${input.rollCount}회 돌려 ${input.participants.length}명을 ${input.groupCount}개 그룹으로 배정했습니다.`
        : `${input.participants.length}명을 ${input.groupCount}개 그룹으로 배정했습니다.`,
      "success",
    );
  } finally {
    isGenerating = false;
    setGenerateBusy(false);
    if (lastPlan) {
      renderGroups(lastPlan);
    }
  }
}

function formatCopyResult(plan, groupNames, auditItems, mode) {
  const groupedText = plan
    .map((group, index) => `${groupNames[index]}\n${group.map((member) => `- ${member}`).join("\n")}`)
    .join("\n\n");
  const namesOnlyText = plan.map((group) => group.join("\n")).join("\n\n");
  const numberedText = plan.map((group, index) => `${index + 1}. ${groupNames[index]}: ${group.join(", ")}`).join("\n");
  const chatText = plan.map((group, index) => `[${groupNames[index]}] ${group.join(", ")}`).join("\n");
  const compactText = plan.map((group, index) => `${groupNames[index]}: ${group.join(", ")}`).join(" / ");
  const auditText = auditItems.map((item) => `- ${item.title}: ${item.detail}`).join("\n");

  if (mode === "names") {
    return namesOnlyText;
  }

  if (mode === "numbered") {
    return numberedText;
  }

  if (mode === "chat") {
    return chatText;
  }

  if (mode === "compact") {
    return compactText;
  }

  if (mode === "audit") {
    return `${groupedText}\n\n검토\n${auditText || "- 검토 없음"}`;
  }

  return groupedText;
}

async function copyResult() {
  if (!lastPlan) {
    setStatus("복사할 결과가 없습니다.", "error");
    return;
  }

  const groupNames = getGroupNames(lastPlan.length);
  const text = formatCopyResult(lastPlan, groupNames, lastAudit, copyModeSelect.value);

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
  lastAudit = [];
  activeSavedSettingId = null;
  lockedAssignments = new Map();
  clearEditHistory();
  savedSettingsNameInput.value = "";
  renderDraftStats();
  renderGroups(null);
  renderAudit([]);
  renderSavedSettings();
  setResultState("대기");
  setStatus("");
}

function clearLockedAssignments() {
  if (!lockedAssignments.size) {
    setStatus("고정된 멤버가 없습니다.", "error");
    return;
  }

  pushEditHistory();
  lockedAssignments = new Map();
  renderGroups(lastPlan);
  refreshAuditForCurrentPlan([
    {
      type: "warning",
      title: "고정 해제",
      detail: "모든 결과 고정을 해제했습니다.",
    },
  ]);
  setResultState("수정됨");
  setStatus("고정된 멤버를 모두 해제했습니다.", "success");
}

function boot() {
  loadSavedSettings();
  reset();
}

function handleInputKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    generate();
  }
}

function handleSingleLineKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    generate();
  }
}

function handleSavedNameKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();

  if (activeSavedSettingId) {
    updateCurrentSavedSetting();
  } else {
    saveCurrentSettings();
  }
}

generateButton.addEventListener("click", generate);
resetButton.addEventListener("click", () => reset());
undoEditButton.addEventListener("click", undoLastEdit);
clearLocksButton.addEventListener("click", clearLockedAssignments);
copyButton.addEventListener("click", copyResult);
saveSettingsButton.addEventListener("click", saveCurrentSettings);
updateSettingsButton.addEventListener("click", updateCurrentSavedSetting);
[participantsInput, groupNamesInput, togetherInput, separateInput, fixedInput, attributesInput].forEach((input) => {
  input.addEventListener("keydown", handleInputKeydown);
});
groupCountInput.addEventListener("keydown", handleSingleLineKeydown);
rollCountInput.addEventListener("keydown", handleSingleLineKeydown);
savedSettingsNameInput.addEventListener("keydown", handleSavedNameKeydown);
getInputFields().forEach((input) => {
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
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
