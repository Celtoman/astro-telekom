import json, pathlib
HERE=pathlib.Path(__file__).resolve().parent
load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
before=load('D:/Temp/tariff-release-before-catalog.json')
current=load('D:/Temp/tariff-release-working-preview.json')
published=load('D:/Temp/tariff-release-pre-cms-catalog.json')
transfer={t['id']:t for t in load(HERE.parent/'2026-11-04-tariff-contract-implementation/tvbox-transfer.json')}
flatten=lambda c:{t['id']:t for city in c['cities'] for t in city['tariffs']}
old=flatten(before);new=flatten(current['catalog']);errors=[]
fields=['name','slug','cityId','providerId','serviceType','standardPrice','promoPrice','speed','promoText','connectionFee','availability','status','externalId','identityKey','dataSource','createdAt']
tv={'tvbox_available','tvbox_buyout_price','tvbox_installment_price','tvbox_installment_months'}
if set(old)!=set(new):errors.append('catalog IDs')
for id,t in new.items():
 o=old[id];expected={k:v for k,v in o.get('attributes',{}).items() if k not in tv};expected.update(transfer[id]['after'])
 if t['attributes']!=expected:errors.append({'id':id,'reason':'unexpected attributes'})
 for key in fields:
  if o.get(key)!=t.get(key):errors.append({'id':id,'field':key})
unrelated=[]
for key in ['generalHome','homeHero','homeHeroVersion','homeHeroBlockId','globalPages','redirects','routes']:
 if before.get(key)!=current['catalog'].get(key):unrelated.append(key)
for a,b in zip(before['cities'],current['catalog']['cities']):
 if {k:v for k,v in a.items() if k!='tariffs'}!={k:v for k,v in b.items() if k!='tariffs'}:unrelated.append('city:'+a['slug'])
if before!=published:errors.append('old published snapshot changed')
if unrelated:errors.append({'unexpectedNonTariffChanges':unrelated})
review=load(HERE/'publication-review.json')
result={'workingRevision':current['workingRevision'],'publishedRevision':current['publishedRevision'],'tariffs':len(new),'cities':len(current['catalog']['cities']),'available':sum(t['attributes'].get('tvbox_available') is True for t in new.values()),'unavailable':sum(t['attributes'].get('tvbox_available') is False for t in new.values()),'historyChanges':review['totalChanges'],'historySources':sorted(set(t['source'] for t in review['changes'])),'oldPublicationPreserved':before==published,'unrelatedChanges':unrelated,'errors':errors}
(HERE/'migration-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
assert not errors
