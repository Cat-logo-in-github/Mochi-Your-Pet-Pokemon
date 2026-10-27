"""Export matching full-body Eevee application icons from the real sprite poster."""
from pathlib import Path
from PIL import Image
from io import BytesIO
import struct
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public'/'mochi';repo=ROOT.parents[1]
with Image.open(OUT/'posters'/'eevee.png') as image:
 portrait=image.convert('RGBA');portrait=portrait.crop(portrait.getchannel('A').getbbox())
def icon(size):
 frame=Image.new('RGBA',(size,size));factor=min(size*.88/portrait.width,size*.88/portrait.height)
 shape=portrait.resize((max(1,round(portrait.width*factor)),max(1,round(portrait.height*factor))),Image.Resampling.NEAREST)
 frame.paste(shape,((size-shape.width)//2,(size-shape.height)//2));return frame
for size in [16,48,128]:icon(size).save(repo/'apps'/'extension'/'icons'/f'icon{size}.png',compress_level=6)
icon(128).save(repo/'apps'/'web'/'public'/'favicon.png',compress_level=6)
sizes=[16,24,32,48,64,128,256];blobs=[]
for size in sizes:
 buffer=BytesIO();icon(size).save(buffer,format='PNG');blobs.append(buffer.getvalue())
header=struct.pack('<HHH',0,1,len(sizes));offset=6+16*len(sizes);entries=[]
for size,blob in zip(sizes,blobs):
 entries.append(struct.pack('<BBBBHHII',0 if size==256 else size,0 if size==256 else size,0,0,1,32,len(blob),offset));offset+=len(blob)
(repo/'apps'/'windows-companion'/'assets'/'mochi.ico').write_bytes(header+b''.join(entries)+b''.join(blobs))
print('Matching full-body Eevee desktop/browser/web icons exported.',flush=True)
