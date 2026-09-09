const { requestStructuredReply } = require("../chat");
const { validate } = require("../../shared/graph");
const {
  createGraphPrompt,
  createIntentPrompt,
  createOrchestratedFlowchartPrompt,
  createProcessPrompt
} = require("./flowchartPrompts");
const {
  normalizeIntent,
  parseAgentJson
} = require("./flowchartState");

async function buildFlowchartWithAgents(input, env) {
  const userPrompt = String(input.userPrompt || "").trim() || "Create a useful process flowchart.";
  const assistantContext = String(input.assistantContext || "").trim();
  const model = String(input.model || "").trim();

  const combinedStage = await runAgentStage(
    createOrchestratedFlowchartPrompt(userPrompt, assistantContext),
    env,
    { model, maxTokens: 2800 }
  );
  const intent = normalizeIntent(combinedStage.output.intent || {}, userPrompt);
  const process = combinedStage.output.process || {};
  if (!Array.isArray(process.steps) || process.steps.length < 2) throw new Error("The AI did not produce a complete process. Please retry.");
  const processGraph = {
    title: process.title || "Flowchart",
    nodes: process.steps.map(step => ({ ...step, type: step.type === "action" ? "step" : step.type })),
    connections: process.steps.flatMap(step => step.type === "decision"
      ? (step.options || []).map(option => ({ from: step.id, to: option.nextStepId, label: option.label }))
      : step.nextStepId ? [{ from: step.id, to: step.nextStepId, label: "" }] : [])
  };
  validate(processGraph);
  if (intent.requiresBranching && !process.steps.some(step => step.type === "decision")) throw new Error("The AI omitted the required choices. Please retry.");

  const suggested = validate(combinedStage.output.graph || {});
  const edgeKey = edge => JSON.stringify([edge.from, edge.to, edge.label || ""]);
  const equal = (a,b) => JSON.stringify(a.sort()) === JSON.stringify(b.sort());
  if (!equal(suggested.nodes.map(n=>n.id), processGraph.nodes.map(n=>n.id)) || !equal(suggested.connections.map(edgeKey), processGraph.connections.map(edgeKey))) throw new Error("The layout proposal changed the process. Please retry.");
  const graph = { ...suggested, assumptions: intent.assumptions };
  validate(graph);

  return {
    plan: graph,
    stages: {
      intent: combinedStage.status,
      process: combinedStage.status,
      graph: combinedStage.status
    }
  };
}

async function runAgentStage(prompt, env, options) {
    const reply = await requestStructuredReply(prompt, env, options);
    const output = parseAgentJson(reply);
    if (!Object.keys(output).length) throw new Error("The AI response was incomplete. Please retry with a smaller flow.");
    return {
      output,
      status: "complete"
    };
}

module.exports = { buildFlowchartWithAgents };
