/**
 * Vérifications avant livraison (npm run check) :
 *  1. syntaxe de chaque script (node --check) ;
 *  2. blocs Handlebars équilibrés dans chaque gabarit ;
 *  3. version identique dans module.json et scripts/constants.js ;
 *  4. imports cohérents (tests/tools/fix-imports.py --check, si Python est disponible).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
let failures = 0;
const fail = (msg) => { failures += 1; console.error(`✗ ${msg}`); };
const walk = (dir, ext) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
});

for (const file of walk(join(root, "scripts"), ".js")) {
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); }
  catch (err) { fail(`syntaxe : ${file}\n${err.stderr}`); }
}

for (const file of walk(join(root, "templates"), ".hbs")) {
  const t = readFileSync(file, "utf8");
  for (const block of ["if", "each", "unless", "with"]) {
    const open = (t.match(new RegExp(`\\{\\{#${block}\\b`, "g")) ?? []).length;
    const close = (t.match(new RegExp(`\\{\\{/${block}\\}\\}`, "g")) ?? []).length;
    if (open !== close) fail(`${file} : {{#${block}}} ${open} ouverts, ${close} fermés`);
  }
}

const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8")).version;
const constant = readFileSync(join(root, "scripts/constants.js"), "utf8").match(/VERSION = "([^"]+)"/)?.[1];
if (manifest !== constant) fail(`version : module.json ${manifest} ≠ constants.js ${constant}`);

try { execFileSync("python3", ["-I", join(root, "tests/tools/fix-imports.py"), root, "--check"], { stdio: "pipe" }); }
catch (err) {
  if (err.code === "ENOENT") console.warn("! Python absent : vérification des imports ignorée");
  else fail(`imports :\n${err.stdout}`);
}

console.log(failures ? `${failures} problème(s)` : `✓ vérifications passées (version ${manifest})`);
process.exit(failures ? 1 : 0);
