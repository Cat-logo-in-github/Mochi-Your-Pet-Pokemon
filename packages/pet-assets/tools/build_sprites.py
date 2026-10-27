"""Build Mochi's Eevee-family runtime pack from the pinned original SpriteCollab sheets.
Offline; Python 3.11+ and Pillow. No interpolation, recoloring, generated motion or 3D runtime.
Source artwork and its licenses remain separate from Mochi's MIT application code.
"""
import hashlib,json,math,re,shutil,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image,ImageChops
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'source';OUT=ROOT/'public'/'mochi'
SPECIES=['eevee','vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon']
DIRECTIONS=['front','front-right','right','back-right','back','back-left','left','front-left']
TILE=256;COLS=8;ROWS=4;CAPACITY=32;TICK_MS=20
CORE={
 'idle':['Idle'],'walk':['Walk'],'run':['Walk'],'turn':['Rotate'],
 'stretch':['Wake','Charge'],'groom':['TailWhip','Twirl','RearUp','Shake','Withdraw','Shock','SpAttack','Pose','Idle'],
 'pounce':['Attack'],'play':['Double','Swing','Hop'],'feed':['Eat','Hop'],'happy':['Hop'],
 'sleep':['Sleep'],'alert':['LookUp','Charge'],'carry':['Pull','Hurt']}
LOOPS={'idle','walk','run','sleep','carry'}
SOURCE_LOOPS={'Idle','Walk','Sleep','EventSleep','Float','DeepBreath','Laying'}
receipt=json.loads((SOURCE/'SOURCE.json').read_text(encoding='utf8'))
for record in receipt['files']:
 data=(SOURCE/record['path']).read_bytes()
 if len(data)!=record['bytes'] or hashlib.sha256(data).hexdigest()!=record['sha256']:raise ValueError('Source receipt mismatch: '+record['path'])
OUT.mkdir(parents=True,exist_ok=True);(OUT/'atlases').mkdir(exist_ok=True);(OUT/'posters').mkdir(exist_ok=True)
manifest={'version':2,'render':'sprite-sheet-2d','tileSize':TILE,'columns':COLS,'rows':ROWS,'framesPerAtlas':CAPACITY,'defaultSkin':'eevee','defaultDirection':'front','clips':{},'sourceActionsCatalog':[],'species':{},'sourceRevision':receipt['revision'],'sourceTickMs':TICK_MS}
catalog={};expected_files=set();total_drawn=0

def slug(name):
 value=re.sub('[^a-z0-9_]','',name.lower())
 if not value:raise ValueError('Invalid source action name')
 return value

def label(name):return re.sub(r'(?<=[a-z])(?=[A-Z])',' ',name)

def load_species(species):
 folder=SOURCE/'spritecollab'/species
 nodes={n.findtext('Name'):n for n in ET.parse(folder/'AnimData.xml').getroot().find('Anims')}
 cache={}
 def resolve(name,visited=()):
  if name in visited:raise ValueError('Source CopyOf cycle')
  node=nodes[name];copy=node.findtext('CopyOf')
  return resolve(copy,visited+(name,)) if copy else name
 def animation(name):
  original=resolve(name)
  if original in cache:return cache[original]
  node=nodes[original];w,h=int(node.findtext('FrameWidth')),int(node.findtext('FrameHeight'))
  durations=[int(d.text) for d in node.find('Durations')]
  if not durations or any(d<=0 for d in durations):raise ValueError('Invalid source frame durations')
  image=Image.open(folder/(original+'-Anim.png')).convert('RGBA');shadow=Image.open(folder/(original+'-Shadow.png')).convert('RGBA')
  if image.size!=shadow.size or image.width!=w*len(durations) or image.height%h:raise ValueError('Source geometry/timing mismatch '+species+' '+name)
  rows=image.height//h
  if rows not in [1,8]:raise ValueError('Unsupported source direction count')
  r,g,b,a=shadow.split();white=ImageChops.multiply(r,ImageChops.multiply(g,b))
  frames=[];side=up=down=0
  for row in range(rows):
   sequence=[]
   for f in range(len(durations)):
    cell=(f*w,row*h,(f+1)*w,(row+1)*h);frame=image.crop(cell);marker=white.crop(cell).getbbox()
    if not marker or marker[2]-marker[0]!=1 or marker[3]-marker[1]!=1:raise ValueError('Missing precise source shadow anchor '+species+' '+name)
    anchor=(marker[0],marker[1]);bounds=frame.getchannel('A').getbbox()
    if not bounds:raise ValueError('Empty source drawing '+species+' '+name)
    side=max(side,anchor[0]-bounds[0],bounds[2]-anchor[0]);up=max(up,anchor[1]-bounds[1]);down=max(down,bounds[3]-anchor[1])
    sequence.append((frame,anchor,bounds))
   frames.append(sequence)
  cache[original]={'name':original,'durations':durations,'rows':rows,'frames':frames,'side':side,'up':up,'down':down}
  return cache[original]
 for name in nodes:animation(name)
 return folder,nodes,animation,cache

for species in SPECIES:
 folder,nodes,animation,source_cache=load_species(species)
 side=max(a['side'] for a in source_cache.values());up=max(a['up'] for a in source_cache.values());down=max(a['down'] for a in source_cache.values())
 scale=min(4,int((TILE-8)//max(2*side,up+down)))
 if scale<2:raise ValueError('Source animations exceed the pixel-art budget')
 ground=(128,min(216,TILE-4-down*scale))
 if ground[1]-up*scale<4:raise ValueError('Source vertical framing cannot fit')
 manifest['species'][species]={'label':species.title(),'pixelScale':scale,'groundAnchor':list(ground),'sourceAnimationCount':len(nodes),'originalSheets':len(source_cache)}
 packed={};posters={}
 for original,source in source_cache.items():
  for row,frames in enumerate(source['frames']):
   heading=DIRECTIONS[row] if source['rows']==8 else 'front';paths=[]
   for start in range(0,len(frames),CAPACITY):
    atlas=Image.new('RGBA',(TILE*COLS,TILE*ROWS))
    for f in range(start,min(start+CAPACITY,len(frames))):
     frame,anchor,bounds=frames[f];drawing=frame.crop(bounds);drawing=drawing.resize((drawing.width*scale,drawing.height*scale),Image.Resampling.NEAREST)
     x=ground[0]+(bounds[0]-anchor[0])*scale;y=ground[1]+(bounds[1]-anchor[1])*scale
     if x<2 or y<2 or x+drawing.width>TILE-2 or y+drawing.height>TILE-2:raise ValueError('Clipped source frame '+species+' '+original+' '+str(f))
     tile=Image.new('RGBA',(TILE,TILE));tile.paste(drawing,(x,y));cell=f-start;atlas.paste(tile,((cell%COLS)*TILE,(cell//COLS)*TILE))
     if original=='Idle' and row==0 and f==0:posters[species]=tile
    path=f'atlases/{species}_{slug(original)}_{heading}_{start//CAPACITY:02d}.png';atlas.save(OUT/path,compress_level=6);expected_files.add(path);paths.append(path)
   packed[(original,row)]=paths
 def clip(action,source_name,rate=1.,loop=False):
  source=animation(source_name)
  holds=[max(16,round(t*TICK_MS/rate,4)) for t in source['durations']];seconds=sum(holds)/1000
  for row in range(source['rows']):
   heading=DIRECTIONS[row] if source['rows']==8 else 'front';key=f'{action}_{species}_{heading}'
   manifest['clips'][key]={'action':action,'skin':species,'direction':heading,'fps':max(.5,min(50,len(holds)/seconds)),'frameCount':len(holds),'loop':loop,'duration':round(seconds,6),'frameDurationsMs':holds,'atlases':packed[(source['name'],row)],'sourceAnimation':source_name,'sourceResolved':source['name'],'sourceFile':f'source/spritecollab/{species}/{source["name"]}-Anim.png','sourceRow':row,'sourcePlaybackRate':rate}
 for action,preferences in CORE.items():
  chosen=next((name for name in preferences if name in nodes),None)
  if chosen is None:raise ValueError('Missing required behavior source '+species+' '+action)
  clip(action,chosen,1.6 if action=='run' else 1.,action in LOOPS)
 for name in nodes:
  action='pmd_'+slug(name);source=animation(name);clip(action,name,loop=name in SOURCE_LOOPS)
  entry=catalog.setdefault(action,{'action':action,'label':label(name),'sourceName':name,'skins':[],'directionsBySkin':{}});entry['skins'].append(species);entry['directionsBySkin'][species]=DIRECTIONS if source['rows']==8 else ['front']
 posters[species].save(OUT/'posters'/f'{species}.png',compress_level=6)
 total_drawn+=sum(len(sequence) for source in source_cache.values() for sequence in source['frames'])
 print('PACKED',species,len(nodes),'source actions',scale,'x pixels',flush=True)
manifest['sourceActionsCatalog']=sorted(catalog.values(),key=lambda e:e['label'].lower())
(OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n',encoding='utf8')
# Remove only obsolete generated atlas files under the fixed runtime atlas folder.
atlas_root=(OUT/'atlases').resolve()
for path in atlas_root.glob('*.png'):
 if 'atlases/'+path.name not in expected_files:
  if path.resolve().parent!=atlas_root:raise ValueError('Unsafe stale atlas path')
  path.unlink()
for name in ['SOURCE.json','LICENSE-SpriteCollab.md']:shutil.copyfile(SOURCE/name,OUT/name)
credit_rows={}
for line in (SOURCE/'credit_names.txt').read_text(encoding='utf-8-sig').splitlines()[1:]:
 values=line.split('\t')
 if len(values)>=3:credit_rows[values[1]]=(values[0],values[2])
credits=['# Eevee family artwork credits','','Mochi is an unofficial, non-commercial fan project. Pokémon names and character designs belong to Nintendo, Creatures Inc. and GAME FREAK. Original Pokémon Mystery Dungeon artwork is credited to CHUNSOFT/Spike Chunsoft and the original rights holders. No affiliation or endorsement is claimed.','','Source: PMDCollab/SpriteCollab, pinned revision '+receipt['revision']+'. Original sheets, XML timing, shadows, offsets and complete per-species credit histories are preserved in packages/pet-assets/source.','','Community artwork is supplied under SpriteCollab’s CC BY-NC 4.0 submission/use policy. See LICENSE-SpriteCollab.md. These sprite assets are excluded from the application code’s MIT license.','','Changes: lossless frame extraction, exact shadow-anchor alignment, integer nearest-neighbor enlargement, atlas packing, source timing conversion at20ms per tick, and a faster walking cycle for the run behavior. Colors/drawings are unchanged. Core behaviors intentionally reuse named available source animations; forms without Eat use a happy Hop reaction.','','## Per-species contributors','']
for species in SPECIES:
 authors=[]
 for line in (SOURCE/'spritecollab'/species/'credits.txt').read_text(encoding='utf-8-sig').splitlines():
  values=line.split('\t')
  if len(values)<2:continue
  key=values[1];name,contact=credit_rows.get(key,(key,''));author=f'[{name}]({contact})' if contact.startswith('https://') else name
  if author not in authors:authors.append(author)
 credits.append('- **'+species.title()+'**: '+', '.join(authors)+'.')
(OUT/'CREDITS.md').write_text('\n'.join(credits)+'\n',encoding='utf8')
summary={'species':len(SPECIES),'clips':len(manifest['clips']),'sourceActions':len(catalog),'atlases':len(expected_files),'sourceDrawings':total_drawn,'runtimeFrames':sum(c['frameCount'] for c in manifest['clips'].values()),'manifestBytes':(OUT/'manifest.json').stat().st_size}
(SOURCE/'BUILD-INFO.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
print(json.dumps(summary,indent=2),flush=True)


# Icons use the same unchanged source drawing, with crisp nearest-neighbor resizing.
import subprocess,sys
subprocess.run([sys.executable,str(ROOT/'tools'/'export_icons.py')],check=True)
