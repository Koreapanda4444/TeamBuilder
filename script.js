const participantsInput = document.querySelector("#participantsInput");
const importCSVButton = document.querySelector("#importCSVButton");
const participantCSVFile = document.querySelector("#participantCSVFile");
const groupCountInput = document.querySelector("#groupCountInput");
const rollCountInput = document.querySelector("#rollCountInput");
const seedInput = document.querySelector("#seedInput");
const profileMemberSelect = document.querySelector("#profileMemberSelect");
const profilePreferencesInput = document.querySelector("#profilePreferencesInput");
const profileRestrictionsInput = document.querySelector("#profileRestrictionsInput");
const profileRequiredRoleInput = document.querySelector("#profileRequiredRoleInput");
const profileAttributesInput = document.querySelector("#profileAttributesInput");
const profileApplyButton = document.querySelector("#profileApplyButton");
const attributeWeightsInput = document.querySelector("#attributeWeightsInput");
const roleWeightInput = document.querySelector("#roleWeightInput");
const weightsApplyButton = document.querySelector("#weightsApplyButton");
const qualityStrip = document.querySelector("#qualityStrip");
const searchTimeInput = document.querySelector("#searchTimeInput");
const searchOperationsInput = document.querySelector("#searchOperationsInput");
const groupNamesInput = document.querySelector("#groupNamesInput");
const groupCapacitiesInput = document.querySelector("#groupCapacitiesInput");
const togetherInput = document.querySelector("#togetherInput");
const separateInput = document.querySelector("#separateInput");
const fixedInput = document.querySelector("#fixedInput");
const attributesInput = document.querySelector("#attributesInput");
const twoStageInput = document.querySelector("#twoStageInput");
const rolesInput = document.querySelector("#rolesInput");
const generateButton = document.querySelector("#generateButton");
const cancelButton = document.querySelector("#cancelButton");
const generationProgress = document.querySelector("#generationProgress");
const resetButton = document.querySelector("#resetButton");
const importJSONButton = document.querySelector("#importJSONButton");
const exportJSONButton = document.querySelector("#exportJSONButton");
const settingsJSONFile = document.querySelector("#settingsJSONFile");
const rulesPanel = document.querySelector("#rulesPanel");
const undoEditButton = document.querySelector("#undoEditButton");
const redoEditButton = document.querySelector("#redoEditButton");
const clearLocksButton = document.querySelector("#clearLocksButton");
const copyModeSelect = document.querySelector("#copyModeSelect");
const copyButton = document.querySelector("#copyButton");
const exportCSVButton = document.querySelector("#exportCSVButton");
const exportResultJSONButton = document.querySelector("#exportResultJSONButton");
const statusMessage = document.querySelector("#statusMessage");
const groupsGrid = document.querySelector("#groupsGrid");
const emptyState = document.querySelector("#emptyState");
const auditList = document.querySelector("#auditList");
const ruleFeedback = document.querySelector("#ruleFeedback");
const participantCount = document.querySelector("#participantCount");
const participantPreview = document.querySelector("#participantPreview");
const resultState = document.querySelector("#resultState");
const summaryParticipants = document.querySelector("#summaryParticipants");
const summaryGroups = document.querySelector("#summaryGroups");
const savedSettingsCount = document.querySelector("#savedSettingsCount");
const savedSettingsList = document.querySelector("#savedSettingsList");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const updateSettingsButton = document.querySelector("#updateSettingsButton");
const savedSettingsNameInput = document.querySelector("#savedSettingsNameInput");

let participantRecords = null;
let balanceWeights = {};
let rolePreferenceWeight = 1;
let lastPlan = null;
let lastRoleAssignments = null;
let lastCapacities = null;
let resultInputSignature = null;
let lastAudit = [];
let lastQuality = null;
let resultCandidates = [];
let selectedMembers = new Set();
let activeDrag = null;
let selectedCandidateId = null;
let resultHistory = [];
const RESULT_HISTORY_KEY = "teambuilder.resultHistory.v2";
const DRAFT_STORAGE_KEY = "teambuilder.draft.v2";
let draftSaveTimer = null;
let savedSettings = [];
let activeSavedSettingId = null;
let lockedAssignments = new Map();
let editHistory = [];
let redoHistory = [];
let isGenerating = false;
let activeWorker = null;
let cancelActiveComputation = null;
let generationCancelled = false;
const DEFAULT_ATTEMPTS = 1800;
const DEFAULT_ROLL_COUNT = 1;
const MAX_ROLL_COUNT = 30;
const MAX_EDIT_HISTORY = 20;
const SAVED_SETTINGS_STORAGE_KEY = "teambuilder.savedSettings.v2";
const LEGACY_SETTINGS_STORAGE_KEY = "teambuilder.savedSettings.v1";






function getParticipantNames(value = participantsInput.value, records = participantRecords) {
  if (records && value === records.map((record) => record.name).join("\n")) return records.map((record) => record.name);
  return splitParticipants(value);
}

function applyParticipantRecords(records) {
  participantRecords = records.map(normalizeParticipantProfile);
  participantsInput.value = records.map((record) => record.name).join("\n");
  renderDraftStats();
  refreshResultConsistency();
}

async function importParticipantCSV(event) {
  const file = event.target.files?.[0];
  if (!file || isGenerating) return;
  try {
    if (file.size > 2000000) throw new Error("파일은 2MB 이하여야 합니다.");
    const records = parseParticipantCSV(await file.text());
    if (isGenerating) return;
    applyParticipantRecords(records);
    setStatus("CSV 명단을 가져왔습니다.", "success");
  } catch (error) {
    setStatus(error.message || "CSV를 가져오지 못했습니다.", "error");
  } finally {
    event.target.value = "";
  }
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

function getInputSignature() {
  return JSON.stringify(getDraftSettings());
}

function isResultCurrent() {
  return Boolean(lastPlan && resultInputSignature === getInputSignature());
}

function refreshResultConsistency() {
  if (!lastPlan) return;
  const current = isResultCurrent();
  copyButton.disabled = isGenerating || !current;
  exportCSVButton.disabled = isGenerating || !current;
  exportResultJSONButton.disabled = isGenerating || !current;
  setResultState(current ? "완료" : "재생성 필요", current ? "ready" : "error");
}

function setGenerateBusy(active) {
  cancelButton.hidden = !active;
  cancelButton.disabled = !active;
  generationProgress.hidden = !active;
  groupsGrid.setAttribute("aria-busy", String(active));
  generateButton.disabled = active;
  [profileMemberSelect, profilePreferencesInput, profileRestrictionsInput, profileRequiredRoleInput, profileAttributesInput, profileApplyButton, attributeWeightsInput, roleWeightInput, weightsApplyButton].forEach((element) => { element.disabled = active; });
  importCSVButton.disabled = active;
  participantCSVFile.disabled = active;
  importJSONButton.disabled = active;
  exportJSONButton.disabled = active;
  settingsJSONFile.disabled = active;
  resetButton.disabled = active;
  clearLocksButton.disabled = active;
  copyModeSelect.disabled = active;
  copyButton.disabled = active;
  saveSettingsButton.disabled = active;
  savedSettingsNameInput.disabled = active;
  getInputFields().forEach((field) => {
    field.disabled = active;
  });
  syncTwoStageControls();
  generateButton.textContent = active ? "생성 중" : "생성";
  renderSavedSettings();
  renderResultHistory();
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

function syncTwoStageControls() {
  rolesInput.disabled = isGenerating || !twoStageInput.checked;
}

function getInputFields() {
  return [searchTimeInput, searchOperationsInput, seedInput, participantsInput, groupCountInput, rollCountInput, groupNamesInput, groupCapacitiesInput, togetherInput, separateInput, fixedInput, attributesInput, twoStageInput, rolesInput];
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

    if (error.includes("역할") || error.includes("2단계")) {
      markFieldInvalid(rolesInput);
    }

    if (error.includes("정원") || error.includes("그룹별 인원")) {
      markFieldInvalid(groupCapacitiesInput);
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
    maxMs: searchTimeInput.value,
    maxOperations: searchOperationsInput.value,
    rolePreferenceWeight,
    balanceWeights: { ...balanceWeights },
    seed: seedInput.value,
    participants: participantsInput.value,
    participantRecords: participantRecords ? participantRecords.map(normalizeParticipantProfile) : null,
    groupCount: groupCountInput.value,
    rollCount: rollCountInput.value,
    groupNames: groupNamesInput.value,
    groupCapacities: groupCapacitiesInput.value,
    together: togetherInput.value,
    separate: separateInput.value,
    fixed: fixedInput.value,
    attributes: attributesInput.value,
    twoStage: twoStageInput.checked,
    roles: rolesInput.value,
  };
}

function applyDraftSettings(settings) {
  balanceWeights = normalizeBalanceWeights(settings?.balanceWeights || {});
  rolePreferenceWeight = settings?.rolePreferenceWeight ?? 1;
  seedInput.value = settings?.seed || "";
  searchTimeInput.value = settings?.maxMs ?? "3000";
  searchOperationsInput.value = settings?.maxOperations ?? "1000000";
  participantsInput.value = settings?.participants || "";
  participantRecords = Array.isArray(settings?.participantRecords) ? settings.participantRecords.map(normalizeParticipantProfile) : null;
  groupCountInput.value = settings?.groupCount ?? "3";
  rollCountInput.value = settings?.rollCount ?? String(DEFAULT_ROLL_COUNT);
  groupNamesInput.value = settings?.groupNames || "";
  groupCapacitiesInput.value = settings?.groupCapacities || "";
  togetherInput.value = settings?.together || "";
  separateInput.value = settings?.separate || "";
  fixedInput.value = settings?.fixed || "";
  attributesInput.value = settings?.attributes || "";
  twoStageInput.checked = settings?.twoStage === true;
  rolesInput.value = settings?.roles || "";
  syncTwoStageControls();
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
    const raw = storage.getItem(SAVED_SETTINGS_STORAGE_KEY) || storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    savedSettings = Array.isArray(parsed) ? parsed.flatMap((item) => {
      try {
        if (!item || typeof item.id !== "string" || typeof item.name !== "string") return [];
        return [{ ...item, settings: parseSettingsJSON(JSON.stringify({ app: "TeamBuilder", version: 1, settings: item.settings })) }];
      } catch { return []; }
    }) : [];
  } catch {
    savedSettings = [];
  }
}








function getGroupNames(groupCount) {
  const names = splitLines(groupNamesInput.value);
  const count = Number.isInteger(groupCount) && groupCount > 0 && groupCount <= 24 ? groupCount : 0;

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
  const parsedParticipants = getParticipantNames();
  const participants = uniqueItems(parsedParticipants);
  const duplicateCount = parsedParticipants.length - participants.length;
  const groupCount = Number(groupCountInput.value);
  const rollCount = Number(rollCountInput.value || DEFAULT_ROLL_COUNT);
  const attempts = DEFAULT_ATTEMPTS;
  const errors = [];
  const maxMs = Number(searchTimeInput.value), maxOperations = Number(searchOperationsInput.value);
  if (!Number.isInteger(maxMs) || maxMs < 50 || maxMs > 30000 || !Number.isSafeInteger(maxOperations) || maxOperations < 100 || maxOperations > 10000000) errors.push("탐색 제한 범위를 확인하세요.");

  if (participants.length < 2) {
    errors.push("참가자는 최소 2명 이상이어야 합니다.");
  }

  if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > 24) {
    errors.push("그룹 수는 2부터 24 사이의 정수여야 합니다.");
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
  const capacityInput = parseGroupCapacities(groupCapacitiesInput.value, groupCount, participants.length);
  const roleInput = parseRoleList(rolesInput.value, twoStageInput.checked);

  if (twoStageInput.checked && !capacityInput.errors.length && !roleInput.errors.length) {
    errors.push(...validateNestedCapacities(participants.length, groupCount, capacityInput.capacities, roleInput.roleCount, roleInput.requiredRoles.length));
  }

  errors.push(...roleInput.errors, ...capacityInput.errors, ...groupNameErrors, ...together.errors, ...separate.errors, ...fixed.errors, ...attributes.errors);

  return {
    participants,
    maxMs, maxOperations,
    seed: seedInput.value,
    groupCount,
    capacities: capacityInput.capacities,
    twoStage: twoStageInput.checked,
    roles: roleInput.roles,
    requiredRoles: roleInput.requiredRoles, optionalRoles: roleInput.optionalRoles,
    roleCount: roleInput.roleCount,
    rollCount,
    groupNames: getGroupNames(groupCount),
    attempts,
    togetherRules: together.rules,
    separateRules: separate.rules,
    fixedRules: fixed.rules,
    attributeRules: attributes.rules,
    rolePreferenceWeight,
    balanceWeights: { ...balanceWeights },
    profiles: createParticipantProfiles(participants, participantRecords, attributes.rules),
    duplicateCount,
    errors,
  };
}













function cancelledResult() { return { status: "cancelled", error: "배정을 취소했습니다.", audit: [] }; }

function reportSearchProgress(progress) {
  generationProgress.max = Number(searchOperationsInput.value) || 1000000;
  generationProgress.value = progress.operations;
  setStatus(`${progress.operations.toLocaleString()}회 검사 · ${progress.nodes.toLocaleString()}개 탐색 · ${progress.elapsedMs}ms`);
}

function cancelGeneration() {
  if (!isGenerating) return;
  generationCancelled = true;
  cancelActiveComputation?.();
  setStatus("배정을 취소하는 중입니다.");
}

async function computePlan(input, onProgress = reportSearchProgress) {
  const fallback = async () => {
    await waitForResultPaint();
    if (generationCancelled) return cancelledResult();
    return buildPlan({ ...input, maxMs: Math.min(input.maxMs || 3000, 150) }, { onProgress });
  };
  if (typeof Worker === "undefined") return fallback();
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("assignment-worker.js", document.baseURI));
      activeWorker = worker;
      const cleanup = () => { worker.terminate(); if (activeWorker === worker) { activeWorker = null; cancelActiveComputation = null; } };
      cancelActiveComputation = () => { cleanup(); resolve(cancelledResult()); };
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") { onProgress?.(data.progress); return; }
        cleanup(); resolve(data.result);
      };
      worker.onerror = () => { cleanup(); reject(new Error("Worker unavailable")); };
      worker.postMessage(input);
    });
  } catch { return fallback(); }
}

function candidateFingerprint(result) {
  return JSON.stringify({ plan: result.plan.map((group) => [...group].sort()), roles: result.roleAssignments?.map((group) => [...group].sort((a, b) => a.member.localeCompare(b.member))) || null });
}

function keepCandidate(candidates, result, seed, roll) {
  if (!result.plan || !result.quality?.valid || candidates.some((item) => candidateFingerprint(item) === candidateFingerprint(result))) return;
  candidates.push({ id: String(roll), plan: clonePlan(result.plan), roleAssignments: cloneRoleAssignments(result.roleAssignments), quality: { ...result.quality }, score: result.score, seed, roll });
  candidates.sort((a, b) => a.score - b.score || a.roll - b.roll);
  candidates.splice(5);
}

async function buildRolledPlan(input, onProgress = null) {
  const rollCount = input.rollCount || DEFAULT_ROLL_COUNT;

  const candidates = [];
  if (rollCount <= 1) {
    const result = await computePlan(input);
    keepCandidate(candidates, result, input.seed, 1);
    return { ...result, candidates };
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
    if (generationCancelled) return cancelledResult();
    const result = await computePlan({ ...rollInput, seed: `${input.seed}:${rollIndex}` });

    if (result.status === "cancelled") return result;
    if (result.error) {
      lastError = result;
      if (onProgress) {
        onProgress({ current: rollIndex, total: rollCount, successCount, error: result.error });
        await waitForResultPaint();
      }
      continue;
    }

    keepCandidate(candidates, result, `${input.seed}:${rollIndex}`, rollIndex);
    successCount += 1;
    const score = Number.isFinite(result.score) ? result.score : getAttributeBalanceScore(result.plan, input.attributeRules, input.profiles, input.balanceWeights);
    const currentResult = {
      ...result,
      score,
      selectedRoll: rollIndex,
    };
    const shouldReplace =
      !bestResult || score < bestResult.score || (score === bestResult.score && rollIndex < bestResult.selectedRoll);

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
      candidates,
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

  return lastError || computePlan(input);
}

function renderSummary(participantCount, groupCount) {
  summaryParticipants.textContent = String(participantCount);
  summaryGroups.textContent = String(groupCount);
}

function renderDraftStats() {
  renderProfileConfiguration();
  const participants = uniqueItems(getParticipantNames());
  participantCount.textContent = `${participants.length}명`;
  renderSummary(participants.length, Number(groupCountInput.value) || 0);

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


function cloneRoleAssignments(assignments) {
  return assignments ? assignments.map((group) => group.map((entry) => ({ ...entry }))) : null;
}

function clonePlan(plan) {
  return plan ? plan.map((group) => [...group]) : null;
}

function createResultSnapshot() {
  if (!lastPlan) {
    return null;
  }

  return {
    selectedCandidateId,
    quality: lastQuality ? { ...lastQuality } : null,
    signature: resultInputSignature,
    audit: structuredClone(lastAudit),
    plan: clonePlan(lastPlan),
    roleAssignments: cloneRoleAssignments(lastRoleAssignments),
    capacities: lastCapacities ? [...lastCapacities] : null,
    locks: [...lockedAssignments.entries()],
  };
}

function updateUndoButtonState() {
  undoEditButton.disabled = isGenerating || !isResultCurrent() || editHistory.length === 0;
  redoEditButton.disabled = isGenerating || !isResultCurrent() || redoHistory.length === 0;
  exportCSVButton.disabled = isGenerating || !isResultCurrent();
  exportResultJSONButton.disabled = isGenerating || !isResultCurrent();
  copyButton.disabled = isGenerating || !isResultCurrent();
}

function clearEditHistory() {
  editHistory = [];
  redoHistory = [];
  updateUndoButtonState();
}

function pushEditHistory() {
  const snapshot = createResultSnapshot();

  if (!snapshot) {
    return;
  }

  redoHistory = [];
  editHistory.push(snapshot);

  if (editHistory.length > MAX_EDIT_HISTORY) {
    editHistory.shift();
  }

  updateUndoButtonState();
}

function restoreResultSnapshot(snapshot) {
  lastPlan = clonePlan(snapshot.plan);
  lastRoleAssignments = cloneRoleAssignments(snapshot.roleAssignments);
  lastCapacities = snapshot.capacities ? [...snapshot.capacities] : null;
  lockedAssignments = new Map(snapshot.locks);
  resultInputSignature = snapshot.signature;
  selectedCandidateId = snapshot.selectedCandidateId ?? null;
  lastQuality = snapshot.quality ? { ...snapshot.quality } : null;
  lastAudit = structuredClone(snapshot.audit || []);
  renderGroups(lastPlan);
  refreshAuditForCurrentPlan();
  refreshResultConsistency();
  updateUndoButtonState();
}

function travelEditHistory(from, to) {
  if (isGenerating || !isResultCurrent() || !from.length) return false;
  to.push(createResultSnapshot());
  if (to.length > MAX_EDIT_HISTORY) to.shift();
  restoreResultSnapshot(from.pop());
  setStatus("결과 수정 상태를 복원했습니다.", "success");
  return true;
}

function redoLastEdit() { return travelEditHistory(redoHistory, editHistory); }

function undoLastEdit() { return travelEditHistory(editHistory, redoHistory); }

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

  renderSummary(input.participants.length, input.groupCount);
  renderAudit([...extraItems, ...audit], input);
}

function getProtectedMembers(input) {
  const fixed = new Set([...lockedAssignments.keys(), ...input.fixedRules.map((rule) => rule.member)]);
  return new Set(createComponents(input.participants, input.togetherRules).filter((component) => component.members.some((name) => fixed.has(name))).flatMap((component) => component.members));
}

function isMemberProtected(member) { return getProtectedMembers(getInputs()).has(member); }

function toggleMemberLock(member, groupIndex) {
  if (isGenerating || !isResultCurrent() || !lastPlan?.[groupIndex]?.includes(member)) return;
  const groupNames = getGroupNames(lastPlan?.length || 0);
  const wasLocked = lockedAssignments.get(member) === groupIndex;

  scheduleDraftSave();
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


function validateManualPlan(plan, roleAssignments) {
  const input = getInputs();
  input.fixedRules = [...input.fixedRules, ...[...lockedAssignments].map(([member, groupIndex]) => ({ member, groupIndex }))];
  return validateAssignmentResult(plan, input, roleAssignments);
}

function applyManualPlan(plan, roles = lastRoleAssignments) {
  const input = getInputs();
  if (input.twoStage && validateManualPlan(plan, roles).length) {
    const matched = plan.map((group) => findRoleMatching(group, input));
    if (matched.every(Boolean)) roles = matched;
  }
  const errors = validateManualPlan(plan, roles);
  if (errors.length) {
    setStatus(errors[0], "error");
    renderGroups(lastPlan);
    return false;
  }
  pushEditHistory();
  lastPlan = plan;
  lastRoleAssignments = roles;
  lastQuality = scoreAssignment(plan, input, roles);
  selectedCandidateId = null;
  renderGroups(lastPlan);
  refreshAuditForCurrentPlan();
  refreshResultConsistency();
  setStatus("조건을 확인하고 결과를 변경했습니다.", "success");
  return true;
}

function moveMember(member, fromGroupIndex, toGroupIndex) {
  if (isGenerating || !isResultCurrent() || isMemberProtected(member) || fromGroupIndex === toGroupIndex) { renderGroups(lastPlan); return false; }
  const plan = clonePlan(lastPlan);
  const source = plan[fromGroupIndex];
  const target = plan[toGroupIndex];
  if (!source?.includes(member) || !target) { renderGroups(lastPlan); return false; }
  const roles = cloneRoleAssignments(lastRoleAssignments);
  const swapMember = (lastCapacities || roles) ? target.find((name) => !isMemberProtected(name)) : null;
  if ((lastCapacities || roles) && !swapMember) { renderGroups(lastPlan); return false; }
  if (swapMember) {
    source[source.indexOf(member)] = swapMember;
    target[target.indexOf(swapMember)] = member;
    if (roles) {
      roles[fromGroupIndex].find((entry) => entry.member === member).member = swapMember;
      roles[toGroupIndex].find((entry) => entry.member === swapMember).member = member;
    }
  } else {
    source.splice(source.indexOf(member), 1);
    target.push(member);
  }
  if (!applyManualPlan(plan, roles)) return false;
  lockedAssignments.set(member, toGroupIndex);
  renderGroups(lastPlan);
  return true;
}

function swapMembers(member, other) {
  if (isGenerating || !isResultCurrent() || member === other || isMemberProtected(member) || isMemberProtected(other)) return false;
  const from = lastPlan.findIndex((group) => group.includes(member));
  const to = lastPlan.findIndex((group) => group.includes(other));
  if (from < 0 || to < 0 || from === to) return false;
  const plan = clonePlan(lastPlan);
  plan[from][plan[from].indexOf(member)] = other;
  plan[to][plan[to].indexOf(other)] = member;
  const roles = cloneRoleAssignments(lastRoleAssignments);
  if (roles) {
    roles[from].find((entry) => entry.member === member).member = other;
    roles[to].find((entry) => entry.member === other).member = member;
  }
  return applyManualPlan(plan, roles);
}

function parseAttributeEntries(text, weights = false) {
  const entries = splitLines(text).map((line) => {
    const at = line.indexOf("=");
    if (at <= 0 || !line.slice(at + 1).trim()) throw new Error("속성은 항목=값 형식으로 입력하세요.");
    const key = line.slice(0, at).trim(), raw = line.slice(at + 1).trim();
    return [key, weights || /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iu.test(raw) ? Number(raw) : raw];
  });
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error("속성 항목이 중복됩니다.");
  return Object.fromEntries(entries);
}

function renderSelectedProfile() {
  const name = profileMemberSelect.value;
  const profile = createParticipantProfiles(name ? [name] : [], participantRecords)[0];
  profilePreferencesInput.value = profile?.preferences.join(", ") || "";
  profileRestrictionsInput.value = profile?.restrictions.join(", ") || "";
  profileRequiredRoleInput.value = profile?.requiredRole || "";
  profileAttributesInput.value = Object.entries(profile?.attributes || {}).map(([key, value]) => `${key}=${value}`).join("\n");
}

function renderProfileConfiguration() {
  const selected = profileMemberSelect.value;
  profileMemberSelect.replaceChildren();
  const names = uniqueItems(getParticipantNames());
  names.forEach((name) => { const option = document.createElement("option"); option.value = name; option.textContent = name; profileMemberSelect.append(option); });
  profileMemberSelect.value = names.includes(selected) ? selected : (names[0] || "");
  renderSelectedProfile();
  attributeWeightsInput.value = Object.entries(balanceWeights).map(([key, value]) => `${key}=${value}`).join("\n");
  roleWeightInput.value = String(rolePreferenceWeight);
}

function applyProfileConfiguration() {
  if (isGenerating) return;
  try {
    const names = uniqueItems(getParticipantNames()), name = profileMemberSelect.value;
    if (!names.includes(name)) throw new Error("참가자를 먼저 선택하세요.");
    const list = (value) => value.split(/[,;|]/u).map((role) => role.trim()).filter(Boolean);
    const profiles = createParticipantProfiles(names, participantRecords);
    const index = profiles.findIndex((profile) => profile.name === name);
    profiles[index] = normalizeParticipantProfile({ ...profiles[index], preferences: list(profilePreferencesInput.value), restrictions: list(profileRestrictionsInput.value), requiredRole: profileRequiredRoleInput.value, attributes: parseAttributeEntries(profileAttributesInput.value) });
    participantRecords = profiles;
    renderDraftStats(); renderGroups(lastPlan); refreshResultConsistency();
    saveDraft();
    setStatus(`${name}의 프로필을 적용했습니다.`, "success");
  } catch (error) { setStatus(error.message, "error"); }
}

function applyWeightConfiguration() {
  if (isGenerating) return;
  try {
    const weights = normalizeBalanceWeights(parseAttributeEntries(attributeWeightsInput.value, true));
    const roleWeight = Number(roleWeightInput.value);
    if (!Number.isFinite(roleWeight) || roleWeight < 0 || roleWeight > 100) throw new Error("역할 선호 가중치는 0부터 100 사이여야 합니다.");
    balanceWeights = weights; rolePreferenceWeight = roleWeight;
    renderGroups(lastPlan); refreshResultConsistency(); saveDraft(); setStatus("균형 가중치를 적용했습니다.", "success");
  } catch (error) { setStatus(error.message, "error"); }
}

function saveDraft() {
  clearTimeout(draftSaveTimer);
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 2, settings: getDraftSettings(), locks: [...lockedAssignments] }));
    document.querySelector("#draftState").textContent = "자동 저장됨"; return true;
  } catch { document.querySelector("#draftState").textContent = "자동 저장 실패"; return false; }
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  document.querySelector("#draftState").textContent = "저장 중";
  draftSaveTimer = setTimeout(saveDraft, 350);
}

function recoverDraft(raw) {
  if (!raw || raw.length > 2000000) return false;
  try {
    const data = JSON.parse(raw);
    if (data.version !== 2 || !data.settings || typeof data.settings.groupCount !== "string" || typeof data.settings.rollCount !== "string") return false;
    const settings = parseSettingsJSON(JSON.stringify({ app: "TeamBuilder", version: 1, settings: { ...data.settings, groupCount: "3", rollCount: "1", maxMs: "3000", maxOperations: "1000000", locks: [] } }));
    settings.groupCount = data.settings.groupCount; settings.rollCount = data.settings.rollCount;
    for (const key of ["maxMs", "maxOperations"]) if (typeof data.settings[key] === "string") settings[key] = data.settings[key];
    const names = getParticipantNames(settings.participants, settings.participantRecords);
    if (!Array.isArray(data.locks) || data.locks.some((entry) => !Array.isArray(entry) || !names.includes(entry[0]) || !Number.isInteger(entry[1]) || entry[1] < 0 || entry[1] >= Number(settings.groupCount))) return false;
    restoreSettings(settings); lockedAssignments = new Map(data.locks);
    document.querySelector("#draftState").textContent = "초안 복구됨";
    setStatus("자동 저장된 입력을 복구했습니다.", "success"); return true;
  } catch { return false; }
}

function persistResultHistory() {
  try { getStorage()?.setItem(RESULT_HISTORY_KEY, JSON.stringify(resultHistory)); }
  catch { setStatus("결과는 생성되었지만 기록 저장 공간이 부족합니다.", "error"); }
}

function loadResultHistory() {
  try {
    const parsed = JSON.parse(getStorage()?.getItem(RESULT_HISTORY_KEY) || "[]");
    resultHistory = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.createdAt === "string" && item.settings && item.snapshot).slice(0, 20) : [];
  } catch { resultHistory = []; }
}

function recordResultHistory() {
  if (!lastPlan || !lastQuality?.valid) return;
  resultHistory.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(), settings: structuredClone(getDraftSettings()), snapshot: createResultSnapshot(), candidates: structuredClone(resultCandidates) });
  resultHistory.splice(20); persistResultHistory(); renderResultHistory();
}

function restoreResultHistory(id) {
  if (isGenerating) return false;
  const item = resultHistory.find((entry) => entry.id === id);
  if (!item) return false;
  const previous = getDraftSettings();
  try {
    const settings = parseSettingsJSON(JSON.stringify({ app: "TeamBuilder", version: 1, settings: item.settings }));
    applyDraftSettings(settings);
    const input = getInputs(), snapshot = structuredClone(item.snapshot);
    if (!Array.isArray(snapshot.locks) || snapshot.locks.some((entry) => !Array.isArray(entry) || entry.length !== 2 || !input.participants.includes(entry[0]) || !Number.isInteger(entry[1]) || !snapshot.plan?.[entry[1]]?.includes(entry[0]))) throw new Error("기록의 고정 정보를 확인하세요.");
    input.fixedRules.push(...snapshot.locks.map(([member, groupIndex]) => ({ member, groupIndex })));
    const errors = validateAssignmentResult(snapshot.plan, input, snapshot.roleAssignments);
    if (errors.length) throw new Error(errors[0]);
    snapshot.signature = getInputSignature(); snapshot.quality = scoreAssignment(snapshot.plan, input, snapshot.roleAssignments);
    resultCandidates = (Array.isArray(item.candidates) ? item.candidates : []).filter((candidate) => candidate && !validateAssignmentResult(candidate.plan, input, candidate.roleAssignments).length).slice(0, 5).map((candidate) => ({ ...candidate, quality: scoreAssignment(candidate.plan, input, candidate.roleAssignments) }));
    restoreResultSnapshot(snapshot); clearEditHistory(); renderDraftStats(); renderResultHistory();
    setStatus("생성 조건·시드와 결과를 복원했습니다.", "success"); return true;
  } catch (error) { applyDraftSettings(previous); setStatus(error.message || "결과 기록을 복원할 수 없습니다.", "error"); return false; }
}

function renderResultHistory() {
  const list = document.querySelector("#resultHistoryList"); list.replaceChildren();
  resultHistory.forEach((item) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "saved-load";
    button.textContent = `${new Date(item.createdAt).toLocaleString()} · 시드 ${item.settings.seed || "—"} · ${item.snapshot.quality?.total?.toFixed(1) || "—"}점`;
    button.disabled = isGenerating; button.addEventListener("click", () => restoreResultHistory(item.id)); list.append(button);
  });
}

function selectResultCandidate(id) {
  if (!canUseResult()) return false;
  const candidate = resultCandidates.find((item) => item.id === id);
  if (!candidate || !applyManualPlan(clonePlan(candidate.plan), cloneRoleAssignments(candidate.roleAssignments))) return false;
  selectedCandidateId = id; renderCandidates(); return true;
}

function renderCandidates() {
  const list = document.querySelector("#resultCandidatesList"); list.replaceChildren();
  resultCandidates.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "candidate-button";
    button.textContent = `후보 ${index + 1} · 전체 ${candidate.quality.total.toFixed(1)} · 균형 ${candidate.quality.balance.toFixed(1)} · 역할 ${candidate.quality.role.toFixed(1)}`;
    button.setAttribute("aria-pressed", String(candidate.id === selectedCandidateId));
    button.disabled = isGenerating || !isResultCurrent();
    button.addEventListener("click", () => selectResultCandidate(candidate.id)); list.append(button);
  });
}

function renderQuality() {
  qualityStrip.hidden = !lastQuality || !isResultCurrent();
  for (const [key, id] of [["total", "totalQuality"], ["balance", "balanceQuality"], ["role", "roleQuality"]]) document.querySelector(`#${id}`).textContent = lastQuality ? lastQuality[key].toFixed(1) : "—";
}

function matchesParticipant(member, input = getInputs()) {
  const query = document.querySelector("#participantSearch").value.trim().toLocaleLowerCase();
  const profile = input.profiles.find((item) => item.name === member);
  const role = lastRoleAssignments?.flat().find((entry) => entry.member === member)?.role || "";
  return !query || `${member} ${role} ${Object.values(profile?.attributes || {}).join(" ")}`.toLocaleLowerCase().includes(query);
}

function updateBulkControls() {
  document.querySelector("#selectionCount").textContent = `${selectedMembers.size}명 선택`;
  for (const id of ["selectVisibleButton", "bulkTargetSelect", "bulkMoveButton", "bulkLockButton", "bulkUnlockButton"]) document.querySelector(`#${id}`).disabled = isGenerating || !isResultCurrent();
}

function selectVisibleMembers() {
  if (!canUseResult()) return;
  const input = getInputs(), visible = lastPlan.flat().filter((member) => matchesParticipant(member, input));
  const all = visible.every((member) => selectedMembers.has(member));
  visible.forEach((member) => all ? selectedMembers.delete(member) : selectedMembers.add(member));
  renderGroups(lastPlan);
}

function bulkSetLocks(locked) {
  if (!canUseResult() || !selectedMembers.size) return false;
  pushEditHistory();
  selectedMembers.forEach((member) => locked ? lockedAssignments.set(member, lastPlan.findIndex((group) => group.includes(member))) : lockedAssignments.delete(member));
  renderGroups(lastPlan); refreshAuditForCurrentPlan(); saveDraft(); return true;
}

function bulkMoveMembers(targetIndex) {
  if (!canUseResult() || !lastPlan[targetIndex] || !selectedMembers.size) return false;
  const selected = [...selectedMembers], protectedMembers = getProtectedMembers(getInputs());
  const moving = selected.filter((member) => !lastPlan[targetIndex].includes(member));
  const counterparts = selected.filter((member) => lastPlan[targetIndex].includes(member));
  if (!moving.length || selected.some((member) => protectedMembers.has(member))) { setStatus("고정된 참가자는 이동할 수 없습니다.", "error"); return false; }
  const plan = clonePlan(lastPlan);
  if (counterparts.length) {
    if (counterparts.length !== moving.length) { setStatus("교환할 양쪽 참가자를 같은 수로 선택하세요.", "error"); return false; }
    moving.forEach((member, index) => {
      const from = plan.findIndex((group) => group.includes(member)), other = counterparts[index];
      plan[from][plan[from].indexOf(member)] = other;
      plan[targetIndex][plan[targetIndex].indexOf(other)] = member;
    });
  } else moving.forEach((member) => {
    const source = plan.find((group) => group.includes(member)); source.splice(source.indexOf(member), 1); plan[targetIndex].push(member);
  });
  return applyManualPlan(plan, cloneRoleAssignments(lastRoleAssignments));
}

function finishDrag() {
  activeDrag = null;
  groupsGrid.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
}

function completeMemberDrop(targetIndex, other = null) {
  const drag = activeDrag; finishDrag();
  if (!drag || !canUseResult() || !lastPlan[drag.from]?.includes(drag.member) || isMemberProtected(drag.member) || targetIndex === drag.from) { renderGroups(lastPlan); return false; }
  if (other) return swapMembers(drag.member, other);
  const plan = clonePlan(lastPlan), source = plan[drag.from], target = plan[targetIndex];
  if (!target) return false;
  source.splice(source.indexOf(drag.member), 1); target.push(drag.member);
  return applyManualPlan(plan, cloneRoleAssignments(lastRoleAssignments));
}

function renderMember(member, index, plan, memberRoles, groupNames, protectedMembers, current) {
  const item = document.createElement("li"), label = document.createElement("label"), checkbox = document.createElement("input"), name = document.createElement("span"), actions = document.createElement("div"), moveSelect = document.createElement("select"), lockButton = document.createElement("button");
  const locked = lockedAssignments.get(member) === index;
  checkbox.type = "checkbox"; checkbox.checked = selectedMembers.has(member); checkbox.disabled = isGenerating || !current;
  checkbox.setAttribute("aria-label", `${member} 선택`);
  checkbox.addEventListener("change", () => { checkbox.checked ? selectedMembers.add(member) : selectedMembers.delete(member); updateBulkControls(); });
  label.className = "member-label"; label.append(checkbox, name);
  const role = memberRoles.get(member); name.textContent = role ? `${role} — ${member}` : member;
  actions.className = "member-actions"; moveSelect.className = "member-move-select"; moveSelect.setAttribute("aria-label", `${member} 이동할 그룹`);
  groupNames.forEach((groupName, groupIndex) => { const option = document.createElement("option"); option.value = String(groupIndex); option.textContent = groupName; moveSelect.append(option); });
  moveSelect.value = String(index); moveSelect.disabled = isGenerating || !current || protectedMembers.has(member);
  moveSelect.addEventListener("change", (event) => moveMember(member, index, Number(event.target.value)));
  lockButton.className = "lock-button"; lockButton.classList.toggle("is-locked", locked); lockButton.type = "button"; lockButton.disabled = isGenerating || !current;
  lockButton.textContent = locked ? "해제" : "고정"; lockButton.setAttribute("aria-pressed", String(locked)); lockButton.setAttribute("aria-label", locked ? `${member} 고정 해제` : `${member} 현재 그룹에 고정`);
  lockButton.addEventListener("click", () => toggleMemberLock(member, index));
  const swapSelect = document.createElement("select"), placeholder = document.createElement("option");
  swapSelect.className = "member-move-select"; swapSelect.setAttribute("aria-label", `${member} 교환 상대`); placeholder.value = ""; placeholder.textContent = "교환 상대"; swapSelect.append(placeholder);
  let populated = false;
  swapSelect.addEventListener("focus", () => {
    if (populated) return; populated = true;
    plan.forEach((group, targetIndex) => { if (targetIndex === index) return; group.forEach((other) => {
      const option = document.createElement("option"); option.value = other; option.textContent = `${groupNames[targetIndex]}: ${other}`; option.disabled = protectedMembers.has(other); swapSelect.append(option);
    }); });
  });
  swapSelect.disabled = isGenerating || !current || protectedMembers.has(member);
  swapSelect.addEventListener("change", () => { swapMembers(member, swapSelect.value); renderGroups(lastPlan); });
  actions.append(moveSelect, swapSelect, lockButton); item.append(label, actions);
  item.draggable = current && !isGenerating && !protectedMembers.has(member);
  item.dataset.member = member; item.setAttribute("aria-describedby", "dragHelp");
  item.addEventListener("dragstart", (event) => {
    if (!item.draggable) { event.preventDefault(); return; }
    activeDrag = { member, from: index };
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-teambuilder-member", JSON.stringify(activeDrag));
  });
  item.addEventListener("dragend", finishDrag);
  item.addEventListener("dragover", (event) => {
    if (activeDrag && activeDrag.from !== index && !protectedMembers.has(member)) { event.preventDefault(); event.stopPropagation(); item.classList.add("is-drop-target"); }
  });
  item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
  item.addEventListener("drop", (event) => { if (!activeDrag) return; event.preventDefault(); event.stopPropagation(); completeMemberDrop(index, member); renderGroups(lastPlan); });
  return item;
}

function renderGroups(plan, roleAssignments = lastRoleAssignments) {
  renderQuality(); renderCandidates(); groupsGrid.replaceChildren();
  emptyState.classList.toggle("is-hidden", Boolean(plan)); updateUndoButtonState();
  selectedMembers = new Set([...selectedMembers].filter((member) => plan?.some((group) => group.includes(member))));
  updateBulkControls();
  if (!plan) return;
  const input = getInputs(), protectedMembers = getProtectedMembers(input), current = isResultCurrent() && plan === lastPlan;
  const groupNames = getGroupNames(plan.length), target = document.querySelector("#bulkTargetSelect"), chosenTarget = target.value;
  target.replaceChildren(); groupNames.forEach((name, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = name; target.append(option); }); target.value = chosenTarget || "0";
  const distributions = getAttributeDistributions(plan, input.profiles);
  plan.forEach((members, index) => {
    const card = document.createElement("article"), header = document.createElement("header"), title = document.createElement("h3"), count = document.createElement("span"), list = document.createElement("ul");
    card.className = "group-card"; card.dataset.groupIndex = String(index);
    title.textContent = groupNames[index]; count.textContent = `${members.length}명`; card.setAttribute("aria-label", `${groupNames[index]}, ${members.length}명`); list.className = "member-list";
    const groupRoles = roleAssignments?.[index] || [], roles = new Map(groupRoles.map((entry) => [entry.member, entry.role]));
    const ordered = groupRoles.length === members.length && groupRoles.every((entry) => members.includes(entry.member)) ? groupRoles.map((entry) => entry.member) : members;
    ordered.filter((member) => matchesParticipant(member, input)).forEach((member) => list.append(renderMember(member, index, plan, roles, groupNames, protectedMembers, current)));
    card.addEventListener("dragover", (event) => {
      if (activeDrag && activeDrag.from !== index && current && !isGenerating) { event.preventDefault(); card.classList.add("is-drop-target"); }
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
    card.addEventListener("drop", (event) => { if (!activeDrag) return; event.preventDefault(); completeMemberDrop(index); renderGroups(lastPlan); });
    header.append(title, count); card.append(header);
    if (distributions.length) { const summary = document.createElement("p"); summary.className = "attribute-summary"; summary.textContent = distributions.map((entry) => `${entry.dimension}: ${entry.type === "numeric" ? (entry.groups[index].mean?.toFixed(1) ?? "—") : Object.entries(entry.groups[index].values).map(([value, amount]) => `${value} ${amount}`).join(", ")}`).join(" · "); card.append(summary); }
    card.append(list); groupsGrid.append(card);
  });
}

function getSettingsMeta(settings) {
  const participantCount = getParticipantNames(settings.participants, settings.participantRecords || null).length;
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
    detail.textContent = `${meta.participantCount}명 / ${meta.rollCount}회`;
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
  resultCandidates = []; selectedCandidateId = null;
  applyDraftSettings(item.settings);
  activeSavedSettingId = item.id;
  lastPlan = null;
  lastRoleAssignments = null;
  lastCapacities = null;
  lastQuality = null;
  clearFieldValidity();
  rulesPanel.open = false;
  lockedAssignments = new Map(item.settings.locks || []);
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

function getFailureDiagnostic(status) {
  const messages = {
    invalid: ["입력 오류", "명단과 규칙의 입력 형식을 확인하세요."],
    limit: ["탐색 한계", "불가능이 증명된 것은 아닙니다. 탐색 시간·연산량을 늘리거나 조건을 조정하세요."],
    impossible: ["조건 충돌", "현재 조건으로 배정할 수 없습니다. 규칙 영역의 충돌 내용을 확인하세요."],
    error: ["계산 오류", "다시 생성하거나 입력과 탐색 제한을 확인하세요."]
  };
  const [title, detail] = messages[status] || messages.error;
  return { type: status === "limit" ? "warning" : "error", title, detail };
}

function getPublicAudit(items, hasResult = Boolean(lastPlan)) {
  const limit = items.find((item) => item.title === "탐색 한계");
  if (limit) return [getFailureDiagnostic("limit")];
  if (items.some((item) => item.type === "error" || item.title === "생성 실패")) return [{ type: "error", title: "입력 확인", detail: "규칙 영역의 안내를 확인한 뒤 다시 생성하세요." }];
  if (hasResult && !isResultCurrent()) return [{ type: "warning", title: "재생성 필요", detail: "현재 입력과 이전 결과가 다릅니다." }];
  if (hasResult) return [{ type: "ok", title: "배정 완료", detail: "입력 조건을 만족하는 결과입니다." }];
  return [{ type: "ok", title: "대기 중", detail: "결과 없음" }];
}

function renderAudit(items, input = null) {
  ruleFeedback.innerHTML = "";
  items.filter((item) => item.type === "error" || item.type === "warning").forEach((item) => {
    const detail = document.createElement("p");
    detail.textContent = item.detail;
    ruleFeedback.append(detail);
  });
  lastAudit = getPublicAudit(items);
  auditList.innerHTML = "";
  for (const item of lastAudit) {
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

async function generate() {
  if (isGenerating) {
    return;
  }

  generationCancelled = false;
  const previousResult = createResultSnapshot();
  generationProgress.value = 0;
  isGenerating = true;
  setGenerateBusy(true);

  try {
    if (!seedInput.value) seedInput.value = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const input = getInputs();
    applyLockedRules(input);
    renderDraftStats();
    renderSummary(input.participants.length, Number.isFinite(input.groupCount) ? input.groupCount : 0);

    if (input.errors.length) {
      lastPlan = null;
      lastRoleAssignments = null;
      lastCapacities = null;
  lastQuality = null;
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
      setStatus("입력을 확인한 뒤 다시 시도하세요.", "error");
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
        renderGroups(currentResult.plan, currentResult.roleAssignments);
      }

      setResultState(`${current}/${total}`);
      setStatus(
        error ? `${total}회 중 ${current}번째 실패, ${successCount}회 생성` : `${current}번째 결과 표시 중`,
        "default",
      );
    });

    if (generationCancelled || result.status === "cancelled") {
      if (previousResult) restoreResultSnapshot(previousResult);
      else { lastPlan = null; renderGroups(null); renderAudit([]); }
      setResultState("취소됨"); setStatus("배정을 취소했습니다. 다시 생성할 수 있습니다.");
      return;
    }
    if (result.error) {
      lastPlan = null;
      lastRoleAssignments = null;
      lastCapacities = null;
  lastQuality = null;
      lastAudit = result.audit;
      markInvalidFields([result.error]);
      clearEditHistory();
      renderGroups(null);
      const diagnostic = getFailureDiagnostic(result.status);
      renderAudit([diagnostic, ...(result.audit || [])], input);
      setResultState(diagnostic.title, "error");
      setStatus(diagnostic.detail, result.status === "limit" ? "default" : "error");
      return;
    }

    engineRandom = createSeededRandom(`${input.seed}:roles`);
    const assignedRoles = input.twoStage ? result.roleAssignments : null;
    const validationErrors = validateAssignmentResult(result.plan, input, assignedRoles);
    if (validationErrors.length) {
      lastPlan = null; lastRoleAssignments = null;
      renderGroups(null);
      renderAudit(validationErrors.map((detail) => ({ type: "error", title: "결과 검증 실패", detail })));
      setResultState("검증 실패", "error"); setStatus(validationErrors[0], "error");
      return;
    }
    lastPlan = result.plan;
    lastRoleAssignments = assignedRoles;
    lastQuality = result.quality || scoreAssignment(lastPlan, input, lastRoleAssignments);
    resultCandidates = result.candidates || [];
    selectedCandidateId = resultCandidates.find((item) => candidateFingerprint(item) === candidateFingerprint(result))?.id || null;
    lastCapacities = input.capacities ? [...input.capacities] : null;
    resultInputSignature = getInputSignature();
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
    recordResultHistory(); saveDraft();
  } catch (error) {
    if (previousResult) restoreResultSnapshot(previousResult);
    else { lastPlan = null; renderGroups(null); }
    renderAudit([getFailureDiagnostic("error")]);
    setResultState("계산 오류", "error"); setStatus(error.message || "배정 계산 중 오류가 발생했습니다.", "error");
  } finally {
    isGenerating = false;
    setGenerateBusy(false);
    if (lastPlan) {
      renderGroups(lastPlan);
    }
  }
}

function formatCopyResult(plan, groupNames, auditItems, mode, roleAssignments = null) {
  const displayedPlan = roleAssignments ? plan.map((group, index) => {
    const roles = new Map((roleAssignments[index] || []).map((entry) => [entry.member, entry.role]));
    const ordered = (roleAssignments[index] || []).map((entry) => entry.member);
    return (ordered.length === group.length ? ordered : group).map((member) => roles.get(member) ? `${roles.get(member)} — ${member}` : member);
  }) : plan;
  const groupedText = displayedPlan
    .map((group, index) => `${groupNames[index]}\n${group.map((member) => `- ${member}`).join("\n")}`)
    .join("\n\n");
  const namesOnlyText = plan.map((group) => group.join("\n")).join("\n\n");
  const numberedText = displayedPlan.map((group, index) => `${index + 1}. ${groupNames[index]}: ${group.join(", ")}`).join("\n");
  const chatText = displayedPlan.map((group, index) => `[${groupNames[index]}] ${group.join(", ")}`).join("\n");
  const compactText = displayedPlan.map((group, index) => `${groupNames[index]}: ${group.join(", ")}`).join(" / ");
  const auditText = getPublicAudit(auditItems, true).map((item) => `- ${item.title}: ${item.detail}`).join("\n");

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

function encodeCSVCell(value) {
  const raw = String(value);
  const text = /^[\s]*[=+@-]|^[\t\r\n]/u.test(raw) ? "'" + raw : raw;
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildResultCSV(plan, groupNames, roleAssignments = null, options = null) {
  if (options) {
    const profiles = new Map((options.profiles || []).map((profile) => [profile.name, profile]));
    const dimensions = [...new Set((options.profiles || []).flatMap((profile) => Object.keys(profile.attributes || {})))].sort();
    const rows = [["group", "role", "name", ...dimensions.map((key) => `attr:${key}`), "preferences", "restrictions", "requiredRole", "locked", "seed", "quality"]];
    plan.forEach((group, index) => {
      const roles = new Map((roleAssignments?.[index] || []).map((entry) => [entry.member, entry.role]));
      group.forEach((member) => {
        const profile = profiles.get(member);
        rows.push([groupNames[index], roles.get(member) || "", member, ...dimensions.map((key) => profile?.attributes?.[key] ?? ""), (profile?.preferences || []).join("|"), (profile?.restrictions || []).join("|"), profile?.requiredRole || "", options.locks?.has(member) ? "true" : "false", options.seed || "", options.quality?.total?.toFixed(2) || ""]);
      });
    });
    return rows.map((row) => row.map(encodeCSVCell).join(",")).join("\r\n") + "\r\n";
  }
  const rows = [roleAssignments ? ["group", "role", "name"] : ["group", "name"]];
  plan.forEach((group, index) => {
    const roleByMember = new Map((roleAssignments?.[index] || []).map((entry) => [entry.member, entry.role]));
    const orderedMembers = roleAssignments?.[index]?.map((entry) => entry.member) || group;
    orderedMembers.forEach((member) => {
      rows.push(roleAssignments ? [groupNames[index], roleByMember.get(member) || "", member] : [groupNames[index], member]);
    });
  });
  return rows.map((row) => row.map(encodeCSVCell).join(",")).join("\r\n") + "\r\n";
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canUseResult() {
  if (isGenerating || !lastPlan || !isResultCurrent()) {
    setStatus(lastPlan ? "조건이 변경되었습니다. 결과를 다시 생성하세요." : "사용할 결과가 없습니다.", "error");
    refreshResultConsistency();
    return false;
  }
  return true;
}

function exportResultCSV() {
  if (!canUseResult()) {
    return;
  }
  const csv = buildResultCSV(lastPlan, getGroupNames(lastPlan.length), lastRoleAssignments, { profiles: getInputs().profiles, seed: seedInput.value, locks: lockedAssignments, quality: lastQuality });
  downloadText("TeamBuilder-result.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  setStatus("CSV 결과를 내보냈습니다.", "success");
}

function buildResultJSON() {
  const input = getInputs(), names = getGroupNames(lastPlan.length);
  const profiles = new Map(input.profiles.map((profile) => [profile.name, profile]));
  return JSON.stringify({ app: "TeamBuilder", version: 2, type: "result", settings: getDraftSettings(), seed: input.seed, quality: lastQuality, candidates: resultCandidates, distributions: getAttributeDistributions(lastPlan, input.profiles), groups: lastPlan.map((group, index) => ({ name: names[index], members: group.map((member) => ({ ...profiles.get(member), role: lastRoleAssignments?.[index]?.find((entry) => entry.member === member)?.role || "", locked: lockedAssignments.has(member) })) })) }, null, 2);
}

function exportResultJSON() {
  if (!canUseResult()) return;
  downloadText("TeamBuilder-result.json", buildResultJSON(), "application/json;charset=utf-8");
  setStatus("JSON 결과를 내보냈습니다.", "success");
}

async function copyResult() {
  if (!canUseResult()) {
    return;
  }

  const groupNames = getGroupNames(lastPlan.length);
  const text = formatCopyResult(lastPlan, groupNames, lastAudit, copyModeSelect.value, lastRoleAssignments);

  try {
    await navigator.clipboard.writeText(text);
    setStatus("결과를 클립보드에 복사했습니다.", "success");
  } catch {
    setStatus("브라우저에서 클립보드 접근을 허용하지 않았습니다.", "error");
  }
}

function buildSettingsJSON(settings = getDraftSettings()) {
  return JSON.stringify({ app: "TeamBuilder", version: 2, settings, locks: [...lockedAssignments] }, null, 2);
}

function parseSettingsJSON(text) {
  if (typeof text !== "string" || text.length > 2000000) throw new Error("설정 파일이 너무 큽니다.");
  const data = JSON.parse(text.replace(/^\uFEFF/u, ""));
  if (!data || typeof data !== "object" || Array.isArray(data) || data.app !== "TeamBuilder" || ![1, 2].includes(data.version)) {
    throw new Error("지원하는 TeamBuilder 설정 JSON이 아닙니다.");
  }
  const source = data.settings;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("JSON 설정 형식을 확인하세요.");
  const settings = {};
  const textFields = ["seed", "participants", "groupNames", "groupCapacities", "together", "separate", "fixed", "attributes", "roles"];
  for (const key of textFields) {
    if (source[key] !== undefined && typeof source[key] !== "string") throw new Error("JSON 설정 입력값의 형식을 확인하세요.");
    settings[key] = source[key] || "";
  }
  for (const [key, fallback] of [["groupCount", "3"], ["rollCount", "1"]]) {
    if (source[key] !== undefined && typeof source[key] !== "string" && !(typeof source[key] === "number" && Number.isSafeInteger(source[key]))) {
      throw new Error("JSON 배정 설정의 형식을 확인하세요.");
    }
    settings[key] = source[key] === undefined ? fallback : String(source[key]);
  }
  if (!/^\d+$/u.test(settings.groupCount) || Number(settings.groupCount) < 2 || Number(settings.groupCount) > 24 || !/^\d+$/u.test(settings.rollCount) || Number(settings.rollCount) < 1 || Number(settings.rollCount) > MAX_ROLL_COUNT) throw new Error("JSON 그룹 수 또는 돌리기 범위를 확인하세요.");
  for (const [key, fallback, min, max] of [["maxMs", "3000", 50, 30000], ["maxOperations", "1000000", 100, 10000000]]) {
    const value = source[key] ?? fallback;
    if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/u.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error("JSON 탐색 제한을 확인하세요.");
    settings[key] = String(value);
  }
  if (settings.seed.length > 256) throw new Error("시드는 256자 이하여야 합니다.");
  if (source.twoStage !== undefined && typeof source.twoStage !== "boolean") throw new Error("JSON 2단계 배정 설정의 형식을 확인하세요.");
  settings.twoStage = source.twoStage === true;
  settings.balanceWeights = normalizeBalanceWeights(source.balanceWeights ?? {});
  if (source.rolePreferenceWeight !== undefined && (typeof source.rolePreferenceWeight !== "number" || !Number.isFinite(source.rolePreferenceWeight) || source.rolePreferenceWeight < 0 || source.rolePreferenceWeight > 100)) throw new Error("역할 선호 가중치를 확인하세요.");
  settings.rolePreferenceWeight = source.rolePreferenceWeight ?? 1;
  settings.participantRecords = null;
  if (source.participantRecords != null) {
    if (!Array.isArray(source.participantRecords) || source.participantRecords.some((record) => !record || typeof record.name !== "string" || !record.name.trim() || (record.role !== undefined && typeof record.role !== "string"))) {
      throw new Error("JSON 참가자 정보의 형식을 확인하세요.");
    }
    if (source.participantRecords.some((record) => Array.isArray(record) || /[\u0000-\u001f\u007f]/u.test(record.name)) || duplicateItems(source.participantRecords.map((record) => record.name.trim())).length) throw new Error("JSON 참가자 이름을 확인하세요.");
    settings.participantRecords = source.participantRecords.map(normalizeParticipantProfile);
    if (JSON.stringify(getParticipantNames(settings.participants, settings.participantRecords)) !== JSON.stringify(settings.participantRecords.map((record) => record.name))) {
      throw new Error("JSON 참가자 정보와 명단이 일치하지 않습니다.");
    }
  }
  const locks = data.locks ?? source.locks ?? [];
  const names = getParticipantNames(settings.participants, settings.participantRecords);
  if (!Array.isArray(locks) || locks.some((entry) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !names.includes(entry[0]) || !Number.isInteger(entry[1]) || entry[1] < 0 || entry[1] >= Number(settings.groupCount)) || new Set(locks.map(([member]) => member)).size !== locks.length) throw new Error("JSON 고정 정보를 확인하세요.");
  settings.locks = locks.map((entry) => [...entry]);
  return settings;
}

function restoreSettings(settings) {
  resultCandidates = []; selectedCandidateId = null;
  applyDraftSettings(settings);
  activeSavedSettingId = null;
  savedSettingsNameInput.value = "";
  lastPlan = null;
  lastRoleAssignments = null;
  lastCapacities = null;
  lastQuality = null;
  lastAudit = [];
  lockedAssignments = new Map(settings.locks || []);
  clearEditHistory();
  clearFieldValidity();
  rulesPanel.open = false;
  renderDraftStats();
  renderGroups(null);
  renderAudit([]);
  renderSavedSettings();
  setResultState("대기");
}

function exportSettingsJSON() {
  if (isGenerating) return;
  downloadText("TeamBuilder-settings.json", buildSettingsJSON(), "application/json;charset=utf-8");
  setStatus("설정을 내보냈습니다.", "success");
}

async function importSettingsJSON(event) {
  const file = event.target.files?.[0];
  if (!file || isGenerating) return;
  try {
    if (file.size > 2000000) throw new Error("파일은 2MB 이하여야 합니다.");
    const settings = parseSettingsJSON(await file.text());
    if (isGenerating) return;
    restoreSettings(settings);
    setStatus("설정을 가져왔습니다.", "success");
  } catch {
    setStatus("설정 JSON 형식을 확인하세요.", "error");
  } finally {
    event.target.value = "";
  }
}

function reset() {
  clearTimeout(draftSaveTimer);
  try { getStorage()?.removeItem(DRAFT_STORAGE_KEY); } catch {}
  document.querySelector("#draftState").textContent = "";
  resultCandidates = []; selectedCandidateId = null;
  applyDraftSettings(null);
  rulesPanel.open = false;
  clearFieldValidity();
  lastPlan = null;
  lastRoleAssignments = null;
  lastCapacities = null;
  lastQuality = null;
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
  let draft = null;
  try { draft = getStorage()?.getItem(DRAFT_STORAGE_KEY); } catch {}
  loadSavedSettings();
  reset();
  loadResultHistory(); renderResultHistory();
  recoverDraft(draft);
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

importCSVButton.addEventListener("click", () => participantCSVFile.click());
participantCSVFile.addEventListener("change", importParticipantCSV);
importJSONButton.addEventListener("click", () => settingsJSONFile.click());
exportJSONButton.addEventListener("click", exportSettingsJSON);
settingsJSONFile.addEventListener("change", importSettingsJSON);
twoStageInput.addEventListener("change", syncTwoStageControls);
generateButton.addEventListener("click", generate);
cancelButton.addEventListener("click", cancelGeneration);
resetButton.addEventListener("click", () => reset());
undoEditButton.addEventListener("click", undoLastEdit);
redoEditButton.addEventListener("click", redoLastEdit);
profileMemberSelect.addEventListener("change", renderSelectedProfile);
profileApplyButton.addEventListener("click", applyProfileConfiguration);
weightsApplyButton.addEventListener("click", applyWeightConfiguration);
document.querySelector("#participantSearch").addEventListener("input", () => renderGroups(lastPlan));
document.querySelector("#selectVisibleButton").addEventListener("click", selectVisibleMembers);
document.querySelector("#bulkLockButton").addEventListener("click", () => bulkSetLocks(true));
document.querySelector("#bulkUnlockButton").addEventListener("click", () => bulkSetLocks(false));
document.querySelector("#bulkMoveButton").addEventListener("click", () => bulkMoveMembers(Number(document.querySelector("#bulkTargetSelect").value)));
clearLocksButton.addEventListener("click", clearLockedAssignments);
copyButton.addEventListener("click", copyResult);
exportCSVButton.addEventListener("click", exportResultCSV);
exportResultJSONButton.addEventListener("click", exportResultJSON);
saveSettingsButton.addEventListener("click", saveCurrentSettings);
updateSettingsButton.addEventListener("click", updateCurrentSavedSetting);
[participantsInput, groupNamesInput, togetherInput, separateInput, fixedInput, attributesInput].forEach((input) => {
  input.addEventListener("keydown", handleInputKeydown);
});
groupCountInput.addEventListener("keydown", handleSingleLineKeydown);
groupCapacitiesInput.addEventListener("keydown", handleSingleLineKeydown);
rollCountInput.addEventListener("keydown", handleSingleLineKeydown);
savedSettingsNameInput.addEventListener("keydown", handleSavedNameKeydown);
getInputFields().forEach((input) => {
  input.addEventListener("input", () => {
    if (input === participantsInput && participantRecords) {
      const existing = new Map(participantRecords.map((record) => [record.name, record]));
      participantRecords = uniqueItems(splitParticipants(participantsInput.value)).map((name) => existing.get(name) || normalizeParticipantProfile({ name }));
    }
    scheduleDraftSave();
    syncTwoStageControls();
    input.removeAttribute("aria-invalid");
    renderDraftStats();
    if (lastPlan) {
      if (input === groupNamesInput) {
        renderGroups(lastPlan);
      }
      refreshResultConsistency();
    }
  });
});

globalThis.addEventListener?.("pagehide", saveDraft);

boot();
