import json
S=lambda mx:"newData.isString() && newData.val().length <= %d"%mx
def day_rules(B, CB=None, own_code=True):
    """B = rules-expression that yields root.child(...) of the day node"""
    counter="%s.child('counter').val()"%B
    CB=CB or B
    r={"$day":{
      "counter": {".read": True,
                  ".write": "auth != null || newData.val() === (data.exists() ? data.val() : 0) + 1",
                  ".validate": "newData.isNumber()"},
      # public queue: only what the waiting room needs (number, status, times, first name)
      "queue": {".read": True, "$id": {
        ".write": ("auth != null || (!data.exists() && newData.child('status').val() === 'waiting' "
                   "&& !newData.child('startedAt').exists() && !newData.child('doneAt').exists() "
                   "&& newData.child('no').val() >= 1 && newData.child('no').val() <= "+counter+" "
                   "&& "+B+".child('private').child($id).exists())"),
        ".validate": "$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && newData.hasChildren(['no','status','createdAt'])",
        "no":     {".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() % 1 === 0"},
        "first":  {".validate": S(30)},
        "status": {".write": "auth != null || (data.val() === 'waiting' && newData.val() === 'cancelled')",
                   ".validate": "newData.val() === 'waiting' || newData.val() === 'in' || newData.val() === 'done' || newData.val() === 'noshow' || newData.val() === 'cancelled'"},
        "createdAt": {".validate": "newData.isNumber()"},
        "startedAt": {".validate": "newData.isNumber()"},
        "doneAt":    {".validate": "newData.isNumber()"},
        "$other": {".validate": False}}},
      # private details: staff read only. Patients can only CREATE (needs today's code when one is set)
      "private": {".read": "auth != null", "$id": {
        ".write": ("auth != null || (!data.exists() && newData.child('src').val() === 'qr' && !newData.child('waAt').exists() "
                   "&& ("+CB+".child('codeOn').val() === true && newData.child('code').val() === "+CB+".child('code').val()))"),
        ".validate": "$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && newData.hasChildren(['name','src'])",
        "name":    {".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 100"},
        "phone":   {".validate": S(20)},
        "age":     {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 130"},
        "gender":  {".validate": S(20)},
        "type":    {".validate": S(40)},
        "why":     {".validate": S(1000)},
        "chronic": {".validate": S(1000)},
        "src":     {".validate": "newData.val() === 'qr' || newData.val() === 'staff'"},
        "code":    {".validate": S(8)},
        "waAt":    {".validate": "newData.isNumber()"},
        "$other":  {".validate": False}}}}}
    if own_code:
        r["$day"]["codeOn"]={".read": True,  ".write": "auth != null", ".validate": "newData.isBoolean()"}
        r["$day"]["code"]={".read": True, ".write": "auth != null"}
    return r
dawrak={"rules":{"clinics":{"main":{
  "settings":{".read":True,".write":"auth != null"},
  "days": day_rules("root.child('clinics').child('main').child('days').child($day)")}}}}
mdorak={"rules":{"clinics":{
  "settings":{".read":True,".write":"auth != null"},
  "directory":{".read":True,".write":"auth != null"},
  "doctors":{".read":"auth != null","$drId":{
     "settings":{".read":True,".write":"auth != null"},
     "days": day_rules("root.child('clinics').child('doctors').child($drId).child('days').child($day)",
                       CB="root.child('clinics').child('dayCode').child($day)", own_code=False)}},
  # ONE code per clinic per day, shared by all doctors
  "dayCode":{"$day":{".read":True,".write":"auth != null",
     "code":{".validate":"newData.isString() && newData.val().length <= 8"},
     "codeOn":{".validate":"newData.isBoolean()"},"$other":{".validate":False}}}}}}
json.dump(dawrak,open('dawrak.rules.json','w'),indent=2,ensure_ascii=False)
json.dump(mdorak,open('mdorak.rules.json','w'),indent=2,ensure_ascii=False)
