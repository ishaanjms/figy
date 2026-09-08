const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
fs.mkdirSync(path.join(root, "assets/vendor"), { recursive: true });
for (const [source, target] of [["elkjs/lib/elk.bundled.js", "elk.bundled.js"], ["lucide/dist/umd/lucide.min.js", "lucide.js"]]) {
  fs.copyFileSync(path.join(root, "node_modules", source), path.join(root, "assets/vendor", target));
}
