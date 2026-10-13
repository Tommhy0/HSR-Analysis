"""Rebuild the arbitration database from the same validated version as the core DB."""
import argparse,importlib.util,json,os,pathlib,shutil,sqlite3,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
def build_peak(version):
 source=ROOT/'_data_cache/versions'/version;raw=ROOT/'_data_cache/peak_raw'/version;raw.mkdir(parents=True,exist_ok=True)
 for name in ['maze_peak','monster','monstervalue','HardLevelGroup','EliteGroup','InfiniteEliteGroup']:
  shutil.copy2(source/(name+'.json'),raw/('cdn_'+name+'.json'))
 shutil.copy2(source/'zh/peak/version.json',raw/'cdn_peak_version.json')
 versions=json.loads((raw/'cdn_peak_version.json').read_text('utf-8'))
 seasons=sorted({int(i) for ids in versions.values() for i in ids})
 for period in seasons:shutil.copy2(source/f'zh/peak/{period}.json',raw/f'cdn_peak_{period}.json')
 for file in (ROOT/'data/wiki').glob('*.json'):shutil.copy2(file,raw/file.name)
 spec=importlib.util.spec_from_file_location('peak_builder',ROOT/'_scripts/vendor/build_peak.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 target=ROOT/f'data/databases/peak_{version}.db';staging=target.with_name(target.name+'.'+str(time.time_ns())+'.staging.db')
 module.RAW=str(raw);module.DB=str(staging);module.JSON_OUT=str(ROOT/'data/peak_database.json')
 b=module.Builder();b.build();b.build_wiki();b.cross_check();b.finish(version);module.dump_json(b)
 actual=b.db.execute('SELECT COUNT(*) FROM season').fetchone()[0]
 if actual!=len(seasons) or b.db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Peak database incomplete')
 counts={t:b.db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['season','stage','stage_monster']};b.db.close()
 if target.exists():shutil.copy2(target,target.with_name(target.name+'.backup.'+str(time.time_ns())))
 os.replace(staging,target)
 print(json.dumps({'version':version,'file':target.relative_to(ROOT).as_posix(),'counts':counts},ensure_ascii=False))
 return target
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--version',default='4.6');args=p.parse_args();build_peak(args.version)
