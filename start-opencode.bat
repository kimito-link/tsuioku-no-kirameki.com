@echo off
setlocal EnableExtensions

chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "PROJECT_DIR=%~1"
if "%PROJECT_DIR%"=="" set "PROJECT_DIR=%~dp0"

echo.
echo OpenCode launcher
echo -----------------
echo Default project: %PROJECT_DIR%
echo.
set /P "PROJECT_DIR_INPUT=Project directory (Enter = default, or paste a folder path): "
if not "%PROJECT_DIR_INPUT%"=="" set "PROJECT_DIR=%PROJECT_DIR_INPUT%"
set "PROJECT_DIR=%PROJECT_DIR:"=%"
if not exist "%PROJECT_DIR%\" (
  echo.
  echo Directory not found: %PROJECT_DIR%
  pause
  exit /b 1
)
echo Project: %PROJECT_DIR%
echo.
echo 1. NVIDIA DeepSeek V4 Flash - recommended for agentic file edits
echo 2. Groq Qwen3 32B - fast free API, smaller rate limit
echo 3. Local Qwen3 14B - free local chat/code drafts
echo 4. Local Qwen2.5 Coder 14B - free local code drafts
echo.
choice /C 1234 /N /T 10 /D 1 /M "Choose model [1-4] (default: 1 in 10s): "

if errorlevel 4 set "MODEL=local/qwen2.5-coder:14b"
if errorlevel 3 set "MODEL=local/qwen3:14b"
if errorlevel 2 set "MODEL=groq/qwen/qwen3-32b"
if errorlevel 1 set "MODEL=nvidia/deepseek-ai/deepseek-v4-flash"

echo.
echo Starting OpenCode
echo Model: %MODEL%
echo.

pushd "%PROJECT_DIR%" || (
  echo Failed to enter project directory.
  pause
  exit /b 1
)

opencode --model "%MODEL%"
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
