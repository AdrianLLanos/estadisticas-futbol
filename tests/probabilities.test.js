const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appCode = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const sandbox = {
  console,
  window: {
    lucide: { createIcons() {} },
  },
  document: {
    querySelector: () => null,
    addEventListener: () => {},
  },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  setTimeout,
  clearTimeout,
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.global = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);
vm.runInContext(appCode, sandbox, { filename: "app.js" });

const result = sandbox.calcularProbabilidadesFinales({
  homeGoals: 1.8,
  awayGoals: 1.2,
  homeComposite: 0.68,
  awayComposite: 0.44,
  matrix: {
    homeWinProb: 0.42,
    awayWinProb: 0.3,
    drawProb: 0.28,
    overProb: 0.56,
    underProb: 0.44,
    bttsProb: 0.59,
  },
});

assert.ok(result.homeWin > 0 && result.homeWin < 1, "homeWin debe estar entre 0 y 1");
assert.ok(result.draw > 0 && result.draw < 1, "draw debe estar entre 0 y 1");
assert.ok(result.awayWin > 0 && result.awayWin < 1, "awayWin debe estar entre 0 y 1");
assert.ok(result.over2p5 > 0 && result.over2p5 < 1, "over2p5 debe estar entre 0 y 1");
assert.ok(result.btts > 0 && result.btts < 1, "btts debe estar entre 0 y 1");
assert.strictEqual(Math.round((result.homeWin + result.draw + result.awayWin) * 1000) / 1000, 1, "las probabilidades deben normalizarse a 1");

console.log("Prueba de probabilidades OK", result);
