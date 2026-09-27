#!/usr/bin/env python3
"""Build AI/MAXXI identity, editable templates, and deterministic campaign exports.

Requires Pillow, fonttools[woff], and resvg-py. Run from any directory.
Source scenes are preserved in assets/art/source and never included in the kit.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import zipfile
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageOps
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools import subset
import resvg_py

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
BRAND = ASSETS / 'brand'
FONTS = ASSETS / 'fonts'
KIT = ASSETS / 'kit'
ART = ASSETS / 'art'
SOURCE = ART / 'source'
ORANGE = '#FF5A1F'
WHITE = '#F1F0E8'
BLACK = '#080A0B'
STEEL = '#8B969C'
COLORS = {'white': WHITE, 'black': BLACK, 'orange': ORANGE}
FONT_NAMES = {'anton': 'Anton-Regular.ttf', 'archivo': 'Archivo-Variable.ttf', 'space-mono': 'SpaceMono-Regular.ttf'}

# Reconstructed from the original paired-arrow silhouette. Every diagonal is 45°.
# The right tail extends below the left, preserving the distinctive existing rhythm.
ARROW_PATHS = [
    'M0 63H23L62 24V53L77 38V0H35L20 15H48Z',
    'M51 72H74L122 24V53L137 38V0H95L80 15H108Z',
]
# A pixel-snapped 16-unit master opens the space between heads at tiny sizes.
# It keeps matching heads, 45° shafts, and the right arrow's extended tail.
SMALL_ARROW_PATHS = [
    'M0 11H2L6 7V10L8 8V3H4L2 5H6Z',
    'M5 13H7L13 7V10L15 8V3H11L9 5H13Z',
]


def svg(w, h, body, title='AI/MAXXI'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img"><title>{escape(title)}</title>{body}</svg>'


def mark(x=0, y=0, width=137, color=WHITE, opacity=1):
    paths = ''.join(f'<path d="{d}"/>' for d in ARROW_PATHS)
    return f'<g fill="{color}" opacity="{opacity}" transform="translate({x} {y}) scale({width/137})">{paths}</g>'


def render(content, path, width=None, height=None):
    data = resvg_py.svg_to_bytes(svg_string=content, width=width, height=height,
        font_files=[str(FONTS / name) for name in FONT_NAMES.values()],
        skip_system_fonts=True)
    Path(path).write_bytes(data)


def save_svg(name, content, raster_width=None):
    path = BRAND / f'{name}.svg'
    path.write_text(content)
    render(content, path.with_suffix('.png'), width=raster_width)


FONT_CACHE = {}


def text_path(text, x, y, height, color=WHITE, family='anton', max_width=None):
    """Convert actual font glyphs to outlines, fit by ink bounds, retain proportions."""
    if family not in FONT_CACHE:
        FONT_CACHE[family] = TTFont(FONTS / FONT_NAMES[family])
    font = FONT_CACHE[family]
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    pen, bounds, advance = SVGPathPen(glyphs), BoundsPen(glyphs), 0
    for char in text:
        glyphname = cmap.get(ord(char), '.notdef')
        glyph = glyphs[glyphname]
        transform = (1, 0, 0, 1, advance, 0)
        glyph.draw(TransformPen(pen, transform))
        glyph.draw(TransformPen(bounds, transform))
        advance += glyph.width
    if not bounds.bounds:
        return '', 0
    x0, y0, x1, y1 = bounds.bounds
    scale = height / (y1-y0)
    if max_width:
        scale = min(scale, max_width / (x1-x0))
    group = f'<g fill="{color}" transform="translate({x-x0*scale:.4f} {y+y1*scale:.4f}) scale({scale:.7f} {-scale:.7f})"><path d="{pen.getCommands()}"/></g>'
    return group, (x1-x0)*scale


def label(text, x, y, size=16, color=STEEL, letter_spacing=2):
    return f'<text x="{x}" y="{y}" font-family="Space Mono" font-size="{size}" letter-spacing="{letter_spacing}" fill="{color}">{escape(text)}</text>'


def live(text, x, y, size=100, color=WHITE, ident='headline', max_width=972):
    # Font-size is chosen from the same bundled font; SVG text stays editable.
    _, width = text_path(text, 0, 0, size*.75)
    adjusted = min(size, size*max_width/max(width,1))
    return f'<text id="{ident}" x="{x}" y="{y}" font-family="Anton" font-size="{adjusted:.2f}" fill="{color}">{escape(text)}</text>'


def wordmark(x, y, height, color=WHITE, max_width=None):
    return text_path('AI/MAXXI', x, y, height, color, max_width=max_width)


def fonts():
    for family, filename in FONT_NAMES.items():
        out = FONTS / f'{family}-latin.woff2'
        font = TTFont(FONTS / filename)
        options = subset.Options()
        options.flavor = 'woff2'
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes=list(range(0x20,0x250))+list(range(0x2000,0x2070))+[0x20ac,0x2197])
        sub.subset(font)
        font.flavor = 'woff2'
        font.save(out)


def identity():
    for name, color in COLORS.items():
        save_svg(f'mark-{name}', svg(137,72,mark(color=color)), raster_width=1096)
        wm, width = wordmark(0,0,100,color)
        save_svg(f'wordmark-{name}', svg(round(width,2),100,wm), raster_width=1600)
        wm, width = wordmark(230,8,92,color)
        save_svg(f'lockup-horizontal-{name}', svg(round(230+width,2),116,mark(0,10,184,color)+wm), raster_width=1800)
        wm, width = wordmark(0,165,86,color)
        body = mark((width-208)/2,0,208,color)+wm
        save_svg(f'lockup-stacked-{name}', svg(round(width,2),251,body), raster_width=1200)
    avatar = svg(512,512,f'<rect width="512" height="512" fill="{BLACK}"/>'+mark(70,158,372,ORANGE))
    (BRAND/'avatar.svg').write_text(avatar)
    render(avatar, BRAND/'avatar.png')
    for size, name in [(180,'apple-touch-icon'),(192,'icon-192'),(512,'icon-512')]:
        render(avatar, BRAND/f'{name}.png',width=size,height=size)
    small_body=''.join(f'<path d="{p}" fill="{ORANGE}"/>' for p in SMALL_ARROW_PATHS)
    small=svg(16,16,small_body,'AI/MAXXI small-size paired-arrow master')
    (BRAND/'mark-small-orange.svg').write_text(small)
    render(small,BRAND/'mark-small-orange.png',width=512,height=512)
    small_icon=svg(16,16,f'<rect width="16" height="16" fill="{BLACK}"/>'+small_body)
    for size in [16,32,48]:
        render(small_icon,BRAND/f'favicon-{size}.png',width=size,height=size)
    Image.open(BRAND/'favicon-48.png').save(BRAND/'favicon.ico',sizes=[(16,16),(32,32),(48,48)],
        append_images=[Image.open(BRAND/'favicon-16.png'),Image.open(BRAND/'favicon-32.png')])
    # Root compatibility assets use current identity with no old raster contamination.
    shutil.copy2(BRAND/'mark-white.png',ROOT/'icon.png')
    shutil.copy2(BRAND/'lockup-horizontal-white.png',ROOT/'lockup.png')
    shutil.copy2(BRAND/'favicon-32.png',ROOT/'favicon.png')
    (BRAND/'visor-overlay.svg').write_text(svg(480,160,
        f'<path d="M0 32L32 0H448L480 32V128L448 160H32L0 128Z" fill="{BLACK}" fill-opacity=".82"/>'+mark(128,21,224,ORANGE)))
    render((BRAND/'visor-overlay.svg').read_text(),BRAND/'visor-overlay.png',width=1440)
    frame = f'<path d="M0 0H1024V1024H0Z M28 28V996H996V28Z" fill="{ORANGE}" fill-rule="evenodd"/><rect x="746" y="802" width="278" height="222" fill="{BLACK}"/>'+mark(794,858,176,ORANGE)
    (BRAND/'avatar-frame.svg').write_text(svg(1024,1024,frame))
    render((BRAND/'avatar-frame.svg').read_text(),BRAND/'avatar-frame.png')


def templates():
    wm,_=wordmark(54,49,34)
    common=f'<rect width="1080" height="1350" fill="{BLACK}"/>{wm}'+label('COMMUNITY TRANSMISSION',625,76,15)+f'<path d="M54 112H1026" stroke="{STEEL}" stroke-opacity=".5"/>'
    body=common+live('SMALL REQUEST.',54,244,130,ident='request-headline')+live('UNREASONABLE OUTPUT.',54,366,104,ORANGE,ident='result-headline')
    body+=f'<g id="replace-with-your-image"><rect x="54" y="432" width="972" height="686" fill="#151B1E" stroke="{STEEL}" stroke-width="2" stroke-dasharray="10 12"/>'+mark(404,609,274,'#2D383E')+'</g>'
    body+=label('DROP YOUR IMAGE INTO THIS FRAME',266,989,17)+label('EDIT THIS CAPTION. CREDIT YOUR SOURCE.',54,1179,17,WHITE)
    body+=label('CAPACITY EXCEEDED / 001',54,1287,16,ORANGE)+mark(918,1237,108)
    cap=svg(1080,1350,body,'AI/MAXXI editable Capacity Exceeded meme template')
    (KIT/'template-capacity.svg').write_text(cap)
    render(cap,KIT/'template-capacity.png')
    body=common+label('PUBLIC SERVICE ANNOUNCEMENT',54,180,20,ORANGE)+live('MAXX',54,446,290,ident='headline-line-1')+live('THE FUTURE.',54,660,210,ident='headline-line-2')
    body+=f'<g id="replace-with-your-image"><rect x="54" y="731" width="640" height="377" fill="#151B1E"/>'+label('YOUR IMAGE / YOUR IDEA',96,927,18)+'</g>'+mark(749,822,277,ORANGE)
    body+=live('MAKE SOMETHING IMPOSSIBLE TO IGNORE.',54,1203,49,ident='editable-caption')+label('BY YOUR NAME / SOURCE LINK',54,1287,16,ORANGE)
    transmission=svg(1080,1350,body,'AI/MAXXI editable Transmission poster template')
    (KIT/'template-transmission.svg').write_text(transmission)
    render(transmission,KIT/'template-transmission.png')
    for name in ['capacity','transmission']:
        image=Image.open(KIT/f'template-{name}.png').convert('RGB')
        image.resize((720,900),Image.Resampling.LANCZOS).save(KIT/f'template-{name}.webp',quality=88,method=6)


def data_image(image):
    buf=io.BytesIO()
    image.save(buf,format='JPEG',quality=96)
    return 'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()


def crop(image, size, centering=(.5,.5)):
    return ImageOps.fit(image,size,Image.Resampling.LANCZOS,centering=centering)


def hero():
    src=SOURCE/'hero.png'
    if not src.exists():
        return
    image=Image.open(src).convert('RGBA')
    # Geometry inspected at 1774x887: a flat blank patch on the human's upper back.
    # All raw scene pixels remain intact in assets/art/source/hero.png.
    if image.size==(1774,887):
        emblem=Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=svg(137,72,mark(color=BLACK,opacity=.85)),width=63))).convert('RGBA')
        image.alpha_composite(emblem,(1502,356))
    image=image.convert('RGB')
    image.save(ART/'hero-desktop.webp',quality=87,method=6)
    # Preserve both human and synthetic operator on portrait displays.
    crop(image,(750,1000),(.90,.50)).save(ART/'hero-mobile.webp',quality=88,method=6)
    # Same full scene is useful as a shareable wide header without headline copy.
    crop(image,(1500,500),(.65,.58)).save(KIT/'social-banner.png',optimize=True)
    og=crop(image,(1200,630),(.56,.5))
    backdrop=f'<image width="1200" height="630" href="{data_image(og)}"/>'
    backdrop+='<defs><linearGradient id="shade"><stop stop-color="#080A0B" stop-opacity=".86"/><stop offset=".68" stop-color="#080A0B" stop-opacity=".4"/><stop offset="1" stop-color="#080A0B" stop-opacity=".1"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/>'
    wm,_=wordmark(58,135,116)
    l1,_=text_path('MAXX THE FUTURE.',58,283,52,WHITE,max_width=685)
    ogsvg=svg(1200,630,backdrop+mark(60,57,98,ORANGE)+wm+l1+label('MAXIMUM INTELLIGENCE. MAXIMUM MEMES.',60,400,16,WHITE)+label('AIMAXXI.COM',60,561,15,ORANGE))
    render(ogsvg,BRAND/'og.png')
    Image.open(BRAND/'og.png').convert('RGB').save(BRAND/'og.jpg',quality=90,optimize=True)


POSTERS = {
    'power': {'lines':['MORE INTELLIGENCE.','MORE LIFE.'], 'small':'', 'serial':'TRANSMISSION 001 / POWER COMES ONLINE'},
    'night-shift': {'lines':['THE FUTURE IS','UNDER CONSTRUCTION.'], 'small':'BRING TOOLS.', 'serial':'TRANSMISSION 002 / NIGHT SHIFT'},
    'transmission': {'lines':['MAXIMUM INTELLIGENCE.','MAXIMUM MEMES.'], 'small':'MAXX THE FUTURE.', 'serial':'TRANSMISSION 003 / FROM TOMORROW'},
}


def posters():
    made=[]
    for name, copy in POSTERS.items():
        src=SOURCE/f'{name}.png'
        if not src.exists():
            continue
        scene=Image.open(src).convert('RGB')
        crop(scene,(864,1080)).save(ART/f'{name}.webp',quality=87,method=6)
        scene=crop(scene,(1080,1350))
        bg=f'<image width="1080" height="1350" href="{data_image(scene)}"/>'
        bg+='<defs><linearGradient id="veil" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#080A0B" stop-opacity=".9"/><stop offset=".32" stop-color="#080A0B" stop-opacity=".02"/><stop offset=".76" stop-color="#080A0B" stop-opacity="0"/><stop offset="1" stop-color="#080A0B" stop-opacity=".92"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#veil)"/>'
        # Fixed print-safe margin and outlined display type, never generated text.
        body=bg+label(copy['serial'],54,70,15,ORANGE)
        y=111
        for line in copy['lines']:
            txt,_=text_path(line,54,y,81,WHITE,max_width=972)
            body+=txt
            y+=99
        if copy['small']:
            body+=label(copy['small'],57,y+11,23,ORANGE,3)
        wm,_=wordmark(54,1221,58,WHITE)
        body+=f'<path d="M54 1184H1026" stroke="{WHITE}" stroke-opacity=".6"/>'+wm+mark(886,1220,140,ORANGE)
        body+=label('AIMAXXI.COM',54,1310,15,WHITE)+label('FICTION FROM AN ABUNDANT FUTURE',611,1310,12,WHITE,1)
        poster=svg(1080,1350,body,f'AI/MAXXI — {name} campaign poster')
        render(poster,KIT/f'poster-{name}.png')
        preview=Image.open(KIT/f'poster-{name}.png').convert('RGB')
        preview.resize((720,900),Image.Resampling.LANCZOS).save(KIT/f'poster-{name}.webp',quality=89,method=6)
        made.append(name)
    return made


def documents(made):
    guide='''# AI/MAXXI — brand kit v1

Maximum intelligence. Maximum memes.\n
Version 1 · 27 September 2026

## The mark

Use the paired 45° arrow master supplied here. Both arrows have identical heads and shaft widths. The second diagonal tail extends nine master units lower: this preserves the rhythm of the original mark. Keep the two arrows together. Do not stretch, redraw, rotate, add outlines, or apply effects to the master. Leave clear space around the mark of at least one shaft width. Minimum suggested display for the regular mark: 24 px wide. Use `mark-small-orange.svg` or the supplied favicon at smaller sizes; its simplified, pixel-snapped geometry preserves separation and readability at 16 and 32 px.

Use the horizontal lockup when space permits, stacked lockup in square compositions, and symbol alone for avatars and patches. The SVG wordmarks are actual vector outlines, so the logo never needs a font installed. Transparent PNGs are provided for simple tools. White, black, and orange versions share identical geometry.

## Palette

| Color | Hex | Role |
|---|---|---|
| Ion orange | `#FF5A1F` | Signal, mark, short labels |
| Graphite | `#080A0B` | Main dark surface |
| Warm white | `#F1F0E8` | Reading text and light mark |
| Steel | `#8B969C` | Secondary text and equipment details |

Keep essential text high contrast. Use orange as a signal rather than a wash. Do not use small orange text on white.

## Typography

Anton: monumental headlines. Archivo: body copy. Space Mono: short labels. Open-source font files and their OFL licenses are included under `fonts/`. The website uses self-hosted WOFF2 files. Install the bundled TTFs before opening editable SVG templates in your design tool. Templates deliberately retain editable text; the official lockups use outlines.

## The world

Industrial cyberpunk with an optimistic destination. Human and synthetic collaborators build a future worth inhabiting. Use working machinery, warm lived-in places, disciplined labels, and original scenes. Keep the mark stable while the art gets strange. Do not imply that a pictured person, brand, or lab endorses AI/MAXXI.

## Make a transmission

1. Open `templates/template-capacity.svg` or `templates/template-transmission.svg` in an SVG editor. The repository copies are in `assets/kit/`.
2. Install the supplied fonts. Edit the named text elements; replace the group named `replace-with-your-image` with your image. Keep the 54 px safe margin.
3. Credit the source or creator and distinguish imagined scenes from a real demonstration.
4. Export at 1080 × 1350. The included PNG and WebP files are visual references.

Campaign PNGs are 1080 × 1350. WebP previews are 720 × 900. Avatar exports include 512, 192, and 180 px. Social banner: 1500 × 500. Social preview: 1200 × 630. The transparent avatar frame and visor overlay can be placed over your own image.

## Naming and voice

Use **AI/MAXXI** in the identity; **AI Maxxi** in prose; **AIMAXXI** for plain-text discovery; **#AIMAXXI** as the community hashtag. Keep “Maximum intelligence. Maximum memes.” as the signature. “MAXX THE FUTURE.” is the participation line. Be terse, funny, curious, and excessively ambitious. Credit real work. Imagined scale is a creative premise; avoid promises about token price, returns, or unverified project capabilities.

## Files and permissions

Read `COMMUNITY-USE.md` for community reuse permissions and `PROVENANCE.json` for source notes. This kit contains selected finished assets, templates, fonts, and documentation. It contains no wallet software, token utility, or financial rights.
'''
    (KIT/'BRAND-GUIDE.md').write_text(guide)
    (KIT/'COMMUNITY-USE.md').write_text('''# AI/MAXXI community use permissions — v1

The project grants permission to use, copy, and adapt the AI/MAXXI visual assets and templates in this kit for personal and noncommercial community expression, including social posts, avatars, memes, and community remixes. Give visible credit to AI/MAXXI / aimaxxi.com where practical and preserve creator credits when provided. Describe adaptations as community-made.

This permission does not authorize impersonating an official account, claiming endorsement, changing the token identity, or committing project resources. It does not grant ownership of the AI/MAXXI name or mark. Commercial merchandise, paid advertising, sublicensing, and unrelated commercial branding require separate permission from the project. Any rights someone else holds in material you add remain theirs; clear those rights yourself.

Generated artwork is supplied as creative fiction. These permissions apply only to rights the project can grant; no exclusive copyright claim is made over purely AI-generated elements. Fonts have their own SIL Open Font License terms, supplied verbatim in the fonts folder. The font licenses prevail for the font files.

The kit is provided as-is. Credit, edits, and requests can be directed through the project's official contribution route at aimaxxi.com.
''')
    provenance={'version':'1','created':'2026-09-27','project':'AI/MAXXI',
        'identity':{'source':'Existing AI/MAXXI paired-arrow mark, redrawn as deterministic vector geometry. Wordmark outlined from Anton.','master':'assets/brand/mark-white.svg','display_type':'Anton'},
        'art':[], 'fonts':[],'process':'Original scenes generated using built-in image_gen. Text and marks composited deterministically using bundled fonts, SVG paths, resvg, and Pillow. No generated readable text is relied upon.',
        'derivatives':{'hero':'Optimized desktop image and portrait crop; crisp paired-arrow patch composited onto the existing blank upper-back panel.','posters':'Cropped scenes, contrast gradients, outlined headline typography, live small labels, vector logos. Raw scenes remain unchanged.'},
        'generation_notes':['assets/art/source/provenance-hero-power.md','assets/art/source/provenance-posters.md']}
    for name in ['hero']+made:
        p=SOURCE/f'{name}.png'
        if p.exists():
            im=Image.open(p)
            provenance['art'].append({'name':name,'source':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'dimensions':list(im.size),'kind':'AI-generated original fictional scene','source_in_public_kit':False})
    for family, filename in FONT_NAMES.items():
        p=FONTS/filename
        provenance['fonts'].append({'family':family,'source':'https://github.com/google/fonts/tree/main/ofl/'+family.replace('-',''),'filename':filename,'license':family+'-OFL.txt','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (KIT/'PROVENANCE.json').write_text(json.dumps(provenance,indent=2)+'\n')
    notes=[]
    for name in ['provenance-hero-power.md','provenance-posters.md']:
        path=SOURCE/name
        if path.exists():
            # Preserve prompts and public provenance while omitting workstation paths.
            notes.append('\n'.join(line for line in path.read_text().splitlines() if '/Users/' not in line))
    if notes:
        (KIT/'ART-PROVENANCE.md').write_text('\n\n'.join(notes)+'\n')


def bundle():
    dst=KIT/'aimaxxi-brand-kit-v1.zip'
    # Do not self-list the ZIP or manifest: a self-referential size cannot stabilize.
    inventory=[]
    for folder in [BRAND,FONTS,KIT,ART]:
        for p in sorted(folder.glob('*')):
            if p.is_file() and p.name not in ['aimaxxi-brand-kit-v1.zip','asset-manifest.json']:
                inventory.append({'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size})
    (KIT/'asset-manifest.json').write_text(json.dumps(inventory,indent=2)+'\n')
    with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
        for p in sorted(BRAND.glob('*')):
            if p.is_file(): z.write(p,'aimaxxi-brand-kit-v1/brand/'+p.name)
        for p in sorted(FONTS.glob('*')):
            if p.is_file(): z.write(p,'aimaxxi-brand-kit-v1/fonts/'+p.name)
        for p in sorted(ART.glob('*.webp')):
            z.write(p,'aimaxxi-brand-kit-v1/art/'+p.name)
        for p in sorted(KIT.glob('*')):
            if p==dst or not p.is_file(): continue
            folder='templates/' if p.name.startswith('template-') else 'campaign/' if p.name.startswith('poster-') or p.name.startswith('social-') else ''
            z.write(p,'aimaxxi-brand-kit-v1/'+folder+p.name)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--identity-only',action='store_true')
    args=parser.parse_args()
    for p in [BRAND,FONTS,KIT,ART,SOURCE]:p.mkdir(parents=True,exist_ok=True)
    fonts()
    identity()
    templates()
    if args.identity_only:
        print('Identity, fonts, and templates exported.')
        return
    hero()
    made=posters()
    documents(made)
    bundle()
    print(json.dumps({'posters':made,'zip_bytes':(KIT/'aimaxxi-brand-kit-v1.zip').stat().st_size,'font_files':[f'{x}-latin.woff2' for x in FONT_NAMES]},indent=2))


if __name__=='__main__':main()
