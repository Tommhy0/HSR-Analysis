"""Cache pinned public game JSON as data; never execute downloaded content."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'_data_cache/strict_research'
REV='312b4597691e0a29cf9828a15b592757dba86949'

def main():
    avatars=json.loads((CACHE/'AvatarConfig.json').read_text(encoding='utf-8'))
    data=json.loads((ROOT/'_data_cache/hsr_core.json').read_text(encoding='utf-8'))
    tree=json.loads((CACHE/'ability_tree.json').read_text())['tree']
    paths={Path(r['path']).name:r['path'] for r in tree if r['path'].startswith('Avatar/') and r['path'].endswith('_Ability.json')}
    by_id={r['AvatarID']:r for r in avatars}
    def fetch(ch):
        row=by_id.get(ch['id'])
        collaboration={1014:'Avatar_Saber_00_Ability.json',1015:'Avatar_Archer_00_Ability.json',1508:'Avatar_TohsakaRin_00_Ability.json',1509:'Avatar_Gilgamesh_00_Ability.json'}
        if not row and ch['id'] not in collaboration:return dict(id=ch['id'],name=ch['name'],error='角色在当前固定正式数据中无 AvatarConfig 映射')
        filename=collaboration.get(ch['id']) or Path(row['JsonPath']).name.replace('_Config.json','_Ability.json')
        path=paths.get(filename)
        if not path:return dict(id=ch['id'],name=ch['name'],error='未找到固定版本 Ability 文件',filename=filename)
        destination=CACHE/filename
        if not destination.exists():
            raw=urllib.request.urlopen('https://raw.githubusercontent.com/DimbreathBot/TurnBasedGameData/'+REV+'/Config/ConfigAbility/'+quote(path),timeout=60).read()
            json.loads(raw);destination.write_bytes(raw)
        raw=destination.read_bytes();obj=json.loads(raw)
        return dict(id=ch['id'],name=ch['name'],filename=filename,path=path,sha256=hashlib.sha256(raw).hexdigest(),abilities=len(obj.get('AbilityList',[])))
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures={pool.submit(fetch,ch):ch for ch in data['characters']}
        for future in concurrent.futures.as_completed(futures):
            ch=futures[future]
            try:results.append(future.result())
            except Exception as e:results.append(dict(id=ch['id'],name=ch['name'],error=str(e)))
    results.sort(key=lambda x:x['id'])
    report=dict(revision=REV,characters=results)
    out=ROOT/'_data_cache/roster_research/source_index.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(total=len(results),cached=sum('sha256' in r for r in results),missing=[r for r in results if 'error' in r]),ensure_ascii=False))

if __name__=='__main__':main()
