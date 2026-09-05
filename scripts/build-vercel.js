const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const outDir = path.join(rootDir, "dist");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

copyFile("index.html");
copyDir("assets");
copyDir(path.join("src", "js"));
copyDir(path.join("src", "styles"));

console.log("Built static Figy app in dist/");

function copyFile(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(outDir, relativePath);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDir(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(outDir, relativePath);

  fs.cpSync(source, destination, { recursive: true });
}
