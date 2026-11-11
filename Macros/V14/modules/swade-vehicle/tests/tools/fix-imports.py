"""
Recalcule les imports nommés de chaque fichier de scripts/ d'après les exports du projet.
Usage : python3 -I tests/tools/fix-imports.py <dossier du module> [--check]
  --check : n'écrit rien, signale les imports manquants ou inutiles (code de sortie 1 s'il y en a).
Les imports sans nom (import "./x.js";) sont conservés tels quels.
"""
import os, re, sys
from collections import defaultdict

ROOT = sys.argv[1]
CHECK = "--check" in sys.argv
SCRIPTS = os.path.join(ROOT, "scripts")


def code_only(src):
    """Garde le code et les expressions ${…} ; retire chaînes, commentaires et texte des gabarits."""
    out, n = [], len(src)

    def scan_code(i, stop_on_brace):
        depth = 0
        while i < n:
            c = src[i]
            if c in "\"'":
                q = c; i += 1
                while i < n and src[i] != q:
                    i += 2 if src[i] == "\\" else 1
                i += 1; out.append(" "); continue
            if src.startswith("//", i):
                j = src.find("\n", i); i = n if j < 0 else j; continue
            if src.startswith("/*", i):
                j = src.find("*/", i + 2); i = n if j < 0 else j + 2; out.append(" "); continue
            if c == "`":
                i = scan_template(i + 1); out.append(" "); continue
            if stop_on_brace:
                if c == "{": depth += 1
                elif c == "}":
                    if depth == 0: return i + 1
                    depth -= 1
            out.append(c); i += 1
        return i

    def scan_template(i):
        while i < n:
            c = src[i]
            if c == "\\": i += 2; continue
            if c == "`": return i + 1
            if src.startswith("${", i):
                out.append(" "); i = scan_code(i + 2, True); out.append(" "); continue
            i += 1
        return i

    scan_code(0, False)
    return "".join(out)


IMPORT_RE = re.compile(r'^import \{[^}]*\} from "[^"]+";\n', re.M)
files = {}
for dp, _, fs in os.walk(SCRIPTS):
    for f in fs:
        if f.endswith(".js"):
            files[os.path.relpath(os.path.join(dp, f), SCRIPTS)] = open(os.path.join(dp, f), encoding="utf-8").read()

exports = {}
for f, t in files.items():
    for name in re.findall(r'^export (?:async function|function|class|const|let)\s+(\w+)', t, re.M):
        if name in exports and exports[name] != f:
            sys.exit(f"Export en double : {name} dans {exports[name]} et {f}")
        exports[name] = f


def rel(src, dst):
    r = os.path.relpath(dst, os.path.dirname(src)) if os.path.dirname(src) else dst
    return r if r.startswith(".") else "./" + r


problems = 0
for f, t in sorted(files.items()):
    body = IMPORT_RE.sub("", t)
    code = code_only(body)
    own = set(re.findall(r'(?:function|class|const|let)\s+(\w+)', code))
    own |= set(re.findall(r'const \{\s*([\w\s,]+)\}', code)[0].replace(" ", "").split(",")) if re.search(r'const \{\s*[\w\s,]+\}', code) else set()
    needed = defaultdict(set)
    for name, src in exports.items():
        if src == f or name in own: continue
        if re.search(r'(?<![\w.$#])' + re.escape(name) + r'\b(?!\s*:(?!:))', code):
            needed[src].add(name)
    block = "".join(f'import {{ {", ".join(sorted(n))} }} from "{rel(f, src)}";\n' for src, n in sorted(needed.items()))
    old_block = "".join(IMPORT_RE.findall(t))
    if block == old_block: continue
    problems += 1
    if CHECK:
        print(f"{f} : imports à corriger")
        continue
    # Réécrit : en-tête de commentaire éventuel, imports nommés recalculés, imports sans nom conservés, reste du fichier
    first = IMPORT_RE.search(t)
    if first:
        head, rest = t[:first.start()], IMPORT_RE.sub("", t[first.start():])
    else:
        m = re.match(r'(\s*/\*.*?\*/\s*\n)', t, re.S)
        head, rest = (m.group(1), t[m.end():]) if m else ("", t)
    rest = rest.lstrip("\n")
    files[f] = head + block + ("\n" if block and not rest.startswith("import ") else "") + rest
    open(os.path.join(SCRIPTS, f), "w", encoding="utf-8").write(files[f])
    print(f"{f} : imports recalculés")

if CHECK and problems:
    sys.exit(1)
