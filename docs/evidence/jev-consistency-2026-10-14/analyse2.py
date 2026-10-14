import json, statistics as st, collections, math, random, itertools
rows=[json.loads(l) for l in open('results.jsonl')]
subs={s['id']:s for s in json.load(open('subjects.json'))}
order=[s['id'] for s in json.load(open('subjects.json'))]
def calc(r):
    s=subs[r['id']]; ts=sum(r['ratings'][s['terms'].index(t)] for t in s['expected']); return ts, ts*r['intent']
G=collections.defaultdict(dict)
for r in rows:
    ts,sc=calc(r); G[(r['id'],r['cond'],r['scope'])][r['run']]=dict(ts=ts,fit=r['intent'],score=sc,ratings=r['ratings'],at=r['at'],ms=r['ms'],tok=r['tokensIn'])
out={'pages':[]}
times=sorted(r['at'] for r in rows); out['run']=dict(requests=2*len(rows), answers=len(rows), first=times[0], last=times[-1], models=sorted(set(r['modelA'] for r in rows)|set(r['modelB'] for r in rows)), tokensIn=sum(r['tokensIn'] for r in rows), medianPairMs=st.median(r['ms'] for r in rows))
def S(xs): return dict(mean=st.mean(xs), sd=st.stdev(xs), min=min(xs), max=max(xs), n=len(xs))
singleErr={'meta':[], 'page':[]}
for pid in order:
    s=subs[pid]; e=dict(id=pid,label=s['label'],kind=s['kind'],url=s['url'],intent=s['intent'],bodyChars=s['bodyChars'])
    for sc in ['meta','page']:
        g=G[(pid,'base',sc)]; runs=[g[i] for i in range(100)]
        xs=[x['score'] for x in runs]; m=st.mean(xs)
        singleErr[sc]+= [abs(x-m) for x in xs]
        # top10 terms per run vs mean ranking
        mean_r=[st.mean(x['ratings'][k] for x in runs) for k in range(30)]
        top_mean=set(sorted(range(30),key=lambda k:-mean_r[k])[:10])
        overlaps=[len(top_mean & set(sorted(range(30),key=lambda k:-x['ratings'][k])[:10])) for x in runs]
        term_sds=[st.stdev(x['ratings'][k] for x in runs) for k in range(30)]
        half=st.mean(xs[50:])-st.mean(xs[:50])
        e[sc]=dict(score=S(xs), fit=S([x['fit'] for x in runs]), termSum=S([x['ts'] for x in runs]),
            dev=[round(x-m,4) for x in xs], top10Overlap=dict(mean=st.mean(overlaps),min=min(overlaps),identical=sum(o==10 for o in overlaps)),
            termSd=dict(mean=st.mean(term_sds),max=max(term_sds)), halfDrift=half,
            clusters=False)
        # app's two-cluster rule
        srt=sorted(xs); best=0; at=-1
        for i in range(1,len(srt)):
            if srt[i]-srt[i-1]>best: best=srt[i]-srt[i-1]; at=i
        lo,hi=srt[:at],srt[at:]
        if len(lo)>=3 and len(hi)>=3: e[sc]['clusters']= best > 4*max(st.stdev(lo),st.stdev(hi),0.005)
    for cond in ['improved','degraded']:
        g=G[(pid,cond,'meta')]; xs=[g[i]['score'] for i in range(30)]
        b=e['meta']['score']; v=S(xs); d=v['mean']-b['mean']; pooled=math.sqrt((v['sd']**2+b['sd']**2)/2)
        e[cond]=dict(score=v, fit=S([g[i]['fit'] for i in range(30)]), delta=d, deltaOverPooledSd=(d/pooled if pooled>0 else None), bandsOverlap= abs(d) <= 2*v['sd']+2*b['sd'])
    out['pages'].append(e)
# noise floor
for sc in ['meta','page']:
    sds=[p[sc]['score']['sd'] for p in out['pages']]
    errs=sorted(singleErr[sc])
    q=lambda p: errs[min(len(errs)-1,int(p*len(errs)))]
    out[sc]=dict(maxSd=max(sds), medianSd=st.median(sds), meanSd=st.mean(sds), err50=q(.5), err95=q(.95), err99=q(.99), errMax=errs[-1])
allsd=[p[sc]['score']['sd'] for p in out['pages'] for sc in ['meta','page']]
out['noiseFloor']=2*max(allsd)
# SD of the mean of n runs, by resampling without replacement, worst page
random.seed(1)
conv={}
for n in [1,2,3,5,10,20]:
    worst=0; med=[]
    for p in out['pages']:
        for sc in ['meta','page']:
            xs=[G[(p['id'],'base',sc)][i]['score'] for i in range(100)]
            ms=[st.mean(random.sample(xs,n)) for _ in range(2000)]
            sd=st.pstdev(ms); worst=max(worst,sd); med.append(sd)
    conv[n]=dict(worst=worst, median=st.median(med))
out['convergence']=conv
# ranking of the 10 pages per run
rank={}
for sc in ['meta','page']:
    means=[p[sc]['score']['mean'] for p in out['pages']]
    ref=sorted(range(10),key=lambda i:-means[i])
    same=0; taus=[]
    for r in range(100):
        xs=[G[(pid,'base',sc)][r]['score'] for pid in order]
        o=sorted(range(10),key=lambda i:-xs[i])
        same+= o==ref
        conc=disc=0
        for i,j in itertools.combinations(range(10),2):
            a=(means[i]-means[j]); b=(xs[i]-xs[j])
            if a*b>0: conc+=1
            elif a*b<0: disc+=1
        taus.append((conc-disc)/45)
    gaps=sorted(abs(a-b) for a,b in itertools.combinations(means,2))
    rank[sc]=dict(identicalOrder=same, minTau=min(taus), closestGap=gaps[0])
out['ranking']=rank
json.dump(out,open('report-data.json','w'),indent=1)
print(json.dumps({k:out[k] for k in ['run','noiseFloor','convergence','ranking']},indent=1))
for sc in ['meta','page']: print(sc,out[sc])
for p in out['pages']:
    print(p['id'], 'meta sd %.4f top10 %.2f/%d id %d clus %s drift %.4f | page sd %.4f top10 %.2f min %d clus %s drift %.4f'%(p['meta']['score']['sd'],p['meta']['top10Overlap']['mean'],p['meta']['top10Overlap']['min'],p['meta']['top10Overlap']['identical'],p['meta']['clusters'],p['meta']['halfDrift'],p['page']['score']['sd'],p['page']['top10Overlap']['mean'],p['page']['top10Overlap']['min'],p['page']['clusters'],p['page']['halfDrift']),
      '| imp d %.3f z %.1f overlap %s | deg d %.3f z %s overlap %s'%(p['improved']['delta'],p['improved']['deltaOverPooledSd'],p['improved']['bandsOverlap'],p['degraded']['delta'],None if p['degraded']['deltaOverPooledSd'] is None else round(p['degraded']['deltaOverPooledSd'],1),p['degraded']['bandsOverlap']))
