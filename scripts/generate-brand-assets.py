from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "brand"
ANDROID = ROOT / "android/app/src/main/res"
IOS = ROOT / "ios/Sources/AiDigitalSinaiApp/Resources/Branding"

NAVY = (9, 15, 28, 255)
NAVY2 = (16, 22, 34, 255)
TEAL = (34, 211, 238, 255)
GOLD = (229, 190, 55, 255)
WHITE = (244, 247, 251, 255)

BRAND.mkdir(exist_ok=True)
ANDROID.joinpath("drawable-nodpi").mkdir(parents=True, exist_ok=True)
IOS.mkdir(parents=True, exist_ok=True)


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def draw_mark(draw, box, scale=1.0):
    x, y, w, h = box
    side = min(w, h)
    left = x + (w - side) / 2
    top = y + (h - side) / 2
    r = side * 0.24
    draw.rounded_rectangle((left, top, left + side, top + side), radius=r, outline=GOLD, width=max(2, int(side * .035)))
    cx, cy = left + side * .5, top + side * .5
    pts = [(cx, top + side*.18), (cx + side*.10, cy - side*.08), (left + side*.82, cy), (cx + side*.10, cy + side*.08), (cx, top + side*.82), (cx - side*.10, cy + side*.08), (left + side*.18, cy), (cx - side*.10, cy - side*.08)]
    draw.polygon(pts, fill=TEAL)
    draw.ellipse((cx-side*.06, cy-side*.06, cx+side*.06, cy+side*.06), fill=GOLD)
    for radius, alpha in [(0.27, 90), (0.34, 55)]:
        draw.arc((cx-side*radius, cy-side*radius, cx+side*radius, cy+side*radius), 210, 330, fill=TEAL[:3] + (alpha,), width=max(1, int(side*.012)))


def make_square(size, background=NAVY, transparent=False, with_wordmark=False):
    mode = "RGBA"
    img = Image.new(mode, (size, size), (0,0,0,0) if transparent else background)
    d = ImageDraw.Draw(img)
    draw_mark(d, (size*.12, size*.10, size*.76, size*.76))
    if with_wordmark:
        d.text((size*.08, size*.83), "AI DIGITAL", fill=WHITE, font=font(max(10, int(size*.055)), True))
        d.text((size*.08, size*.89), "SINAI", fill=TEAL, font=font(max(12, int(size*.07)), True))
    return img

# Master vectors for source-controlled scaling and handoff.
(BRAND / "sinai-mark.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="58" fill="#090f1c"/><rect x="31" y="31" width="194" height="194" rx="52" fill="none" stroke="#e5be37" stroke-width="9"/><path d="M128 76l16 35 35 17-35 17-16 35-16-35-35-17 35-17z" fill="#22d3ee"/><circle cx="128" cy="128" r="11" fill="#e5be37"/><path d="M63 150a78 78 0 0 0 58 42M193 106a78 78 0 0 0-58-42" fill="none" stroke="#22d3ee" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/></svg>''', encoding="utf-8")
(BRAND / "nocturne-signal-splash.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#090f1c"/><stop offset="1" stop-color="#101622"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="850" cy="270" r="280" fill="#22d3ee" opacity=".05"/><circle cx="180" cy="1640" r="360" fill="#e5be37" opacity=".04"/><g transform="translate(390 620) scale(1.2)"><rect width="250" height="250" rx="58" fill="#090f1c" stroke="#e5be37" stroke-width="9"/><path d="M125 45l16 35 35 17-35 17-16 35-16-35-35-17 35-17z" fill="#22d3ee"/><circle cx="125" cy="125" r="11" fill="#e5be37"/></g><text x="540" y="1010" fill="#f4f7fb" font-family="sans-serif" font-size="58" font-weight="700" text-anchor="middle" letter-spacing="8">AI DIGITAL</text><text x="540" y="1085" fill="#22d3ee" font-family="sans-serif" font-size="74" font-weight="800" text-anchor="middle" letter-spacing="12">SINAI</text><text x="540" y="1160" fill="#e5be37" font-family="sans-serif" font-size="28" text-anchor="middle" letter-spacing="5">NOCTURNE SIGNAL</text></svg>''', encoding="utf-8")

# Android launcher layers and splash bitmap.
make_square(1024, background=NAVY).save(ANDROID / "drawable-nodpi/sinai_app_icon.png")
make_square(1024, transparent=True).save(ANDROID / "drawable-nodpi/sinai_icon_foreground.png")
img = Image.new("RGBA", (1080, 1920), NAVY)
d = ImageDraw.Draw(img)
d.ellipse((700, 10, 1300, 610), fill=(34,211,238,18))
d.ellipse((-250, 1440, 500, 2190), fill=(229,190,55,12))
draw_mark(d, (360, 560, 360, 360))
d.text((540, 1000), "AI DIGITAL", fill=WHITE, font=font(58, True), anchor="mm")
d.text((540, 1075), "SINAI", fill=TEAL, font=font(74, True), anchor="mm")
d.text((540, 1150), "NOCTURNE SIGNAL", fill=GOLD, font=font(28, True), anchor="mm")
img.save(ANDROID / "drawable-nodpi/sinai_splash.png")

# iOS AppIcon universal 1024 and launch artwork. Xcode scales the app icon from the universal slot.
appicon = make_square(1024, background=NAVY)
appicon.save(IOS / "AppIcon.appiconset.png")
launch = img.resize((1080, 1920), Image.Resampling.LANCZOS)
launch.save(IOS / "LaunchScreen.png")

# A small preview for CI/human evidence.
make_square(512, background=NAVY, with_wordmark=True).save(BRAND / "nocturne-signal-preview.png")
print("Generated branded assets under brand/, android/, and ios/Sources/AiDigitalSinaiApp/Resources/Branding/")
