let engineRandom = Math.random;

function createSeededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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

function parseCSV(text) {
  const source = text.replace(/^\uFEFF/u, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
      continue;
    }
    if (char === '"') {
      if (cell || closedQuote) throw new Error("CSV 따옴표 형식을 확인하세요.");
      quoted = true;
    } else if (char === ",") {
      row.push(cell); cell = ""; closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      row.push(cell); rows.push(row); row = []; cell = ""; closedQuote = false;
      if (char === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      if (closedQuote) throw new Error("CSV 따옴표 뒤에는 쉼표나 줄바꿈이 필요합니다.");
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function parseParticipantCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("CSV에 name 헤더와 참가자를 입력하세요.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || !headers.includes("name")) {
    throw new Error("CSV에는 중복되지 않는 name 헤더가 필요합니다.");
  }
  const nameIndex = headers.indexOf("name");
  const roleIndex = headers.indexOf("role");
  const records = rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV ${index + 2}번째 줄의 열 수를 확인하세요.`);
    const name = cells[nameIndex].trim();
    if (!name) throw new Error(`CSV ${index + 2}번째 줄의 이름이 비어 있습니다.`);
    return { name, role: roleIndex === -1 ? "" : cells[roleIndex].trim() };
  });
  if (!records.length) throw new Error("CSV에 참가자가 없습니다.");
  if (duplicateItems(records.map((record) => record.name)).length || records.some((record) => /[\u0000-\u001f\u007f]/u.test(record.name))) throw new Error("CSV 이름의 중복 또는 제어 문자를 확인하세요.");
  return records;
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
    const next = Math.floor(engineRandom() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }

  return copy;
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

function parseRoleList(value, enabled = true) {
  if (!enabled) return { roles: [], roleCount: 0, errors: [] };
  const roles = value.split(",").map((role) => role.trim()).filter(Boolean);
  const errors = [];
  if (!roles.length) errors.push("2단계 배정에 사용할 역할을 입력하세요.");
  const duplicates = duplicateItems(roles);
  if (duplicates.length) errors.push(`역할이 중복되어 있습니다: ${duplicates.join(", ")}`);
  if (roles.some((role) => /[\u0000-\u001f\u007f]/u.test(role))) errors.push("역할에는 줄바꿈이나 제어 문자를 사용할 수 없습니다.");
  return { roles, roleCount: roles.length, errors };
}

function validateNestedCapacities(participantCount, groupCount, capacities, roleCount) {
  if (!Number.isInteger(groupCount) || groupCount < 2 || !roleCount) return [];
  if (capacities) {
    if (capacities.some((size) => size !== roleCount)) {
      return ["2단계 배정은 모든 그룹의 정원과 역할 수가 같아야 합니다."];
    }
  } else if (participantCount !== groupCount * roleCount) {
    return ["2단계 배정은 각 그룹 인원과 역할 수가 같아야 합니다."];
  }
  return [];
}

function parseGroupCapacities(value, groupCount, participantCount) {
  if (!value.trim()) return { capacities: null, errors: [] };
  const tokens = value.split(",").map((token) => token.trim());
  const errors = [];
  if (tokens.length !== groupCount) errors.push("그룹별 인원 값 개수는 그룹 수와 같아야 합니다.");
  if (tokens.some((token) => !/^[0-9]+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) < 1)) {
    errors.push("그룹별 인원은 모두 1 이상의 정수여야 합니다.");
  }
  const capacities = tokens.map(Number);
  if (!errors.length && capacities.reduce((sum, size) => sum + size, 0) !== participantCount) {
    errors.push("그룹별 인원의 합계는 참가자 수와 같아야 합니다.");
  }
  return { capacities, errors };
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
    if (size > (input.capacities?.[groupIndex] ?? maxTargetSize)) {
      errors.push(`${groupIndex + 1}그룹에 고정된 인원이 너무 많습니다.`);
    }
  });

  for (const [left, right] of createSeparatedComponentPairs(components, input.separateRules).pairs) {
    if (fixedTargets.has(left) && fixedTargets.get(left) === fixedTargets.get(right)) errors.push("분리할 참가자가 같은 그룹에 고정되어 있습니다.");
  }
  const base = Math.floor(input.participants.length / input.groupCount);
  const extra = input.participants.length % input.groupCount;
  if (!input.capacities && fixedSizeByGroup.filter((size) => size > base).length > extra) errors.push("큰 정원이 필요한 고정 그룹이 너무 많습니다.");
  const free = components.filter((component) => !fixedTargets.has(component.id));
  if (input.participants.length <= 2000) {
    let reachable = 1n;
    for (const component of free) reachable |= reachable << BigInt(component.size);
    fixedSizeByGroup.forEach((size, index) => {
      const targets = input.capacities ? [input.capacities[index]] : [...new Set([base, maxTargetSize])];
      if (!targets.some((target) => target >= size && ((reachable >> BigInt(target - size)) & 1n))) errors.push(`${index + 1}그룹의 정원을 함께 배정 묶음으로 채울 수 없습니다.`);
    });
  }
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
    const passed = firstGroup !== undefined && rest.every((member) => groupIndexByName.get(member) === firstGroup);

    audit.push({
      type: passed ? "ok" : "error",
      title: passed ? "함께 배정 만족" : "함께 배정 실패",
      detail: rule.members.join(", "),
    });
  }

  for (const rule of separateRules) {
    let passed = rule.members.every((member) => groupIndexByName.has(member));

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
  engineRandom = createSeededRandom(input.seed ?? "TeamBuilder");
  const components = createComponents(input.participants, input.togetherRules);
  const maxTargetSize = input.capacities ? Math.max(...input.capacities) : Math.ceil(input.participants.length / input.groupCount);
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
    const targetSizes = input.capacities || getTargetSizes(input.participants.length, input.groupCount);
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
    const errors = validateAssignmentResult(bestPlan, input, null, false);
    if (errors.length) return { error: errors[0], audit: errors.map((detail) => ({ type: "error", title: "결과 검증 실패", detail })) };
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

function assignRolesToPlan(plan, roles) {
  if (plan.some((group) => group.length !== roles.length)) throw new Error("그룹 인원과 역할 수가 같아야 합니다.");
  return plan.map((group) => shuffle(group).map((member, index) => ({ member, role: roles[index] || "" })));
}

function validateAssignmentResult(plan, input, roleAssignments = null, checkRoles = true) {
  const errors = [...(input.errors || [])];
  if (!Array.isArray(plan) || plan.length !== input.groupCount || plan.some((group) => !Array.isArray(group))) return [...errors, "그룹 구조가 올바르지 않습니다."];
  const members = plan.flat();
  if (members.length !== input.participants.length || new Set(members).size !== members.length || members.some((member) => !input.participants.includes(member)) || input.participants.some((member) => !members.includes(member))) errors.push("참가자 누락 또는 중복입니다.");
  plan.forEach((group, index) => {
    const min = input.capacities?.[index] ?? Math.floor(input.participants.length / input.groupCount);
    const max = input.capacities?.[index] ?? Math.ceil(input.participants.length / input.groupCount);
    if (group.length < min || group.length > max) errors.push("그룹 정원을 지켜야 합니다.");
    if (input.twoStage && checkRoles) {
      const entries = roleAssignments?.[index];
      if (!Array.isArray(entries) || entries.length !== group.length || new Set(entries.map((entry) => entry.member)).size !== group.length || new Set(entries.map((entry) => entry.role)).size !== input.roles.length || entries.some((entry) => !group.includes(entry.member) || !input.roles.includes(entry.role))) errors.push("역할 배정을 확인하세요.");
    }
  });
  errors.push(...validatePlan(plan, input.togetherRules, input.separateRules, input.fixedRules, input.attributeRules).filter((item) => item.type === "error").map((item) => item.detail));
  return errors;
}
