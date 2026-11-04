import json, sys, pathlib, re
from html.parser import HTMLParser
VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
def norm(x): return re.sub(r'\s+',' ',x or '').strip()
class Page(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.stack=[];self.blocks=[];self.h1=[];self.canonical=[];self.prices=[];self.equipment=[];self.services={};self.games=[];self.cinemas=[];self.components={};self.descriptions=[];self.related=[];self.description_meta=[]
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if 'data-tariff-block' in a:self.blocks.append(a['data-tariff-block'])
  if a.get('rel')=='canonical':self.canonical.append(a.get('href'))
  if tag=='meta' and a.get('name')=='description':self.description_meta.append(a.get('content'))
  if 'data-equipment-code' in a:self.equipment.append(a['data-equipment-code'])
  if 'data-game-code' in a:self.games.append(a['data-game-code'])
  if 'data-cinema-code' in a:self.cinemas.append(a['data-cinema-code'])
  if 'card-link' in a.get('class','').split():self.related.append(a.get('href'))
  if tag not in VOID:self.stack.append([tag,a,[]])
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs)
 def handle_data(self,s):
  for item in self.stack:item[2].append(s)
 def handle_endtag(self,tag):
  ix=next((i for i in range(len(self.stack)-1,-1,-1) if self.stack[i][0]==tag),None)
  if ix is None:return
  closed=self.stack[ix:];self.stack=self.stack[:ix]
  for tg,a,text in closed:
   value=norm(''.join(text))
   if tg=='h1':self.h1.append(value)
   if a.get('class')=='price':self.prices.append(value)
   if 'data-service-code' in a:self.services[a['data-service-code']]=value
   if 'data-component' in a:self.components[a['data-component']]=value
   if 'details-copy' in a.get('class','').split():self.descriptions.append(value)
def check_page(html,e):
 p=Page();p.feed(html);v=e['view'];errors=[]
 if p.h1!=[norm(v['name'])]:errors.append('H1')
 if p.canonical!=['https://tv-internet-dom.ru'+e['path']]:errors.append('canonical')
 if not p.description_meta or not p.description_meta[0]:errors.append('meta description')
 if p.blocks!=e['blocks']:errors.append('blocks '+str(p.blocks))
 if p.prices!=[norm(v['pricing']['currentLabel'])]:errors.append('price')
 if p.equipment!=[i['code'] for i in v['equipment']]:errors.append('equipment')
 if p.cinemas!=[i['code'] for i in v['cinemas']]:errors.append('cinemas')
 if p.games!=([v['game']['code']] if v['game'] else []):errors.append('game')
 if list(p.services)!=[i['code'] for i in v['services']]:errors.append('services')
 for s in v['services']:
  val=p.services.get(s['code'],'')
  if norm(s['title']) not in val or norm(s['statusLabel']) not in val:errors.append('service status '+s['code'])
  for c in s['oneTimeCharges']:
   if norm(c['amountLabel']) not in val:errors.append('service charge '+s['code'])
 for c in v['baseComponents']:
  if norm(c['value']) not in p.components.get(c['code'],''):errors.append('base component '+c['code'])
 if v['description'] and p.descriptions!=[norm(v['description'])]:errors.append('description')
 if not v['description'] and p.descriptions:errors.append('empty description')
 if any(not x.startswith('/'+e['path'].split('/')[1]+'/') or x==e['path'] for x in p.related):errors.append('related city')
 return errors
if __name__=='__main__':
 expected=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'));dist=pathlib.Path(sys.argv[2]);out=pathlib.Path(sys.argv[3]);failures=[]
 for e in expected:
  f=dist/(e['id']+'.html') if len(sys.argv)>4 and sys.argv[4]=='live' else dist/e['path'].lstrip('/')/'index.html'
  if not f.is_file():failures.append({'path':e['path'],'errors':['missing HTML']});continue
  errors=check_page(f.read_text(encoding='utf-8'),e)
  if errors:failures.append({'path':e['path'],'errors':errors})
 result={'checked':len(expected),'failures':failures,'method':'Python HTMLParser over actual generated HTML; expected tariffView per live published tariff','checks':['one H1 and correct name','canonical and description','conditional block presence/order','base price','internet/TV values','equipment codes','cinema codes','game code','service codes/status/charges','full description','same-city related links']}
 out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
