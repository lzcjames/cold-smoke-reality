"""Annotate paired screenshots without changing the raw captures."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
frames = [json.loads(line) for line in (root / 'capture.jsonl').read_text().splitlines()]
output = root / 'annotated'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('DejaVuSans.ttf', 16)
for frame in frames:
    i = frame['frame']
    canvas = Image.new('RGB', (960, 322), '#121824')
    for index, view in enumerate(('chase', 'close')):
        img = Image.open(root / 'frames' / f'{i:04d}-{view}.png').convert('RGB')
        canvas.paste(img.resize((480, 270), Image.Resampling.BILINEAR), (480 * index, 0))
    draw = ImageDraw.Draw(canvas)
    state = 'TOUCHDOWN' if frame['touchdown'] else ('CONTACT' if frame['contact'] else 'NO CONTACT')
    colour = '#ffb371' if frame['touchdown'] else '#f5f6f8'
    draw.text((10, 274), f"Frame {i} | {frame['t']:.3f} s | {state} | speed {frame['speed']:.2f} m/s | min mesh–DEM {100*frame['min']:+.1f} cm", fill=colour, font=font)
    draw.text((10, 298), 'Game chase camera', fill='#cfd5dc', font=font)
    draw.text((490, 298), 'Diagnostic side camera (same pose)', fill='#cfd5dc', font=font)
    canvas.save(output / f'{i:04d}.png', optimize=True)
