#!/usr/bin/env bash
# This file works as both a bash script and a Windows .cmd file.
# Windows uses the @echo and goto lines; bash ignores them as comments-ish.
:<<"::CMDLITERAL"
@echo off
goto :CMDSTART
::CMDLITERAL

# --- bash section ---
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_NAME="$1"
shift
exec "${SCRIPT_DIR}/${HOOK_NAME}" "$@"

:CMDSTART
@rem Windows: invoke bash via WSL or git-bash; fall back to a friendly error.
where bash >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo kbase hooks require bash. Install Git Bash or WSL.
  exit /b 1
)
bash "%~dp0%1" %*
