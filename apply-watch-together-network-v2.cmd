@echo off
setlocal
cd /d "%~dp0"
echo Applying AnimeBox Watch Together Network v2...
node apply-watch-together-network-v2.mjs
if errorlevel 1 (
  echo.
  echo Patch failed. No Git push was performed.
  exit /b 1
)
echo.
echo Patch applied. Run:
echo npm run build
endlocal
