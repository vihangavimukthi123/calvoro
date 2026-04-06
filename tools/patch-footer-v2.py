# Patch remaining HTML: trust strip + footer bar + bottom links
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TRUST = """    <section class=\"footer-trust\" aria-label=\"Why shop with Calvoro\">
        <div class=\"container footer-trust__inner\">
            <article class=\"footer-trust__item\">
                <div class=\"footer-trust__icon\" aria-hidden=\"true\">
                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10 17h8V5H3v12h3\"/><path d=\"M2 17h2\"/><path d=\"M14 17V9h3l3 3v5\"/><circle cx=\"7.5\" cy=\"17.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/></svg>
                </div>
                <h3 class=\"footer-trust__title\">Shipping</h3>
                <p class=\"footer-trust__text\">Standard shipping (Estimated 3-5 days)</p>
            </article>
            <article class=\"footer-trust__item\">
                <div class=\"footer-trust__icon\" aria-hidden=\"true\">
                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg>
                </div>
                <h3 class=\"footer-trust__title\">Payments</h3>
                <p class=\"footer-trust__text\">Payment is 100% secure</p>
            </article>
            <article class=\"footer-trust__item\">
                <div class=\"footer-trust__icon\" aria-hidden=\"true\">
                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/></svg>
                </div>
                <h3 class=\"footer-trust__title\">Easy Returns</h3>
                <p class=\"footer-trust__text\">30 days to change your mind!</p>
            </article>
            <article class=\"footer-trust__item\">
                <div class=\"footer-trust__icon\" aria-hidden=\"true\">
                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22v-7\"/><path d=\"M4 15s4-4 8-4 8 4 8 4\"/><path d=\"M6 10s3-3 6-3 6 3 6 3\"/></svg>
                </div>
                <h3 class=\"footer-trust__title\">Made in Sri Lanka</h3>
                <p class=\"footer-trust__text\">Sustainably Sourced</p>
            </article>
        </div>
    </section>

"""

def bar(img: str) -> str:
    return f"""        <div class=\"footer-bar\">
            <div class=\"container footer-bar__row\">
                <div class=\"footer-social\">
                    <a href=\"https://www.instagram.com/calvoro_sl?igsh=MWphc2ozMzV6bnA5Ng==\" class=\"footer-social__link\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Instagram\">
                        <img src=\"{img}social-instagram.png\" alt=\"\" class=\"footer-social__img\" width=\"32\" height=\"32\" loading=\"lazy\" decoding=\"async\">
                    </a>
                    <a href=\"https://www.facebook.com/share/1N3FAQwgDZ/?mibextid=wwXIfr\" class=\"footer-social__link\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Facebook\">
                        <img src=\"{img}social-facebook.png\" alt=\"\" class=\"footer-social__img footer-social__img--fb\" width=\"32\" height=\"32\" loading=\"lazy\" decoding=\"async\">
                    </a>
                    <a href=\"https://www.tiktok.com/@calvoro.clothing?_r=1&amp;_t=ZS-946fy7SrlVB\" class=\"footer-social__link\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"TikTok\">
                        <img src=\"{img}social-tiktok.png\" alt=\"\" class=\"footer-social__img\" width=\"32\" height=\"32\" loading=\"lazy\" decoding=\"async\">
                    </a>
                </div>
                <div class=\"footer-emblem\">
                    <img src=\"{img}lion-sri-lanka.png\" alt=\"Sri Lankan lion emblem\" width=\"180\" height=\"180\" loading=\"lazy\" decoding=\"async\" class=\"footer-emblem__img\">
                </div>
            </div>
        </div>
"""

def bottom_line(priv: str) -> str:
    return (
        f'© 2026 | CALVORO | All Rights Reserved | <a href="{priv}privacy-policy.html">Privacy Policy</a> | '
        f'<a href="{priv}terms-and-conditions.html">Terms &amp; Conditions</a> | '
        f'<a href="{priv}return-exchange-policy.html">Return &amp; Exchange Policy</a> | '
        f'<a href="{priv}return-refund-policy.html">Return &amp; Refund Policy</a>'
    )


def patch(path: Path, products: bool):
    t = path.read_text(encoding="utf-8", errors="replace")
    if path.name in ("index.html", "return-exchange-policy.html"):
        return
    priv = "../" if products else ""
    img = "../images/" if products else "images/"

    if "footer-trust" not in t:
        if "\n    <footer>" in t:
            t = t.replace("\n    <footer>", "\n" + TRUST + "\n    <footer>", 1)
        elif "\n<footer>" in t:
            t = t.replace("\n<footer>", "\n" + TRUST + "<footer>", 1)

    emblem_old = (
        '        <div class="footer-emblem">\n'
        '            <img src="' + img + 'sri-lanka-lion-emblem.jpeg" alt="Sri Lankan lion emblem" width="160" height="160" loading="lazy" decoding="async" class="footer-emblem__img">\n'
        "        </div>"
    )
    if emblem_old in t:
        t = t.replace(emblem_old, bar(img), 1)
    elif 'class="footer-bar"' not in t and "<div class=\"footer-emblem\">" in t:
        t = re.sub(
            r'<div class="footer-emblem">[\s\S]*?</div>\s*(?=<div class="footer-bottom">)',
            bar(img).strip() + "\n",
            t,
            count=1,
        )

    for block in (
        '<div class="social-links">\n                    <a href="#">FB</a>\n                    <a href="#">IG</a>\n                    <a href="#">TW</a>\n                </div>',
        '<div class="social-links">\n                    <a href="#">FB</a>\n                    <a href="#">IG</a>\n                    <a href="#">YT</a>\n                </div>',
    ):
        if block in t:
            t = t.replace(block, '<p class="footer-connect-hint">Follow us below</p>')

    if "Return &amp; Exchange Policy" not in t or path.name == "cart.html":
        # Replace inner text of footer-bottom once
        t = re.sub(
            r'(<div class="footer-bottom">\s*<p>)([\s\S]*?)(</p>)',
            lambda m: m.group(1) + bottom_line(priv) + m.group(3) if "footer-bottom" in m.group(0) else m.group(0),
            t,
            count=1,
        )

    path.write_text(t, encoding="utf-8")
    print("ok", path.relative_to(ROOT))


def main():
    for p in sorted(ROOT.glob("*.html")):
        patch(p, False)
    for p in sorted((ROOT / "products").glob("*.html")):
        patch(p, True)


if __name__ == "__main__":
    main()
