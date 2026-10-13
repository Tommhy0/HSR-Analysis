"""Validated raw JSON -> SQLite -> active manifest. No change to previous versions.
Usage: python _scripts/update_database.py --version 4.6 [--probe]
"""
import argparse, concurrent.futures, hashlib, importlib.util, json, os, pathlib, sqlite3, time, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parent.parent
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,file); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def request(url,headers=None):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HSR-Analysis/1.0',**(headers or {})}),timeout=35)
def atomic(path,blob):
 path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_name(path.name+'.part'); tmp.write_bytes(blob); os.replace(tmp,path)
def build_database(version,cache,report):
 chars=json.loads((cache/version/'character.json').read_text('utf-8'))
 builder=module('database_builder',ROOT/'_scripts/vendor/build_db.py'); builder.CACHE=str(cache)
 dbDir=ROOT/'data/databases'; dbDir.mkdir(parents=True,exist_ok=True)
 staging=dbDir/f'HSR_{version}.{time.time_ns()}.staging.db'; builder.Builder(version,str(staging)).build()
 with sqlite3.connect(staging) as db:
  if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise RuntimeError('SQLite integrity failed')
  counts={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['characters','character_skills','monster_stats','abyss_wave_monsters']}
  if counts['characters']!=len(chars) or not counts['character_skills']: raise RuntimeError('Database row count mismatch')
 db.close()
 if (cache/version/'zh/peak/version.json').exists() and not any(e.get('optional') for e in report.get('failures',[])):
  peak=module('peak_update',ROOT/'_scripts/build_peak_database.py');peak.build_peak(version)
 output=dbDir/f'HSR_{version}.db'
 if output.exists(): os.replace(output,output.with_name(output.name+'.backup.'+str(time.time_ns())))
 os.replace(staging,output)
 report={**report,'version':version,'database':output.relative_to(ROOT).as_posix(),'counts':counts}
 atomic(ROOT/'data/active_database.json',json.dumps(report,ensure_ascii=False,indent=2).encode())
 print('Activated '+str(output)); print(json.dumps(counts))
def main():
 p=argparse.ArgumentParser(); p.add_argument('--version'); p.add_argument('--probe',action='store_true'); p.add_argument('--build-only',action='store_true'); p.add_argument('--force',action='store_true'); args=p.parse_args()
 if not args.version:
  active=ROOT/'data/active_database.json'
  if args.build_only and active.exists(): args.version=json.loads(active.read_text('utf-8'))['version']
  else:
   discovery=module('version_discovery',ROOT/'_scripts/vendor/auto_update.py'); discovery.OUT_DIR=str(ROOT); discovery.CACHE=str(ROOT/'_data_cache'); discovery.TECH_LOG=str(ROOT/'_data_cache/update_tech.log')
   args.version=discovery.discover_versions()[0]
 if not __import__('re').fullmatch(r'\d+\.\d+(?:\.\d+)?',args.version): p.error('invalid version')
 up=module('legacy_updater',ROOT/'_scripts/vendor/auto_update.py')
 base=up.BASE+'/'+args.version; cache=ROOT/'_data_cache/versions'; dest=cache/args.version
 if args.build_only:
  report=json.loads((ROOT/'_data_cache/update_report.json').read_text('utf-8'))
  if report['version']!=args.version or any(not e['optional'] for e in report['failures']): raise RuntimeError('This version was not completely downloaded')
  manifest=json.loads((dest/'.manifest.json').read_text('utf-8'))
  for rel,info in manifest.items():
   if hashlib.sha256((dest/rel).read_bytes()).hexdigest()!=info['sha256']: raise RuntimeError('Cache hash mismatch '+rel)
  build_database(args.version,cache,report); return
 with request(base+'/character.json') as r: chars=json.load(r)
 if not isinstance(chars,dict) or not chars: raise RuntimeError('Invalid character list')
 if args.probe: print(json.dumps({'version':args.version,'characters':len(chars),'source':base,'available':True})); return
 dest.mkdir(parents=True,exist_ok=True); manifestPath=dest/'.manifest.json'; old=json.loads(manifestPath.read_text('utf-8')) if manifestPath.exists() else {}; manifest=dict(old); failures=[]
 def fetch(rel):
  file=dest/rel; previous=old.get(rel,{}); headers={}
  # Validators only apply to this version URL, and only when the local hash still matches.
  if file.exists() and previous.get('sha256')==hashlib.sha256(file.read_bytes()).hexdigest():
   if previous.get('etag'): headers['If-None-Match']=previous['etag']
   elif previous.get('mtime'): headers['If-Modified-Since']=previous['mtime']
  for attempt in range(3):
   try:
    with request(base+'/'+rel,headers) as r: blob=r.read(); info={'etag':r.headers.get('ETag'),'mtime':r.headers.get('Last-Modified')}
    obj=json.loads(blob)
    if not isinstance(obj,(dict,list)): raise ValueError('Expected JSON object/list')
    info['sha256']=hashlib.sha256(blob).hexdigest(); atomic(file,blob); return rel,info,None
   except urllib.error.HTTPError as e:
    if e.code==304: return rel,previous,None
    if e.code==404: return rel,None,'404'
    err=str(e)
   except Exception as e: err=str(e)
   time.sleep(attempt+1)
  return rel,None,err
 def run(rels,optional=False):
  rels=list(dict.fromkeys(rels)); print(f'Fetching {len(rels)} JSON files',flush=True)
  with concurrent.futures.ThreadPoolExecutor(16) as ex:
   for rel,info,err in ex.map(fetch,rels):
    if err: failures.append({'file':rel,'error':err,'optional':optional})
    else: manifest[rel]=info
  atomic(manifestPath,json.dumps(manifest,ensure_ascii=False,indent=1).encode())
 def load(rel): return json.loads((dest/rel).read_text('utf-8'))
 run(up.CORE_FILES)
 requiredCore=[e for e in failures if e['file'] in ['character.json','lightcone.json','monstervalue.json','monster.json','relicset.json','EliteGroup.json','HardLevelGroup.json']]
 if requiredCore: raise RuntimeError('Required core download failed: '+str(requiredCore))
 run([f'zh/character/{i}.json' for i in load('character.json')]+[f'zh/lightcone/{i}.json' for i in load('lightcone.json')])
 seasonTasks=[]
 for _,(listFile,subdir) in up.ABYSS_MODES.items():
  if (dest/listFile).exists(): seasonTasks.extend(f'zh/{subdir}/{i}.json' for i in load(listFile))
 run(seasonTasks)
 run(['zh/peak/version.json'],True)
 if (dest/'zh/peak/version.json').exists(): run([f'zh/peak/{i}.json' for i in up.peak_season_ids(str(dest))],True)
 monsters=set()
 for rel in seasonTasks:
  if (dest/rel).exists(): monsters |= up.collect_monster_ids_from_season(load(rel))
 run([f'zh/monster/{i}.json' for i in sorted(monsters)])
 report={'version':args.version,'files':len(manifest),'failures':failures,'source':base,'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
 atomic(ROOT/'_data_cache/update_report.json',json.dumps(report,ensure_ascii=False,indent=2).encode())
 # Missing optional archive is allowed; required failures prohibit replacing the active version.
 bad=[e for e in failures if not e['optional']]
 if bad: raise RuntimeError(f'{len(bad)} required downloads failed; active database unchanged. See update_report.json')
 build_database(args.version,cache,report)
if __name__=='__main__': main()
