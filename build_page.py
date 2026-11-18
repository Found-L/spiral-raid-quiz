from pathlib import Path
root=Path(__file__).resolve().parent
template=(root/'template.html').read_text(encoding='utf-8')
css=(root/'style.css').read_text(encoding='utf-8')
js=(root/'app.js').read_text(encoding='utf-8')
data=(root/'questions.json').read_text(encoding='utf-8').replace('</','<\\/')
for marker,value in [('/*__APP_CSS__*/',css),('/*__APP_JS__*/',js),('/*__QUESTION_BANK__*/',data)]:
    assert template.count(marker)==1, marker
    template=template.replace(marker,value)
(root/'index.html').write_text(template,encoding='utf-8')
print('Created self-contained index.html')
