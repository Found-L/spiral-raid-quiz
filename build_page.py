from pathlib import Path
root=Path(__file__).resolve().parent
template=(root/'template.html').read_text(encoding='utf-8')
css='\n'.join((root/name).read_text(encoding='utf-8') for name in ('style.css','detail.css','social.css'))
js='\n'.join((root/name).read_text(encoding='utf-8') for name in ('badge-art.js','social-ui.js','app.js'))
guide_js='\n'.join((root/name).read_text(encoding='utf-8') for name in ('guide.js','sequences.js','diagrams.js'))
data=(root/'questions.json').read_text(encoding='utf-8').replace('</','<\\/')
for marker,value in [('/*__APP_CSS__*/',css),('/*__APP_JS__*/',js),('/*__GUIDE_JS__*/',guide_js),('/*__QUESTION_BANK__*/',data)]:
    assert template.count(marker)==1, marker
    template=template.replace(marker,value)
(root/'index.html').write_text(template,encoding='utf-8')
(root/'domestic-backend'/'questions.json').write_text((root/'questions.json').read_text(encoding='utf-8'),encoding='utf-8')
print('Created self-contained index.html')
