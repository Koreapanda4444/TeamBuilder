const participantsInput = document.querySelector("#participantsInput");
const groupCountInput = document.querySelector("#groupCountInput");
const togetherInput = document.querySelector("#togetherInput");
const separateInput = document.querySelector("#separateInput");
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
const historyCount = document.querySelector("#historyCount");
const historyList = document.querySelector("#historyList");

let lastPlan = null;
let history = [];
const DEFAULT_ATTEMPTS = 1800;

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

  errors.push(...together.errors, ...separate.errors);

  return {
    participants,
    groupCount,
    attempts,
    togetherRules: together.rules,
    separateRules: separate.rules,
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

function assignComponents(components, groupCount, targetSizes, separatedPairs) {
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: index,
    targetSize: targetSizes[index],
    members: [],
    components: [],
  }));

  const orderedComponents = shuffle(components).sort((left, right) => right.size - left.size);

  function place(index) {
    if (index === orderedComponents.length) {
      return groups.every((group) => group.members.length === group.targetSize);
    }

    const component = orderedComponents[index];
    const candidates = shuffle(groups).filter((group) => {
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

function validatePlan(plan, togetherRules, separateRules) {
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

  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    const targetSizes = getTargetSizes(input.participants.length, input.groupCount);
    const plan = assignComponents(components, input.groupCount, targetSizes, separated.pairs);

    if (plan) {
      return {
        plan,
        audit: validatePlan(plan, input.togetherRules, input.separateRules),
      };
    }
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
  const rules = splitLines(togetherInput.value).length + splitLines(separateInput.value).length;

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

function renderGroups(plan) {
  groupsGrid.innerHTML = "";
  emptyState.classList.toggle("is-hidden", Boolean(plan));

  if (!plan) {
    return;
  }

  plan.forEach((members, index) => {
    const card = document.createElement("article");
    card.className = "group-card";

    const header = document.createElement("header");
    const title = document.createElement("h3");
    const count = document.createElement("span");
    const list = document.createElement("ul");

    title.textContent = `${index + 1}그룹`;
    count.textContent = `${members.length}명`;
    list.className = "member-list";

    members.forEach((member) => {
      const item = document.createElement("li");
      item.textContent = member;
      list.append(item);
    });

    header.append(title, count);
    card.append(header, list);
    groupsGrid.append(card);
  });
}

function renderHistory() {
  historyCount.textContent = String(history.length);
  historyList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "기록 없음";
    historyList.append(empty);
    return;
  }

  history.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";

    const title = document.createElement("strong");
    const detail = document.createElement("span");

    title.textContent = `${index + 1}. ${item.groupCount}그룹`;
    detail.textContent = `${item.participantCount}명 / 규칙 ${item.ruleCount}개`;

    button.append(title, detail);
    button.addEventListener("click", () => restoreHistory(item));
    historyList.append(button);
  });
}

function addHistory(plan, input) {
  history.unshift({
    id: Date.now() + Math.random(),
    plan: plan.map((group) => [...group]),
    participantCount: input.participants.length,
    groupCount: input.groupCount,
    ruleCount: input.togetherRules.length + input.separateRules.length,
    audit: validatePlan(plan, input.togetherRules, input.separateRules),
  });

  history = history.slice(0, 6);
  renderHistory();
}

function restoreHistory(item) {
  lastPlan = item.plan.map((group) => [...group]);
  renderGroups(lastPlan);
  renderAudit(item.audit);
  renderSummary(item.participantCount, item.groupCount, item.ruleCount);
  setResultState("기록", "ready");
  setStatus("기록에서 결과를 불러왔습니다.", "success");
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

function generate() {
  const input = getInputs();
  const ruleCount = input.togetherRules.length + input.separateRules.length;
  renderSummary(input.participants.length, Number.isFinite(input.groupCount) ? input.groupCount : 0, ruleCount);
  renderDraftStats();

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
  addHistory(result.plan, input);
  setResultState("완료", "ready");
  setStatus(`${input.participants.length}명을 ${input.groupCount}개 그룹으로 배정했습니다.`, "success");
}

async function copyResult() {
  if (!lastPlan) {
    setStatus("복사할 결과가 없습니다.", "error");
    return;
  }

  const text = lastPlan
    .map((group, index) => `${index + 1}그룹\n${group.map((member) => `- ${member}`).join("\n")}`)
    .join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("결과를 클립보드에 복사했습니다.", "success");
  } catch {
    setStatus("브라우저에서 클립보드 접근을 허용하지 않았습니다.", "error");
  }
}

function reset() {
  participantsInput.value = "";
  groupCountInput.value = "3";
  togetherInput.value = "";
  separateInput.value = "";
  lastPlan = null;
  history = [];
  renderDraftStats();
  renderSummary(0, 0, 0);
  renderGroups(null);
  renderAudit([]);
  renderHistory();
  setResultState("대기");
  setStatus("");
}

generateButton.addEventListener("click", generate);
shuffleButton.addEventListener("click", generate);
resetButton.addEventListener("click", reset);
copyButton.addEventListener("click", copyResult);
[participantsInput, groupCountInput, togetherInput, separateInput].forEach((input) => {
  input.addEventListener("input", () => {
    renderDraftStats();
    if (lastPlan) {
      setResultState("수정됨");
    }
  });
});

reset();
