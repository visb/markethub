# [SUPERSEDED 2026-06-28] Mecanismo de run autônomo via Windows Task Scheduler — aposentado.
# Go-forward: skill /autorun + /loop (ver .claude/skills/autorun e stories/AUTORUN.md), que
# sobrevive ao limite de sessão pelo próprio harness, sem schtasks/lock/watchdog. Mantido só
# como registro histórico do run phase-7-quality (já concluído — ver FINAL-REPORT.md).
# Se ainda houver tarefa agendada: schtasks /delete /tn markethub-sweep /f
#
# run-sweep.ps1 — UM disparo, limitado no tempo, do run autônomo de qualidade.
# Chamado pelo Windows Task Scheduler a cada 30min. Três garantias:
#   - LOCK: nunca dois runs ao mesmo tempo.
#   - WATCHDOG: nenhum run trava o slot — é morto se passar de $timeoutSec.
#   - RETOMADA: como todo run termina e libera o lock, o próximo disparo continua.
#     Se o limite de uso estourou, o run sai/é morto sem progresso; quando o limite
#     reseta, o disparo seguinte volta a trabalhar. Estado vive em PROGRESS.md + git.

$ErrorActionPreference = 'Stop'
$repo       = 'C:\code\markethub\final2'
$lock       = Join-Path $repo '.sweep.lock'
$log        = Join-Path $repo 'stories\phase-7-quality\sweep.log'
$driver     = Join-Path $repo 'stories\phase-7-quality\RUNBOOK.md'
$timeoutSec = 1500   # 25 min — menor que o intervalo de 30min do agendador

# Lock obsoleto (run anterior morto sem limpar) -> libera. 35min > watchdog (25) = seguro.
if (Test-Path $lock) {
  if (((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 35) { exit 0 }  # run ativo
  Remove-Item $lock -Force
}
Set-Content -Path $lock -Value (Get-Date -Format s)

$out = Join-Path $env:TEMP 'sweep-out.txt'
$err = Join-Path $env:TEMP 'sweep-err.txt'
try {
  Set-Location $repo
  "[{0}] start" -f (Get-Date -Format s) | Add-Content $log

  # claude le o prompt do stdin (RUNBOOK.md). -PassThru -> poder vigiar e matar a arvore.
  # Permissoes: --permission-mode acceptEdits + allowlist em .claude/settings.local.json.
  # Se ainda bloquear pedindo permissao, troque por: '--dangerously-skip-permissions'
  $p = Start-Process -FilePath 'claude' `
        -ArgumentList '-p','--permission-mode','acceptEdits' `
        -RedirectStandardInput  $driver `
        -RedirectStandardOutput $out `
        -RedirectStandardError  $err `
        -NoNewWindow -PassThru

  if (-not $p.WaitForExit($timeoutSec * 1000)) {
    "[{0}] WATCHDOG timeout -> kill tree PID {1}" -f (Get-Date -Format s), $p.Id | Add-Content $log
    & taskkill /PID $p.Id /T /F | Out-Null   # mata claude + filhos (pnpm/node/etc)
  } else {
    "[{0}] exit {1}" -f (Get-Date -Format s), $p.ExitCode | Add-Content $log
  }
}
finally {
  Get-Content $out, $err -ErrorAction SilentlyContinue | Add-Content $log
  Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
  Remove-Item $lock -Force -ErrorAction SilentlyContinue   # SEMPRE libera o slot
}
