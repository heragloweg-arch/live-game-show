#!/usr/bin/env python3
"""Audit Arabic question wording only; never fact-checks or changes answers/options."""
import concurrent.futures as cf
import json, os, sys, time
from pathlib import Path
from openai import OpenAI

INPUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'content/question-bank/review-queue.json')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'content/question-bank/wording-audit.json')
MODEL = os.getenv('WORDING_AUDIT_MODEL', 'gpt-5-mini')
BATCH = 10

rows = json.loads(INPUT.read_text())
eligible = [r for r in rows if r.get('qaStatus') == 'needs_review_structurally_eligible']

schema = {
    'type': 'object', 'additionalProperties': False,
    'properties': {'items': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False,
        'properties': {
            'sourceKey': {'type': 'string'},
            'revisedPrompt': {'type': 'string'},
            'changed': {'type': 'boolean'},
            'needsHumanWordingReview': {'type': 'boolean'},
            'reason': {'type': 'string'}
        },
        'required': ['sourceKey','revisedPrompt','changed','needsHumanWordingReview','reason']
    }}},
    'required': ['items']
}

system = '''أنت مدقق صياغة عربية لتطبيق مسابقات. مهمتك تحرير صياغة السؤال فقط، لا التحقق من صحة المعلومة ولا تغيير الإجابة.
قواعد صارمة:
1) حافظ على المعنى المقصود تمامًا.
2) لا تغيّر الخيارات ولا correctIndex؛ لا تُخرجهما أصلًا.
3) لا تضف معلومة جديدة، ولا تحذف قيدًا زمنيًا أو مكانيًا أو وصفًا.
4) أصلح النحو والإملاء وعلامات الترقيم والوضوح واللغة العربية الطبيعية.
5) اجعل السؤال قصيرًا وواضحًا ومناسبًا للعبة.
6) إذا كان السؤال غامضًا أو صياغته قد تغيّر المعنى أو تحتاج تحققًا بشريًا، اتركه كما هو وضع needsHumanWordingReview=true واشرح السبب.
7) لا تستخدم التشكيل الكامل. أخرج JSON مطابقًا للمخطط فقط.'''

def call(batch):
    client = OpenAI()
    payload = [{'sourceKey': r['sourceKey'], 'prompt': r['prompt'], 'category': r.get('category',''), 'options': r.get('options', [])} for r in batch]
    for attempt in range(4):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{'role':'system','content':system}, {'role':'user','content':json.dumps(payload, ensure_ascii=False)}],
                response_format={'type':'json_schema','json_schema':{'name':'wording_audit','strict':True,'schema':schema}},
                max_completion_tokens=3500,
                extra_body={'reasoning': {'effort': 'minimal'}},
            )
            data = json.loads(resp.choices[0].message.content)
            got = {x['sourceKey']: x for x in data['items']}
            out=[]
            for r in batch:
                x=got.get(r['sourceKey'])
                if not x: raise ValueError('missing sourceKey '+r['sourceKey'])
                revised=str(x['revisedPrompt']).strip()
                if not revised or len(revised) < 8: raise ValueError('invalid revised prompt')
                x['revisedPrompt']=revised
                out.append(x)
            return out
        except Exception:
            if attempt == 3: raise
            time.sleep(2 ** attempt)

batches=[eligible[i:i+BATCH] for i in range(0,len(eligible),BATCH)]
results=[]
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    futures=[ex.submit(call,b) for b in batches]
    for i,f in enumerate(futures,1):
        results.extend(f.result())
        print(f'completed {i}/{len(futures)}', flush=True)

by_key={x['sourceKey']:x for x in results}
merged=[]
for r in rows:
    x=by_key.get(r.get('sourceKey'))
    item=dict(r)
    if x:
        item['wordingAudit'] = x
        item['wordingStatus'] = 'needs_human_review' if x['needsHumanWordingReview'] else 'wording_checked'
        item['reviewedPrompt'] = x['revisedPrompt']
    merged.append(item)

OUT.write_text(json.dumps({'model':MODEL,'scope':'wording_only','source':str(INPUT),'items':merged},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'eligible':len(eligible),'audited':len(results),'changed':sum(x['changed'] for x in results),'needs_human_review':sum(x['needsHumanWordingReview'] for x in results),'output':str(OUT)},ensure_ascii=False))
