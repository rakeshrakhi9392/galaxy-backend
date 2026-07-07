@echo off
REM Verify Galaxy MCP server (uses Windows system curl, not a local copy)
setlocal
cd /d "%~dp0"

set CURL=C:\Windows\System32\curl.exe
set KEY=gal_dev_test_key_12345
set URL=http://localhost:4010/api/mcp

echo === Step 1: Initialize ===
"%CURL%" -s -D "%TEMP%\mcp-init-headers.txt" -o "%TEMP%\mcp-init-body.txt" -X POST "%URL%" ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -H "Authorization: Bearer %KEY%" ^
  --data-binary "@init.json"

type "%TEMP%\mcp-init-headers.txt"
echo.
type "%TEMP%\mcp-init-body.txt"
echo.

for /f "tokens=2 delims=: " %%a in ('findstr /i "mcp-session-id" "%TEMP%\mcp-init-headers.txt"') do set SESSION=%%a
if "%SESSION%"=="" (
  echo ERROR: No mcp-session-id in response. Is backend running on port 4010?
  exit /b 1
)

echo === Step 2: List tools (session %SESSION%) ===
"%CURL%" -s -i -X POST "%URL%" ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -H "Authorization: Bearer %KEY%" ^
  -H "mcp-session-id: %SESSION%" ^
  --data-binary "@tools.json"

echo.
echo Done.
