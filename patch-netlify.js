const fs = require("fs");

const htmlPath = "index.html";
let html = fs.readFileSync(htmlPath, "utf8");

if (!html.includes("enhancements.js")) {
  html = html.replace("</body>", '<script src="./enhancements.js"></script>\n</body>');
  fs.writeFileSync(htmlPath, html);
}
