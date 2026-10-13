"""Download numerical affix tables and retain the upstream license/provenance."""
import json, urllib.request, pathlib, hashlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HSR-Analysis'}),timeout=40) as r: return r.read()
if __name__=='__main__':
 tree=json.loads(get('https://api.github.com/repos/Mar-7th/StarRailRes/git/trees/master?recursive=1'))
 files=[x['path'] for x in tree['tree'] if x['type']=='blob' and ('affix' in x['path'] or 'affixes' in x['path']) and x['path'].startswith('index')]
 print(json.dumps(files,ensure_ascii=False))
 dest=ROOT/'data'/'relics'; dest.mkdir(parents=True,exist_ok=True)
 manifest={'repository':'https://github.com/Mar-7th/StarRailRes','treeSha':tree['sha'],'files':[]}
 for stem in ['relic_main_affixes.json','relic_sub_affixes.json']:
  matches=[p for p in files if p.startswith('index_new/cn/') and p.endswith('/'+stem)] or [p for p in files if p.startswith('index_new/en/') and p.endswith('/'+stem)] or [p for p in files if p.endswith('/'+stem)]
  if not matches: raise RuntimeError('No upstream table: '+stem)
  path=matches[0]; blob=get('https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/'+path)
  json.loads(blob); (dest/stem).write_bytes(blob)
  manifest['files'].append({'path':path,'sha256':hashlib.sha256(blob).hexdigest()})
 (dest/'UPSTREAM_LICENSE').write_bytes(get('https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/LICENSE'))
 (dest/'source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Affix tables saved with source hashes.')
