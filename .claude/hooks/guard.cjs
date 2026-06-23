// PreToolUse guard for hands-off (skip-permissions) runs.
// Claude Code pipes the hook JSON to this script's stdin. Exit 2 BLOCKS the tool call.
// Hooks run even in bypass mode, so this is the real safety rail once prompts are off.
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse(s); } catch (e) { process.exit(0); }
  const name = j.tool_name || "";
  const ti = j.tool_input || {};
  const block = (why) => {
    console.error("BLOCKED by .claude/hooks/guard.cjs: " + why);
    process.exit(2);
  };

  if (name === "Bash") {
    const c = String(ti.command || "");
    if (/\brm\s+-rf\b/i.test(c)) block("rm -rf");
    if (/git\s+push\b[^\n]*(--force|\s-f\b)/i.test(c)) block("force push");
    if (/git\s+push\b[^\n]*\borigin\s+main\b/i.test(c)) block("push to main");
    if (/git\s+push\s+main\b/i.test(c)) block("push to main");
    if (/git\s+reset\s+--hard\b/i.test(c)) block("git reset --hard");
    if (/gh\s+pr\s+merge\b[^\n]*--admin\b/i.test(c)) block("admin merge (bypasses required checks)");
    if (/npm\s+run\s+db:(migrate|deploy|seed)\b/i.test(c)) block("DB mutation (db:migrate/deploy/seed)");
    if (/prisma\s+migrate\s+reset\b/i.test(c)) block("prisma migrate reset");
    if (/\bpsql\b/i.test(c)) block("psql");
    if (/\b(curl|wget)\b/i.test(c)) block("raw network fetch (curl/wget)");
  }
  if (name === "Write" || name === "Edit" || name === "MultiEdit") {
    const f = String(ti.file_path || ti.path || "");
    if (/(^|\/)\.env(\.|$)/.test(f)) block(".env is protected");
  }
  process.exit(0);
});
