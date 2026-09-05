const fs = require("fs");
const path = require("path");
const { sendJson } = require("./http");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function serveStaticFile(req, res, rootDir) {
  const requestedPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(rootDir, safePath));
  const relativePath = path.relative(rootDir, filePath);

  if (!filePath.startsWith(rootDir) || isPrivateFile(relativePath)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "File not found." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(content);
  });
}

function isPrivateFile(relativePath) {
  return relativePath
    .split(path.sep)
    .some((part) => part.startsWith(".") || part === "node_modules");
}

module.exports = {
  serveStaticFile
};
