import importlib.util,json,pathlib,shutil,uuid,unittest,urllib.error,sys
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent.parent
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
legacy=load('tested_updater',ROOT/'_scripts/vendor/auto_update.py')
upgrade=load('tested_new_updater',ROOT/'_scripts/update_database.py')
class Response:
 def __init__(self,body):self.body=body;self.headers={}
 def read(self,*args):return self.body
 def __enter__(self):return self
 def __exit__(self,*args):pass
class UpdaterTests(unittest.TestCase):
 def setUp(self):
  folder=ROOT/'_data_cache/test_tmp';folder.mkdir(parents=True,exist_ok=True)
  self.root=folder/('case_'+uuid.uuid4().hex);self.root.mkdir()
  self.assertTrue(self.root.resolve().is_relative_to(ROOT.resolve()))
 def tearDown(self):
  self.assertTrue(self.root.resolve().is_relative_to((ROOT/'_data_cache/test_tmp').resolve()));shutil.rmtree(self.root)
 def test_html_response_cannot_replace_json(self):
  p=self.root/'data.json';p.write_bytes(b'{"known":1}')
  with patch.object(legacy.urllib.request,'urlopen',return_value=Response(b'<html>error</html>')),patch.object(legacy.time,'sleep'):
   status,_=legacy.fetch_one('https://example.invalid/data.json',str(p))
  self.assertEqual(status,'failed');self.assertEqual(p.read_bytes(),b'{"known":1}')
 def test_json_scalar_not_accepted(self):
  p=self.root/'data.json'
  with patch.object(legacy.urllib.request,'urlopen',return_value=Response(b'0')),patch.object(legacy.time,'sleep'):
   status,_=legacy.fetch_one('https://example.invalid/data.json',str(p))
  self.assertEqual(status,'failed');self.assertFalse(p.exists())
 def test_valid_json_is_atomically_written(self):
  p=self.root/'data.json'
  with patch.object(legacy.urllib.request,'urlopen',return_value=Response(b'{"new":2}')):
   status,_=legacy.fetch_one('https://example.invalid/data.json',str(p),is_new=True)
  self.assertEqual(status,'new');self.assertEqual(json.loads(p.read_bytes()),{'new':2});self.assertFalse(p.with_name('data.json.part').exists())
 def test_304_retains_local_data(self):
  p=self.root/'data.json';p.write_bytes(b'{"known":1}')
  err=urllib.error.HTTPError('https://example.invalid',304,'Not Modified',{},None)
  with patch.object(legacy.urllib.request,'urlopen',side_effect=err):
   status,_=legacy.fetch_one('https://example.invalid/data.json',str(p),info={'etag':'v1'})
  self.assertEqual(status,'unchanged');self.assertEqual(p.read_bytes(),b'{"known":1}')
  err.close()
 def test_beta_is_not_a_formal_database(self):
  with patch.object(legacy.urllib.request,'urlopen',return_value=Response(b'https://static.nanoka.cc/hsr/4.6.51/character.json')),patch.object(legacy,'http_probe_exists',side_effect=lambda url:'/4.6.51/' in url),patch.object(legacy,'log'):
   with self.assertRaisesRegex(RuntimeError,'正式服'):legacy.discover_versions()
 def test_build_only_rejects_modified_cache(self):
  dest=self.root/'_data_cache/versions/4.6';dest.mkdir(parents=True)
  (dest/'a.json').write_text('{}',encoding='utf-8');(dest/'.manifest.json').write_text(json.dumps({'a.json':{'sha256':'bad'}}),encoding='utf-8')
  (self.root/'_data_cache/update_report.json').write_text(json.dumps({'version':'4.6','failures':[]}),encoding='utf-8')
  class FakeLegacy:BASE='https://example.invalid'
  with patch.object(upgrade,'ROOT',self.root),patch.object(upgrade,'module',return_value=FakeLegacy),patch.object(sys,'argv',['update','--version','4.6','--build-only']),patch.object(upgrade,'build_database') as build:
   with self.assertRaisesRegex(RuntimeError,'hash mismatch'):upgrade.main()
   build.assert_not_called()
 def test_failed_snapshot_cannot_build(self):
  (self.root/'_data_cache').mkdir();(self.root/'_data_cache/update_report.json').write_text(json.dumps({'version':'4.6','failures':[{'optional':False}]}),encoding='utf-8')
  class FakeLegacy:BASE='https://example.invalid'
  with patch.object(upgrade,'ROOT',self.root),patch.object(upgrade,'module',return_value=FakeLegacy),patch.object(sys,'argv',['update','--version','4.6','--build-only']):
   with self.assertRaisesRegex(RuntimeError,'completely downloaded'):upgrade.main()
 def test_failed_atomic_replace_preserves_existing_data(self):
  p=self.root/'data.json';p.write_bytes(b'{"known":1}')
  with patch.object(legacy.urllib.request,'urlopen',return_value=Response(b'{"new":2}')),patch.object(legacy.os,'replace',side_effect=PermissionError('destination locked')),patch.object(legacy.time,'sleep'):
   status,_=legacy.fetch_one('https://example.invalid/data.json',str(p))
  self.assertEqual(status,'failed');self.assertEqual(p.read_bytes(),b'{"known":1}')
if __name__=='__main__':unittest.main()
