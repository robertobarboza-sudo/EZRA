#!/bin/sh
# Abre a planta RJ2 unificada (sorter + 3 esteiras) no navegador. Requer Python 3.
cd "$(dirname "$0")/planta-rj2-unificada"
echo "Planta em http://localhost:8765/index.html  (Ctrl+C para parar)"
( sleep 1; (open http://localhost:8765/index.html 2>/dev/null || xdg-open http://localhost:8765/index.html) ) &
python3 -m http.server 8765
