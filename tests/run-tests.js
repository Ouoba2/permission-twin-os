const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { planGoalToAction } = require("../src/agent-runner.js");
const {
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
  resolveWorkspacePath,
  runDemoScenario,
  setActiveWorkspace,
  setActiveProfile,
  unlockSession,
  updatePolicy,
  updateRiskRules,
} = require("../src/core.js");
const { startServer } = require("../server.js");

function makeStore(name) {
  const workspaceRoot = path.join(__dirname, `${name}-workspace`);
  const persistencePath = path.join(__dirname, `${name}-store.json`);
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.rmSync(persistencePath, { force: true });
  return createTwinStore({ workspaceRoot, persistencePath });
}

const tests = [
  {
    name: "create_file simulation becomes executed after approval",
    run() {
      const root = path.join(__dirname, "tmp-workspace-1-workspace", "main");
      const store = makeStore("tmp-workspace-1");
      unlockSession(store, "4242");

      const action = createActionRequest(store, {
        title: "Write test file",
        actionType: "create_file",
        payload: {
          relativePath: "docs/test.txt",
          content: "hello twin",
        },
      });

      assert.equal(action.status, "executed");
      const target = path.join(root, "docs", "test.txt");
      assert.equal(fs.existsSync(target), true);
      assert.equal(fs.readFileSync(target, "utf8"), "hello twin");
    },
  },
  {
    name: "open_url requires approval and can be denied",
    run() {
      const store = makeStore("tmp-workspace-2");
      unlockSession(store, "4242");
      const action = createActionRequest(store, {
        title: "Open site",
        actionType: "open_url",
        payload: {
          url: "https://example.com",
        },
      });

      assert.equal(action.status, "simulated");
      assert.equal(action.requiresApproval, true);
      const denied = denyAction(store, action.id, "No browser launch.");
      assert.equal(denied.status, "denied");
    },
  },
  {
    name: "workspace path resolution blocks escaping root",
    run() {
      assert.throws(() => {
        resolveWorkspacePath("C:\\safe-root", "..\\escape.txt");
      });
    },
  },
  {
    name: "server exposes bootstrap and accepts action creation",
    async run() {
      fs.rmSync(path.join(__dirname, "tmp-server-workspace"), { recursive: true, force: true });
      fs.rmSync(path.join(__dirname, "tmp-server-store.json"), { force: true });
      const server = await startServer(3400, {
        workspaceRoot: path.join(__dirname, "tmp-server-workspace"),
        persistencePath: path.join(__dirname, "tmp-server-store.json"),
      });
      try {
        const bootstrapResponse = await fetch("http://127.0.0.1:3400/api/bootstrap");
        assert.equal(bootstrapResponse.status, 200);
        const bootstrap = await bootstrapResponse.json();
        assert.equal(Array.isArray(bootstrap.presets), true);

        const actionResponse = await fetch("http://127.0.0.1:3400/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Create through api",
            actionType: "create_file",
            payload: {
              relativePath: "api/output.txt",
              content: "created over api",
            },
          }),
        });
        assert.equal(actionResponse.status, 400);
        await fetch("http://127.0.0.1:3400/api/session/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: "4242" }),
        });
        const actionResponse2 = await fetch("http://127.0.0.1:3400/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Create through api",
            actionType: "create_file",
            payload: {
              relativePath: "api/output.txt",
              content: "created over api",
            },
          }),
        });
        assert.equal(actionResponse2.status, 201);
        const action = await actionResponse2.json();
        assert.equal(action.status, "executed");
      } finally {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  },
  {
    name: "policy can be updated and affects next action",
    run() {
      const store = makeStore("tmp-workspace-3");
      unlockSession(store, "4242");
      updatePolicy(store, { create_file: "ask" });

      const action = createActionRequest(store, {
        title: "Protected write",
        actionType: "create_file",
        payload: {
          relativePath: "docs/protected.txt",
          content: "needs approval",
        },
      });

      assert.equal(action.requiresApproval, true);
      assert.equal(action.status, "simulated");
      approveAction(store, action.id);
      assert.equal(action.status, "executed");
    },
  },
  {
    name: "append_memory action writes into twin memory",
    run() {
      const store = makeStore("tmp-workspace-4");
      unlockSession(store, "4242");
      const initial = store.memories.length;
      const action = createActionRequest(store, {
        title: "Memory insert",
        actionType: "append_memory",
        payload: {
          title: "User preference",
          content: "User wants human approval for browser actions.",
          kind: "user",
        },
      });

      assert.equal(action.status, "executed");
      assert.equal(store.memories.length > initial, true);
    },
  },
  {
    name: "profile switching changes active policy",
    run() {
      const store = makeStore("tmp-workspace-5");
      const result = setActiveProfile(store, "strict");
      assert.equal(result.activeProfileId, "strict");
      assert.equal(store.policy.open_url, "deny");
      assert.equal(store.policy.launch_app, "deny");
    },
  },
  {
    name: "export journal includes actions and snapshots",
    run() {
      const store = makeStore("tmp-workspace-6");
      unlockSession(store, "4242");
      createActionRequest(store, {
        title: "Export write",
        actionType: "create_file",
        payload: {
          relativePath: "docs/export.txt",
          content: "snapshot me",
        },
      });
      const exported = exportJournal(store);
      assert.equal(Array.isArray(exported.actions), true);
      assert.equal(Array.isArray(exported.snapshots), true);
      assert.equal(exported.snapshots.length > 0, true);
    },
  },
  {
    name: "risk rules can force approval for low-risk actions",
    run() {
      const store = makeStore("tmp-workspace-7");
      unlockSession(store, "4242");
      updateRiskRules(store, { create_file: 0.7 });
      const action = createActionRequest(store, {
        title: "Now protected",
        actionType: "create_file",
        payload: {
          relativePath: "docs/high-risk.txt",
          content: "approval now required",
        },
      });
      assert.equal(action.requiresApproval, true);
      assert.equal(action.risk.level, "high");
    },
  },
  {
    name: "store persists data to disk and reloads it",
    run() {
      const workspaceRoot = path.join(__dirname, "tmp-workspace-8");
      const persistencePath = path.join(__dirname, "tmp-store.json");
      fs.rmSync(persistencePath, { force: true });

      const storeA = createTwinStore({ workspaceRoot, persistencePath });
      unlockSession(storeA, "4242");
      createActionRequest(storeA, {
        title: "Persisted memory",
        actionType: "append_memory",
        payload: {
          title: "Persistent note",
          content: "This should survive restart.",
          kind: "user",
        },
      });

      const storeB = createTwinStore({ workspaceRoot, persistencePath });
      assert.equal(storeB.memories.some((item) => item.title === "Persistent note"), true);
      fs.rmSync(persistencePath, { force: true });
    },
  },
  {
    name: "workspace switching changes file target root",
    run() {
      const workspaceRoot = path.join(__dirname, "tmp-workspace-9-workspace");
      const persistencePath = path.join(__dirname, "tmp-workspace-9-store.json");
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(persistencePath, { force: true });
      const store = createTwinStore({ workspaceRoot, persistencePath });
      unlockSession(store, "4242");
      setActiveWorkspace(store, "research");
      const action = createActionRequest(store, {
        title: "Workspace write",
        actionType: "create_file",
        payload: {
          relativePath: "docs/ws.txt",
          content: "workspace scoped",
        },
      });
      assert.equal(action.status, "executed");
      assert.equal(
        fs.existsSync(path.join(workspaceRoot, "research", "docs", "ws.txt")),
        true
      );
    },
  },
  {
    name: "filtered state narrows actions and memories by query and status",
    run() {
      const store = makeStore("tmp-workspace-10");
      unlockSession(store, "4242");
      const action = createActionRequest(store, {
        title: "Filter me",
        actionType: "append_memory",
        payload: {
          title: "Filter memory",
          content: "Search token zebra",
          kind: "user",
        },
      });
      denyAction(store, action.id, "Denied for filter.");
      const filtered = getFilteredState(store, {
        query: "zebra",
        status: "denied",
        memoryKind: "user",
      });
      assert.equal(filtered.actions.length, 0);
      assert.equal(filtered.memories.some((item) => item.content.includes("zebra")), true);
    },
  },
  {
    name: "demo scenario populates builder flow and bootstrap exposes demos",
    run() {
      const store = makeStore("tmp-workspace-11");
      unlockSession(store, "4242");
      const result = runDemoScenario(store, "guided-local-builder");
      assert.equal(result.actions.length, 1);
      assert.equal(result.actions[0].status, "executed");
      assert.equal(store.activeProfileId, "builder");
      assert.equal(store.activeWorkspaceId, "research");

      const bootstrap = getBootstrap(store);
      assert.equal(Array.isArray(bootstrap.demos), true);
      assert.equal(bootstrap.demos.length > 0, true);
      assert.equal(Array.isArray(bootstrap.demoRuns), true);
      assert.equal(bootstrap.demoRuns.length, 1);
    },
  },
  {
    name: "bulk queue approval executes all pending actions",
    run() {
      const store = makeStore("tmp-workspace-12");
      unlockSession(store, "4242");
      updatePolicy(store, { create_file: "ask", append_memory: "ask" });
      createActionRequest(store, {
        title: "Queued file",
        actionType: "create_file",
        payload: {
          relativePath: "docs/bulk.txt",
          content: "bulk approval",
        },
      });
      createActionRequest(store, {
        title: "Queued memory",
        actionType: "append_memory",
        payload: {
          title: "Bulk memory",
          content: "approve all should execute this",
          kind: "user",
        },
      });

      const result = approveAllQueued(store);
      assert.equal(result.count, 2);
      assert.equal(store.actions.every((item) => item.status === "executed"), true);
    },
  },
  {
    name: "bulk queue denial denies all pending actions",
    run() {
      const store = makeStore("tmp-workspace-13");
      unlockSession(store, "4242");
      updatePolicy(store, { open_url: "ask" });
      createActionRequest(store, {
        title: "Queued browser one",
        actionType: "open_url",
        payload: {
          url: "https://example.com",
        },
      });
      createActionRequest(store, {
        title: "Queued browser two",
        actionType: "open_url",
        payload: {
          url: "https://openai.com",
        },
      });

      const result = denyAllQueued(store, "Denied in bulk.");
      assert.equal(result.count, 2);
      assert.equal(store.actions.every((item) => item.status === "denied"), true);
    },
  },
  {
    name: "sdk preflight returns developer-oriented decision payload",
    run() {
      const store = makeStore("tmp-workspace-14");
      const result = createSdkPreflight(store, {
        title: "SDK payload test",
        actionType: "create_file",
        payload: {
          relativePath: "docs/sdk.txt",
          content: "sdk test",
        },
      }, "twin_demo_local_token");

      assert.equal(result.actionType, "create_file");
      assert.equal(result.intent.impact, "filesystem-local");
      assert.equal(result.decision.status, "executed");
      assert.equal(result.decision.nextStep, "completed");
      assert.equal(typeof result.decision.policyDecision, "string");
      assert.equal(typeof result.decision.humanOverride, "boolean");
      assert.equal(typeof result.reasoning, "string");
      assert.equal(result.reasoning.length > 0, true);
    },
  },
  {
    name: "agent can be created and used for sdk token auth",
    run() {
      const store = makeStore("tmp-workspace-15");
      unlockSession(store, "4242");
      const agent = createAgent(store, {
        name: "Docs Agent",
        description: "Agent for local docs tasks.",
      });

      const result = createSdkPreflight(
        store,
        {
          title: "Agent-auth preflight",
          actionType: "create_file",
          payload: {
            relativePath: "docs/agent-auth.txt",
            content: "agent token write",
          },
        },
        agent.token
      );

      assert.equal(result.actor.id, agent.id);
      assert.equal(result.actor.label, agent.name);
    },
  },
  {
    name: "sdk preflight auto-generates reasoning when missing",
    run() {
      const store = makeStore("tmp-workspace-16");
      const result = createSdkPreflight(
        store,
        {
          title: "Missing reasoning",
          actionType: "create_file",
          payload: {
            relativePath: "docs/missing-reasoning.txt",
            content: "auto reasoning",
          },
        },
        "twin_demo_local_token"
      );

      const action = store.actions.find((item) => item.id === result.actionId);
      assert.equal(typeof action.reasoning, "string");
      assert.equal(action.reasoning.length > 0, true);
    },
  },
  {
    name: "human approval records override on denied policy action",
    run() {
      const store = makeStore("tmp-workspace-17");
      unlockSession(store, "4242");
      setActiveProfile(store, "strict");
      const action = createActionRequest(store, {
        title: "Denied then approved",
        actionType: "open_url",
        payload: {
          url: "https://example.com",
        },
      });

      assert.equal(action.policyMode, "deny");
      assert.equal(action.status, "simulated");
      approveAction(store, action.id);
      assert.equal(action.status, "executed");
      assert.equal(action.governance.policyDecision, "deny");
      assert.equal(action.governance.humanOverride, true);
      assert.equal(action.governance.finalDecision, "executed");
    },
  },
  {
    name: "agent goal planner maps open goal to browser action",
    run() {
      const result = planGoalToAction("Open https://example.com in the browser");
      assert.equal(result.actionType, "open_url");
      assert.equal(result.payload.url, "https://example.com");
    },
  },
  {
    name: "agent goal planner defaults to local artifact for generic drafting goal",
    run() {
      const result = planGoalToAction("Create a project brief for the operator");
      assert.equal(result.actionType, "create_file");
      assert.equal(typeof result.payload.relativePath, "string");
    },
  },
];

async function main() {
  let passed = 0;
  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }

  if (passed === tests.length) {
    console.log(`All ${passed} tests passed.`);
  }
}

main();
