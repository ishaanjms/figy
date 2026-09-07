function parseAgentJson(reply) {
  const text = String(reply || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace <= firstBrace) return {};

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return {};
  }
}

function normalizeIntent(rawIntent, userPrompt) {
  const allowedStyles = new Set(["linear", "branching", "cyclical", "mixed"]);
  const chartStyle = cleanText(rawIntent.chartStyle).toLowerCase();
  const possiblePaths = (Array.isArray(rawIntent.possiblePaths) ? rawIntent.possiblePaths : [])
    .map((path) => ({
      label: cleanLabel(path?.label || path?.name).slice(0, 36),
      when: cleanLabel(path?.when || path?.condition).slice(0, 90),
      outcome: cleanLabel(path?.outcome || path?.result).slice(0, 90)
    }))
    .filter((path) => path.label)
    .slice(0, 3);
  const normalizedStyle = allowedStyles.has(chartStyle) ? chartStyle : "linear";
  const requiresBranching = rawIntent.requiresBranching === true ||
    ["branching", "mixed"].includes(normalizedStyle) ||
    possiblePaths.length >= 2 ||
    inferBranchingNeed(userPrompt);

  return {
    goal: cleanText(rawIntent.goal) || cleanText(userPrompt) || "Create a useful process flowchart",
    audience: cleanText(rawIntent.audience) || "People using this process",
    scope: cleanText(rawIntent.scope) || "The complete process from start to finish",
    chartStyle: requiresBranching && normalizedStyle === "linear" ? "branching" : normalizedStyle,
    requiresBranching,
    possiblePaths,
    assumptions: cleanStringList(rawIntent.assumptions).slice(0, 8),
    requiredOutcomes: cleanStringList(rawIntent.requiredOutcomes).slice(0, 8)
  };
}

function normalizeProcess(rawProcess, intent, assistantContext = "") {
  const rawSteps = Array.isArray(rawProcess.steps) ? rawProcess.steps : [];
  let steps = rawSteps.map((step, index) => normalizeProcessStep(step, index)).filter((step) => step.label);

  if (steps.length < 2) {
    steps = createFallbackSteps(intent, assistantContext);
  }

  steps = ensureTerminalSteps(steps);
  const stepIds = new Set(steps.map((step) => step.id));

  steps.forEach((step, index) => {
    step.options = step.options.filter((option) => stepIds.has(option.nextStepId));

    if (step.type === "decision" && !hasDistinctDecisionOptions(step)) {
      step.type = "action";
      step.options = [];
    }

    if (step.type !== "decision" && step.type !== "end" && !stepIds.has(step.nextStepId)) {
      step.nextStepId = steps[index + 1]?.id || "";
    }
  });

  steps = ensureMeaningfulBranch(steps, intent);

  return {
    title: cleanText(rawProcess.title).slice(0, 80) || createTitle(intent.goal),
    steps
  };
}

function normalizeProcessStep(step, index) {
  const type = normalizeNodeType(step?.type || step?.kind, index);

  return {
    id: cleanId(step?.id || "step-" + (index + 1)),
    type,
    label: cleanLabel(step?.label || step?.title || step?.name),
    detail: cleanLabel(step?.detail || step?.description).slice(0, 120),
    nextStepId: cleanId(step?.nextStepId || step?.next || ""),
    options: (Array.isArray(step?.options) ? step.options : Array.isArray(step?.branches) ? step.branches : [])
      .map((option) => ({
        label: cleanLabel(option?.label || option?.choice || option?.condition).slice(0, 32),
        nextStepId: cleanId(option?.nextStepId || option?.target || option?.to || "")
      }))
      .filter((option) => option.label && option.nextStepId)
  };
}

function normalizeGraph(rawGraph, process, intent = {}) {
  const rawNodes = Array.isArray(rawGraph.nodes) ? rawGraph.nodes : [];
  const nodes = rawNodes.map((node, index) => ({
    id: cleanId(node?.id || "node-" + (index + 1)),
    type: normalizeGraphNodeType(node?.type || node?.kind, index, rawNodes.length),
    label: cleanLabel(node?.label || node?.title || node?.name).slice(0, 70),
    detail: cleanLabel(node?.detail || node?.description).slice(0, 120),
    row: finiteNumber(node?.row),
    column: finiteNumber(node?.column)
  })).filter((node) => node.id && node.label);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawConnections = Array.isArray(rawGraph.connections) ? rawGraph.connections : Array.isArray(rawGraph.edges) ? rawGraph.edges : [];
  const connections = rawConnections.map((connection) => ({
    from: cleanId(connection?.from || connection?.source),
    to: cleanId(connection?.to || connection?.target),
    label: cleanLabel(connection?.label || connection?.choice || connection?.condition).slice(0, 32)
  })).filter((connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to) && connection.from !== connection.to);
  const graph = {
    title: cleanText(rawGraph.title || rawGraph.name).slice(0, 80) || process.title,
    nodes,
    connections
  };

  return isUsableGraph(graph, intent) ? graph : createGraphFromProcess(process);
}

function isUsableGraph(graph, intent = {}) {
  if (graph.nodes.length < 2 || !graph.connections.length) return false;

  const outgoing = graph.connections.reduce((counts, connection) => {
    const targets = counts.get(connection.from) || new Set();
    targets.add(connection.to);
    counts.set(connection.from, targets);
    return counts;
  }, new Map());

  if (intent.requiresBranching && ![...outgoing.values()].some((targets) => targets.size >= 2)) return false;

  return graph.nodes.every((node) => {
    if (node.type === "end") return true;
    if (!outgoing.get(node.id)) return false;
    if (node.type === "decision") return outgoing.get(node.id).size >= 2;
    return true;
  });
}

function ensureMeaningfulBranch(steps, intent) {
  if (!intent.requiresBranching || steps.some((step) => step.type === "decision" && hasDistinctDecisionOptions(step))) {
    return steps;
  }

  const nextSteps = [...steps];
  const existingIds = new Set(nextSteps.map((step) => step.id));
  const start = nextSteps.find((step) => step.type === "start") || nextSteps[0];
  const end = nextSteps.find((step) => step.type === "end") || nextSteps[nextSteps.length - 1];
  const actions = nextSteps.filter((step) => step !== start && step !== end && step.type !== "decision");
  const entry = actions[0] || start;
  const continuation = actions[1] || end;
  const decisionId = createUniqueId("choose-path", existingIds);
  const paths = intent.possiblePaths.length >= 2
    ? intent.possiblePaths.slice(0, 3)
    : [
      { label: "Standard path", when: "Use the usual approach", outcome: "Continue the process" },
      { label: "Alternative path", when: "Use another suitable approach", outcome: "Continue the process" }
    ];
  const branchSteps = paths.map((path, index) => {
    const id = createUniqueId("path-" + (index + 1), existingIds);

    return {
      id,
      type: "action",
      label: path.label,
      detail: path.when || path.outcome || "",
      nextStepId: continuation.id,
      options: []
    };
  });
  const decision = {
    id: decisionId,
    type: "decision",
    label: "Which path applies?",
    detail: "",
    nextStepId: "",
    options: branchSteps.map((step) => ({ label: step.label, nextStepId: step.id }))
  };
  const insertAt = nextSteps.indexOf(entry) + 1;

  entry.nextStepId = decision.id;
  nextSteps.splice(insertAt, 0, decision, ...branchSteps);
  return nextSteps;
}

function hasDistinctDecisionOptions(step) {
  if (!Array.isArray(step.options) || step.options.length < 2) return false;

  const labels = new Set(step.options.map((option) => option.label.toLowerCase()));
  const targets = new Set(step.options.map((option) => option.nextStepId));
  return labels.size >= 2 && targets.size >= 2;
}

function createGraphFromProcess(process) {
  const nodes = process.steps.map((step, index) => ({
    id: step.id,
    type: step.type === "action" ? "step" : step.type,
    label: step.label,
    detail: step.detail,
    row: null,
    column: null
  }));
  const connections = [];

  process.steps.forEach((step) => {
    if (step.type === "decision") {
      step.options.forEach((option) => connections.push({
        from: step.id,
        to: option.nextStepId,
        label: option.label
      }));
      return;
    }

    if (step.nextStepId) {
      connections.push({ from: step.id, to: step.nextStepId, label: "" });
    }
  });

  return { title: process.title, nodes, connections };
}

function ensureTerminalSteps(steps) {
  const normalized = [...steps];

  if (normalized[0]?.type !== "start") {
    normalized.unshift({
      id: "start",
      type: "start",
      label: "Start",
      detail: "",
      nextStepId: normalized[0]?.id || "end",
      options: []
    });
  }

  if (!normalized.some((step) => step.type === "end")) {
    normalized.push({ id: "end", type: "end", label: "End", detail: "", nextStepId: "", options: [] });
  }

  return normalized;
}

function createFallbackSteps(intent, assistantContext) {
  const contextSteps = String(assistantContext || "")
    .split(/\r?\n/)
    .map((line) => cleanLabel(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")))
    .filter((line) => line.length >= 3 && line.length <= 90)
    .filter((line) => !/^(flowchart|workflow|here are|i found|plus \d+)/i.test(line))
    .slice(0, 10);
  const labels = contextSteps.length >= 2
    ? contextSteps
    : ["Define the goal", ...(intent.requiredOutcomes.length ? intent.requiredOutcomes : ["Complete the process"]), "Review the result"];

  return labels.map((label, index) => ({
    id: "step-" + (index + 1),
    type: "action",
    label: label.slice(0, 70),
    detail: "",
    nextStepId: "",
    options: []
  }));
}

function normalizeNodeType(type, index) {
  const value = cleanText(type).toLowerCase();

  if (/start|begin/.test(value)) return "start";
  if (/end|finish|terminal/.test(value)) return "end";
  if (/decision|choice|condition/.test(value)) return "decision";
  return index === 0 && value === "" ? "start" : "action";
}

function normalizeGraphNodeType(type, index, length) {
  const normalized = normalizeNodeType(type, index);

  if (normalized === "action") return index === length - 1 ? "end" : "step";
  return normalized;
}

function cleanStringList(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function cleanLabel(value) {
  return cleanText(value)
    .replace(/```(?:json|mermaid)?/gi, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createUniqueId(base, existingIds) {
  let id = cleanId(base) || "node";
  let suffix = 2;

  while (existingIds.has(id)) {
    id = cleanId(base) + "-" + suffix;
    suffix += 1;
  }

  existingIds.add(id);
  return id;
}

function inferBranchingNeed(userPrompt) {
  return /\b(decide|decision|choose|choice|approve|reject|if|otherwise|alternative|option|retry|failure|troubleshoot|review|qualify|yes|no)\b/i.test(String(userPrompt || ""));
}

function createTitle(goal) {
  const title = cleanText(goal).replace(/^(?:please\s+)?(?:make|create|build|generate)\s+(?:a\s+)?(?:flowchart|workflow)\s*(?:for|of)?\s*/i, "");
  return (title || "Process flowchart").slice(0, 80);
}

module.exports = {
  normalizeGraph,
  normalizeIntent,
  normalizeProcess,
  parseAgentJson
};
