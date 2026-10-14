#!/usr/bin/env python3
"""Gerador de artes · marca Arão Baltazar (paleta Relatório).
Uso: python3 render_artes.py spec.json pasta_saida
"""
import base64, html, json, os, pathlib, re, subprocess, sys, tarfile, tempfile

CACHE = pathlib.Path(os.path.expanduser("~/.cache/arao-fonts"))
FONTS = {
    "Fraunces": ("@fontsource/fraunces", {600: "fraunces-latin-600-normal.woff2", 400: "fraunces-latin-400-normal.woff2"}),
    "Inter": ("@fontsource/inter", {400: "inter-latin-400-normal.woff2", 500: "inter-latin-500-normal.woff2", 600: "inter-latin-600-normal.woff2"}),
}

def ensure_fonts():
    CACHE.mkdir(parents=True, exist_ok=True)
    for fam, (pkg, files) in FONTS.items():
        if all((CACHE / f).exists() for f in files.values()):
            continue
        with tempfile.TemporaryDirectory() as td:
            out = subprocess.run(["npm", "pack", pkg, "--silent"], cwd=td, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
            with tarfile.open(pathlib.Path(td) / out) as t:
                for f in files.values():
                    m = t.extractfile(f"package/files/{f}")
                    (CACHE / f).write_bytes(m.read())

def font_css():
    css = []
    for fam, (_, files) in FONTS.items():
        for w, f in files.items():
            b64 = base64.b64encode((CACHE / f).read_bytes()).decode()
            css.append(f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{b64}) format('woff2');}}")
    return "".join(css)

def md(t):
    """*palavra* = destaque laranja · **texto** = negrito · \\n = quebra."""
    t = html.escape(t or "")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)
    return t.replace("\n", "<br>")

CSS = """
:root{--paper:#F6F4EF;--ink:#111827;--graphite:#4B5563;--line:#E2DED5;--signal:#C2410C;--signal-l:#FF6B3D;--k:1}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#ddd}
.s{position:relative;overflow:hidden;background:var(--paper);color:var(--ink);font-family:'Inter';display:flex;flex-direction:column;padding:96px 96px 0}
.s.escuro{background:var(--ink);color:var(--paper)}
.feed{width:1080px;height:1350px}.story{width:1080px;height:1920px;padding:220px 96px 0}
.kicker{font-size:26px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--signal);margin-bottom:36px}
.escuro .kicker{color:var(--signal-l)}
.c{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
em{font-style:normal;color:var(--signal)}.escuro em{color:var(--signal-l)}
b{font-weight:600}
.serif{font-family:'Fraunces';font-weight:600;letter-spacing:-.01em}
.t-capa{font-size:calc(var(--k)*140px);line-height:1.04}
.t-sec{font-size:calc(var(--k)*68px);line-height:1.12;margin-bottom:44px}
.sub{font-size:calc(var(--k)*38px);line-height:1.4;color:var(--graphite);margin-top:40px}
.escuro .sub{color:#C9CDD4}
.fio{width:96px;height:5px;background:var(--signal);margin-top:48px}
.escuro .fio{background:var(--signal-l)}
.body{font-size:calc(var(--k)*44px);line-height:1.5}
.body p+p{margin-top:30px}
.lst{list-style:none}
.lst li{font-size:calc(var(--k)*42px);line-height:1.4;padding:30px 0 30px 64px;border-bottom:2px solid var(--line);position:relative}
.escuro .lst li{border-bottom-color:#2A3242}
.lst li:before{content:attr(data-n);position:absolute;left:0;top:30px;font-weight:600;color:var(--signal);font-variant-numeric:tabular-nums}
.escuro .lst li:before{color:var(--signal-l)}
.num{font-size:calc(var(--k)*230px);font-weight:600;letter-spacing:-.03em;line-height:1;color:var(--signal);font-variant-numeric:tabular-nums}
.escuro .num{color:var(--signal-l)}
.ctx{font-size:calc(var(--k)*44px);line-height:1.35;margin-top:36px;max-width:820px}
.fonte{font-size:24px;color:var(--graphite);margin-top:28px}
.escuro .fonte{color:#9CA3AF}
.frase{font-size:calc(var(--k)*82px);line-height:1.14}
.cta{margin-top:56px;display:inline-block;align-self:flex-start;background:var(--signal);color:#fff;font-size:calc(var(--k)*36px);font-weight:600;padding:26px 40px;border-radius:14px}
.escuro .cta{background:var(--signal-l);color:var(--ink)}
.center{justify-content:center}
.foot{height:150px;flex:none;display:flex;align-items:center;justify-content:space-between;border-top:2px solid var(--line);margin-top:24px}
.escuro .foot{border-top-color:#2A3242}
.story .foot{height:300px;align-items:flex-start;padding-top:40px}
.marca{font-family:'Fraunces';font-weight:600;font-size:34px}
.marca i{font-style:normal;color:var(--signal)}.escuro .marca i{color:var(--signal-l)}
.assin{font-size:22px;color:var(--graphite);margin-top:4px;letter-spacing:.04em}
.escuro .assin{color:#9CA3AF}
.pg{font-size:24px;color:var(--graphite);font-variant-numeric:tabular-nums}
.escuro .pg{color:#9CA3AF}
.pg span{color:var(--signal);font-weight:600;margin-left:14px}.escuro .pg span{color:var(--signal-l)}
"""

def slide_html(sl, i, n, fmt):
    tipo = sl.get("tipo", "texto")
    escuro = sl.get("fundo", "escuro" if tipo == "frase" else "claro") == "escuro"
    k = f"<div class='kicker'>{md(sl['kicker'])}</div>" if sl.get("kicker") else ""
    if tipo == "capa":
        c = f"<div class='c center'>{k}<div class='serif t-capa'>{md(sl.get('titulo'))}</div><div class='fio'></div>" + (f"<div class='sub'>{md(sl.get('subtitulo'))}</div>" if sl.get('subtitulo') else "") + "</div>"
        k = ""
    elif tipo == "texto":
        paras = "".join(f"<p>{md(p)}</p>" for p in sl.get("texto", "").split("\n\n"))
        c = f"<div class='c center'>{k}<div class='serif t-sec'>{md(sl.get('titulo'))}</div><div class='body'>{paras}</div></div>"
        k = ""
    elif tipo == "lista":
        items = "".join(f"<li data-n='{j+1:02d}'>{md(x)}</li>" for j, x in enumerate(sl.get("itens", [])))
        c = f"<div class='c center'>{k}<div class='serif t-sec'>{md(sl.get('titulo'))}</div><ul class='lst'>{items}</ul></div>"
        k = ""
    elif tipo == "dado":
        c = f"<div class='c center'>{k}<div class='num'>{md(sl.get('numero'))}</div><div class='ctx'>{md(sl.get('contexto'))}</div>" + (f"<div class='fonte'>{md(sl.get('fonte'))}</div>" if sl.get('fonte') else "") + "</div>"
        k = ""
    elif tipo == "frase":
        c = f"<div class='c center'>{k}<div class='serif frase'>{md(sl.get('frase'))}</div>" + (f"<div class='fonte'>{md(sl.get('autor'))}</div>" if sl.get('autor') else "") + "</div>"
        k = ""
    elif tipo == "cta":
        c = f"<div class='c center'>{k}<div class='serif t-sec'>{md(sl.get('titulo'))}</div><div class='body'>{md(sl.get('texto'))}</div>" + (f"<div class='cta'>{md(sl.get('botao'))}</div>" if sl.get('botao') else "") + "</div>"
        k = ""
    else:
        raise ValueError(f"tipo desconhecido: {tipo}")
    pg = "" if n == 1 else f"<div class='pg'>{i:02d} / {n:02d}" + ("<span>→</span>" if i < n else "") + "</div>"
    foot = f"<div class='foot'><div><div class='marca'>Arão Baltazar<i>.</i></div><div class='assin'>Do clique à cadeira</div></div>{pg}</div>"
    return f"<section class='s {fmt}{' escuro' if escuro else ''}'>{c}{foot}</section>"

FIT_JS = """() => { for (const s of document.querySelectorAll('.s')) { const c = s.querySelector('.c'); let k = 1;
  while ((c.scrollHeight > c.clientHeight + 1) && k > 0.55) { k -= 0.03; s.style.setProperty('--k', k); } } }"""

def render(spec_path, out_dir):
    spec = json.loads(pathlib.Path(spec_path).read_text(encoding="utf-8"))
    fmt = "story" if spec.get("formato") == "story" else "feed"
    slides = spec["slides"]
    ensure_fonts()
    body = "".join(slide_html(s, i + 1, len(slides), fmt) for i, s in enumerate(slides))
    doc = f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><style>{font_css()}{CSS}</style></head><body>{body}</body></html>"
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / "_artes.html").write_text(doc, encoding="utf-8")
    from playwright.sync_api import sync_playwright
    h = 1920 if fmt == "story" else 1350
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1080, "height": h})
        pg.goto((out / "_artes.html").resolve().as_uri())
        pg.evaluate("document.fonts.ready")
        pg.evaluate(FIT_JS)
        files = []
        for i, el in enumerate(pg.query_selector_all(".s"), 1):
            f = out / f"slide-{i:02d}.png"; el.screenshot(path=str(f)); files.append(f)
            try:  # o Instagram só aceita JPEG na API de publicação
                from PIL import Image
                Image.open(f).convert("RGB").save(out / f"slide-{i:02d}.jpg", "JPEG", quality=95)
            except ImportError:
                pass
        b.close()
    # prévia lado a lado
    try:
        from PIL import Image
        ims = [Image.open(f) for f in files]
        tw = 360; th = int(tw * h / 1080); cols = min(len(ims), 4); rows = (len(ims) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw + (cols + 1) * 16, rows * th + (rows + 1) * 16), "#E2DED5")
        for j, im in enumerate(ims):
            sheet.paste(im.resize((tw, th)), (16 + (j % cols) * (tw + 16), 16 + (j // cols) * (th + 16)))
        sheet.save(out / "previa.png")
    except ImportError:
        pass
    if spec.get("legenda"):
        (out / "legenda.txt").write_text(spec["legenda"], encoding="utf-8")
    print("\n".join(str(f) for f in files))

if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
