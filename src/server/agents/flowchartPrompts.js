const intentSchema = {
  goal: "Clear statement of the process goal",
  audience: "Who will use the flowchart",
  scope: "What the chart includes and excludes",
  chartStyle: "linear|branching|cyclical|mixed",
  requiresBranching: true,
  possiblePaths: [{ label: "Short path name", when: "When this path applies", outcome: "Where it leads" }],
  assumptions: ["Reasonable assumption"],
  requiredOutcomes: ["Required outcome"]
};

const processSchema = {
  title: "Short user-facing title",
  steps: [{
    id: "stable-id",
    type: "start|action|decision|end",
    label: "Short user-facing label",
    detail: "Optional useful detail",
    nextStepId: "next-id-or-empty",
    options: [{ label: "Choice label", nextStepId: "target-id" }]
  }]
};

const graphSchema = {
  title: "Short title",
  nodes: [{
    id: "stable-id",
    type: "start|step|decision|end",
    label: "Short label",
    detail: "Optional detail",
    row: 0,
    column: 0
  }],
  connections: [{ from: "source-id", to: "target-id", label: "Optional choice label" }]
};

function createIntentPrompt(userPrompt, assistantContext) {
  return [
    "You are the Intent Agent in Figy's flowchart system.",
    "Understand the user's real process goal before any graph is created.",
    "Infer sensible missing context. Do not ask follow-up questions unless the goal is impossible to interpret.",
    "Think explicitly about realistic choices, alternate approaches, failure paths, optional paths, and retries.",
    "Decide whether the process is linear, branching, cyclical, or mixed. Do not force a branch when the process is genuinely linear.",
    "Set requiresBranching to true when at least one meaningful choice changes what happens next.",
    "When branching is useful, provide two or three concise possiblePaths. Keep the final graph simple rather than exhaustive.",
    "Return only one valid minified JSON object matching this schema:",
    JSON.stringify(intentSchema),
    "User request:",
    userPrompt || "Create a useful process flowchart.",
    "Relevant conversation context:",
    String(assistantContext || "").slice(0, 7000)
  ].join("\n");
}

function createProcessPrompt(intent) {
  return [
    "You are the Process Agent in Figy's flowchart system.",
    "Build a complete real-world process from the approved intent below.",
    "Include required actions, meaningful decisions, alternative paths, retries, exceptions, merge points, and a clear finish when relevant.",
    "Use 5 to 10 steps for an ordinary process. Prefer one clear decision with two or three useful paths over a long linear checklist.",
    "Every action must name nextStepId unless it ends the process.",
    "Every decision must have at least two options with different labels and valid target step ids.",
    "If intent.requiresBranching is true, include at least one decision and preserve the intent's possible paths.",
    "A branch may point back to an earlier step for a retry or forward to a shared merge step.",
    "Return only one valid minified JSON object matching this schema:",
    JSON.stringify(processSchema),
    "Intent Agent output:",
    JSON.stringify(intent)
  ].join("\n");
}

function createGraphPrompt(intent, process) {
  return [
    "You are the Graph Architect in Figy's flowchart system.",
    "Convert the process into an editable, readable top-to-bottom whiteboard graph.",
    "Preserve every meaningful process connection exactly. Do not invent code fragments or expose internal notation in labels.",
    "Use decision nodes only for choices. Put choice text on connection labels.",
    "Assign rows by progression. Put sibling branches in separate columns, align merge nodes centrally, and keep loops near their source.",
    "Keep the graph compact. A decision's different choices must connect to different nodes, then rejoin only when the process truly converges.",
    "If intent.requiresBranching is true, a purely linear graph is invalid.",
    "Keep labels under 46 characters and details under 120 characters.",
    "Every connection must reference an existing node. Every non-end node needs an outgoing connection.",
    "Return only one valid minified JSON object matching this schema:",
    JSON.stringify(graphSchema),
    "Intent Agent output:",
    JSON.stringify(intent),
    "Process Agent output:",
    JSON.stringify(process)
  ].join("\n");
}

module.exports = {
  createGraphPrompt,
  createIntentPrompt,
  createProcessPrompt
};
