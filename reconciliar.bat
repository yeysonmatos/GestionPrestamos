@echo off
title Reconciliacion de prestamos
cd /d "%~dp0"
set /p SUPABASE_ACCESS_TOKEN=Ingresa el token de acceso (sbp_...): 
echo.
echo ============================================
echo   Reconciliacion contable - Gestor de Prestamos
echo ============================================
echo.
node scripts/exec-audit-reconcile.mjs
echo.
echo Saliendo en 10 segundos...
timeout /t 10 /nobreak > nul