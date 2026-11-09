#!/usr/bin/env node
/**
 * Fail on `var(--token)` that nothing defines.
 *
 * An undefined custom property does not fall back to something sensible — the
 * whole declaration becomes invalid at computed-value time and the property
 * reverts to its inherited or initial value. That is silent: `--spacing-surface`
 * was used for `.chat-stream-progress { padding }` and the streaming panel
 * simply rendered with no padding at all, with nothing in the build to say so.
 *
 * Usages that carry a fallback (`var(--x, 1rem)`) are fine by construction and
 * are not reported.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["tokens.css", "src"];
const DEFINITION = /(--[a-zA-Z0-9-]+)\s*:/g;
const USAGE = /var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g;

// Custom properties are not always declared in CSS. `next/font` mints one per
// face via its `variable` option, and a few pages set one inline through a
// style object. Both are real definitions; miss them and the check cries wolf.
const TS_DEFINITION = /(?:variable\s*:\s*|["'])(--[a-zA-Z0-9-]+)["']/g;

// Defined by Tailwind or the browser rather than by our stylesheets.
const EXTERNAL = /^--(tw-|webkit-)/;

function sourceFiles(path, suffixes, found = []) {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return found;
  if (stats.isFile()) {
    if (suffixes.some((suffix) => path.endsWith(suffix))) found.push(path);
    return found;
  }
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    sourceFiles(join(path, entry), suffixes, found);
  }
  return found;
}

const defined = new Set();
const used = [];

for (const file of ROOTS.flatMap((root) => sourceFiles(root, [".ts", ".tsx"]))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(TS_DEFINITION)) defined.add(match[1]);
}

for (const file of ROOTS.flatMap((root) => sourceFiles(root, [".css"]))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(DEFINITION)) defined.add(match[1]);
  for (const match of source.matchAll(USAGE)) {
    if (match[2] === ",") continue; // has a fallback
    const line = source.slice(0, match.index).split("\n").length;
    used.push({ token: match[1], file: relative(process.cwd(), file), line });
  }
}

const missing = used.filter(({ token }) => !defined.has(token) && !EXTERNAL.test(token));

if (missing.length > 0) {
  console.error(`\n${missing.length} lần dùng custom property không có định nghĩa:\n`);
  for (const { token, file, line } of missing) console.error(`  ${file}:${line}  ${token}`);
  console.error("\nThêm token vào tokens.css, hoặc dùng token đã có, hoặc viết var(--x, fallback).\n");
  process.exit(1);
}

console.log(`css tokens ok — ${defined.size} định nghĩa, ${used.length} lần dùng, 0 thiếu`);
