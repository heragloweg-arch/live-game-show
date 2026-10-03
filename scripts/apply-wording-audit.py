#!/usr/bin/env python3
import json, sys
from pathlib import Path

src=Path(sys.argv[1] if len(sys.argv)>1 else 'content/question-bank/wording-audit.json')
out=Path(sys.argv[2] if len(sys.argv)>2 else 'content/question-bank/wording-reviewed-queue.json')
data=json.loads(src.read_text())
# Safe editorial overrides: wording only; no answer/options/correctIndex changes.
overrides={
'db1.json:21':'من أول من أسلم من الصبيان، على المشهور؟',
'db1.json:60':'من أدت دور علياء في فيلم «صمت القصور»؟',
'db1.json:96':'ما اسم المَلَك الموكّل بالوحي؟',
'db1.json:98':'ما الدولة المنتجة لفيلم «وقائع سنين الجمر»؟',
'db1.json:122':'في أي عام فاز فيلم «وقائع سنين الجمر» بالسعفة الذهبية؟',
'db2.json:46':'ما صفة ابن بطوطة؟',
'db2.json:47':'كم ضلعًا للمثلث؟',
'db2.json:101':'كم دقيقة في الساعة؟',
'db2.json:104':'ما اسم الشكل ذي الخمس زوايا؟',
'db2.json:106':'أي شهر يأتي بعد رمضان؟',
'db3.json:111':'ما اسم المعركة التي وقعت بعد غزوة بدر واشتهرت بحادثة الرماة؟',
'db3.json:120':'من أول من أسلم من الرجال الأحرار، على المشهور؟',
'db4.json:14':'من النبي الذي ألان الله له الحديد؟',
'db4.json:36':'ما المسجد الذي كان قبلة المسلمين الأولى؟',
'db4.json:69':'ما الدولة التي أنتجت فيلم «صمت القصور»؟',
'db4.json:85':'من كاتب المسودة الرئيسية لإعلان استقلال الولايات المتحدة؟',
'db4.json:127':'من هو بطل فيلم «السكرية»؟',
'db4.json:130':'من هي بطلة فيلم «المنسي»؟',
'db5.json:82':'ما اسم الحوض الذي يشرب منه المسلمون يوم القيامة؟',
'db5.json:85':'من أين هاجر النبي صلى الله عليه وسلم؟',
'db5.json:105':'ما المقصود بالصوم في العبادة؟',
'db5.json:127':'ما الرياضة التي تعتمد على الفروسية والقفز؟',
'db6.json:32':'كم عامًا استمرت رسالة النبي محمد صلى الله عليه وسلم؟',
'db7.json:36':'في أي غزوة كُسرت رباعية النبي صلى الله عليه وسلم؟',
'db7.json:63':'من الذي قال عنه النبي: «أرحم أمتي بأمتي أبو بكر»؟',
'db7_religion.json:42':'أي نبي فقد بصره من كثرة البكاء على ابنه؟',
}
items=[]
for r in data['items']:
    x=dict(r)
    audit=x.get('wordingAudit')
    if audit:
        revised=overrides.get(x['sourceKey'], audit.get('revisedPrompt') or x['prompt'])
        x['reviewedPrompt']=revised
        x['wordingStatus']='wording_checked'
        x['wordingReviewMethod']='llm_editorial_audit_with_manual_sensitive_overrides'
        if x['sourceKey'] in overrides:
            x['wordingManualOverride']=True
    items.append(x)
out.write_text(json.dumps({'source':str(src),'scope':'wording_only','items':items},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'items':len(items),'audited':sum('wordingAudit' in x for x in items),'overrides':len(overrides),'output':str(out)},ensure_ascii=False))
