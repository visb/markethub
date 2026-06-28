#!/usr/bin/env node
// @ts-check
/**
 * Gate de cobertura de diff (story 19).
 *
 * Garante que as linhas ADICIONADAS/ALTERADAS num PR estejam cobertas por teste
 * acima de um limite (default 90%). É o eixo "por arquivo / código novo" do gate:
 * o piso agregado de cada workspace impede regressão; este script força todo
 * código novo a vir bem coberto (um arquivo novo sem teste reprova aqui, porque
 * suas linhas novas ficam 0% cobertas).
 *
 * Lê os relatórios lcov de cada workspace (`<ws>/coverage/lcov.info`, gerados por
 * `pnpm test:coverage`) e cruza com o `git diff` contra a base.
 *
 * Uso:
 *   node scripts/diff-coverage.mjs [--base <ref>] [--threshold <0-100>]
 *
 * Base (ordem de precedência): --base | $COVERAGE_DIFF_BASE | origin/main | main.
 * Sai com código 1 se a cobertura do diff ficar abaixo do limite.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const threshold = Number(arg("--threshold", "90"));
const sourceRe = /\.(ts|tsx)$/;

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function tryGit(args) {
  try {
    return git(args).trim();
  } catch {
    return "";
  }
}

function resolveBase() {
  const explicit = arg("--base", process.env.COVERAGE_DIFF_BASE);
  const candidates = [explicit, "origin/main", "main"].filter(Boolean);
  for (const ref of candidates) {
    if (tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) return ref;
  }
  return "";
}

/** Lista diretórios de workspace a partir dos globs do pnpm-workspace. */
function workspaceDirs() {
  const dirs = [];
  for (const group of ["apps", "services", "packages"]) {
    const base = path.join(repoRoot, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(base, entry.name));
    }
  }
  return dirs;
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

/** Mapa repoRelPath -> Map(linha -> hits) a partir de todos os lcov.info. */
function loadCoverage() {
  const cov = new Map();
  let files = 0;
  for (const wsDir of workspaceDirs()) {
    const lcovPath = path.join(wsDir, "coverage", "lcov.info");
    if (!existsSync(lcovPath)) continue;
    files++;
    const raw = readFileSync(lcovPath, "utf8").replace(/^﻿/, "");
    let current = null;
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("SF:")) {
        const sf = line.slice(3).trim();
        const abs = path.isAbsolute(sf) ? sf : path.resolve(wsDir, sf);
        const rel = normalize(path.relative(repoRoot, abs));
        current = cov.get(rel) ?? new Map();
        cov.set(rel, current);
      } else if (line.startsWith("DA:") && current) {
        const [ln, hits] = line.slice(3).split(",");
        const lineNo = Number(ln);
        const hitCount = Number(hits);
        // Mantém o maior hit count quando o mesmo arquivo aparece em mais de um lcov.
        const prev = current.get(lineNo);
        current.set(lineNo, prev === undefined ? hitCount : Math.max(prev, hitCount));
      } else if (line === "end_of_record") {
        current = null;
      }
    }
  }
  return { cov, files };
}

/** Mapa repoRelPath -> Set(linhas adicionadas) a partir do git diff. */
function changedLines(base) {
  const range = base ? `${base}...HEAD` : "HEAD";
  const out = git(["diff", "--unified=0", "--no-color", "--diff-filter=AM", range]);
  const changed = new Map();
  let file = null;
  let newLine = 0;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      file = p === "/dev/null" ? null : normalize(p.replace(/^b\//, ""));
      if (file && !sourceRe.test(file)) file = null;
    } else if (line.startsWith("@@")) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      newLine = m ? Number(m[1]) : 0;
    } else if (file && line.startsWith("+") && !line.startsWith("+++")) {
      const set = changed.get(file) ?? new Set();
      set.add(newLine);
      changed.set(file, set);
      newLine++;
    }
    // linhas "-" e cabeçalhos não avançam newLine (unified=0 não traz contexto)
  }
  return changed;
}

function main() {
  const base = resolveBase();
  if (!base) {
    console.log("[diff-coverage] sem base git resolvível (origin/main|main) — pulando gate de diff.");
    return;
  }
  const { cov, files } = loadCoverage();
  if (files === 0) {
    console.error("[diff-coverage] nenhum coverage/lcov.info encontrado. Rode `pnpm test:coverage` antes.");
    process.exit(1);
  }

  const changed = changedLines(base);
  let total = 0;
  let covered = 0;
  const offenders = [];

  for (const [file, lines] of changed) {
    const fileCov = cov.get(file);
    if (!fileCov) continue; // arquivo não instrumentado (excluído do escopo de cobertura)
    const uncovered = [];
    for (const ln of lines) {
      const hits = fileCov.get(ln);
      if (hits === undefined) continue; // linha não-executável (tipo, comentário, etc.)
      total++;
      if (hits > 0) covered++;
      else uncovered.push(ln);
    }
    if (uncovered.length) {
      offenders.push({ file, uncovered: uncovered.sort((a, b) => a - b) });
    }
  }

  if (total === 0) {
    console.log(`[diff-coverage] base=${base} — nenhuma linha nova instrumentada no diff. OK.`);
    return;
  }

  const pct = (covered / total) * 100;
  console.log(`[diff-coverage] base=${base} — linhas novas cobertas: ${covered}/${total} (${pct.toFixed(2)}%), limite ${threshold}%.`);

  if (offenders.length) {
    console.log("[diff-coverage] linhas novas sem cobertura:");
    for (const { file, uncovered } of offenders) {
      console.log(`  ${file}: ${uncovered.join(", ")}`);
    }
  }

  if (pct < threshold) {
    console.error(`[diff-coverage] REPROVADO: ${pct.toFixed(2)}% < ${threshold}%.`);
    process.exit(1);
  }
  console.log("[diff-coverage] OK.");
}

main();
