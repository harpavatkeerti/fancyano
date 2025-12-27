@echo off
REM WSL Port Forwarding Setup Script
REM Run this as Administrator: Right-click CMD -> "Run as Administrator"

echo Setting up WSL port forwarding...
echo.

REM Get WSL IP address
echo Getting WSL IP address...
for /f "tokens=*" %%i in ('wsl hostname -I') do set WSL_IP=%%i

if "%WSL_IP%"=="" (
    echo Error: Could not get WSL IP address. Make sure WSL is running.
    pause
    exit /b 1
)

echo WSL IP: %WSL_IP%
echo.

REM Remove existing rule if any
echo Removing existing port forwarding rule...
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0 >nul 2>&1

REM Add new port forwarding rule
echo Adding port forwarding rule...
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=%WSL_IP%

if %ERRORLEVEL% EQU 0 (
    echo Port forwarding set up successfully!
    echo Windows:3001 -^> WSL(%WSL_IP%):3001
) else (
    echo Error setting up port forwarding
    pause
    exit /b 1
)

REM Set up firewall rule
echo.
echo Setting up firewall rule...
netsh advfirewall firewall show rule name="WSL Backend Port 3001" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    netsh advfirewall firewall add rule name="WSL Backend Port 3001" dir=in action=allow protocol=TCP localport=3001
    echo Firewall rule created
) else (
    echo Firewall rule already exists
)

REM Show current rules
echo.
echo Current port forwarding rules:
netsh interface portproxy show all

echo.
echo Setup complete!
echo Backend in WSL is now accessible via Windows IP on port 3001
echo.
pause

