const { buildFlowchartWithAgents } = require("./agents/flowchartOrchestrator");
const { readJsonBody, sendJson } = require("./http");

async function handleFlowchartRequest(req, res, env) {
  const body = await readJsonBody(req);
  const result = await buildFlowchartWithAgents({
    userPrompt: body.userPrompt,
    assistantContext: body.assistantContext,
    model: body.model
  }, env);

  sendJson(res, 200, result);
}

module.exports = { handleFlowchartRequest };
