const { getChatHealth, handleChatRequest } = require("../src/server/chat");
const { sendJson } = require("../src/server/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, getChatHealth(process.env));
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    await handleChatRequest(req, res, process.env);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
};
