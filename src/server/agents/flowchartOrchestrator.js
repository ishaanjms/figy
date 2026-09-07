const { requestStructuredReply } = require("../chat");
const {
  createGraphPrompt,
  createIntentPrompt,
  createProcessPrompt
} = require("./flowchartPrompts");
const {
  normalizeGraph,
  normalizeIntent,
  normalizeProcess,
  parseAgentJson
} = require("./flowchartState");

async function buildFlowchartWithAgents(input, env) {
  const userPrompt = String(input.userPrompt || "").trim() || "Create a useful process flowchart.";
  const assistantContext = String(input.assistantContext || "").trim();
  const model = String(input.model || "").trim();

  const intentStage = await runAgentStage(
    createIntentPrompt(userPrompt, assistantContext),
    env,
    { model, maxTokens: 1000 }
  );
  const intent = normalizeIntent(intentStage.output, userPrompt);

  const processStage = await runAgentStage(
    createProcessPrompt(intent),
    env,
    { model, maxTokens: 2400 }
  );
  const process = normalizeProcess(processStage.output, intent, assistantContext);

  const graphStage = await runAgentStage(
    createGraphPrompt(intent, process),
    env,
    { model, maxTokens: 3200 }
  );
  const graph = normalizeGraph(graphStage.output, process, intent);

  return {
    plan: graph,
    stages: {
      intent: intentStage.status,
      process: processStage.status,
      graph: graphStage.status
    }
  };
}

async function runAgentStage(prompt, env, options) {
  try {
    const reply = await requestStructuredReply(prompt, env, options);
    const output = parseAgentJson(reply);

    return {
      output,
      status: Object.keys(output).length ? "complete" : "fallback"
    };
  } catch {
    return { output: {}, status: "fallback" };
  }
}

module.exports = { buildFlowchartWithAgents };
