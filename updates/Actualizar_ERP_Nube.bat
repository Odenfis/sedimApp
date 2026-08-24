@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Actualizador Sistema ERP Nube

rem ============================================================
rem  ACTUALIZADOR SISTEMA ERP NUBE (sedimApp)
rem  Descarga el ZIP desde Google Drive y:
rem   - Copia los RES_*.exe al Escritorio del usuario
rem   - Copia los Res*.dll a C:\Windows\SysWOW64 y los registra
rem  Requiere Windows 10 (1803+) o Windows 11.
rem
rem  PLANTILLA: los valores entre @@...@@ son reemplazados por el servidor
rem  (Configurador de Actualizaciones) al momento de la descarga.
rem  Si ZIP_SHA256 queda vacio, el paso [2/6] de validacion se omite.
rem ============================================================

set "DRIVE_ID=@@DRIVE_ID@@"
set "ZIP_URL=https://drive.usercontent.google.com/download?id=%DRIVE_ID%&export=download&confirm=t"
set "ZIP_NAME=@@ZIP_NAME@@"
set "ZIP_SHA256=@@ZIP_SHA256@@"
set "WORKDIR=%TEMP%\sedim_upd"
set "LOG=%TEMP%\sedim_instalador.log"

rem --- Verificar permisos de administrador; si no hay, elevar ---
>nul 2>&1 fltmc || (
    echo Solicitando permisos de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    exit /b
)

cd /d "%TEMP%" >nul 2>&1
set /a OK_COUNT=0, ERR_COUNT=0

>>"%LOG%" echo ================================================
>>"%LOG%" echo %date% %time% - Inicio de actualizacion ERP Nube

echo.
echo ================================================
echo    ACTUALIZADOR SISTEMA ERP NUBE
echo ================================================
echo.

if not exist "%SYSTEMROOT%\SysWOW64" (
    echo ERROR: Este equipo no es Windows de 64 bits ^(no existe SysWOW64^).
    >>"%LOG%" echo [ERROR] Equipo sin SysWOW64 - Windows de 32 bits no soportado
    pause
    exit /b 1
)

if exist "%WORKDIR%" rd /s /q "%WORKDIR%" >nul 2>&1
mkdir "%WORKDIR%" >nul 2>&1

echo [1/6] Descargando actualizacion desde Google Drive...
where curl.exe >nul 2>&1
if not errorlevel 1 (
    curl.exe -L --progress-bar -o "%WORKDIR%\%ZIP_NAME%" "%ZIP_URL%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%WORKDIR%\%ZIP_NAME%'"
)
if not exist "%WORKDIR%\%ZIP_NAME%" goto :fail_download
for %%Z in ("%WORKDIR%\%ZIP_NAME%") do if %%~zZ LSS 1000000 goto :fail_download
>>"%LOG%" echo [OK] Descarga completada

echo [2/6] Validando integridad del archivo (SHA256)...
if "%ZIP_SHA256%"=="" (
    echo       Hash no configurado - validacion de integridad omitida.
    >>"%LOG%" echo [AVISO] Sin SHA256 configurado - validacion de integridad omitida
    goto :skip_hash
)
set "CALC_HASH="
for /f "usebackq skip=1 delims=" %%H in (`certutil -hashfile "%WORKDIR%\%ZIP_NAME%" SHA256`) do (
    if not defined CALC_HASH set "CALC_HASH=%%H"
)
if not defined CALC_HASH goto :fail_hash
if /i not "%CALC_HASH%"=="%ZIP_SHA256%" goto :fail_hash
>>"%LOG%" echo [OK] Hash SHA256 verificado
:skip_hash

echo [3/6] Extrayendo archivos...
mkdir "%WORKDIR%\src" >nul 2>&1
where tar.exe >nul 2>&1
if not errorlevel 1 (
    tar.exe -xf "%WORKDIR%\%ZIP_NAME%" -C "%WORKDIR%\src" >nul 2>&1
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%WORKDIR%\%ZIP_NAME%' -DestinationPath '%WORKDIR%\src' -Force"
)
if not exist "%WORKDIR%\src\RES_VENTAS.exe" goto :fail_extract
>>"%LOG%" echo [OK] Archivos extraidos

echo [4/6] Cerrando procesos abiertos del ERP...
call :KillProc RES_ALMACEN.exe
call :KillProc RES_COMPRAS.exe
call :KillProc RES_CUENTAS.exe
call :KillProc RES_SEGURIDAD.exe
call :KillProc RES_VENTAS.exe

echo [5/6] Copiando ejecutables al Escritorio y DLLs a SysWOW64...
set "DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%D"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" mkdir "%DESKTOP%" >nul 2>&1
>>"%LOG%" echo Destino EXE: %DESKTOP%

call :CopyOne "%WORKDIR%\src\RES_ALMACEN.exe" "%DESKTOP%"
call :CopyOne "%WORKDIR%\src\RES_COMPRAS.exe" "%DESKTOP%"
call :CopyOne "%WORKDIR%\src\RES_CUENTAS.exe" "%DESKTOP%"
call :CopyOne "%WORKDIR%\src\RES_SEGURIDAD.exe" "%DESKTOP%"
call :CopyOne "%WORKDIR%\src\RES_VENTAS.exe" "%DESKTOP%"

call :CopyOne "%WORKDIR%\src\ResEstadisticas.dll" "%SYSTEMROOT%\SysWOW64"
call :CopyOne "%WORKDIR%\src\ResInstall.dll" "%SYSTEMROOT%\SysWOW64"
call :CopyOne "%WORKDIR%\src\ResMaestros.dll" "%SYSTEMROOT%\SysWOW64"
call :CopyOne "%WORKDIR%\src\ResProcesos.dll" "%SYSTEMROOT%\SysWOW64"
call :CopyOne "%WORKDIR%\src\ResSeguridad.dll" "%SYSTEMROOT%\SysWOW64"

echo [6/6] Registrando librerias DLL...
call :RegOne ResEstadisticas.dll
call :RegOne ResInstall.dll
call :RegOne ResMaestros.dll
call :RegOne ResProcesos.dll
call :RegOne ResSeguridad.dll

rd /s /q "%WORKDIR%" >nul 2>&1

echo.
echo ================================================
if %ERR_COUNT% EQU 0 (
    echo   ACTUALIZACION COMPLETADA CON EXITO
) else (
    echo   FINALIZADO CON %ERR_COUNT% ERRORES - revise el log
)
echo   Operaciones OK: %OK_COUNT%
echo   Log detallado: %LOG%
echo ================================================
>>"%LOG%" echo Fin: OK=%OK_COUNT% ERR=%ERR_COUNT%
pause
exit /b %ERR_COUNT%

rem ------------------- Subrutinas -------------------

:KillProc
taskkill /F /IM %1 >nul 2>&1
if errorlevel 1 (
    >>"%LOG%" echo [INFO] Sin proceso activo: %1
) else (
    >>"%LOG%" echo [OK] Proceso cerrado: %1
)
exit /b

:CopyOne
copy /Y "%~1" "%~2\" >nul 2>&1
if errorlevel 1 (
    >>"%LOG%" echo [ERROR] No se pudo copiar: %~nx1 hacia %~2
    set /a ERR_COUNT+=1
) else (
    >>"%LOG%" echo [OK] Copiado: %~nx1 hacia %~2
    set /a OK_COUNT+=1
)
exit /b

:RegOne
if not exist "%SYSTEMROOT%\SysWOW64\%~1" (
    >>"%LOG%" echo [ERROR] DLL no encontrada en SysWOW64: %~1
    set /a ERR_COUNT+=1
    exit /b
)
"%SYSTEMROOT%\SysWOW64\regsvr32.exe" /s "%SYSTEMROOT%\SysWOW64\%~1"
if errorlevel 1 (
    >>"%LOG%" echo [ERROR] Fallo el registro de: %~1
    set /a ERR_COUNT+=1
) else (
    >>"%LOG%" echo [OK] DLL registrada: %~1
    set /a OK_COUNT+=1
)
exit /b

rem ------------------- Errores fatales -------------------

:fail_download
>>"%LOG%" echo [ERROR] La descarga fallo o el archivo esta incompleto
rd /s /q "%WORKDIR%" >nul 2>&1
echo.
echo ERROR: No se pudo descargar la actualizacion desde Google Drive.
echo Verifique su conexion a internet e intente nuevamente.
echo.
pause
exit /b 1

:fail_hash
>>"%LOG%" echo [ERROR] Hash SHA256 no coincide. Archivo corrompido o modificado.
rd /s /q "%WORKDIR%" >nul 2>&1
echo.
echo ERROR: El archivo descargado no paso la validacion de integridad.
echo Contacte al administrador del sistema.
echo.
pause
exit /b 1

:fail_extract
>>"%LOG%" echo [ERROR] Fallo la extraccion del ZIP
rd /s /q "%WORKDIR%" >nul 2>&1
echo.
echo ERROR: No se pudieron extraer los archivos de la actualizacion.
echo.
pause
exit /b 1
