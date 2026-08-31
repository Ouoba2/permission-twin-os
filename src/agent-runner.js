function planGoalToAction(goal) {
  const text = String(goal || "").trim();
  if (!text) {
    throw new Error("Objectif agent requis.");
  }

  const lower = text.toLowerCase();

  if (
    lower.includes("open") ||
    lower.includes("url") ||
    lower.includes("browser") ||
    lower.includes("site") ||
    lower.includes("ouvre") ||
    lower.includes("ouvrir")
  ) {
    return {
      title: "Agent navigation request",
      actionType: "open_url",
      payload: {
        url: extractUrl(text) || "https://www.openai.com",
      },
      reasoning:
        "The agent inferred that the user's goal requires an external browser navigation.",
    };
  }

  if (
    lower.includes("remember") ||
    lower.includes("memo") ||
    lower.includes("memory") ||
    lower.includes("souvenir") ||
    lower.includes("memoire")
  ) {
    return {
      title: "Agent memory write",
      actionType: "append_memory",
      payload: {
        title: "Agent note",
        content: text,
        kind: "user",
        score: 0.88,
      },
      reasoning:
        "The agent interpreted the goal as a persistent memory update for future governance context.",
    };
  }

  if (
    lower.includes("list") ||
    lower.includes("scan") ||
    lower.includes("folder") ||
    lower.includes("directory") ||
    lower.includes("sandbox") ||
    lower.includes("lister") ||
    lower.includes("dossier")
  ) {
    return {
      title: "Agent directory audit",
      actionType: "list_directory",
      payload: {
        relativePath: ".",
      },
      reasoning:
        "The agent wants a local inventory before taking further action, so it asks for a directory listing.",
    };
  }

  return {
    title: "Agent local artifact",
    actionType: "create_file",
    payload: {
      relativePath: "agent/generated-brief.txt",
      content: `${text}\n`,
    },
    reasoning:
      "The agent chose to create a local artifact because the goal looks like a drafting or output task.",
  };
}

function extractUrl(text) {
  const match = String(text).match(/https?:\/\/\S+/u);
  return match ? match[0] : "";
}

module.exports = {
  planGoalToAction,
};
