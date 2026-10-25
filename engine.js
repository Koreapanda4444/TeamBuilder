function normalizeParticipantProfile(record) {
  if (!record || Array.isArray(record) || typeof record.name !== "string" || !record.name.trim() || /[\u0000-\u001f\u007f]/u.test(record.name)) throw new Error("참가자 프로필 이름을 확인하세요.");
  if (record.role !== undefined && typeof record.role !== "string") throw new Error("참가자 역할 형식을 확인하세요.");
  const attributes = record.attributes ?? {};
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes) || Object.entries(attributes).some(([key, value]) => !key.trim() || ["__proto__", "constructor", "prototype"].includes(key) || (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))))) throw new Error("참가자 속성 형식을 확인하세요.");
  const roleList = (value, fallback = []) => {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.some((role) => typeof role !== "string" || !role.trim())) throw new Error("역할 선호·제한 형식을 확인하세요.");
    return uniqueItems(value.map((role) => role.trim()));
  };
  if (record.requiredRole !== undefined && typeof record.requiredRole !== "string") throw new Error("필수 역할 형식을 확인하세요.");
  return { name: record.name.trim(), role: record.role || "", attributes: { ...attributes }, preferences: roleList(record.preferences, record.role ? [record.role] : []), restrictions: roleList(record.restrictions), requiredRole: record.requiredRole?.trim() || "" };
}

function createParticipantProfiles(names, records = [], attributeRules = []) {
  const byName = new Map((records || []).map((record) => [record.name, normalizeParticipantProfile(record)]));
  const profiles = names.map((name) => byName.get(name) || normalizeParticipantProfile({ name }));
  const profilesByName = new Map(profiles.map((profile) => [profile.name, profile]));
  attributeRules.forEach(({ member, value }) => { if (profilesByName.has(member)) profilesByName.get(member).attributes.attribute = value; });
  return profiles;
}

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
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length || !headers.includes("name")) throw new Error("CSV에는 중복되지 않는 name 헤더가 필요합니다.");
  const reserved = new Set(["name", "role", "preferences", "restrictions", "requiredrole"]);
  const dimensions = headers.filter((header) => !reserved.has(header)).map((header) => header.replace(/^(?:attr|attribute):/u, ""));
  if (new Set(dimensions).size !== dimensions.length) throw new Error("CSV 속성 이름이 중복됩니다.");
  const records = rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV ${index + 2}번째 줄의 열 수를 확인하세요.`);
    const values = Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
    const attributes = Object.fromEntries(headers.filter((header) => !reserved.has(header) && values[header] !== "").map((header) => {
      const text = values[header];
      const value = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iu.test(text) && Number.isFinite(Number(text)) ? Number(text) : text;
      return [header.replace(/^(?:attr|attribute):/u, ""), value];
    }));
    const list = (value) => value ? value.split(/[|;,]/u).map((role) => role.trim()).filter(Boolean) : undefined;
    return normalizeParticipantProfile({ name: values.name, role: values.role || "", attributes, preferences: list(values.preferences), restrictions: list(values.restrictions), requiredRole: values.requiredrole || "" });
  });
  if (!records.length || duplicateItems(records.map((record) => record.name)).length) throw new Error("CSV 명단의 중복과 빈 명단을 확인하세요.");
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
  if (!enabled) return { roles: [], requiredRoles: [], optionalRoles: [], roleCount: 0, errors: [] };
  const tokens = value.split(",").map((role) => role.trim()).filter(Boolean);
  const requiredRoles = tokens.filter((role) => !role.startsWith("?")).map((role) => role.trim());
  const optionalRoles = tokens.filter((role) => role.startsWith("?")).map((role) => role.slice(1).trim());
  const roles = [...requiredRoles, ...optionalRoles];
  const errors = [];
  if (!roles.length || roles.some((role) => !role || /[\u0000-\u001f\u007f]/u.test(role))) errors.push("2단계 배정의 역할을 확인하세요.");
  if (duplicateItems(roles).length) errors.push("역할 이름이 중복되어 있습니다.");
  return { roles, requiredRoles, optionalRoles, roleCount: roles.length, errors };
}

function validateNestedCapacities(participantCount, groupCount, capacities, roleCount, requiredCount = roleCount) {
  if (!Number.isInteger(groupCount) || groupCount < 2 || !roleCount) return [];
  const sizes = capacities || Array.from({ length: groupCount }, (_, index) => Math.floor(participantCount / groupCount) + (index < participantCount % groupCount ? 1 : 0));
  return sizes.some((size) => size < requiredCount || size > roleCount) ? ["그룹 인원은 필수 역할 수 이상, 전체 역할 수 이하여야 합니다."] : [];
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

function createSeparationGraph(pairs) {
  const graph = new Map();
  pairs.forEach(([left, right]) => {
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left).add(right); graph.get(right).add(left);
  });
  return graph;
}

function hasSeparationConflict(group, component, graph) {
  const neighbors = graph.get(component.id);
  if (!neighbors) return false;
  for (const id of group.componentIds) if (neighbors.has(id)) return true;
  return false;
}

function assignComponents(components, groupCount, targetSizes, separatedPairs, fixedTargets, search) {
  const graph = createSeparationGraph(separatedPairs);
  const groups = Array.from({ length: groupCount }, (_, id) => ({ id, targetSize: targetSizes[id], members: [], components: [], componentIds: new Set() }));
  const failedStates = new Set();
  const fixedGroups = new Set(fixedTargets.values());
  const pending = shuffle(components).sort((a, b) => b.size - a.size);
  function domain(component) {
    checkSearchBudget(search, groups.length);
    const fixed = fixedTargets.get(component.id);
    return groups.filter((group) => (fixed === undefined || fixed === group.id) && group.members.length + component.size <= group.targetSize && !hasSeparationConflict(group, component, graph));
  }
  function forwardCheck() {
    const domains = pending.map((component) => ({ component, choices: domain(component) }));
    if (domains.some((item) => item.choices.length === 0)) return false;
    return groups.every((group) => {
      const space = group.targetSize - group.members.length;
      let possible = 0, forced = 0;
      domains.forEach(({ component, choices }) => {
        if (choices.includes(group)) { possible += component.size; if (choices.length === 1) forced += component.size; }
      });
      return possible >= space && forced <= space;
    });
  }
  function place() {
    search.nodes += 1;
    checkSearchBudget(search);
    if (!pending.length) return groups.every((group) => group.members.length === group.targetSize);
    const stateKey = groups.map((group) => [...group.componentIds].sort((a, b) => a - b).join(",")).join("|");
    if (failedStates.has(stateKey)) return false;
    let selected = 0;
    let candidates = null;
    for (let index = 0; index < pending.length; index += 1) {
      const choices = domain(pending[index]);
      if (!choices.length) return false;
      if (!candidates || choices.length < candidates.length) { selected = index; candidates = choices; }
      if (candidates.length === 1) break;
    }
    const [component] = pending.splice(selected, 1);
    const emptySizes = new Set();
    for (const group of shuffle(candidates)) {
      if (!group.members.length && !fixedGroups.has(group.id)) {
        if (emptySizes.has(group.targetSize)) continue;
        emptySizes.add(group.targetSize);
      }
      group.components.push(component); group.componentIds.add(component.id); group.members.push(...component.members);
      if (forwardCheck() && place()) return true;
      group.components.pop(); group.componentIds.delete(component.id); group.members.splice(group.members.length - component.size, component.size);
    }
    pending.splice(selected, 0, component);
    if (failedStates.size < 20000) failedStates.add(stateKey);
    return false;
  }
  return place() ? groups.map((group) => shuffle(group.members)) : null;
}

function getAttributeDistributions(plan, profiles) {
  const byName = new Map(profiles.map((profile) => [profile.name, profile]));
  const dimensions = [...new Set(profiles.flatMap((profile) => Object.keys(profile.attributes || {})))].sort();
  return dimensions.map((dimension) => {
    const known = profiles.map((profile) => profile.attributes?.[dimension]).filter((value) => value !== undefined);
    const numeric = known.length > 0 && known.every((value) => typeof value === "number");
    const groups = plan.map((members) => {
      const values = members.map((member) => byName.get(member)?.attributes?.[dimension]).filter((value) => value !== undefined);
      const counts = new Map(); values.forEach((value) => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
      return { count: values.length, size: members.length, mean: numeric && values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, values: Object.fromEntries(counts) };
    });
    return { dimension, type: numeric ? "numeric" : "categorical", groups, min: numeric ? Math.min(...known) : null, max: numeric ? Math.max(...known) : null };
  });
}

function normalizeBalanceWeights(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([key, weight]) => !key || ["__proto__", "constructor", "prototype"].includes(key) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 100)) throw new Error("속성 가중치는 0부터 100 사이의 숫자여야 합니다.");
  return { ...value };
}

function getAttributeBalanceScore(plan, attributeRules = [], profiles = null, weights = {}) {
  const data = profiles || createParticipantProfiles(plan.flat(), [], attributeRules);
  let score = 0;
  for (const distribution of getAttributeDistributions(plan, data)) {
    let penalty = 0;
    if (distribution.type === "numeric") {
      const means = distribution.groups.map((group) => group.mean).filter((mean) => mean !== null);
      const range = distribution.max - distribution.min;
      if (means.length && range > 0) penalty += (Math.max(...means) - Math.min(...means)) / range;
    } else {
      const values = new Set(distribution.groups.flatMap((group) => Object.keys(group.values)));
      values.forEach((value) => {
        const counts = distribution.groups.map((group) => distribution.dimension === "attribute" ? (group.values[value] || 0) : (group.values[value] || 0) / Math.max(1, group.size));
        penalty += Math.max(...counts) - Math.min(...counts);
      });
    }
    score += penalty * (weights[distribution.dimension] ?? 1);
  }
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

class SearchLimitError extends Error {}

function checkSearchBudget(search, operations = 1) {
  search.operations += operations;
  if (search.operations > search.maxOperations || performance.now() - search.start >= search.maxMs) throw new SearchLimitError("탐색 한계에 도달했습니다. 불가능이 증명된 것은 아닙니다.");
  if (search.onProgress && search.operations - search.lastProgress >= 10000) {
    search.lastProgress = search.operations;
    search.onProgress({ nodes: search.nodes, operations: search.operations, elapsedMs: Math.round(performance.now() - search.start) });
  }
}

function* capacityLayouts(total, groupCount, capacities) {
  if (capacities) { yield capacities; return; }
  const base = Math.floor(total / groupCount), extra = total % groupCount;
  const order = shuffle(Array.from({ length: groupCount }, (_, index) => index));
  const sizes = Array(groupCount).fill(base);
  function* choose(start, left) {
    if (!left) { yield [...sizes]; return; }
    for (let index = start; index <= order.length - left; index += 1) {
      sizes[order[index]] += 1; yield* choose(index + 1, left - 1); sizes[order[index]] -= 1;
    }
  }
  yield* choose(0, extra);
}

function buildPlan(input, options = {}) {
  if (input.errors?.length) return { status: "invalid", error: input.errors[0], audit: input.errors.map((detail) => ({ type: "error", title: "입력 오류", detail })) };
  const roleErrors = validateRoleConfiguration(input);
  if (roleErrors.length) return { status: "invalid", error: roleErrors[0], audit: roleErrors.map((detail) => ({ type: "error", title: "역할 설정 오류", detail })) };
  const roleFeasibility = validateRoleFeasibility(input);
  if (roleFeasibility.length) return { status: "impossible", error: roleFeasibility[0], audit: roleFeasibility.map((detail) => ({ type: "error", title: "역할 충돌", detail })) };
  const search = { nodes: 0, operations: 0, start: performance.now(), lastProgress: 0, maxMs: input.maxMs ?? 3000, maxOperations: input.maxOperations ?? 1000000, onProgress: options.onProgress };
  if (!Number.isFinite(search.maxMs) || search.maxMs <= 0 || !Number.isSafeInteger(search.maxOperations) || search.maxOperations <= 0) return { status: "invalid", error: "탐색 제한을 확인하세요.", audit: [{ type: "error", title: "입력 확인", detail: "탐색 제한을 확인하세요." }] };
  try {
    const result = searchPlan(input, search);
    return { ...result, status: result.status || (result.error ? "impossible" : "success"), search: { nodes: search.nodes, operations: search.operations } };
  } catch (error) {
    if (!(error instanceof SearchLimitError)) throw error;
    return { status: "limit", error: error.message, audit: [{ type: "warning", title: "탐색 한계", detail: error.message }], search: { nodes: search.nodes, operations: search.operations } };
  }
}

function searchPlan(input, search) {
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
  const rejectedCapacities = new Set();
  const layouts = capacityLayouts(input.participants.length, input.groupCount, input.capacities);
  let layoutExhausted = false;

  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    checkSearchBudget(search);
    const next = layouts.next();
    if (next.done) { layoutExhausted = true; if (!bestPlan) break; }
    const targetSizes = next.done ? (input.capacities || getTargetSizes(input.participants.length, input.groupCount)) : next.value;
    const capacityKey = targetSizes.join(",");
    if (rejectedCapacities.has(capacityKey)) continue;
    const plan = assignComponents(components, input.groupCount, targetSizes, separated.pairs, fixed.targets, search);
    if (!plan) rejectedCapacities.add(capacityKey);

    if (plan) {
      const score = getAttributeBalanceScore(plan, input.attributeRules, input.profiles, input.balanceWeights);

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
    status: layoutExhausted || layouts.next().done ? "impossible" : "limit",
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

function findRoleMatching(members, input, copies = 1, partial = false) {
  const profiles = new Map((input.profiles || []).map((profile) => [profile.name, profile]));
  const required = new Set(input.requiredRoles || input.roles);
  const slots = input.roles.flatMap((role) => Array.from({ length: copies }, () => ({ role, required: required.has(role) })));
  if (members.length > slots.length) return null;
  const nodes = members.map((member) => ({ member, choices: slots.flatMap((slot, index) => canAssignRole(profiles.get(member), slot.role) ? [index] : []) }));
  if (!partial) for (let index = members.length; index < slots.length; index += 1) nodes.push({ member: null, choices: slots.flatMap((slot, slotIndex) => slot.required ? [] : [slotIndex]) });
  nodes.sort((a, b) => a.choices.length - b.choices.length);
  const owner = new Map();
  function augment(nodeIndex, seen) {
    for (const slot of nodes[nodeIndex].choices) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      if (!owner.has(slot) || augment(owner.get(slot), seen)) { owner.set(slot, nodeIndex); return true; }
    }
    return false;
  }
  for (let index = 0; index < nodes.length; index += 1) if (!augment(index, new Set())) return null;
  return [...owner].sort(([a], [b]) => a - b).flatMap(([slot, node]) => nodes[node].member === null ? [] : [{ member: nodes[node].member, role: slots[slot].role }]);
}

function validateRoleConfiguration(input) {
  if (!input.twoStage) return [];
  const errors = [];
  for (const profile of input.profiles || []) {
    if ([...(profile.preferences || []), ...(profile.restrictions || []), ...(profile.requiredRole ? [profile.requiredRole] : [])].some((role) => !input.roles.includes(role))) errors.push(`${profile.name}의 역할 설정에 없는 역할이 있습니다.`);
    if (profile.requiredRole && profile.restrictions?.includes(profile.requiredRole)) errors.push(`${profile.name}의 필수 역할이 금지되어 있습니다.`);
  }
  return errors;
}

function validateRoleFeasibility(input) {
  if (!input.twoStage) return [];
  return findRoleMatching(input.participants, input, input.groupCount) ? [] : ["역할 제한 때문에 필수 역할과 참가자를 모두 배정할 수 없습니다."];
}

function canAssignRole(profile, role) {
  return !profile?.restrictions?.includes(role) && (!profile?.requiredRole || profile.requiredRole === role);
}

function assignRolesToPlan(plan, roles) {
  if (plan.some((group) => group.length > roles.length)) throw new Error("그룹 인원과 역할 수가 같아야 합니다.");
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
      if (!Array.isArray(entries) || entries.length !== group.length || new Set(entries.map((entry) => entry.member)).size !== group.length || new Set(entries.map((entry) => entry.role)).size !== group.length || (input.requiredRoles || input.roles).some((role) => !entries.some((entry) => entry.role === role)) || entries.some((entry) => !group.includes(entry.member) || !input.roles.includes(entry.role) || !canAssignRole(input.profiles?.find((profile) => profile.name === entry.member), entry.role))) errors.push("역할 배정을 확인하세요.");
    }
  });
  errors.push(...validatePlan(plan, input.togetherRules, input.separateRules, input.fixedRules, input.attributeRules).filter((item) => item.type === "error").map((item) => item.detail));
  return errors;
}
