# Continuar localmente

Retomada do trabalho da maquete RJ2 numa sessão local do Claude Code. Branch: `claude/gifted-knuth-pr16nu`.

## Preparar a máquina

```
git clone https://github.com/robertobarboza-sudo/ezra.git EZRA
cd EZRA
git checkout claude/gifted-knuth-pr16nu
```

Requisitos: Node 20+ e Python 3.10+. Para os conversores, instale `numpy`, `scipy` e `matplotlib`.

### Maquete (planta das 3 esteiras com pessoas e simulação)

```
cd maquete-esteira/src
npm install
npx playwright install chromium   # só para os testes automáticos
# (ou aponte um Chromium já instalado: export PW_CHROMIUM=/caminho/do/chrome)
bash build.sh                     # gera ../index.html (CDN) e test.html (local)
python3 -m http.server 8765
```

Abra no navegador:
- `http://localhost:8765/test.html` (versão local);
- ou `../index.html` servido a partir da pasta `maquete-esteira`.

Testes:
- `node shot.js aerea,planta alta` gera capturas;
- `node simtest2.js` roda 20 min de simulação e mostra a produção.

### Layout do sorter (lido do .nwd)

```
cd layout-rj2
python3 -m http.server 8790
```

Depois abra `http://localhost:8790/index.html`.

O conversor fica em `layout-rj2/conversor` e trabalha numa pasta irmã `nwd_out` com os blocos do `.nwd`. Ordem dos scripts:

```
python3 unz.py SPX_BR_RJ2_ASM3_Layout-V6.1-0729.nwd ../nwd_out
cat ../nwd_out/c000*.bin ../nwd_out/c001*.bin ../nwd_out/c002[0-8]*.bin > ../nwd_out/s0.bin
python3 objs.py ../nwd_out/c0034_*.bin 0x69 2600 objs34.pkl
python3 inst.py
python3 topo_cache.py
python3 export.py modelo.json
```

O nome `c0034_*` é o bloco de ~30 MB; o número pode mudar em outro arquivo.

## Onde paramos

1. **Feito.** O layout do sorter abre em 3D, com metal laranja, esteiras e carrinhos cinza escuro, pilares em concreto e piso estilo maquete.
   - Classificação em `conversor/classify.py`.
   - Os carrinhos são as peças repetidas 765 vezes.
2. **Feito: modo compacto da planta das 3 esteiras.**
   - Em `src/b_core.js` (`SORTER_MODE = true`), a planta fica com cerca de 100 × 61 m.
   - Esteiras a 18,25 m uma da outra; filas de scuttles vazias defasadas em x.
   - Liderança e avarias foram para a faixa leste; não há banheiros nem paredes laterais.
   - Simulação testada: cerca de 6.900 pct/h, sem travas.
3. **A fazer: juntar tudo numa planta só.**
   - Criar `src/s_sorter.js`, incluído no `build.sh` depois de `p_plant.js`.
   - Carregar `layout-rj2/modelo.json` (copiar para `maquete-esteira/sorter/`).
   - Montar as instâncias com os materiais do sorter.
   - Transformação do desenho para a maquete:
     `x = Y_desenho − (262 − L.bx1)`, `y = Z`, `z = X_desenho − (547 − L.bz1)`, em metros.
     O fim da planta (saída) fica na parede norte (Y 262) e o caminho seguro junto à parede leste (X 547).
   - O sorter não projeta sombra (a sombra da maquete é recalculada a ~15 Hz).
   - As linhas 2D viram textura no piso. O WebGPU não tem as linhas instanciadas do visualizador.
   - Piso único cobrindo o galpão: X 225–547, Y 130–262 do desenho.
   - Fog e distância da câmera maiores (galpão de 330 m).
4. **A fazer: dar vida ao sorter.**
   - **Carrinhos:** 765, girando no circuito. Agrupar as peças repetidas 765 vezes pelo carrinho mais próximo; a referência é a forma 3327 (esteira do carrinho, 675 × 590 mm). A ordem do circuito sai do vizinho mais próximo; interpolar a posição e o quatérnio entre carrinhos consecutivos.
   - **Rampas:** forma 253, 765 rampas de 6,5 m, uma por destino. As sacas descem conforme os pacotes chegam: o pacote anda no carrinho, cai na rampa do destino, a saca enche e é trocada.
   - **Colaboradores** (pedido do usuário):
     - indução do sorter: um por pista de indução (as 3 ilhas diagonais);
     - docas com telescópicas: descarregando na ponta interna;
     - rampas: um colaborador a cada 10 rampas.
   - **Pacotes nas esteiras:** usar as placas da classe `esteira` (eixo longo, sentido para o sorter).
5. Depois: testar, publicar a maquete (artifact `E2sk3hkZsjYAoZGX71QVwy`) e o layout (`J1SGnmQxhzRka4QQpNB9hz`), e fazer commit.

## Arquivos

- `maquete-esteira/src/`: fontes da maquete. O `build.sh` junta os arquivos em `index.html`.
- `maquete-esteira/pessoas/`: pessoas MakeHuman (glTF em JSON) e movimentos (CMU).
- `maquete-esteira/ferramentas/`: exportação das pessoas (Blender bpy) e conversor de captura de movimento.
- `layout-rj2/`: visualizador do sorter, `modelo.json` e conversor do `.nwd`.
- `layout-rj2/proposta-local-planta.png`: área aprovada para a planta das esteiras.
