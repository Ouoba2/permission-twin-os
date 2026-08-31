const BASE_URL = process.env.TWIN_BASE_URL || "http://127.0.0.1:3300";
const PIN = process.env.TWIN_PIN || "4242";
const TOKEN = process.env.TWIN_AGENT_TOKEN || "twin_demo_local_token";

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
  console.log(`Connecting to ${BASE_URL}`);

  const session = await requestJson("/api/session/unlock", {
    method: "POST",
    body: JSON.stringify({ pin: PIN }),
  });
  console.log("Session:", session);

  const result = await requestJson("/api/sdk/preflight", {
    method: "POST",
    headers: {
      "x-agent-token": TOKEN,
    },
    body: JSON.stringify({
      title: "SDK demo local artifact",
      actionType: "create_file",
      payload: {
        relativePath: "sdk/demo-output.txt",
        content:
          "This file was created through the Permission Twin OS SDK demo.\n",
      },
      reasoning:
        "An external agent requests a local file write and delegates policy enforcement to the runtime.",
    }),
  });

  console.log("\nPreflight result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.decision.requiresApproval) {
    console.log("\nThis action requires approval before execution.");
    return;
  }

  console.log("\nAction completed without human escalation.");
}

main().catch((error) => {
  console.error("SDK demo failed:");
  console.error(error.message);
  process.exitCode = 1;
});
