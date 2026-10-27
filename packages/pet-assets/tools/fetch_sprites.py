"""Fetch the pinned, credited Eevee family source sheets. Normal app builds are offline.
Python 3.11+, standard library only. --verify checks an existing receipt offline.
"""
import argparse,concurrent.futures,hashlib,json,re,time,urllib.request,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'source'
PIN='989a2b0d7272e382a0fb51bb611f744256adafbc'
FAMILY={'eevee':'0133','vaporeon':'0134','jolteon':'0135','flareon':'0136','espeon':'0196','umbreon':'0197','leafeon':'0470','glaceon':'0471','sylveon':'0700'}
p=argparse.ArgumentParser();p.add_argument('--revision',default=PIN);p.add_argument('--verify',action='store_true');p.add_argument('--checkout',type=Path,help='Optional local Git checkout at the pinned revision.');a=p.parse_args()
if not re.fullmatch('[0-9a-f]{40}',a.revision):raise ValueError('Use an explicit 40-character source commit.')
def get(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mochi-sprite-importer/2.0'}),timeout=30) as r:return r.read()
  except Exception:
   if attempt==2:raise
   time.sleep(.3*(attempt+1))
def digest(data):return hashlib.sha256(data).hexdigest()
receipt_path=SOURCE/'SOURCE.json'
if a.verify:
 receipt=json.loads(receipt_path.read_text(encoding='utf8'))
 for file in receipt['files']:
  path=SOURCE/file['path']
  if digest(path.read_bytes())!=file['sha256']:raise ValueError('Source hash mismatch: '+file['path'])
 print('Verified',len(receipt['files']),'pinned source files.');raise SystemExit
SOURCE.mkdir(parents=True,exist_ok=True)
if a.checkout:
 actual=subprocess.check_output(['git','-C',str(a.checkout),'rev-parse','HEAD'],text=True).strip()
 if actual!=a.revision:raise ValueError('Checkout revision differs from requested pin.')
jobs=[]
for species,dex in FAMILY.items():
 print('LIST',species,flush=True)
 listing=([{'name':file.name,'type':'file'} for file in (a.checkout/'sprite'/dex).iterdir() if file.is_file()] if a.checkout else json.loads(get(f'https://api.github.com/repos/PMDCollab/SpriteCollab/contents/sprite/{dex}?ref={a.revision}')))
 for item in listing:
  name=item['name']
  if item['type']=='file' and re.fullmatch(r'[A-Za-z0-9_-]+\.(?:png|xml|txt)',name):
   jobs.append((f'spritecollab/{species}/{name}',f'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/{a.revision}/sprite/{dex}/{name}'))
for local,remote in [('LICENSE-SpriteCollab.md','LICENSE.md'),('credit_names.txt','credit_names.txt')]:jobs.append((local,f'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/{a.revision}/{remote}'))
def download(job):
 name,url=job
 if a.checkout:
  parts=name.split('/')
  original=(a.checkout/'sprite'/FAMILY[parts[1]]/parts[2]) if parts[0]=='spritecollab' else a.checkout/('LICENSE.md' if name=='LICENSE-SpriteCollab.md' else name)
  data=original.read_bytes()
 else:data=get(url)
 path=SOURCE/name
 if not path.resolve().is_relative_to(SOURCE.resolve()):raise ValueError(f'Unsafe source path: {path.resolve()} versus {SOURCE.resolve()}')
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 return {'path':name,'url':url,'sha256':digest(data),'bytes':len(data)}
print('DOWNLOAD',len(jobs),'files',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:files=sorted(pool.map(download,jobs),key=lambda file:file['path'])
receipt={'repository':'https://github.com/PMDCollab/SpriteCollab','revision':a.revision,'license':'CC BY-NC 4.0 repository policy; original owners and individual credits retained','licenseUrl':'https://creativecommons.org/licenses/by-nc/4.0/','family':FAMILY,'files':files}
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
print('Fetched',len(files),'source files from',a.revision,flush=True)
