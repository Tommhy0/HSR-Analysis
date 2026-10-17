"""Generate full-roster numeric contracts; registration remains an explicit code decision."""
import argparse
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'_data_cache/strict_research'

def build(check=False):
    d=json.loads((ROOT/'_data_cache/hsr_core.json').read_text(encoding='utf-8'))
    if d['_meta']['version']!='4.6':raise ValueError('Roster rules require re-audit for a new dataset')
    raw_skills={(r['SkillID'],r['Level']):r for r in json.loads((CACHE/'AvatarSkillConfig.json').read_text())}
    rows=json.loads((CACHE/'AvatarConfig.json').read_text(encoding='utf-8'))
    avatar={r['AvatarID']:r for r in rows}
    promotions=json.loads((CACHE/'AvatarPromotionConfig.json').read_text())+json.loads((CACHE/'AvatarPromotionConfigLD.json').read_text())
    aggro={r['AvatarID']:r['BaseAggro']['Value'] for r in promotions if r.get('Promotion',0)==0}
    tables={};evidence={}
    for ch in d['characters']:
        cid=ch['id'];cfg=avatar.get(cid);facts=dict(id=cid,name=ch['name'],energyMax=ch['energyMax'],element=ch['element'],path=ch['path'],aggro=aggro.get(cid),skills={},traces=[t for t in d['traces'] if t['charId']==cid and t['type']==3],ranks={r['rank']:r['params'] for r in d['ranks'] if r['charId']==cid})
        for skill in d['skills']:
            if skill['charId']==cid and skill['type'] in ['Normal','BPSkill','Ultra','Talent','Maze']:
                if cid in [1101,1105,1202,1313,1403,1009,1106,1215,1301,1002,1103,1013]:
                    for level,param in skill['params'].items():
                        raw=raw_skills.get((skill['id'],int(level)))
                        values=[x['Value'] for x in raw.get('ParamList',[])] if raw else None
                        if values is None or len(values)!=len(param['param_list']) or any(abs(a-b)>1e-6 for a,b in zip(values,param['param_list'])):raise ValueError(f"Release parameter mismatch: {cid}/{skill['id']}/{level}")
                facts['skills'][str(skill['id'])]={k:skill.get(k) for k in ['id','name','type','params','stance','spBase','bpNeed','bpAdd','tag']}
        collaboration={1014:'Avatar_Saber_00_Ability.json',1015:'Avatar_Archer_00_Ability.json',1508:'Avatar_TohsakaRin_00_Ability.json',1509:'Avatar_Gilgamesh_00_Ability.json'}
        if cfg or cid in collaboration:
            filename=collaboration.get(cid) or Path(cfg['JsonPath']).name.replace('_Config.json','_Ability.json');p=CACHE/filename
            if p.exists():
                raw=p.read_bytes();obj=json.loads(raw)
                evidence[cid]=dict(filename=filename,sha256=hashlib.sha256(raw).hexdigest(),url='https://github.com/DimbreathBot/TurnBasedGameData/blob/312b4597691e0a29cf9828a15b592757dba86949/Config/ConfigAbility/Avatar/'+filename)
                facts['hits']={}
                def attacks(node,out):
                    if isinstance(node,dict):
                        if node.get('$type')=='RPG.GameCore.AttackData' and 'DamagePercentage' in node and node.get('AttackType')!='Pursued':out.append(node.get('HitSplitRatio',{}).get('FixedValue',{}).get('Value',1))
                        for v in node.values():attacks(v,out)
                    elif isinstance(node,list):
                        for v in node:attacks(v,out)
                for ability in obj.get('AbilityList',[]):
                    hits=[];attacks(ability.get('OnStart',[]),hits)
                    if hits:facts['hits'][ability['Name']]=hits
        tables[cid]=facts
    compact=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
    def save(path,text):
        if check:
            if path.read_text(encoding='utf-8')!=text:raise ValueError('Roster facts have drifted: '+str(path))
        else:path.write_text(text,encoding='utf-8')
    save(ROOT/'simulator/roster-data.mjs','// Full-roster numeric data, not an assertion of implemented mechanics.\nexport const ROSTER_DATA='+compact(tables)+';\n')
    save(ROOT/'data/combat/roster-evidence.json',json.dumps(dict(revision='312b4597691e0a29cf9828a15b592757dba86949',characters=evidence),ensure_ascii=False,indent=2)+'\n')
    print('Roster numeric contracts:',len(tables),'Ability sources:',len(evidence))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');build(parser.parse_args().check)
