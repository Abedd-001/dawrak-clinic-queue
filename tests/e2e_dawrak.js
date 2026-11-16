const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const {Backend}=require('./backend.js');
const ROOT=process.argv[2]||'/tmp/mdorak_work/dawrak_real/public';
const rules=JSON.parse(fs.readFileSync(path.join(ROOT,'..','database.rules.json')));
const fake=fs.readFileSync(path.join(__dirname,'fakefb_page.js'),'utf8');
const pad=n=>n<10?'0'+n:''+n,d=new Date(),TODAY=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const BASE=['clinics','main','days',TODAY];
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok  ':'FAIL  ')+m)};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.svg':'image/svg+xml','.json':'application/json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end('nf')} r.writeHead(200,{'content-type':mime[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f))});
(async()=>{
  await new Promise(r=>srv.listen(8099,r)); const URL='http://localhost:8099';
  const be=new Backend(rules); const browser=await chromium.launch(); let pn=0; const errors=[];
  async function mk(name){ const ctx=await browser.newContext({viewport:{width:1280,height:900}}); const page=await ctx.newPage(); const pid=name+(++pn);
    page.on('pageerror',e=>errors.push(name+': '+e.message)); 
    be.addPage(pid,m=>page.evaluate(x=>window.__fb_push(x),m));
    await page.exposeFunction('__fb_op',m=>be.op(pid,m));
    await page.route('**/*',route=>{const u=route.request().url();
      if(u.startsWith(URL))return route.continue();
      if(/firebase-app-compat/.test(u))return route.fulfill({contentType:'application/javascript',body:fake});
      if(/firebase-(database|auth)-compat/.test(u))return route.fulfill({contentType:'application/javascript',body:''});
      if(/qrcode/.test(u))return route.fulfill({contentType:'application/javascript',body:'window.QRCode=function(el){el.innerHTML="<i>qr</i>"};window.QRCode.CorrectLevel={M:0};'});
      if(/fonts\.googleapis/.test(u))return route.fulfill({contentType:'text/css',body:''});
      return route.fulfill({status:200,body:''})});
    return page }
  const fill=async(p,sel,v)=>{await p.fill(sel,v)};
  await be.adminSet('clinics/main/settings',{name:'عيادة تجريبية',specialty:'باطنة',setupDone:true,open:true,avg:15});
  // ---------- BEFORE staff opens: no code exists -> booking must be locked ----------
  { const pre=await mk('pre'); await pre.goto(URL+'/'); await pre.waitForTimeout(600);
    const t=await pre.textContent('body'); ok(t.includes('الحجز لسه ما بدأش')&&!(await pre.$('#book-form'))&&!(await pre.$('#code-form')),'client: no code generated yet -> NO booking form (booking locked)');
    const r=await pre.evaluate(async b=>{try{await firebase.database().ref(b).set({name:'x',phone:'0',age:3,gender:'ذكر',type:'كشف جديد',why:'x',chronic:'',src:'qr'});return 'ALLOWED'}catch(e){return e.code}},BASE.join('/')+'/private/hack1');
    ok(r==='PERMISSION_DENIED','anon cannot write patient data while no code exists (rules, not just UI)'); await pre.close(); }
  // ---------- STAFF logs in; code auto-generated ----------
  const staff=await mk('staff'); await staff.goto(URL+'/staff/'); await staff.waitForSelector('#l-email');
  await fill(staff,'#l-email','staff@test.com'); await fill(staff,'#l-pass','wrong'); await staff.click('#btn-login');
  await staff.waitForTimeout(300); ok(!be.pages.get('staff2').auth,'staff: wrong password rejected');
  await fill(staff,'#l-pass','secret'); await staff.click('#btn-login'); await staff.waitForSelector('#btn-new-code',{timeout:5000});
  await staff.waitForTimeout(500); ok(/^\d{4}$/.test(be.get([...BASE,'code']))&&be.get([...BASE,'codeOn'])===true,'staff: code AUTO-generated on opening the page (no button press)');
  await staff.click('#btn-new-code'); await staff.waitForTimeout(400);
  const code=be.get([...BASE,'code']); ok(/^\d{4}$/.test(code),'staff: daily code generated ('+code+')');
  ok(be.get([...BASE,'codeOn'])===true,'staff: codeOn flag set publicly');
  // seed 3 earlier patients: #1 inside, #2 and #3 waiting
  const seed=(k,no,st,extra={})=>Promise.all([be.adminSet([...BASE,'private',k].join('/'),{name:'مريض '+no+' تجريبي',phone:'0100000000'+no,age:30+no,gender:'ذكر',type:'كشف جديد',why:'سبب',chronic:'',src:'staff'}),
     be.adminSet([...BASE,'queue',k].join('/'),{no,first:'مريض',status:st,createdAt:Date.now()-1000*(10-no),...extra})]);
  await be.adminSet([...BASE,'counter'].join('/'),3);
  await seed('s1',1,'in',{startedAt:Date.now()-60000}); await seed('s2',2,'waiting'); await seed('s3',3,'waiting');
  // ---------- CLIENT ----------
  const cl=await mk('client'); await cl.addInitScript(()=>{window.__vib=0;navigator.vibrate=()=>{window.__vib++;return true}});
  await cl.goto(URL+'/'); await cl.waitForSelector('#code-form',{timeout:5000}); ok(true,'client: daily-code gate shown (codeOn)');
  const fillForm=async(p,name,phone)=>{ await p.waitForSelector('#book-form'); await fill(p,'#f-name',name); await fill(p,'#f-phone',phone); await fill(p,'#f-age','35');
    await p.evaluate(()=>document.querySelector('input[name=gender]').click()); await fill(p,'#f-why','صداع'); await fill(p,'#f-chronic','سكر'); };
  await fill(cl,'#f-code','9999'); await cl.click('#code-form button'); await fillForm(cl,'احمد محمد علي','01012345678'); await cl.click('#book-form button[type=submit]');
  await cl.waitForSelector('#code-form',{timeout:5000}); ok((await cl.textContent('#e-code')).includes('الكود مش صح'),'client: WRONG code -> booking refused by rules, gate re-shown with error');
  ok(!Object.keys(be.get([...BASE,'queue'])||{}).some(k=>be.get([...BASE,'queue',k,'no'])===4),'db: no ticket created with wrong code');
  await fill(cl,'#f-code',code); await cl.click('#code-form button'); await fillForm(cl,'احمد محمد علي','01012345678'); await cl.click('#book-form button[type=submit]');
  await cl.waitForSelector('.ticket',{timeout:5000}); ok((await cl.textContent('.tk-no')).trim()==='4','client: booked with right code -> number 4');
  ok((await cl.textContent('.tk-name')).includes('احمد محمد علي'),'client: own full name shown on own ticket (kept on device)');
  const q=be.get([...BASE,'queue']), pv=be.get([...BASE,'private']); const myKey=Object.keys(q).find(k=>q[k].no===4);
  ok(!!myKey&&JSON.stringify(q).indexOf('01012345678')<0&&JSON.stringify(q).indexOf('سكر')<0,'db: PUBLIC queue has NO phone / medical info');
  ok(pv[myKey]&&pv[myKey].phone==='01012345678'&&pv[myKey].chronic==='سكر'&&pv[myKey].code===code,'db: private entry has full details (+code used)');
  ok(q[myKey].first==='احمد'&&Object.keys(q[myKey]).sort().join()==='createdAt,first,no,status','db: queue entry = {no, first name, status, createdAt} only');
  // ---------- ANON PROBES from the client page ----------
  const probe=(p,expr)=>p.evaluate(async e=>{try{await eval(e);return 'ALLOWED'}catch(x){return x.code||String(x)}},expr);
  const B=BASE.join('/');
  ok(await probe(cl,`firebase.database().ref('${B}/private').once('value')`)==='PERMISSION_DENIED','anon cannot READ private details');
  ok(await probe(cl,`firebase.database().ref('${B}/code').once('value')`)!=='PERMISSION_DENIED','daily code is readable (shown on display)');
  ok(await probe(cl,`firebase.database().ref('clinics/main/days').once('value')`)==='PERMISSION_DENIED','anon cannot READ all days');
  ok(await probe(cl,`firebase.database().ref('${B}/queue/s2').remove()`)==='PERMISSION_DENIED','anon cannot DELETE others queue entry');
  ok(await probe(cl,`firebase.database().ref('${B}/queue').remove()`)==='PERMISSION_DENIED','anon cannot wipe queue');
  ok(await probe(cl,`firebase.database().ref('${B}/queue/zzz').set({no:99,status:'waiting',createdAt:1})`)==='PERMISSION_DENIED','anon cannot spam queue without private+code');
  // ---------- ALERTS ----------
  await be.adminSet([...BASE,'queue','s1','status'].join('/'),'done'); await cl.waitForTimeout(300);
  await be.adminSet([...BASE,'queue','s2','status'].join('/'),'in'); await cl.waitForTimeout(200);
  // ---------- STAFF sees merged data, whatsapp, call next ----------
  await staff.waitForTimeout(300); const stText=await staff.textContent('body');
  ok(stText.includes('احمد محمد علي')&&stText.includes('0101 234 5678'),'staff: sees full name + phone (private merged)');
  const wa=await staff.$$eval('a[href^="https://wa.me/"]',as=>as.map(a=>a.href)); ok(wa.length>=1&&wa.some(h=>h.startsWith('https://wa.me/201012345678?text=')),'staff: WhatsApp link -> wa.me/201012345678 with message');
  ok(decodeURIComponent(wa.find(h=>h.includes('201012345678'))).includes('رقمك 4'),'staff: whatsapp message has my number');
  { const sel='a[data-wa][href*="201012345678"]'; ok(!(await staff.textContent(sel)).includes('✓'),'staff: WhatsApp button has no ✓ before sending');
    const popup=staff.context().waitForEvent('page',{timeout:3000}).catch(()=>null); await staff.click(sel); const pp=await popup; if(pp) await pp.waitForLoadState().catch(()=>{}); ok(!!pp,'staff: click still opens wa.me chat (new tab)'); if(pp) await pp.close();
    await staff.waitForTimeout(500);
    ok((await staff.textContent(sel)).includes('✓'),'staff: ✓ shown next to "واتساب" after pressing');
    const myk=Object.keys(be.get([...BASE,'queue'])).find(k=>be.get([...BASE,'queue',k,'no'])===4); ok(typeof be.get([...BASE,'private',myk,'waAt'])==='number','db: waAt saved in PRIVATE (staff only), so ✓ survives reload');
    ok(be.get([...BASE,'queue',myk,'waAt'])===null||be.get([...BASE,'queue',myk,'waAt'])===undefined,'db: waAt not exposed in public queue');
    const staff2=await mk('staff'); await staff2.goto(URL+'/staff/'); await staff2.waitForSelector('#l-email'); await fill(staff2,'#l-email','staff@test.com'); await fill(staff2,'#l-pass','secret'); await staff2.click('#btn-login'); await staff2.waitForSelector(sel,{timeout:5000});
    ok((await staff2.textContent(sel)).includes('✓'),'staff (fresh login on another device): ✓ still shown'); await staff2.close(); }
  await staff.click('#btn-toggle-add'); await staff.waitForSelector('#a-name'); await fill(staff,'#a-name','مريض يدوي'); await fill(staff,'#a-phone','01099999999'); await fill(staff,'#a-age','40');
  { const sub=()=>staff.evaluate(()=>document.querySelector('#add-form').requestSubmit());
    await staff.evaluate(()=>{document.querySelector('#a-phone').value='';document.querySelector('#add-form').requestSubmit()}); await staff.waitForTimeout(200);
    ok((await staff.textContent('#ae-phone')).length>0,'staff add: phone is required');
    await fill(staff,'#a-phone','01099999999'); await staff.evaluate(()=>{document.querySelector('#a-age').value=''}); await sub(); await staff.waitForTimeout(200);
    ok((await staff.textContent('#ae-age')).length>0,'staff add: age is required');
    await fill(staff,'#a-age','40'); await sub(); await staff.waitForTimeout(300);
    ok((await staff.$('#a-name')&&(await staff.inputValue('#a-name'))==='مريض يدوي'),'staff add: gender required (form not submitted without it)'); }
  await staff.evaluate(()=>document.querySelector('#add-form input[name=agender]').click()); await staff.evaluate(()=>document.querySelector('#add-form').requestSubmit()); await staff.waitForTimeout(500);
  const q2=be.get([...BASE,'queue']),p2=be.get([...BASE,'private']); const mk2=Object.keys(q2).find(k=>q2[k].no===5);
  ok(mk2&&p2[mk2].src==='staff'&&p2[mk2].phone==='01099999999'&&q2[mk2].first==='مريض','staff: manual add writes queue + private (counter 5)');
  await staff.click('#btn-next'); await staff.waitForTimeout(400); const q3=be.get([...BASE,'queue']);
  ok(q3.s2.status==='done'&&q3.s3.status==='in','staff: "next" finished #2 and called #3 (rules allow staff)');
  await be.adminSet([...BASE,'queue','s3','status'].join('/'),'done'); await be.adminSet([...BASE,'queue',myKey,'status'].join('/'),'in'); await cl.waitForTimeout(300);
  ok((await cl.textContent('body')).includes('دورك بدأ'),'client: shows "دورك بدأ"');
  ok(!(await cl.$('#btn-alert'))&&!(await cl.textContent('body')).includes('نبّهني'),'client: no "notify me" button');
  // ---------- DISPLAY: no login, sound from the start ----------
  const audioStub=(allow)=>`(()=>{ window.__plays=[]; window.__allow=${!!allow}; const g=()=>{window.__allow=true}; ['pointerdown','keydown','touchstart'].forEach(e=>addEventListener(e,g,true));
    window.Audio=function(){ this.volume=1; this.play=()=>{ window.__plays.push(this.volume); return window.__allow?Promise.resolve():Promise.reject(new Error('NotAllowed')) }; this.pause=()=>{}; }; })()`;
  const loud=p=>p.evaluate(()=>window.__plays.filter(v=>v>0.01).length);
  { const dsp=await mk('display'); await dsp.addInitScript(audioStub(true)); await dsp.goto(URL+'/display/'); await dsp.waitForSelector('.serving-no',{timeout:5000}); await dsp.waitForTimeout(500);
    { const bt=await dsp.textContent('body'); ok(bt.includes('كود اليوم')&&bt.includes(be.get([...BASE,'code'])),'display: shows today\'s code'); }
    ok(!(await dsp.$('#login-form'))&&!(await dsp.$('#d-email'))&&!(await dsp.$('#btn-start')),'display: NO login / start screen');
    ok((await dsp.textContent('.serving-no')).trim()==='4','display: shows serving number immediately (public queue)');
    ok(!(await dsp.textContent('body')).includes('01012345678'),'display: no phone numbers on screen');
    ok(await dsp.evaluate(()=>document.getElementById('sound-badge').hidden),'display: sound unlocked on open (no badge)');
    ok(await loud(dsp)===0,'display: NO chime on first load');
    const k5=Object.keys(be.get([...BASE,'queue'])).find(k=>be.get([...BASE,'queue',k,'no'])===5);
    await be.adminSet([...BASE,'queue',myKey,'status'].join('/'),'done'); await be.adminSet([...BASE,'queue',k5,'status'].join('/'),'in'); await dsp.waitForTimeout(400);
    ok(await loud(dsp)===1&&(await dsp.textContent('.serving-no')).trim()==='5','display: chime plays when a new number is called (without any click)');
    await dsp.close(); }
  { const dsp=await mk('display'); await dsp.addInitScript(audioStub(false)); await dsp.goto(URL+'/display/'); await dsp.waitForSelector('.serving-no',{timeout:5000}); await dsp.waitForTimeout(400);
    ok(!(await dsp.evaluate(()=>document.getElementById('sound-badge').hidden)),'display (browser blocks autoplay): badge asks for ONE tap');
    await dsp.mouse.click(300,300); await dsp.waitForTimeout(300);
    ok(await dsp.evaluate(()=>document.getElementById('sound-badge').hidden),'display: after one tap sound enabled, badge gone'); await dsp.close(); }
  // ---------- CANCEL by another patient ----------
  const c2=await mk('client2'); await c2.goto(URL+'/'); await c2.waitForSelector('#code-form'); await fill(c2,'#f-code',code); await c2.click('#code-form button');
  await fillForm(c2,'سارة أحمد','01122334455'); await c2.click('#book-form button[type=submit]'); await c2.waitForSelector('.ticket'); await c2.click('#btn-cancel-ask'); await c2.click('#btn-cancel-yes'); await c2.waitForTimeout(400);
  const q4=be.get([...BASE,'queue']); const k6=Object.keys(q4).find(k=>q4[k].no===6); ok(q4[k6].status==='cancelled','client2: cancelling own waiting ticket works');
  const denied=be.log.filter(l=>l.res!=='OK'); console.log('  (rule denials during run:',denied.length,')');
  ok(errors.length===0,'no JS page errors'+(errors.length?': '+errors.join(' | '):''));
  await browser.close(); srv.close(); console.log(fails?('\n'+fails+' FAILED'):'\nE2E ALL PASSED'); process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
