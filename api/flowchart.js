const { handleFlowchartRequest } = require("../src/server/flowchart");
const { sendJson } = require("../src/server/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    await handleFlowchartRequest(req, res, process.env);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Could not build the flowchart." });
  }
};
