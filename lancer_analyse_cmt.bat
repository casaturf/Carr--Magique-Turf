@echo off
cd /d C:\Aspibet.Api\GitHub-Repo\Carr--Magique-Turf

set DATE_ANALYSE=%1
if "%DATE_ANALYSE%"=="" (
    for /f "tokens=1-3 delims=-" %%a in ('powershell -command "Get-Date -Format yyyy-MM-dd"') do (
        set DATE_ANALYSE=%%a-%%b-%%c
    )
)

echo =================================================================
echo   CMT ANALYSE JOURNEE — %DATE_ANALYSE%
echo =================================================================
echo.
echo   Lancement FUSION SCORE + CLASSEMENT en parallele...
echo.

start "CMT Fusion" cmd /c "cd /d C:\Aspibet.Api\GitHub-Repo\Carr--Magique-Turf && python cmt_analyse_histo.py RAPPORTS\%DATE_ANALYSE% C:\Aspibet.Api\historique\historique_pmu.db %DATE_ANALYSE%"

start "CMT Classement" cmd /c "cd /d C:\Aspibet.Api\GitHub-Repo\Carr--Magique-Turf && python cmt_analyse_classement.py RAPPORTS\%DATE_ANALYSE% C:\Aspibet.Api\historique\historique_pmu.db %DATE_ANALYSE%"

exit
