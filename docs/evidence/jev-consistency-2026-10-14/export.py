import json, statistics as st, collections
d=json.load(open('report-data.json'))
rows=[json.loads(l) for l in open('results.jsonl')]
r4=lambda x: round(x,4)
pages=[]
scatter=[]
for p in d['pages']:
    e=dict(id=p['id'],label=p['label'],kind=p['kind'],url=p['url'],intent=p['intent'],bodyChars=p['bodyChars'])
    for sc in ['meta','page']:
        q=p[sc]
        e[sc]=dict(mean=r4(q['score']['mean']),sd=r4(q['score']['sd']),min=r4(q['score']['min']),max=r4(q['score']['max']),
                   fitMean=r4(q['fit']['mean']),fitSd=r4(q['fit']['sd']),termSumMean=r4(q['termSum']['mean']),termSumSd=r4(q['termSum']['sd']),
                   top10Mean=round(q['top10Overlap']['mean'],2),top10Min=q['top10Overlap']['min'],clusters=q['clusters'],halfDrift=r4(q['halfDrift']),dev=q['dev'])
        scatter.append(dict(id=p['id'],cond='base',scope=sc,fit=r4(q['fit']['mean']),sd=r4(q['score']['sd'])))
    for c in ['improved','degraded']:
        q=p[c]; e[c]=dict(mean=r4(q['score']['mean']),sd=r4(q['score']['sd']),delta=r4(q['delta']),z=None if q['deltaOverPooledSd'] is None else round(q['deltaOverPooledSd'],1),bandsOverlap=q['bandsOverlap'],fitMean=r4(q['fit']['mean']))
        scatter.append(dict(id=p['id'],cond=c,scope='meta',fit=r4(q['fit']['mean']),sd=r4(q['score']['sd'])))
    pages.append(e)
cfg=json.load(open('config.json'))
for e,c in zip(pages,cfg['pages']):
    e['expected']=c['expected']; e['improvedDescription']=c['improved']['description']; e['degradedTitle']=c['degraded']['title']
out=dict(
  date='2026-10-14', model='jev-1.13.0', questionVersion='q1', runs=100, variantRuns=30, termsPerPage=30,
  requests=d['run']['requests'], tokensIn=d['run']['tokensIn'], medianPairMs=d['run']['medianPairMs'], first=d['run']['first'], last=d['run']['last'],
  noiseFloor=r4(d['noiseFloor']),
  scopes={sc:{k:r4(v) for k,v in d[sc].items()} for sc in ['meta','page']},
  convergence=[dict(n=int(n),worst=r4(v['worst']),median=r4(v['median'])) for n,v in d['convergence'].items()],
  ranking=d['ranking'], pages=pages, scatter=scatter, session2=None)
import itertools
subs={x['id']:x for x in json.load(open('subjects.json'))}
sc_={}
for r in rows:
    if r['cond']=='base':
        x=subs[r['id']]; sc_[(r['id'],r['scope'],r['run'])]=sum(r['ratings'][x['terms'].index(t)] for t in x['expected'])*r['intent']
for scope in ['meta','page']:
    means={p['id']:p[scope]['mean'] for p in pages}
    swapGaps=[abs(means[a]-means[b]) for a,b in itertools.combinations(means,2) if any((means[a]-means[b])*(sc_[(a,scope,k)]-sc_[(b,scope,k)])<0 for k in range(100))]
    out['ranking'][scope]['maxSwapGap']=r4(max(swapGaps)) if swapGaps else 0
    out['ranking'][scope]['swappedPairs']=len(swapGaps)
    out['ranking'][scope]['drift']=r4(max(abs(p[scope]['halfDrift']) for p in pages))
# Session 2: the same frozen text, 20 runs, about an hour later.
from datetime import datetime
r2=[json.loads(l) for l in open('results-session2.jsonl')]
assert all(x['modelA']==x['modelB']=='jev-1.13.0' for x in r2)
by=collections.defaultdict(list)
for r in r2:
    x=subs[r['id']]; by[(r['id'],r['scope'])].append(sum(r['ratings'][x['terms'].index(t)] for t in x['expected'])*r['intent'])
iso=lambda t: datetime.fromisoformat(t.replace('Z','+00:00'))
gap=(iso(min(x['at'] for x in r2))-iso(max(x['at'] for x in rows))).total_seconds()/60
s2rows=[]
for p in pages:
    for sc in ['meta','page']:
        xs=by[(p['id'],sc)]; m2=st.mean(xs)
        s2rows.append(dict(id=p['id'],scope=sc,s1=r4(p[sc]['mean']),s2=r4(m2),diff=r4(m2-p[sc]['mean']),sd2=r4(st.stdev(xs)),n=len(xs)))
out['session2']=dict(gapMinutes=round(gap),runs=20,first=min(x['at'] for x in r2),last=max(x['at'] for x in r2),rows=s2rows,maxAbsDiff=max(abs(x['diff']) for x in s2rows),beyondFloor=sum(abs(x['diff'])>out['noiseFloor'] for x in s2rows),requests=2*len(r2))
json.dump(out,open('../../../src/data/jev-consistency-2026-10-14.json','w'),separators=(',',':'))
print('ok', len(json.dumps(out)))
