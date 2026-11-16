const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const {Backend}=require('./backend.js');
const ROOT=process.argv[2]||'/tmp/mdorak_work/mdorak/public';
const rules=JSON.parse(fs.readFileSync(path.join(ROOT,'..','database.rules.json')));
const fake=fs.readFileSync(path.join(__dirname,'fakefb_page.js'),'utf8');
const pad=n=>n<10?'0'+n:''+n,d=new Date(),TODAY=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const BASE=['clinics','doctors','dr1','days',TODAY]; const CODE=['clinics','dayCode',TODAY]; const BASE2=['clinics','doctors','dr2','days',TODAY];
let fails=0;const ok=(c,m)=>{if(!c)fails++;console.log((c?'  ok  ':'FAIL  ')+m)};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.svg':'image/svg+xml','.json':'application/json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(ROOT,u);
  let f2=f;if(!f.startsWith(ROOT)||!fs.existsSync(f)){f2=path.join(ROOT,'index.html')} r.writeHead(200,{'content-type':mime[path.extname(f2)]||'text/plain'});return r.end(fs.readFileSync(f2)); r.writeHead(200,{'content-type':mime[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f))});
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

  await be.adminSet('clinics/settings',{name:'عيادة تجريبية',setupDone:true});
  await be.adminSet('clinics/doctors/dr1/settings',{name:'د. أحمد',specialty:'باطنة',open:true,avg:15,setupDone:true});
  await be.adminSet('clinics/doctors/dr2/settings',{name:'د. منى',specialty:'أطفال',open:true,avg:10,setupDone:true});
  // ---------- BEFORE staff opens: no code -> locked ----------
  { const pre=await mk('pre'); await pre.goto(URL+'/?dr=dr1'); await pre.waitForTimeout(700);
    const t=await pre.textContent('body'); ok(t.includes('الحجز لسه ما بدأش')&&!(await pre.$('#book-form'))&&!(await pre.$('#code-form')),'client: no code generated yet -> NO booking form (locked)');
    const r=await pre.evaluate(async b=>{try{await firebase.database().ref(b).set({name:'x',phone:'0',age:3,gender:'ذكر',type:'كشف جديد',why:'x',chronic:'',src:'qr'});return 'ALLOWED'}catch(e){return e.code}},BASE.join('/')+'/private/hack1');
    ok(r==='PERMISSION_DENIED','anon cannot write patient data while no code exists (rules)'); await pre.close(); }
  // ---------- STAFF login, directory sync, codes auto-generated ----------
  const staff=await mk('staff'); await staff.goto(URL+'/staff/'); await staff.waitForSelector('#l-email');
  await fill(staff,'#l-email','staff@test.com'); await fill(staff,'#l-pass','secret'); await staff.click('#btn-login'); await staff.waitForSelector('[data-tab=dr1]',{timeout:5000});
  await staff.waitForTimeout(400);
  const dir=be.get(['clinics','directory']); ok(dir&&dir.dr1&&dir.dr1.name==='د. أحمد'&&dir.dr2&&dir.dr2.open===true&&Object.keys(dir.dr1).sort().join()==='avg,name,open,specialty','staff: public directory auto-synced (name/specialty/avg/open only)');
  ok(/^\d{4}$/.test(be.get([...CODE,'code']))&&be.get([...CODE,'codeOn'])===true&&be.get([...CODE,'code'])===be.get([...CODE,'code']),'staff: ONE clinic-wide code AUTO-generated on opening the page');
  await staff.click('[data-tab=dr1]'); await staff.waitForSelector('#btn-new-code'); await staff.click('#btn-new-code'); await staff.waitForTimeout(400);
  const code=be.get([...CODE,'code']); ok(/^\d{4}$/.test(code),'staff: dr1 daily code generated ('+code+')'); ok(be.get([...CODE,'codeOn'])===true,'staff: codeOn flag set');
  const seed=(B,k,no,st,extra={})=>Promise.all([be.adminSet([...B,'private',k].join('/'),{name:'مريض '+no+' تجريبي',phone:'0100000000'+no,age:30+no,gender:'ذكر',type:'كشف جديد',why:'سبب',chronic:'',src:'staff'}),
     be.adminSet([...B,'queue',k].join('/'),{no,first:'مريض',status:st,createdAt:Date.now()-1000*(10-no),...extra})]);
  await be.adminSet([...BASE,'counter'].join('/'),3);
  await seed(BASE,'s1',1,'in',{startedAt:Date.now()-60000}); await seed(BASE,'s2',2,'waiting'); await seed(BASE,'s3',3,'waiting');
  // ---------- CLIENT: picker from public directory ----------
  const c0=await mk('picker'); await c0.goto(URL+'/'); await c0.waitForSelector('.dr-card',{timeout:5000});
  const pk=await c0.textContent('body'); ok(pk.includes('د. أحمد')&&pk.includes('د. منى'),'client picker: both doctors listed (read from public directory only)');
  await c0.click('[data-dr=dr1]'); await c0.waitForSelector('#code-form',{timeout:5000}); ok(true,'client: picking dr1 -> code gate shown (codeOn)');
  ok(new (require('url').URL)(c0.url()).pathname==='/dr1/','URL becomes /dr1/ after picking doctor');
  ok(!(await c0.$('.breadcrumb')),'breadcrumb line removed');
  await c0.goBack(); await c0.waitForSelector('.dr-card',{timeout:5000}); ok(new (require('url').URL)(c0.url()).pathname==='/','browser Back returns to picker at /');
  await c0.goForward(); await c0.waitForSelector('#code-form',{timeout:5000}); ok(true,'browser Forward reopens dr1');
  await c0.goto(URL+'/dr2/'); await c0.waitForSelector('#code-form',{timeout:5000}); ok(true,'direct open /dr2/ shows dr2 code gate'); await c0.close();
  // ---------- CLIENT booking for dr1 ----------
  const cl=await mk('client'); await cl.addInitScript(()=>{window.__vib=0;navigator.vibrate=()=>{window.__vib++;return true}});
  await cl.goto(URL+'/?dr=dr1'); await cl.waitForSelector('#code-form',{timeout:5000});
  const fillForm=async(p,name,phone)=>{ await p.waitForSelector('#book-form'); await fill(p,'#f-name',name); await fill(p,'#f-phone',phone); await fill(p,'#f-age','35');
    await p.evaluate(()=>document.querySelector('input[name=gender]').click()); await fill(p,'#f-why','صداع'); await fill(p,'#f-chronic','سكر'); };
  await fill(cl,'#f-code','9999'); await cl.click('#code-form button'); await fillForm(cl,'احمد محمد علي','01012345678'); await cl.click('#book-form button[type=submit]');
  await cl.waitForSelector('#code-form',{timeout:5000}); ok((await cl.textContent('#e-code')).includes('الكود مش صح'),'client: WRONG code -> refused by rules, gate re-shown');
  ok(!Object.keys(be.get([...BASE,'queue'])||{}).some(k=>be.get([...BASE,'queue',k,'no'])===4),'db: no ticket with wrong code');
  await fill(cl,'#f-code',code); await cl.click('#code-form button'); await fillForm(cl,'احمد محمد علي','01012345678'); await cl.click('#book-form button[type=submit]');
  await cl.waitForSelector('.ticket',{timeout:5000}); ok((await cl.textContent('.tk-no')).trim()==='4','client: booked with right code -> number 4');
  ok((await cl.textContent('.tk-name')).includes('احمد محمد علي'),'client: own full name on own ticket (kept on device)');
  const q=be.get([...BASE,'queue']), pv=be.get([...BASE,'private']); const myKey=Object.keys(q).find(k=>q[k].no===4);
  ok(!!myKey&&JSON.stringify(q).indexOf('01012345678')<0&&JSON.stringify(q).indexOf('سكر')<0,'db: PUBLIC queue has NO phone / medical info');
  ok(pv[myKey]&&pv[myKey].phone==='01012345678'&&pv[myKey].code===code,'db: private entry has full details');
  ok(Object.keys(q[myKey]).sort().join()==='createdAt,first,no,status','db: queue entry = {no, first, status, createdAt}');
  await cl.reload(); await cl.waitForSelector('.ticket',{timeout:5000}); ok((await cl.textContent('.tk-name')).includes('احمد محمد علي'),'client: after reload ticket + name still there');
  // ---------- ANON PROBES ----------
  const probe=(p,expr)=>p.evaluate(async e=>{try{await eval(e);return 'ALLOWED'}catch(x){return x.code||String(x)}},expr);
  const B=BASE.join('/');
  ok(await probe(cl,`firebase.database().ref('${B}/private').once('value')`)==='PERMISSION_DENIED','anon cannot READ private details');
  ok(await probe(cl,`firebase.database().ref('clinics/dayCode/${TODAY}/code').once('value')`)!=='PERMISSION_DENIED','daily code is readable (shown on display)');
  ok(await probe(cl,`firebase.database().ref('clinics/doctors').once('value')`)==='PERMISSION_DENIED','anon cannot READ all doctors tree');
  ok(await probe(cl,`firebase.database().ref('${B}/queue/s2').remove()`)==='PERMISSION_DENIED','anon cannot DELETE others entry');
  ok(await probe(cl,`firebase.database().ref('${B}/queue/zzz').set({no:99,status:'waiting',createdAt:1})`)==='PERMISSION_DENIED','anon cannot spam queue');
  ok(await probe(cl,`firebase.database().ref('clinics/directory/dr1/open').set(false)`)==='PERMISSION_DENIED','anon cannot edit directory');
  // ---------- ALERTS ----------
  await be.adminSet([...BASE,'queue','s1','status'].join('/'),'done'); await cl.waitForTimeout(300);
  await be.adminSet([...BASE,'queue','s2','status'].join('/'),'in'); await cl.waitForTimeout(200);
  // ---------- STAFF: merged data, whatsapp ✓, add, next ----------
  await staff.waitForTimeout(300); const stText=await staff.textContent('body');
  ok(stText.includes('احمد محمد علي')&&stText.includes('0101 234 5678'),'staff: full name + phone (private merged)');
  { const sel='a[data-wa][href*="201012345678"]'; const href=await staff.getAttribute(sel,'href'); const msg=decodeURIComponent(href);
    ok(href.startsWith('https://wa.me/201012345678?text=')&&msg.includes('د. أحمد')&&msg.includes('رقمك 4')&&msg.includes('عيادة تجريبية'),'staff: WhatsApp link has doctor + clinic + my number');
    ok(!(await staff.textContent(sel)).includes('✓'),'staff: no ✓ before sending');
    const popup=staff.context().waitForEvent('page',{timeout:3000}).catch(()=>null); await staff.click(sel); const pp=await popup; if(pp) await pp.waitForLoadState().catch(()=>{}); ok(!!pp,'staff: click still opens wa.me (new tab)'); if(pp) await pp.close();
    await staff.waitForTimeout(500); ok((await staff.textContent(sel)).includes('✓'),'staff: ✓ next to "واتساب" after pressing');
    ok(typeof be.get([...BASE,'private',myKey,'waAt'])==='number'&&!be.get([...BASE,'queue',myKey,'waAt']),'db: waAt saved privately, not in public queue');
    const staff2=await mk('staff'); await staff2.goto(URL+'/staff/'); await staff2.waitForSelector('#l-email'); await fill(staff2,'#l-email','staff@test.com'); await fill(staff2,'#l-pass','secret'); await staff2.click('#btn-login'); await staff2.waitForSelector('[data-tab=dr1]'); await staff2.click('[data-tab=dr1]'); await staff2.waitForSelector(sel,{timeout:5000});
    ok((await staff2.textContent(sel)).includes('✓'),'staff (fresh login elsewhere): ✓ still shown'); await staff2.close(); }
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
  ok(q3.s2.status==='done'&&q3.s3.status==='in','staff: "next" finished #2 and called #3');
  await be.adminSet([...BASE,'queue','s3','status'].join('/'),'done'); await be.adminSet([...BASE,'queue',myKey,'status'].join('/'),'in'); await cl.waitForTimeout(300);
  ok((await cl.textContent('body')).includes('دورك بدأ'),'client: "دورك بدأ"'); ok(!(await cl.$('#btn-alert'))&&!(await cl.textContent('body')).includes('نبّهني'),'client: no "notify me" button');
  // ---------- second doctor independent numbering + open/close reflected ----------
  const c2=await mk('client2'); await c2.goto(URL+'/?dr=dr2'); await c2.waitForSelector('#code-form',{timeout:5000}); await fill(c2,'#f-code',be.get([...CODE,'code'])); await c2.click('#code-form button'); await c2.waitForSelector('#book-form',{timeout:5000}); ok(true,'dr2: its own auto-generated code unlocks booking');
  await fillForm(c2,'سارة أحمد','01122334455'); await c2.click('#book-form button[type=submit]'); await c2.waitForSelector('.ticket',{timeout:5000});
  ok((await c2.textContent('.tk-no')).trim()==='1','dr2: first booking is number 1 (independent from dr1)');
  await c2.click('#btn-cancel-ask'); await c2.click('#btn-cancel-yes'); await c2.waitForTimeout(400);
  const k2=Object.keys(be.get([...BASE2,'queue'])); ok(be.get([...BASE2,'queue',k2[0],'status'])==='cancelled','dr2: cancel own waiting ticket works');
  await staff.click('[data-tab=dr2]'); await staff.waitForSelector('#sw-open'); await staff.click('#sw-open'); await staff.waitForTimeout(500);
  ok(be.get(['clinics','directory','dr2','open'])===false&&be.get(['clinics','doctors','dr2','settings','open'])===false,'staff: closing dr2 updates settings AND public directory');
  // ---------- DISPLAY (anonymous): sound from the start ----------
  const acStub=(allow)=>`(()=>{ window.__osc=0; window.__allow=${!!allow};
    window.AudioContext=function(){ const self=this; this.state=window.__allow?'running':'suspended'; this.currentTime=0; this.destination={};
      this.createOscillator=()=>{window.__osc++; return {connect(){},frequency:{setValueAtTime(){}},start(){},stop(){},type:''}};
      this.createGain=()=>({connect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}});
      this.resume=()=>{ if(window.__gest){ self.state='running'; if(self.onstatechange) self.onstatechange(); } return Promise.resolve() }; };
    ['pointerdown','keydown','touchstart'].forEach(e=>addEventListener(e,()=>{window.__gest=true},true)); })()`;
  const badgeHidden=p=>p.evaluate(()=>{const b=[...document.querySelectorAll('div')].find(d=>d.textContent.includes('لتفعيل الصوت')&&d.children.length===0); return !b||b.hidden});
  const k5id=Object.keys(be.get([...BASE,'queue'])).find(k=>be.get([...BASE,'queue',k,'no'])===5);
  { const dsp=await mk('display'); await dsp.addInitScript(acStub(true)); await dsp.goto(URL+'/display/'); await dsp.waitForSelector('.dr-card',{timeout:5000}); await dsp.waitForTimeout(600);
    { const bt=await dsp.textContent('body'); ok(bt.includes('كود اليوم')&&bt.includes(be.get([...CODE,'code'])),'display: shows today\'s code'); }
    const dt=await dsp.textContent('body'); ok(dt.includes('د. أحمد')&&dt.includes('د. منى'),'display: both doctors (via public directory), no login');
    ok((await dsp.$$eval('.cur-no',els=>els.map(e=>e.textContent.trim()))).includes('4'),'display: dr1 serving number 4 (public queue)');
    ok(dt.includes('احمد')&&!dt.includes('محمد علي')&&!dt.includes('01012345678'),'display: first name only, no phone');
    ok(await badgeHidden(dsp),'display: sound unlocked on open (no badge)');
    ok(await dsp.evaluate(()=>window.__osc)===0,'display: NO bell on first load');
    await be.adminSet([...BASE,'queue',myKey,'status'].join('/'),'done'); await be.adminSet([...BASE,'queue',k5id,'status'].join('/'),'in'); await dsp.waitForTimeout(400);
    ok(await dsp.evaluate(()=>window.__osc)===3,'display: bell rings when a new number is called (no click needed)'); await dsp.close(); }
  { const dsp=await mk('display'); await dsp.addInitScript(acStub(false)); await dsp.goto(URL+'/display/'); await dsp.waitForSelector('.dr-card',{timeout:5000}); await dsp.waitForTimeout(600);
    ok(!(await badgeHidden(dsp)),'display (autoplay blocked by browser): badge asks for ONE tap');
    await dsp.mouse.click(300,300); await dsp.waitForTimeout(300);
    ok(await badgeHidden(dsp),'display: after one tap sound enabled, badge gone'); await dsp.close(); }
  const denied=be.log.filter(l=>l.res!=='OK'); console.log('  (rule denials during run:',denied.length,')');
  ok(errors.length===0,'no JS page errors'+(errors.length?': '+errors.join(' | '):''));
  await browser.close(); srv.close(); console.log(fails?('\n'+fails+' FAILED'):'\nE2E ALL PASSED'); process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
