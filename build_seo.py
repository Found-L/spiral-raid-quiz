"""Generate crawlable, human-readable guides and the domestic sitemap."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = 'https://www.lysue.com/spiral-raid-quiz/'


def build():
    pages = json.loads((ROOT / 'seo-pages.json').read_text(encoding='utf-8'))
    template = (ROOT / 'seo-template.html').read_text(encoding='utf-8')
    esc = lambda value: html.escape(value, quote=True)
    urls = [SITE]
    for page in pages:
        url = f"{SITE}guides/{page['slug']}/"
        urls.append(url)
        title = f"{page['title']} | 螺旋寺院机制考核"
        schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': page['heading'],
                  'description': page['description'], 'url': url, 'inLanguage': 'zh-CN',
                  'isPartOf': {'@type': 'WebSite', 'name': '螺旋寺院机制考核', 'url': SITE}}
        structured = json.dumps(schema, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
        toc = ''.join(f'<a href="#section-{i}">{esc(section["title"])}</a>'
                      for i, section in enumerate(page['sections'], 1))
        sections = ''.join(
            f'<section id="section-{i}"><h2>{esc(section["title"])}</h2>' +
            ''.join(f'<p>{esc(paragraph)}</p>' for paragraph in section['paragraphs']) + '</section>'
            for i, section in enumerate(page['sections'], 1))
        related = ''.join(f'<a href="../{esc(other["slug"])}/">{esc(other["name"])}</a>'
                          for other in pages if other['slug'] != page['slug'])
        if page['guide']:
            action = f'<a href="../../#guide-{esc(page["guide"])}" class="button">查看动态机制图解</a>'
        else:
            action = '<a href="../../#honor-board" class="button">查看全站趣味榜</a>'
        replacements = {
            '__TITLE__': esc(title), '__DESCRIPTION__': esc(page['description']), '__CANONICAL__': esc(url),
            '__OG_TITLE__': esc(title), '__OG_DESCRIPTION__': esc(page['description']), '__OG_URL__': esc(url),
            '__STRUCTURED_DATA__': structured, '__HERO_IMAGE__': esc(page['image']), '__KICKER__': esc(page['kicker']),
            '__HEADING__': esc(page['heading']), '__INTRO__': esc(page['intro']), '__TOC__': toc,
            '__SECTIONS__': sections, '__RELATED__': related, '__PRIMARY_ACTION__': action, '__BOTTOM_ACTION__': action,
        }
        output = template
        for marker, value in replacements.items():
            assert output.count(marker) == 1, marker
            output = output.replace(marker, value)
        destination = ROOT / 'guides' / page['slug'] / 'index.html'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(output, encoding='utf-8')
    entries = ''.join(f'  <url><loc>{esc(url)}</loc></url>\n' for url in urls)
    (ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries + '</urlset>\n', encoding='utf-8')
    print(f'Created {len(pages)} static guides and sitemap')


if __name__ == '__main__':
    build()
