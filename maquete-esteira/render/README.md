# Render fotorrealista da maquete (Blender / Cycles)

Gera imagens com luz física (traçado de raios) e pessoas com corpo humano real (MakeHuman, CC0),
posicionadas nos marcadores exportados pela página da maquete.

## Passo a passo
1. Python 3.13 e o Blender como pacote Python:
   `pip install bpy`
2. Dados das pessoas (malha-base, esqueleto, pesos e alvos de forma do MakeHuman, licença CC0):
   `python baixar_makehuman.py`
3. Na página da maquete: **Exportar 3D (.glb)** com a opção **Sem pessoas (marcadores)**.
   Descompacte e salve como `cena.glb` nesta pasta. Atualize `layout.json` se mudar as premissas.
4. Render (padrão 1600×900, 96 amostras, todas as câmeras):
   `python render_scene.py -- ilha,eixo,inducao,goleiro,aerea`
   - Placa NVIDIA: `GPU=OPTIX python render_scene.py -- ilha` (ou `GPU=CUDA`).
   - Mais qualidade: `SAMPLES=512 RES=3840x2160 GPU=OPTIX python render_scene.py -- ilha`.

Saída: `render_<camera>.png`.

## O que o script faz
- Importa a maquete, remove volumes que estavam nas mãos dos bonecos e cria uma pessoa por marcador.
- Pessoas variam em gênero, origem, peso, musculatura e altura; vestem camisa azul-marinho, calça,
  cinto, botas, luvas e colete refletivo na cor da função; cabelo, olhos e boné; pose pela atividade
  (indução e pescador alcançando a esteira, separador carregando volume, setup empurrando, paleteiro puxando).
- Luz de estúdio com sol suave, câmeras com lente de cinema e profundidade de campo nas vistas próximas.
