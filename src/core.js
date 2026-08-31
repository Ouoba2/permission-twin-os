const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { generateMandateProof, verifyMandateProof, exportProof } = require('./zk-proof');


function createTwinStore(config = {}) {
  const persistencePath =
    config.persistencePath || path.join(config.workspaceRoot || process.cwd(), "..", "data", "twin-store.json");

  const store = {
    workspaceRoot: config.workspaceRoot || process.cwd(),
    persistencePath,
    session: {
      pin: config.pin || "4242",
      unlocked: false,
    },
    workspaces: defaultWorkspaces(config.workspaceRoot || process.cwd()),
    activeWorkspaceId: "main",
    agents: defaultAgents(),
    actions: [],
    memories: [],
    snapshots: [],
    demoRuns: [],
    riskRules: defaultRiskRules(),
    policy: defaultPolicy(),
    profiles: defaultProfiles(),
    activeProfileId: "concierge",
  };

  loadStore(store);
  if (store.memories.length === 0) {
    applyProfilePolicy(store, store.activeProfileId);
    seedMemories(store);
    persistStore(store);
  }

  return store;
}

function getBootstrap(store) {
  return {
    session: {
      unlocked: store.session.unlocked,
    },
    workspaces: store.workspaces,
    activeWorkspaceId: store.activeWorkspaceId,
    agents: store.agents,
    policy: store.policy,
    profiles: store.profiles,
    activeProfileId: store.activeProfileId,
    riskRules: store.riskRules,
    actions: store.actions.slice().reverse(),
    queue: store.actions.filter((item) => item.status === "simulated").reverse(),
    memories: store.memories.slice().reverse(),
    snapshots: store.snapshots.slice().reverse(),
    onboarding: defaultOnboarding(),
    demos: listDemoScenarios(),
    demoRuns: store.demoRuns.slice().reverse(),
    stats: buildStats(store),
  };
}

function getFilteredState(store, filters = {}) {
  const query = String(filters.query || "").toLowerCase().trim();
  const status = String(filters.status || "all");
  const memoryKind = String(filters.memoryKind || "all");

  const actions = store.actions
    .filter((action) => {
      const matchesQuery =
        !query ||
        [action.title, action.actionType, action.reasoning, action.execution?.message, action.twin?.summary]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      const matchesStatus = status === "all" || action.status === status;
      return matchesQuery && matchesStatus;
    })
    .slice()
    .reverse();

  const memories = store.memories
    .filter((memory) => {
      const matchesQuery =
        !query ||
        [memory.title, memory.kind, memory.content]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      const matchesKind = memoryKind === "all" || memory.kind === memoryKind;
      return matchesQuery && matchesKind;
    })
    .slice()
    .reverse();

  return {
    ...getBootstrap(store),
    actions,
    memories,
  };
}

function updatePolicy(store, nextPolicy) {
  const allowedModes = ["allow", "ask", "deny"];
  for (const [key, value] of Object.entries(nextPolicy || {})) {
    if (!(key in store.policy)) {
      continue;
    }
    if (!allowedModes.includes(value)) {
      throw new Error(`Mode de policy invalide pour ${key}.`);
    }
    store.policy[key] = value;
  }

  remember(store, {
    kind: "policy",
    title: "Policy updated",
    content: JSON.stringify(store.policy),
    score: 0.9,
  });
  persistStore(store);
  return store.policy;
}

function unlockSession(store, pin) {
  if (String(pin || "") !== String(store.session.pin)) {
    throw new Error("PIN invalide.");
  }
  store.session.unlocked = true;
  return { unlocked: true };
}

function lockSession(store) {
  store.session.unlocked = false;
  return { unlocked: false };
}

function setActiveWorkspace(store, workspaceId) {
  const workspace = getWorkspace(store, workspaceId);
  store.activeWorkspaceId = workspace.id;
  remember(store, {
    kind: "workspace",
    title: `Workspace actif: ${workspace.name}`,
    content: workspace.root,
    score: 0.83,
  });
  persistStore(store);
  return {
    activeWorkspaceId: store.activeWorkspaceId,
  };
}

function updateRiskRules(store, nextRules) {
  for (const [key, value] of Object.entries(nextRules || {})) {
    if (!(key in store.riskRules)) {
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
      throw new Error(`Regle de risque invalide pour ${key}.`);
    }
    store.riskRules[key] = numeric;
  }

  remember(store, {
    kind: "risk",
    title: "Risk rules updated",
    content: JSON.stringify(store.riskRules),
    score: 0.89,
  });
  persistStore(store);
  return store.riskRules;
}

function setActiveProfile(store, profileId) {
  applyProfilePolicy(store, profileId);
  remember(store, {
    kind: "profile",
    title: `Profil actif: ${getProfile(store, profileId).name}`,
    content: getProfile(store, profileId).style,
    score: 0.87,
  });
  persistStore(store);

  return {
    activeProfileId: store.activeProfileId,
    policy: store.policy,
  };
}

function buildStats(store) {
  const actions = store.actions;
  const approved = actions.filter((item) => item.status === "approved" || item.status === "executed").length;
  const denied = actions.filter((item) => item.status === "denied").length;
  const simulated = actions.filter((item) => item.status === "simulated").length;
  const executed = actions.filter((item) => item.status === "executed").length;
  const failed = actions.filter((item) => item.status === "failed").length;
  const highRisk = actions.filter((item) => item.risk?.level === "high").length;
  const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
  const topActionType = buildTopActionType(actions);

  return {
    totalActions: actions.length,
    approved,
    denied,
    simulated,
    executed,
    failed,
    highRisk,
    pendingApprovals: simulated,
    agents: store.agents.length,
    memories: store.memories.length,
    snapshots: store.snapshots.length,
    demoRuns: store.demoRuns.length,
    topActionType,
    approvalRate: actions.length === 0 ? 0 : Math.round((approved / actions.length) * 100),
    lastActivityAt: lastAction ? lastAction.createdAt : null,
  };
}

function listPresets() {
  return [
    {
      id: "create-summary",
      title: "Generer un artefact local",
      actionType: "create_file",
      description: "Produit un artefact local dans le runtime sans toucher a l'exterieur.",
      payload: {
        relativePath: "sandbox/reports/daily-summary.txt",
        content: "Permission Twin OS a cree cet artefact de preflight.\n",
      },
    },
    {
      id: "open-product",
      title: "Demander une navigation externe",
      actionType: "open_url",
      description: "Prepare une navigation externe et la soumet a gouvernance.",
      payload: {
        url: "https://www.openai.com",
      },
    },
    {
      id: "launch-notepad",
      title: "Lancer Notepad",
      actionType: "launch_app",
      description: "Demande l'ouverture de Notepad.",
      payload: {
        command: "notepad.exe",
        args: [],
      },
    },
    {
      id: "append-memory",
      title: "Ajouter un souvenir",
      actionType: "append_memory",
      description: "Ajoute un souvenir persistant dans le twin.",
      payload: {
        title: "Preference utilisateur",
        content: "Le user prefere valider les actions navigateur manuellement.",
        kind: "user",
      },
    },
    {
      id: "list-sandbox",
      title: "Lister le sandbox",
      actionType: "list_directory",
      description: "Liste les fichiers du sandbox local du twin.",
      payload: {
        relativePath: ".",
      },
    },
  ];
}

function listDemoScenarios() {
  return [
    {
      id: "guided-local-builder",
      title: "Preflight local Builder",
      description: "Passe en mode Builder et produit un livrable local dans Research.",
    },
    {
      id: "strict-browser-check",
      title: "Escalade navigateur en mode Strict",
      description: "Passe en mode Strict puis envoie une navigation web vers la file humaine.",
    },
    {
      id: "memory-audit-loop",
      title: "Boucle memoire et audit",
      description: "Ajoute un souvenir utilisateur et audite le workspace pour enrichir la trace.",
    },
  ];
}

function createActionRequest(store, input) {
  requireUnlocked(store);
  return createActionRequestInternal(store, input, {
    actor: {
      type: "session",
      id: "local-user",
      label: "Local Session",
    },
  });
}

function createActionRequestInternal(store, input, context = {}) {
  validateInput(input);
  const policyMode = store.policy[input.actionType] || "ask";
  const twin = buildTwinPreview(store, input);
  const action = {
    id: createId("act"),
    createdAt: new Date().toISOString(),
    title: input.title || input.actionType,
    actionType: input.actionType,
    payload: input.payload,
    reasoning: normalizeReasoning(input),
    actor: context.actor || null,
    policyMode,
    governance: {
      policyDecision: policyMode,
      humanOverride: false,
      overrideReason: "",
      finalDecision: "pending",
    },
    status: "simulated",
    twin,
    execution: null,
    workspaceId: store.activeWorkspaceId,
    snapshots: {
      before: createSnapshot(store, "before", input.actionType),
      after: null,
    },
  };

  action.risk = calculateRisk(store, action);
  action.requiresApproval = action.policyMode !== "allow" || action.risk.level !== "low";

  store.actions.push(action);
  remember(store, {
    kind: "action",
    title: `Simulation: ${action.title}`,
    content: `${action.actionType} | risque ${action.risk.level} | ${action.twin.summary}`,
    score: memoryScoreForAction(action),
  });

  if (!action.requiresApproval) {
    executeApprovedAction(store, action);
  } else {
    persistStore(store);
  }

  return action;
}

function createSdkPreflight(store, input, token) {
  const agent = getAgentByToken(store, token);
  if (!agent) {
    return {
      error: "Agent non trouvé ou token invalide",
      status: 401,
    };
  }
  const action = createActionRequestInternal(store, input, {
    actor: {
      type: "agent",
      id: agent.id,
      label: agent.name,
    },
  });
  return {
    actionId: action.id,
    title: action.title,
    actionType: action.actionType,
    reasoning: action.reasoning,
    intent: {
      summary: action.twin.summary,
      target: action.twin.target,
      impact: action.twin.impact,
    },
    risk: action.risk,
    decision: {
      status: action.status,
      requiresApproval: action.requiresApproval,
      policyMode: action.policyMode,
      policyDecision: action.governance.policyDecision,
      humanOverride: action.governance.humanOverride,
      nextStep: action.status === "executed" ? "completed" : action.requiresApproval ? "await_human_approval" : "execute",
    },
    execution: action.execution,
    workspaceId: action.workspaceId,
    actor: action.actor,
  };
}

function approveAction(store, actionId) {
  requireUnlocked(store);
  const action = getAction(store, actionId);
  if (action.status === "executed") {
    return action;
  }

  action.status = "approved";
  action.governance = {
    ...action.governance,
    humanOverride: action.policyMode !== "allow",
    overrideReason: action.policyMode === "allow" ? "" : "Approved by human operator.",
  };
  return executeApprovedAction(store, action);
}

function denyAction(store, actionId, reason = "Denied by user.") {
  requireUnlocked(store);
  const action = getAction(store, actionId);
  action.status = "denied";
  action.governance = {
    ...action.governance,
    finalDecision: "denied",
    overrideReason: reason,
  };
  action.execution = {
    at: new Date().toISOString(),
    ok: false,
    message: reason,
  };
  remember(store, {
    kind: "policy",
    title: `Denied: ${action.title}`,
    content: reason,
    score: 0.42,
  });
  persistStore(store);
  return action;
}

function exportJournal(store) {
  requireUnlocked(store);
  return {
    exportedAt: new Date().toISOString(),
    activeProfileId: store.activeProfileId,
    activeWorkspaceId: store.activeWorkspaceId,
    agents: store.agents,
    policy: store.policy,
    riskRules: store.riskRules,
    actions: store.actions,
    memories: store.memories,
    snapshots: store.snapshots,
    demoRuns: store.demoRuns,
  };
}

function runDemoScenario(store, scenarioId) {
  requireUnlocked(store);
  let result;

  if (scenarioId === "guided-local-builder") {
    setActiveProfile(store, "builder");
    setActiveWorkspace(store, "research");
    const action = createActionRequest(store, {
      title: "Builder demo report",
      actionType: "create_file",
      payload: {
        relativePath: "reports/demo-brief.txt",
        content:
          "Permission Twin OS a produit ce brief dans le workspace Research.\nMode: Builder\nValidation: locale\n",
      },
      reasoning: "Le twin prepare un livrable local demonstratif sans toucher au web.",
    });

    result = {
      scenarioId,
      label: "Builder local",
      actions: [action],
    };
  }
  else if (scenarioId === "strict-browser-check") {
    setActiveProfile(store, "strict");
    const action = createActionRequest(store, {
      title: "Strict browser review",
      actionType: "open_url",
      payload: {
        url: "https://www.openai.com",
      },
      reasoning: "Le twin verifie que le mode Strict garde la navigation dans la queue d'approbation.",
    });

    result = {
      scenarioId,
      label: "Strict browser review",
      actions: [action],
    };
  }
  else if (scenarioId === "memory-audit-loop") {
    const memoryAction = createActionRequest(store, {
      title: "Remember operator preference",
      actionType: "append_memory",
      payload: {
        title: "Preference demo",
        content: "Le user veut toujours une trace exportable des actions navigateur.",
        kind: "user",
        score: 0.92,
      },
      reasoning: "La memoire produit doit capturer les preferences d'approbation.",
    });
    const listAction = createActionRequest(store, {
      title: "Audit sandbox structure",
      actionType: "list_directory",
      payload: {
        relativePath: ".",
      },
      reasoning: "Le twin compare sa memoire a l'etat du workspace local.",
    });

    result = {
      scenarioId,
      label: "Memory audit loop",
      actions: [memoryAction, listAction],
    };
  } else {
    throw new Error("Scenario introuvable.");
  }

  recordDemoRun(store, result);
  persistStore(store);
  return result;
}

function approveAllQueued(store) {
  requireUnlocked(store);
  const queued = store.actions.filter((item) => item.status === "simulated");
  const approved = queued.map((item) => approveAction(store, item.id));
  return {
    count: approved.length,
    actions: approved,
  };
}

function denyAllQueued(store, reason = "Denied by user.") {
  requireUnlocked(store);
  const queued = store.actions.filter((item) => item.status === "simulated");
  const denied = queued.map((item) => denyAction(store, item.id, reason));
  return {
    count: denied.length,
    actions: denied,
  };
}

function createAgent(store, input) {
  requireUnlocked(store);
  const name = String(input?.name || "").trim();
  if (!name) {
    throw new Error("Nom d'agent requis.");
  }

  const agent = {
    id: createId("agent"),
    name,
    description: String(input?.description || "").trim(),
    token: createSecret("twin"),
    createdAt: new Date().toISOString(),
  };

  store.agents.push(agent);
  remember(store, {
    kind: "agent",
    title: `Agent registered: ${agent.name}`,
    content: agent.description || "No description",
    score: 0.86,
  });
  persistStore(store);
  return agent;
}

function executeApprovedAction(store, action) {
  const execution = performAction(store, action);
  action.execution = execution;
  action.status = execution.ok ? "executed" : "failed";
  action.governance = {
    ...action.governance,
    finalDecision: execution.ok ? "executed" : "failed",
  };
  action.snapshots.after = createSnapshot(store, "after", action.actionType);

  if (action.snapshots.before) {
    store.snapshots.push(action.snapshots.before);
  }
  if (action.snapshots.after) {
    store.snapshots.push(action.snapshots.after);
  }
  if (store.snapshots.length > 100) {
    store.snapshots = store.snapshots.slice(-100);
  }

  remember(store, {
    kind: "execution",
    title: `${execution.ok ? "Executed" : "Failed"}: ${action.title}`,
    content: execution.message,
    score: execution.ok ? 0.74 : 0.58,
  });
  persistStore(store);
  return action;
}

function performAction(store, action) {
  const at = new Date().toISOString();
  const workspaceRoot = getActiveWorkspaceRoot(store, action.workspaceId);
  try {
    if (action.actionType === "create_file") {
      const target = resolveWorkspacePath(workspaceRoot, action.payload.relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, action.payload.content || "", "utf8");
      return {
        at,
        ok: true,
        message: `Fichier cree dans le sandbox: ${target}`,
      };
    }

    if (action.actionType === "open_url") {
      const url = String(action.payload.url || "");
      if (!/^https?:\/\//u.test(url)) {
        throw new Error("URL invalide.");
      }

      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      }).unref();

      return {
        at,
        ok: true,
        message: `URL ouverte: ${url}`,
      };
    }

    if (action.actionType === "launch_app") {
      const command = String(action.payload.command || "");
      if (!command) {
        throw new Error("Commande d'application vide.");
      }

      spawn(command, Array.isArray(action.payload.args) ? action.payload.args : [], {
        detached: true,
        stdio: "ignore",
      }).unref();

      return {
        at,
        ok: true,
        message: `Application lancee: ${command}`,
      };
    }

    if (action.actionType === "append_memory") {
      remember(store, {
        kind: action.payload.kind || "user",
        title: action.payload.title || "Untitled memory",
        content: action.payload.content || "",
        score: clampNumber(action.payload.score, 0, 1, 0.76),
      });

      return {
        at,
        ok: true,
        message: `Souvenir ajoute: ${action.payload.title || "Untitled memory"}`,
      };
    }

    if (action.actionType === "list_directory") {
      const target = resolveWorkspacePath(workspaceRoot, action.payload.relativePath || ".");
      const items = fs
        .readdirSync(target, { withFileTypes: true })
        .map((entry) => (entry.isDirectory() ? `[DIR] ${entry.name}` : entry.name));

      return {
        at,
        ok: true,
        message: `Contenu de ${target}\n${items.join("\n")}`,
      };
    }

    return {
      at,
      ok: false,
      message: `Action non prise en charge: ${action.actionType}`,
    };
  } catch (error) {
    return {
      at,
      ok: false,
      message: error.message,
    };
  }
}

function buildTwinPreview(store, input) {
  const workspaceRoot = getActiveWorkspaceRoot(store);
  if (input.actionType === "create_file") {
    const target = resolveWorkspacePath(workspaceRoot, input.payload.relativePath);
    return {
      summary: "Creerait un fichier local dans le sandbox Twin OS.",
      target,
      impact: "filesystem-local",
    };
  }

  if (input.actionType === "open_url") {
    return {
      summary: "Ouvrirait une URL externe dans le navigateur.",
      target: String(input.payload.url || ""),
      impact: "browser-navigation",
    };
  }

  if (input.actionType === "launch_app") {
    return {
      summary: "Lancerait une application locale sur le PC.",
      target: String(input.payload.command || ""),
      impact: "local-process",
    };
  }

  if (input.actionType === "append_memory") {
    return {
      summary: "Ajouterait un souvenir persistant dans la memoire du twin.",
      target: String(input.payload.title || ""),
      impact: "memory-write",
    };
  }

  if (input.actionType === "list_directory") {
    return {
      summary: "Listerait le contenu du sandbox local.",
      target: String(input.payload.relativePath || "."),
      impact: "filesystem-read",
    };
  }

  return {
    summary: "Action non reconnue.",
    target: "",
    impact: "unknown",
  };
}

function calculateRisk(store, action) {
  const base = store.riskRules[action.actionType] ?? 0.8;
  let level = "low";
  if (base >= 0.6) {
    level = "high";
  } else if (base >= 0.35) {
    level = "medium";
  }

  return {
    level,
    score: base,
    reasons: [`Regle de risque ${action.actionType}: ${Math.round(base * 100)}%`],
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Action invalide.");
  }

  if (!input.actionType) {
    throw new Error("actionType requis.");
  }

  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("payload requis.");
  }
}

function normalizeReasoning(input) {
  const provided = String(input.reasoning || "").trim();
  if (provided) {
    return provided;
  }

  const actionType = String(input.actionType || "");
  if (actionType === "create_file") {
    return "Auto-generated reasoning: local file creation requested and routed through runtime governance.";
  }
  if (actionType === "open_url") {
    return "Auto-generated reasoning: external navigation requested and evaluated by runtime governance.";
  }
  if (actionType === "launch_app") {
    return "Auto-generated reasoning: local application launch requested and evaluated by runtime governance.";
  }
  if (actionType === "append_memory") {
    return "Auto-generated reasoning: persistent memory update requested for governance context.";
  }
  if (actionType === "list_directory") {
    return "Auto-generated reasoning: local directory inspection requested before further action.";
  }
  return "Auto-generated reasoning: action routed through runtime governance.";
}

function resolveWorkspacePath(root, relativePath) {
  const safeRelative = String(relativePath || "").replace(/^([\\/])+/, "");
  const absolute = path.resolve(root, safeRelative);
  const normalizedRoot = path.resolve(root);
  // CORRECTION AUDIT (bug critique #2) : startsWith() seul est contournable par un
  // dossier frere dont le nom commence par le meme prefixe (ex: "research" -> "research-evil").
  // On exige desormais soit une egalite stricte, soit un separateur de chemin juste apres la racine.
  if (absolute !== normalizedRoot && !absolute.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Le chemin sort du workspace autorise.");
  }
  return absolute;
}

function getAction(store, actionId) {
  const action = store.actions.find((item) => item.id === actionId);
  if (!action) {
    throw new Error("Action introuvable.");
  }
  return action;
}

function getProfile(store, profileId) {
  const profile = store.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("Profil introuvable.");
  }
  return profile;
}

function applyProfilePolicy(store, profileId) {
  const profile = getProfile({ profiles: defaultProfiles() }, profileId);
  store.activeProfileId = profile.id;
  store.policy = {
    ...defaultPolicy(),
    ...profile.policyOverrides,
  };
}

function remember(store, memory) {
  store.memories.push({
    id: createId("mem"),
    at: new Date().toISOString(),
    ...memory,
  });

  store.memories.sort((left, right) => right.score - left.score || compareDate(right.at, left.at));
  if (store.memories.length > 50) {
    store.memories.length = 50;
  }
}

function memoryScoreForAction(action) {
  return clampNumber(0.4 + action.risk.score * 0.4 + (action.requiresApproval ? 0.15 : 0.05), 0, 1, 0.5);
}

function seedMemories(store) {
  const items = [
    {
      kind: "system",
      title: "Twin boot",
      content: "Permission Twin OS demarre en mode local-first et journalise chaque action.",
      score: 0.95,
    },
    {
      kind: "policy",
      title: "Default policy",
      content: "create_file auto, open_url ask, launch_app ask, shell_command deny.",
      score: 0.88,
    },
    {
      kind: "product",
      title: "Twin capability",
      content: "Le twin peut simuler, approuver, executer et memoriser des actions locales.",
      score: 0.82,
    },
    {
      kind: "profile",
      title: "Profil initial",
      content: "Le twin demarre avec le profil Concierge actif.",
      score: 0.84,
    },
  ];

  items.forEach((item) => remember(store, item));
}

function createSnapshot(store, phase, actionType) {
  return {
    id: createId("snap"),
    at: new Date().toISOString(),
    phase,
    actionType,
    activeProfileId: store.activeProfileId,
    activeWorkspaceId: store.activeWorkspaceId,
    stats: {
      actions: store.actions.length,
      memories: store.memories.length,
    },
  };
}

function loadStore(store) {
  try {
    if (!fs.existsSync(store.persistencePath)) {
      return;
    }
    const raw = fs.readFileSync(store.persistencePath, "utf8");
    const data = JSON.parse(raw);
    store.actions = Array.isArray(data.actions) ? data.actions : [];
    store.memories = Array.isArray(data.memories) ? data.memories : [];
    store.snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    store.demoRuns = Array.isArray(data.demoRuns) ? data.demoRuns : [];
    store.policy = { ...defaultPolicy(), ...(data.policy || {}) };
    store.riskRules = { ...defaultRiskRules(), ...(data.riskRules || {}) };
    store.activeProfileId = data.activeProfileId || "concierge";
    store.workspaces = Array.isArray(data.workspaces) && data.workspaces.length > 0 ? data.workspaces : defaultWorkspaces(store.workspaceRoot);
    store.agents = Array.isArray(data.agents) && data.agents.length > 0 ? data.agents : defaultAgents();
    store.activeWorkspaceId = data.activeWorkspaceId || "main";
    store.profiles = Array.isArray(data.profiles) && data.profiles.length > 0 ? data.profiles : defaultProfiles();
    store.session.unlocked = false;
  } catch (_error) {
    store.actions = [];
    store.memories = [];
    store.snapshots = [];
    store.demoRuns = [];
    store.policy = defaultPolicy();
    store.riskRules = defaultRiskRules();
    store.workspaces = defaultWorkspaces(store.workspaceRoot);
    store.agents = defaultAgents();
    store.activeWorkspaceId = "main";
    store.profiles = defaultProfiles();
    store.activeProfileId = "concierge";
    store.session.unlocked = false;
  }
}

function persistStore(store) {
  const dir = path.dirname(store.persistencePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    store.persistencePath,
    JSON.stringify(
      {
        actions: store.actions,
        memories: store.memories,
        snapshots: store.snapshots,
        demoRuns: store.demoRuns,
        policy: store.policy,
        riskRules: store.riskRules,
        workspaces: store.workspaces,
        agents: store.agents,
        activeWorkspaceId: store.activeWorkspaceId,
        profiles: store.profiles,
        activeProfileId: store.activeProfileId,
      },
      null,
      2
    ),
    "utf8"
  );
}

function defaultPolicy() {
  return {
    create_file: "allow",
    open_url: "ask",
    launch_app: "ask",
    append_memory: "allow",
    list_directory: "allow",
    shell_command: "deny",
  };
}

function defaultRiskRules() {
  return {
    create_file: 0.22,
    open_url: 0.52,
    launch_app: 0.61,
    append_memory: 0.18,
    list_directory: 0.12,
    shell_command: 0.9,
  };
}

function defaultProfiles() {
  return [
    {
      id: "concierge",
      name: "Concierge",
      style: "Prudent et assiste",
      policyOverrides: {
        open_url: "ask",
        launch_app: "ask",
      },
    },
    {
      id: "builder",
      name: "Builder",
      style: "Plus autonome pour produire localement",
      policyOverrides: {
        create_file: "allow",
        append_memory: "allow",
        list_directory: "allow",
      },
    },
    {
      id: "strict",
      name: "Strict",
      style: "Mode audit, presque tout demande validation",
      policyOverrides: {
        create_file: "ask",
        open_url: "deny",
        launch_app: "deny",
        append_memory: "ask",
        list_directory: "ask",
      },
    },
  ];
}

function defaultAgents() {
  return [
    {
      id: "agent-sdk-demo",
      name: "SDK Demo Agent",
      description: "Agent d'exemple local pour integrer le runtime via token.",
      token: "twin_demo_local_token",
      createdAt: new Date().toISOString(),
    },
  ];
}

function defaultOnboarding() {
  return [
    {
      title: "1. Debloque la session",
      text: "Utilise le PIN local pour activer le runtime de gouvernance sans exposer un compte cloud.",
    },
    {
      title: "2. Choisis policy et workspace",
      text: "Chaque profil ajuste les policies, et chaque workspace isole l'environnement d'execution.",
    },
    {
      title: "3. Lance le preflight puis escalade",
      text: "Le runtime produit un apercu d'impact, une classification de risque et un audit trail exportable.",
    },
  ];
}

function defaultWorkspaces(baseRoot) {
  return [
    {
      id: "main",
      name: "Main Sandbox",
      root: path.join(baseRoot, "main"),
    },
    {
      id: "research",
      name: "Research Sandbox",
      root: path.join(baseRoot, "research"),
    },
    {
      id: "ops",
      name: "Ops Sandbox",
      root: path.join(baseRoot, "ops"),
    },
  ];
}

function getWorkspace(store, workspaceId) {
  const workspace = store.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    throw new Error("Workspace introuvable.");
  }
  return workspace;
}

function getAgentByToken(store, token) {
  // CORRECTION AUDIT (probleme important #3) : on retourne null au lieu de throw,
  // pour que les appelants (createSdkPreflight, createZkProof) puissent repondre
  // par un 401 propre au lieu de laisser l'exception remonter en 400 generique.
  const safeToken = String(token || "").trim();
  if (!safeToken) {
    return null;
  }
  const agent = store.agents.find((item) => item.token === safeToken);
  return agent || null;
}

function getActiveWorkspaceRoot(store, workspaceId = store.activeWorkspaceId) {
  return getWorkspace(store, workspaceId).root;
}

function requireUnlocked(store) {
  if (!store.session.unlocked) {
    throw new Error("Session verrouillee.");
  }
}

function compareDate(left, right) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function recordDemoRun(store, result) {
  store.demoRuns.push({
    id: createId("demo"),
    at: new Date().toISOString(),
    scenarioId: result.scenarioId,
    label: result.label,
    actionCount: result.actions.length,
    executedCount: result.actions.filter((item) => item.status === "executed").length,
    queuedCount: result.actions.filter((item) => item.status === "simulated").length,
    profileId: store.activeProfileId,
    workspaceId: store.activeWorkspaceId,
  });
  if (store.demoRuns.length > 20) {
    store.demoRuns = store.demoRuns.slice(-20);
  }
}

function buildTopActionType(actions) {
  const counts = new Map();
  for (const action of actions) {
    counts.set(action.actionType, (counts.get(action.actionType) || 0) + 1);
  }
  let bestType = "none";
  let bestCount = 0;
  for (const [type, count] of counts.entries()) {
    if (count > bestCount) {
      bestType = type;
      bestCount = count;
    }
  }
  return {
    type: bestType,
    count: bestCount,
  };
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSecret(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

async function createZkProof(store, agentToken, action) {
    const agent = getAgentByToken(store, agentToken);
    if (!agent) {
        return { error: "Agent non trouvé ou token invalide", status: 401 };
    }

    const policies = getPoliciesForAgent(agent);
    
    if (!action.amount || !action.merchant) {
        return {
            error: 'Action doit contenir "amount" et "merchant" pour la preuve ZK',
            suggestion: 'Utilisez /api/sdk/preflight pour les actions sans montant',
            status: 400
        };
    }

    const mandate = {
        maxAmount: policies.maxAmount || 10000,
        allowedMerchants: policies.allowedMerchants || [action.merchant]
    };

    // Vérification directe du mandat (sans passer par le système de risque général)
    // La preuve ZK EST la vérification du mandat, donc on vérifie directement ici
    if (action.amount > mandate.maxAmount) {
        return {
            error: `Montant ${action.amount} dépasse le maximum autorisé ${mandate.maxAmount}`,
            status: 403
        };
    }

    if (!mandate.allowedMerchants.includes(action.merchant)) {
        return {
            error: `Marchand ${action.merchant} non autorisé`,
            status: 403
        };
    }

    try {
        const { proof, publicSignals } = await generateMandateProof(mandate, action);
        
        remember(store, {
            kind: 'zk_proof',
            title: `Preuve ZK générée (Agent: ${agent.name})`,
            content: `Hash: ${hashProof(proof)}`,
            score: 0.8
        });

        return {
            status: 200,
            agent: { id: agent.id, name: agent.name },
            action: { amount: action.amount, merchant: action.merchant },
            proof: exportProof(proof, publicSignals, {
                agentId: agent.id,
                mandateVersion: policies.version || '1.0'
            }),
            governance: {
                risk: { level: 'low', score: 0.2 },
                decision: { status: 'executed', requiresApproval: false }
            },
            message: 'Preuve ZK générée. Envoyez uniquement "proof" au tiers.'
        };
    } catch (error) {
        return { error: 'Erreur génération preuve ZK', details: error.message, status: 500 };
    }
}

async function verifyZkProof(store, proofData) {
    try {
        const { proof, publicSignals } = proofData;
        
        if (!proof || !publicSignals) {
            return { valid: false, error: 'Format de preuve invalide', status: 400 };
        }

        const isValid = await verifyMandateProof(proof, publicSignals);

        if (store) {
            remember(store, {
                kind: 'zk_verify',
                title: `Vérification ZK: ${isValid ? 'Valide' : 'Invalide'}`,
                content: `Hash: ${hashProof(proof)}`,
                score: isValid ? 0.9 : 0.2
            });
        }

        return {
            valid: isValid,
            publicSignals: publicSignals,
            verifiedAt: new Date().toISOString(),
            message: isValid 
                ? '✅ Action autorisée par mandat valide' 
                : '❌ Action NON autorisée ou preuve invalide',
            status: 200
        };
    } catch (error) {
        return { valid: false, error: 'Erreur vérification preuve', details: error.message, status: 500 };
    }
}

function hashProof(proof) {
    const { createHash } = require('crypto');
    return createHash('sha256').update(JSON.stringify(proof)).digest('hex').substring(0, 16);
}

function getPoliciesForAgent(agent) {
    return {
        maxAmount: 1000,
        allowedMerchants: ['AWS', 'Google Cloud', 'Azure'],
        version: '1.0'
    };
}

module.exports = {
  approveAction,
  approveAllQueued,
  createAgent,
  createActionRequest,
  createSdkPreflight,
  createTwinStore,
  denyAction,
  denyAllQueued,
  exportJournal,
  getFilteredState,
  getBootstrap,
  lockSession,
  listDemoScenarios,
  listPresets,
  runDemoScenario,
  resolveWorkspacePath,
  setActiveProfile,
  setActiveWorkspace,
  unlockSession,
  updatePolicy,
  updateRiskRules,
  createZkProof,
  verifyZkProof
};
