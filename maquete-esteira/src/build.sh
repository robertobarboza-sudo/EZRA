#!/bin/bash
set -e
cd "$(dirname "$0")"
CDN=https://cdn.jsdelivr.net/npm
emit() { # $1 = mode (cdn|local)
  cat a_head.html
  if [ "$1" = cdn ]; then T3=$CDN/three@0.186.1; BVH=$CDN/three-mesh-bvh@0.9.15; PTR=$CDN/three-gpu-pathtracer@0.0.26; else T3=./nm/three; BVH=./nm/three-mesh-bvh; PTR=./nm/three-gpu-pathtracer; fi
  cat <<IM
<script type="importmap">
{ "imports": {
  "three": "$T3/build/three.module.js",
  "three/webgpu": "$T3/build/three.webgpu.js",
  "three/tsl": "$T3/build/three.tsl.js",
  "three/addons/": "$T3/examples/jsm/",
  "three/examples/jsm/": "$T3/examples/jsm/",
  "three-mesh-bvh": "$BVH/build/index.module.js",
  "three-gpu-pathtracer": "$PTR/build/index.module.js"
} }
</script>
IM
  echo '<script type="module">'
  cat a_imports.js
  echo 'const main = () => {'
  cat b_core.js c_geo.js d_human.js e_world.js f_sim.js p_plant.js g_ui.js
  echo '};'
  echo "Promise.race(["
  echo "  Promise.all([document.fonts.load('800 80px Archivo'), document.fonts.load('600 60px \"IBM Plex Mono\"')]),"
  echo "  new Promise(r => setTimeout(r, 2500)),"
  echo "]).catch(() => {}).then(main);"
  echo '</script>'
  echo '</body>'
  echo '</html>'
}
emit cdn > ../index.html
emit local > test.html
# teste local sem internet: npm install (package.json desta pasta) cria node_modules; o importmap usa ./nm
[ -d node_modules ] && ln -sfn node_modules nm
[ -e pessoas ] || ln -sfn ../pessoas pessoas
node --input-type=module -e "import fs from 'fs'; const s=fs.readFileSync('test.html','utf8'); const js=s.split('<script type=\"module\">')[1].split('</script>')[0].replace(/^import .*$/gm,''); new Function(js); console.log('syntax ok', js.length)"
