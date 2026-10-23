# Genera src/renderer/i18n.js a partir de src/renderer/i18n-data.txt
import json, os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '..', 'src', 'renderer', 'i18n-data.txt')
lines = [l.rstrip('\n') for l in open(src, encoding='utf-8') if l.strip()]
cols = [c.strip() for c in lines[0].split(' | ')]
data = {c: {} for c in cols[1:]}
for n, l in enumerate(lines[1:], 2):
    parts = [p.strip() for p in l.split(' | ')]
    if len(parts) != len(cols):
        raise SystemExit(f'linea {n}: {len(parts)} columnas: {l[:60]}')
    es = parts[0]
    for c, v in zip(cols[1:], parts[1:]):
        if v.count('#') != es.count('#'):
            raise SystemExit(f'linea {n} ({c}): numero de # distinto: {l[:60]}')
        data[c][es] = v
engine = open(os.path.join(here, 'i18n-engine.js'), encoding='utf-8').read()
out = engine.replace('/*DATA*/{}', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
open(os.path.join(here, '..', 'src', 'renderer', 'i18n.js'), 'w', encoding='utf-8').write(out)
print('ok', {k: len(v) for k, v in data.items()})
