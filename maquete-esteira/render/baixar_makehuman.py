"""Baixa os dados livres (CC0) do MakeHuman usados pelas pessoas: malha-base, esqueleto, pesos e alvos de forma."""
import os, io, json, zipfile, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
MH = os.environ.get('MH_DIR', os.path.join(HERE, 'mh'))
RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
for f in ['3dobjs/base.obj', 'rigs/default.mhskel', 'rigs/default_weights.mhw']:
    dst = os.path.join(MH, f); os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst):
        print('baixando', f); urllib.request.urlretrieve(RAW + f, dst)
dst = os.path.join(MH, 'makehuman/data/targets.npz')
if not os.path.exists(dst):
    meta = json.load(urllib.request.urlopen('https://pypi.org/pypi/makehuman/json'))
    url = next(u['url'] for u in meta['urls'] if u['filename'].endswith('.whl'))
    print('baixando alvos de forma (pacote pip makehuman)')
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read()))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(z.read('makehuman/data/targets.npz'))
print('pronto:', MH)
