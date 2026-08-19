@echo off
chcp 65001 >nul
title 明星海报生成器

cd /d "%~dp0"

echo.
echo   明星海报生成器
echo   ==============================
echo.

if not exist "node_modules" (
    echo   首次运行，正在安装依赖，请稍候...
    echo.
    call npm install
    call npm approve-scripts esbuild
    call npm rebuild esbuild
    echo.
)

echo   正在启动，浏览器会自动打开...
echo   关闭这个窗口即可停止服务。
echo.

REM 延后 3 秒开浏览器，等服务器就绪
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5173/"

call npx vite --port 5173

echo.
echo   服务已停止。
pause
