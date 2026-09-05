const http = require("http");
const path = require("path");
const { handleChatRequest } = require("./src/server/chat");
const { loadEnv } = require("./src/server/env");
const { sendJson } = require("./src/server/http");
const { serveStaticFile } = require("./src/server/static");

const rootDir = __dirname;
const env = loadEnv(path.join(rootDir, ".env"));
const port = 4317;
const host = "127.0.0.1";

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS" && req.url === "/api/chat") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChatRequest(req, res, env);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    serveStaticFile(req, res, rootDir);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
});

server.listen(port, host, () => {
  console.log("Figy is running at http://" + host + ":" + port);
});
