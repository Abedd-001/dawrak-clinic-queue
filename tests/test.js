const {write,read}=require('./sim.js'),fs=require('fs');
let fail=0,n=0;const T=(name,got,want)=>{n++;const ok=got===want;if(!ok)fail++;if(!ok)console.log('FAIL  '+name+' -> '+got+'  (wanted '+want+')')};
const staff={uid:'s1'},anon=null,D='2026-11-12';
const pub=(o={})=>({no:3,first:'احمد',status:'waiting',createdAt:1,...o});
const prv=(o={})=>({name:'احمد علي',phone:'01012345678',age:30,gender:'ذكر',type:'كشف جديد',why:'صداع',chronic:'',src:'qr',...o});
for(const [label,file,pre] of [['DAWRAK','dawrak.rules.json',['clinics','main']],['MDORAK','mdorak.rules.json',['clinics','doctors','dr1']]]){
  const R=JSON.parse(fs.readFileSync(file));
  const days=(...x)=>[...pre,'days',D,...x];
  const cd=(...x)=>label==='DAWRAK'?days(...x):['clinics','dayCode',D,...x];
  const mk=(o={})=>{let db={};const set=(p,v)=>{let c=db;p.slice(0,-1).forEach(k=>c=(c[k]=c[k]||{}));c[p[p.length-1]]=v};
    if(o.counter!==undefined)set(days('counter'),o.counter);
    if(o.code!==undefined){set(cd('code'),o.code);set(cd('codeOn'),true)}
    for(const [k,t] of Object.entries(o.queue||{}))set(days('queue',k),t);
    for(const [k,t] of Object.entries(o.priv||{}))set(days('private',k),t);return db};
  // ---------- READS (privacy) ----------
  const full=mk({counter:3,code:'1234',queue:{k1:pub()},priv:{k1:prv()}});
  T(label+' anon read queue',read(R,full,days('queue'),anon),'OK');
  T(label+' anon read one queue entry',read(R,full,days('queue','k1'),anon),'OK');
  T(label+' anon read counter',read(R,full,days('counter'),anon),'OK');
  T(label+' anon read codeOn',read(R,full,cd('codeOn'),anon),'OK');
  T(label+' anon read PRIVATE',read(R,full,days('private'),anon),'DENIED(read)');
  T(label+' anon read private entry',read(R,full,days('private','k1'),anon),'DENIED(read)');
  T(label+' anon read private phone',read(R,full,days('private','k1','phone'),anon),'DENIED(read)');
  T(label+' anon read CODE (shown on waiting-room display)',read(R,full,cd('code'),anon),'OK');
  T(label+' anon read whole day',read(R,full,days(),anon),'DENIED(read)');
  T(label+' anon read all days',read(R,full,[...pre,'days'],anon),'DENIED(read)');
  T(label+' anon read whole clinic subtree',read(R,full,['clinics'],anon),'DENIED(read)');
  T(label+' anon read root',read(R,full,[],anon),'DENIED(read)');
  T(label+' staff read private',read(R,full,days('private'),staff),'OK');
  T(label+' staff read code',read(R,full,cd('code'),staff),'OK');
  const sp=label==='DAWRAK'?['clinics','main','settings']:['clinics','doctors','dr1','settings'];
  T(label+' anon read settings',read(R,{},sp,anon),'OK');
  if(label==='MDORAK'){
    T(label+' anon read directory',read(R,{},['clinics','directory'],anon),'OK');
    T(label+' anon read clinic settings',read(R,{},['clinics','settings'],anon),'OK');
    T(label+' anon read ALL doctors',read(R,full,['clinics','doctors'],anon),'DENIED(read)');
    T(label+' anon read one doctor whole',read(R,full,['clinics','doctors','dr1'],anon),'DENIED(read)');
    T(label+' staff list ALL doctors (needed by staff page)',read(R,full,['clinics','doctors'],staff),'OK');
    T(label+' staff write directory',write(R,{},['clinics','directory','dr1'],true,staff),'OK');
    T(label+' anon write directory',write(R,{},['clinics','directory','dr1'],true,anon),'DENIED(write)');
  }
  // ---------- COUNTER ----------
  T(label+' counter first',write(R,mk(),days('counter'),1,anon),'OK');
  T(label+' counter +1',write(R,mk({counter:5}),days('counter'),6,anon),'OK');
  T(label+' counter jump',write(R,mk({counter:5}),days('counter'),9,anon),'DENIED(write)');
  T(label+' counter back',write(R,mk({counter:5}),days('counter'),4,anon),'DENIED(write)');
  T(label+' counter reset',write(R,mk({counter:5}),days('counter'),1,anon),'DENIED(write)');
  T(label+' counter delete',write(R,mk({counter:5}),days('counter'),null,anon),'DENIED(write)');
  T(label+' staff counter',write(R,mk({counter:5}),days('counter'),50,staff),'OK');
  // ---------- BOOKING FLOW (private first, then queue) ----------
  const noCode=mk({counter:3});            // clinic without daily code
  const withCode=mk({counter:3,code:'1234'});
  T(label+' book: NO code generated today -> refused (code is mandatory)',write(R,noCode,days('private','k1'),prv(),anon),'DENIED(write)');
  T(label+' book: no code generated, even sending a code',write(R,noCode,days('private','k1'),prv({code:'1234'}),anon),'DENIED(write)');
  T(label+' book: private without code field, code required',write(R,withCode,days('private','k1'),prv(),anon),'DENIED(write)');
  T(label+' book: private wrong code',write(R,withCode,days('private','k1'),prv({code:'9999'}),anon),'DENIED(write)');
  T(label+' book: private right code',write(R,withCode,days('private','k1'),prv({code:'1234'}),anon),'OK');
  T(label+' book: private src staff',write(R,withCode,days('private','k1'),prv({code:'1234',src:'staff'}),anon),'DENIED(write)');
  T(label+' staff marks whatsapp sent (waAt)',write(R,noCode,days('private','k1','waAt'),123,staff),'OK');
  T(label+' anon cannot set waAt on existing private',write(R,(()=>{const d=JSON.parse(JSON.stringify(noCode));return d})(),days('private','k1','waAt'),123,anon),'DENIED(write)');
  T(label+' anon cannot create private with waAt',write(R,withCode,days('private','k1'),prv({code:'1234',waAt:5}),anon),'DENIED(write)');
  T(label+' book: private extra field',write(R,withCode,days('private','k1'),prv({code:'1234',evil:1}),anon),'DENIED(validate)');
  T(label+' book: private age string',write(R,withCode,days('private','k1'),prv({code:'1234',age:'30'}),anon),'DENIED(validate)');
  T(label+' book: private name 300',write(R,withCode,days('private','k1'),prv({code:'1234',name:'x'.repeat(300)}),anon),'DENIED(validate)');
  T(label+' book: private empty chronic ok',write(R,withCode,days('private','k1'),prv({code:'1234',chronic:'',phone:''}),anon),'OK');
  const step1=mk({counter:3,code:'1234',priv:{k1:prv({code:'1234'})}});
  T(label+' book: queue after private',write(R,step1,days('queue','k1'),pub(),anon),'OK');
  T(label+' book: queue WITHOUT private (spam)',write(R,withCode,days('queue','k1'),pub(),anon),'DENIED(write)');
  T(label+' book: queue no>counter',write(R,step1,days('queue','k1'),pub({no:99}),anon),'DENIED(write)');
  T(label+' book: queue status done',write(R,step1,days('queue','k1'),pub({status:'done'}),anon),'DENIED(write)');
  T(label+' book: queue with startedAt',write(R,step1,days('queue','k1'),pub({startedAt:5}),anon),'DENIED(write)');
  T(label+' book: queue extra field (phone leak)',write(R,step1,days('queue','k1'),pub({phone:'010'}),anon),'DENIED(validate)');
  T(label+' book: queue first 100 chars',write(R,step1,days('queue','k1'),pub({first:'x'.repeat(100)}),anon),'DENIED(validate)');
  const step1b=mk({counter:5,priv:{k1:prv()}});
  T(label+' book: queue no<counter (race ok)',write(R,step1b,days('queue','k1'),pub({no:3}),anon),'OK');
  const badday=(()=>{const d={};let c=d;[...pre,'days','foo'].forEach(k=>c=(c[k]={}));c.counter=3;c.private={k1:prv()};return d})();
  T(label+' book: bad day key',write(R,badday,[...pre,'days','foo','queue','k1'],pub(),anon),'DENIED(validate)');
  // ---------- PROTECTION OF EXISTING DATA ----------
  const ex=mk({counter:3,code:'1234',queue:{k1:pub()},priv:{k1:prv({code:'1234'})}});
  T(label+' overwrite queue entry',write(R,ex,days('queue','k1'),pub({first:'x'}),anon),'DENIED(write)');
  T(label+' delete queue entry',write(R,ex,days('queue','k1'),null,anon),'DENIED(write)');
  T(label+' delete all queue',write(R,ex,days('queue'),null,anon),'DENIED(write)');
  T(label+' wipe day',write(R,ex,days(),null,anon),'DENIED(write)');
  T(label+' overwrite private',write(R,ex,days('private','k1'),prv({name:'x'}),anon),'DENIED(write)');
  T(label+' delete private',write(R,ex,days('private','k1'),null,anon),'DENIED(write)');
  T(label+' delete all private',write(R,ex,days('private'),null,anon),'DENIED(write)');
  T(label+' change code',write(R,ex,cd('code'),'0000',anon),'DENIED(write)');
  T(label+' turn code off',write(R,ex,cd('codeOn'),false,anon),'DENIED(write)');
  T(label+' cancel own waiting',write(R,ex,days('queue','k1','status'),'cancelled',anon),'OK');
  T(label+' waiting->done',write(R,ex,days('queue','k1','status'),'done',anon),'DENIED(write)');
  T(label+' waiting->in',write(R,ex,days('queue','k1','status'),'in',anon),'DENIED(write)');
  const inn=mk({counter:3,queue:{k1:pub({status:'in',startedAt:5})},priv:{k1:prv()}});
  T(label+' cancel ticket already in',write(R,inn,days('queue','k1','status'),'cancelled',anon),'DENIED(write)');
  // ---------- STAFF ----------
  T(label+' staff call',write(R,ex,days('queue','k1','status'),'in',staff),'OK');
  T(label+' staff startedAt',write(R,ex,days('queue','k1','startedAt'),123,staff),'OK');
  T(label+' staff finish doneAt',write(R,inn,days('queue','k1','doneAt'),9,staff),'OK');
  T(label+' staff requeue (null times)',write(R,inn,days('queue','k1','startedAt'),null,staff),'OK');
  T(label+' staff bad status',write(R,ex,days('queue','k1','status'),'bogus',staff),'DENIED(validate)');
  T(label+' staff add: private',write(R,mk({counter:4}),days('private','k2'),prv({src:'staff',phone:''}),staff),'OK');
  T(label+' staff add: queue',write(R,mk({counter:4}),days('queue','k2'),pub({no:4}),staff),'OK');
  T(label+' staff set code',write(R,mk(),cd('code'),'1234',staff),'OK');
  T(label+' staff codeOn',write(R,mk(),cd('codeOn'),true,staff),'OK');
  T(label+' anon set code',write(R,mk(),cd('code'),'1234',anon),'DENIED(write)');
  T(label+' old schema tickets write',write(R,mk(),days('tickets','k1'),{no:1,name:'x',status:'waiting',createdAt:1},anon),'DENIED(write)');
  const sw=label==='DAWRAK'?['clinics','main','settings','open']:['clinics','doctors','dr1','settings','open'];
  T(label+' staff settings',write(R,{},sw,false,staff),'OK');
  T(label+' anon settings',write(R,{},sw,false,anon),'DENIED(write)');
  T(label+' anon write root',write(R,{},[],{x:1},anon),'DENIED(write)');
}
console.log(fail?(fail+' FAILED of '+n):'ALL '+n+' PASSED');process.exit(fail?1:0)
