const fs = require("fs");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((values, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) return values;

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) return values;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    values[key] = value;
    return values;
  }, {});
}

module.exports = {
  loadEnv
};
