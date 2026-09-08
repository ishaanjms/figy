const { buildFlowchartWithAgents } = require("./agents/flowchartOrchestrator");
const { readJsonBody, sendJson } = require("./http");
const { guardAIRequest } = require("./usage");

async function handleFlowchartRequest(req, res, env) {
  await guardAIRequest(req, env);
  const body = await readJsonBody(req);
  if (typeof body.userPrompt !== "string" || !body.userPrompt.trim() || body.userPrompt.length > 12000) throw new Error("Enter a request under 12,000 characters.");
  const result = await buildFlowchartWithAgents({
    userPrompt: body.userPrompt,
    assistantContext: body.assistantContext,
    model: body.model
  }, env);

  sendJson(res, 200, result);
}

module.exports = { handleFlowchartRequest };
