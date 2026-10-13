@echo off
cd /d "%~dp0planta-rj2-unificada"
echo Planta em http://localhost:8765/index.html (feche esta janela para parar)
start "" http://localhost:8765/index.html
python -m http.server 8765 || py -m http.server 8765
pause
