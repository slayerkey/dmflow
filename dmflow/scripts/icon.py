"""Generate the app's simple geometric speech-bubble mark without image dependencies."""
from pathlib import Path
import math, struct, zlib
size = 1024
pixels = bytearray()
def distance_segment(x,y,ax,ay,bx,by):
    t=max(0,min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)))
    return math.hypot(x-(ax+t*(bx-ax)),y-(ay+t*(by-ay)))
for y in range(size):
    pixels.append(0)
    for x in range(size):
        qx=max(abs(x-511.5)-310,0); qy=max(abs(y-511.5)-310,0)
        edge=math.hypot(qx,qy)-170
        alpha=max(0,min(1,.5-edge))
        ring=abs(math.hypot(x-512,y-472)-225)-21
        # A lower-left gap and two strokes form the speech tail.
        if x<375 and y>590: ring=999
        tail=min(distance_segment(x,y,341,618,305,760),distance_segment(x,y,305,760,460,693))-21
        white=max(0,min(1,.5-min(ring,tail)))
        green=(24,112,85)
        rgb=[round(c*(1-white)+255*white) for c in green]
        pixels.extend((*rgb,round(alpha*255)))
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b'')
Path('apps/desktop/assets/icon.png').write_bytes(image)
