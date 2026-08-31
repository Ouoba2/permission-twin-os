const { planGoalToAction } = require("../src/agent-runner.js");

const BASE_URL = process.env.TWIN_BASE_URL || "http://127.0.0.1:3300";
const TOKEN = process.env.TWIN_AGENT_TOKEN || "twin_demo_local_token";
const goal = process.argv.slice(2).join(" ").trim() || "Create a local brief for the operator";

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  console.log(`Agent goal: ${goal}`);
  const plannedAction = planGoalToAction(goal);

  console.log("\nPlanned action:");
  console.log(JSON.stringify(plannedAction, null, 2));

  const result = await requestJson("/api/sdk/preflight", {
    method: "POST",
    headers: {
      "x-agent-token": TOKEN,
    },
    body: JSON.stringify(plannedAction),
  });

  console.log("\nRuntime decision:");
  console.log(JSON.stringify(result, null, 2));

  if (result.decision.requiresApproval) {
    console.log("\nOutcome: human escalation required.");
    return;
  }

  console.log("\nOutcome: action completed under runtime governance.");
}

main().catch((error) => {
  console.error("Agent runner failed:");
  console.error(error.message);
  process.exitCode = 1;
});
