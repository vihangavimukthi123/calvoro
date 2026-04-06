@echo off
echo ========================================
echo Calvoro MySQL Database Setup
echo ========================================
echo.

REM Try setup with no password first
echo Attempting setup with no password...
node setup-database.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Setup failed! Trying with environment variable...
    echo.
    echo Please enter your MySQL root password:
    set /p MYSQL_PASSWORD="Password: "
    set DB_PASSWORD=%MYSQL_PASSWORD%
    node setup-database.js
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
pause
