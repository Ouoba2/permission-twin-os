const presetSelect = document.querySelector("#presetSelect");
const profileSelect = document.querySelector("#profileSelect");
const workspaceSelect = document.querySelector("#workspaceSelect");
const pinInput = document.querySelector("#pinInput");
const unlockButton = document.querySelector("#unlockButton");
const lockButton = document.querySelector("#lockButton");
const sessionBanner = document.querySelector("#sessionBanner");
const agentForm = document.querySelector("#agentForm");
const agentNameInput = document.querySelector("#agentNameInput");
const agentDescriptionInput = document.querySelector("#agentDescriptionInput");
const agentList = document.querySelector("#agentList");
const onboardingGrid = document.querySelector("#onboardingGrid");
const demoGrid = document.querySelector("#demoGrid");
const titleInput = document.querySelector("#titleInput");
const typeSelect = document.querySelector("#typeSelect");
const payloadInput = document.querySelector("#payloadInput");
const reasoningInput = document.querySelector("#reasoningInput");
const actionForm = document.querySelector("#actionForm");
const refreshButton = document.querySelector("#refreshButton");
const exportButton = document.querySelector("#exportButton");
const approveButton = document.querySelector("#approveButton");
const denyButton = document.querySelector("#denyButton");
const policyForm = document.querySelector("#policyForm");
const savePolicyButton = document.querySelector("#savePolicyButton");
const riskForm = document.querySelector("#riskForm");
const saveRiskButton = document.querySelector("#saveRiskButton");
const previewCard = document.querySelector("#previewCard");
const statsGrid = document.querySelector("#statsGrid");
const insightStrip = document.querySelector("#insightStrip");
const queueList = document.querySelector("#queueList");
const approveAllQueueButton = document.querySelector("#approveAllQueueButton");
const denyAllQueueButton = document.querySelector("#denyAllQueueButton");
const demoRunsList = document.querySelector("#demoRunsList");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const actionsList = document.querySelector("#actionsList");
const memoryKindFilter = document.querySelector("#memoryKindFilter");
const memoryList = document.querySelector("#memoryList");
const snapshotList = document.querySelector("#snapshotList");

let state = {
  presets: [],
  actions: [],
  memories: [],
  snapshots: [],
  profiles: [],
  activeProfileId: "concierge",
  workspaces: [],
  activeWorkspaceId: "main",
  agents: [],
  stats: {},
  policy: {},
  riskRules: {},
  queue: [],
  session: { unlocked: false },
  onboarding: [],
  demos: [],
  demoRuns: [],
  currentAction: null,
};

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function renderPresets() {
  presetSelect.innerHTML = "";
  state.presets.forEach((preset, index) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.title;
    presetSelect.appendChild(option);
    if (index === 0) {
      applyPreset(preset.id);
    }
  });
}

function renderProfiles() {
  profileSelect.innerHTML = "";
  state.profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} - ${profile.style}`;
    if (profile.id === state.activeProfileId) {
      option.selected = true;
    }
    profileSelect.appendChild(option);
  });
}

function renderOnboarding() {
  onboardingGrid.innerHTML = "";
  state.onboarding.forEach((item) => {
    const card = document.createElement("article");
    card.className = "onboarding-card";
    card.innerHTML = `<h3>${item.title}</h3><p>${item.text}</p>`;
    onboardingGrid.appendChild(card);
  });
}

function renderDemos() {
  demoGrid.innerHTML = "";
  state.demos.forEach((demo) => {
    const card = document.createElement("article");
    card.className = "demo-card";
    card.innerHTML = `
      <h3>${demo.title}</h3>
      <p>${demo.description}</p>
      <button type="button" data-scenario-id="${demo.id}">Lancer la demo</button>
    `;
    demoGrid.appendChild(card);
  });
}

function renderWorkspaces() {
  workspaceSelect.innerHTML = "";
  state.workspaces.forEach((workspace) => {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = `${workspace.name}`;
    if (workspace.id === state.activeWorkspaceId) {
      option.selected = true;
    }
    workspaceSelect.appendChild(option);
  });
}

function renderAgents() {
  if (!agentList) {
    return;
  }
  agentList.innerHTML = "";
  state.agents.forEach((agent) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${agent.name}</h3>
      <p>${agent.description || "Aucune description"}</p>
      <p>Token: <code>${agent.token}</code></p>
      <p>Cree le: ${new Date(agent.createdAt).toLocaleString("fr-FR")}</p>
    `;
    agentList.appendChild(item);
  });
}

function applyPreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) {
    return;
  }
  titleInput.value = preset.title;
  typeSelect.value = preset.actionType;
  payloadInput.value = JSON.stringify(preset.payload, null, 2);
  reasoningInput.value = preset.description;
}

function renderStats() {
  statsGrid.innerHTML = "";
  const items = [
    ["Actions", state.stats.totalActions || 0],
    ["En attente", state.stats.simulated || 0],
    ["Validees", state.stats.approved || 0],
    ["Refusees", state.stats.denied || 0],
    ["Memoires", state.stats.memories || 0],
    ["Snapshots", state.stats.snapshots || 0],
  ];

  items.forEach(([label, value]) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    statsGrid.appendChild(wrapper);
  });

  const topType = state.stats.topActionType?.type || "none";
  const topCount = state.stats.topActionType?.count || 0;
  const lastSeen = state.stats.lastActivityAt
    ? new Date(state.stats.lastActivityAt).toLocaleString("fr-FR")
    : "Aucune";

  insightStrip.innerHTML = `
    <div class="chip">Approval rate ${state.stats.approvalRate || 0}%</div>
    <div class="chip">Escalades haut risque ${state.stats.highRisk || 0}</div>
    <div class="chip">Action dominante ${topType} (${topCount})</div>
    <div class="chip">Derniere activite ${lastSeen}</div>
  `;
}

function renderPolicy() {
  policyForm.innerHTML = "";
  Object.entries(state.policy || {}).forEach(([actionType, mode]) => {
    const row = document.createElement("div");
    row.className = "policy-row";
    row.innerHTML = `
      <label for="policy-${actionType}">${actionType}</label>
      <select id="policy-${actionType}" data-action-type="${actionType}">
        <option value="allow"${mode === "allow" ? " selected" : ""}>allow</option>
        <option value="ask"${mode === "ask" ? " selected" : ""}>ask</option>
        <option value="deny"${mode === "deny" ? " selected" : ""}>deny</option>
      </select>
    `;
    policyForm.appendChild(row);
  });
}

function renderRiskRules() {
  riskForm.innerHTML = "";
  Object.entries(state.riskRules || {}).forEach(([actionType, score]) => {
    const row = document.createElement("div");
    row.className = "policy-row";
    row.innerHTML = `
      <label for="risk-${actionType}">${actionType}</label>
      <input id="risk-${actionType}" type="number" min="0" max="1" step="0.01" value="${score}" data-risk-type="${actionType}" />
    `;
    riskForm.appendChild(row);
  });
}

function renderActions() {
  actionsList.innerHTML = "";
  state.actions.forEach((action) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${action.title}</h3>
      <p>Type: ${action.actionType} | Statut: ${action.status}</p>
      <p class="tone-${action.risk.level}">Risque: ${action.risk.level} (${Math.round(action.risk.score * 100)}%)</p>
      <p>${action.twin.summary}</p>
      ${action.execution ? `<pre>${action.execution.message}</pre>` : ""}
      <div class="list-actions">
        <button type="button" class="button-secondary" data-open-action="${action.id}">Voir</button>
      </div>
    `;
    actionsList.appendChild(item);
  });
}

function renderQueue() {
  queueList.innerHTML = "";
  if (state.queue.length === 0) {
    queueList.innerHTML = `<div class="card-empty">Aucune action en attente.</div>`;
    return;
  }
  state.queue.forEach((action) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${action.title}</h3>
      <p>${action.actionType} | risque ${action.risk.level}</p>
      <p>${action.twin.summary}</p>
      <div class="list-actions">
        <button type="button" data-open-action="${action.id}" class="button-secondary">Ouvrir</button>
        <button type="button" data-queue-approve="${action.id}">Approuver</button>
        <button type="button" data-queue-deny="${action.id}" class="button-secondary">Refuser</button>
      </div>
    `;
    queueList.appendChild(item);
  });
}

function renderDemoRuns() {
  demoRunsList.innerHTML = "";
  if (!state.demoRuns.length) {
    demoRunsList.innerHTML = `<div class="card-empty">Aucune demo n'a encore ete lancee.</div>`;
    return;
  }
  state.demoRuns.forEach((run) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${run.label}</h3>
      <p>Scenario: ${run.scenarioId}</p>
      <p>Profil: ${run.profileId} | Workspace: ${run.workspaceId}</p>
      <p>Actions: ${run.actionCount} | Executees: ${run.executedCount} | Queue: ${run.queuedCount}</p>
      <p>${new Date(run.at).toLocaleString("fr-FR")}</p>
    `;
    demoRunsList.appendChild(item);
  });
}

function renderMemories() {
  memoryList.innerHTML = "";
  state.memories.forEach((memory) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${memory.title}</h3>
      <p>${memory.kind} | score ${Math.round(memory.score * 100)}%</p>
      <p>${memory.content}</p>
    `;
    memoryList.appendChild(item);
  });
}

function renderSnapshots() {
  snapshotList.innerHTML = "";
  state.snapshots.forEach((snapshot) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <h3>${snapshot.phase.toUpperCase()} - ${snapshot.actionType}</h3>
      <p>Profil: ${snapshot.activeProfileId}</p>
      <p>Actions: ${snapshot.stats.actions} | Memoires: ${snapshot.stats.memories}</p>
      <p>${new Date(snapshot.at).toLocaleString("fr-FR")}</p>
    `;
    snapshotList.appendChild(item);
  });
}

function renderPreview() {
  const action = state.currentAction;
  if (!action) {
    previewCard.textContent = "Aucun preflight actif.";
    approveButton.disabled = true;
    denyButton.disabled = true;
    return;
  }

  previewCard.innerHTML = `
    <strong>${action.title}</strong><br />
    Type: ${action.actionType}<br />
    Statut: ${action.status}<br />
    Risque: <span class="tone-${action.risk.level}">${action.risk.level}</span><br />
    Escalade humaine: ${action.requiresApproval ? "oui" : "non"}<br />
    Intention: ${action.twin.summary}<br />
    Cible: ${action.twin.target || "n/a"}<br />
    Raisonnement: ${action.reasoning || "Aucun"}
    ${action.execution ? `<pre>${action.execution.message}</pre>` : ""}
  `;

  const actionable = action.status === "simulated";
  approveButton.disabled = !actionable;
  denyButton.disabled = !actionable;
}

function renderAll() {
  sessionBanner.textContent = state.session.unlocked
    ? `Runtime actif | Workspace: ${state.activeWorkspaceId}`
    : "Runtime verrouille. Debloque la session pour executer ou exporter.";
  renderOnboarding();
  renderDemos();
  renderAgents();
  renderStats();
  renderQueue();
  renderDemoRuns();
  renderPolicy();
  renderRiskRules();
  renderActions();
  renderMemories();
  renderSnapshots();
  renderPreview();
}

async function loadBootstrap() {
  const data = await fetchJson("/api/bootstrap");
  state = {
    ...state,
    presets: data.presets,
    profiles: data.profiles,
    activeProfileId: data.activeProfileId,
    workspaces: data.workspaces,
    activeWorkspaceId: data.activeWorkspaceId,
    agents: data.agents || [],
    actions: data.actions,
    queue: data.queue,
    memories: data.memories,
    snapshots: data.snapshots,
    stats: data.stats,
    policy: data.policy,
    riskRules: data.riskRules,
    session: data.session,
    onboarding: data.onboarding,
    demos: data.demos || [],
    demoRuns: data.demoRuns || [],
  };
  renderProfiles();
  renderWorkspaces();
  renderPresets();
  renderAll();
}

async function refreshState() {
  const params = new URLSearchParams({
    query: searchInput.value || "",
    status: statusFilter.value || "all",
    memoryKind: memoryKindFilter.value || "all",
  });
  const data = await fetchJson(`/api/state?${params.toString()}`);
  state.actions = data.actions;
  state.queue = data.queue;
  state.memories = data.memories;
  state.snapshots = data.snapshots;
  state.profiles = data.profiles;
  state.activeProfileId = data.activeProfileId;
  state.workspaces = data.workspaces;
  state.activeWorkspaceId = data.activeWorkspaceId;
  state.agents = data.agents || [];
  state.stats = data.stats;
  state.policy = data.policy;
  state.riskRules = data.riskRules;
  state.session = data.session;
  state.onboarding = data.onboarding;
  state.demos = data.demos || [];
  state.demoRuns = data.demoRuns || [];
  if (state.currentAction) {
    state.currentAction = state.actions.find((item) => item.id === state.currentAction.id) || null;
  }
  renderAll();
}

async function runDemoScenario(scenarioId) {
  if (!state.session.unlocked) {
    previewCard.textContent = "Debloque la session avant de lancer un scenario.";
    return;
  }
  try {
    const result = await fetchJson("/api/demo/run", {
      method: "POST",
      body: JSON.stringify({ scenarioId }),
    });
    state.currentAction = result.actions[result.actions.length - 1] || null;
    await refreshState();
  } catch (error) {
    previewCard.textContent = error.message;
  }
}

function focusAction(actionId) {
  state.currentAction = state.actions.find((item) => item.id === actionId) || state.queue.find((item) => item.id === actionId) || null;
  renderPreview();
}

actionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.session.unlocked) {
    previewCard.textContent = "Debloque la session avant de lancer un preflight.";
    return;
  }
  try {
    const action = await fetchJson("/api/actions", {
      method: "POST",
      body: JSON.stringify({
        title: titleInput.value.trim(),
        actionType: typeSelect.value,
        payload: JSON.parse(payloadInput.value),
        reasoning: reasoningInput.value.trim(),
      }),
    });
    state.currentAction = action;
    await refreshState();
  } catch (error) {
        previewCard.textContent = error.message;
  }
});

presetSelect.addEventListener("change", () => applyPreset(presetSelect.value));
profileSelect.addEventListener("change", async () => {
  await fetchJson("/api/profile", {
    method: "POST",
    body: JSON.stringify({ profileId: profileSelect.value }),
  });
  await refreshState();
});
workspaceSelect.addEventListener("change", async () => {
  await fetchJson("/api/workspace", {
    method: "POST",
    body: JSON.stringify({ workspaceId: workspaceSelect.value }),
  });
  await refreshState();
});
refreshButton.addEventListener("click", refreshState);
searchInput.addEventListener("input", refreshState);
statusFilter.addEventListener("change", refreshState);
memoryKindFilter.addEventListener("change", refreshState);
demoGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-scenario-id]");
  if (!button) {
    return;
  }
  await runDemoScenario(button.dataset.scenarioId);
});

queueList.addEventListener("click", async (event) => {
  const approveTarget = event.target.closest("button[data-queue-approve]");
  if (approveTarget) {
    state.currentAction = await fetchJson(`/api/actions/${approveTarget.dataset.queueApprove}/approve`, {
      method: "POST",
    });
    await refreshState();
    return;
  }

  const denyTarget = event.target.closest("button[data-queue-deny]");
  if (denyTarget) {
    state.currentAction = await fetchJson(`/api/actions/${denyTarget.dataset.queueDeny}/deny`, {
      method: "POST",
      body: JSON.stringify({ reason: "Denied from queue." }),
    });
    await refreshState();
    return;
  }

  const openTarget = event.target.closest("button[data-open-action]");
  if (openTarget) {
    focusAction(openTarget.dataset.openAction);
  }
});

actionsList.addEventListener("click", (event) => {
  const openTarget = event.target.closest("button[data-open-action]");
  if (!openTarget) {
    return;
  }
  focusAction(openTarget.dataset.openAction);
});

approveButton.addEventListener("click", async () => {
  if (!state.currentAction) {
    return;
  }
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  state.currentAction = await fetchJson(`/api/actions/${state.currentAction.id}/approve`, {
    method: "POST",
  });
  await refreshState();
});

denyButton.addEventListener("click", async () => {
  if (!state.currentAction) {
    return;
  }
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  state.currentAction = await fetchJson(`/api/actions/${state.currentAction.id}/deny`, {
    method: "POST",
    body: JSON.stringify({ reason: "Escalated and denied from dashboard." }),
  });
  await refreshState();
});

approveAllQueueButton.addEventListener("click", async () => {
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  await fetchJson("/api/queue/approve-all", {
    method: "POST",
  });
  await refreshState();
});

denyAllQueueButton.addEventListener("click", async () => {
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  await fetchJson("/api/queue/deny-all", {
    method: "POST",
    body: JSON.stringify({ reason: "Denied from bulk queue action." }),
  });
  await refreshState();
});

agentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.session.unlocked) {
    previewCard.textContent = "Debloque la session avant de creer un agent.";
    return;
  }

  try {
    await fetchJson("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        name: agentNameInput.value.trim(),
        description: agentDescriptionInput.value.trim(),
      }),
    });
    agentNameInput.value = "";
    agentDescriptionInput.value = "";
    await refreshState();
  } catch (error) {
    previewCard.textContent = error.message;
  }
});

savePolicyButton.addEventListener("click", async () => {
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  const payload = {};
  policyForm.querySelectorAll("select[data-action-type]").forEach((select) => {
    payload[select.dataset.actionType] = select.value;
  });

  await fetchJson("/api/policy", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  await refreshState();
});

saveRiskButton.addEventListener("click", async () => {
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  const payload = {};
  riskForm.querySelectorAll("input[data-risk-type]").forEach((input) => {
    payload[input.dataset.riskType] = Number(input.value);
  });

  await fetchJson("/api/risk-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  await refreshState();
});

exportButton.addEventListener("click", async () => {
  if (!state.session.unlocked) {
    previewCard.textContent = "Session verrouillee.";
    return;
  }
  const data = await fetchJson("/api/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `permission-twin-audit-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

unlockButton.addEventListener("click", async () => {
  try {
    await fetchJson("/api/session/unlock", {
      method: "POST",
      body: JSON.stringify({ pin: pinInput.value }),
    });
    await refreshState();
  } catch (error) {
    sessionBanner.textContent = error.message;
  }
});

lockButton.addEventListener("click", async () => {
  await fetchJson("/api/session/lock", {
    method: "POST",
  });
  await refreshState();
});

loadBootstrap().catch((error) => {
  previewCard.textContent = error.message;
});
