// Node-side fake RTDB that enforces the REAL rules files (via sim.js)
const {write,read}=require('/tmp/toolkit_work/rules/sim.js');
class Backend{
  constructor(rules){this.rules=rules;this.db={};this.pages=new Map();this.log=[];}
  addPage(id,evalPage){this.pages.set(id,{eval:evalPage,auth:null,listeners:[]});}
  get(path){return path.length?path.reduce((c,k)=>(c&&typeof c==='object'&&k in c)?c[k]:null,this.db):this.db}
  _apply(path,val){ if(!path.length){this.db=val||{};return} let c=this.db;
    path.slice(0,-1).forEach(k=>{if(typeof c[k]!=='object'||c[k]===null)c[k]={};c=c[k]});
    const last=path[path.length-1]; if(val===null||val===undefined)delete c[last]; else c[last]=val; this._prune(); }
  _prune(){const p=o=>{if(o&&typeof o==='object'){for(const k of Object.keys(o)){p(o[k]); if(o[k]&&typeof o[k]==='object'&&!Object.keys(o[k]).length)delete o[k]}}};p(this.db)}
  clean(v){ if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v)){const c=this.clean(v[k]);if(c!==null&&c!==undefined)o[k]=c}return Object.keys(o).length?o:null} return v===undefined?null:v}
  async op(pid,m){
    const page=this.pages.get(pid); const auth=page.auth;
    const P=s=>String(s).split('/').filter(Boolean);
    if(m.op==='login'){ if(m.email==='staff@test.com'&&m.pass==='secret'){page.auth={uid:'staff1'};return{uid:'staff1'}} return{error:'bad'} }
    if(m.op==='auth'){page.auth=null;return{}}
    if(m.op==='get'){ const p=P(m.path); const r=read(this.rules,this.db,p,auth); if(r!=='OK')return{error:'PERMISSION_DENIED'}; return{val:this.get(p)} }
    if(m.op==='listen'){ const p=P(m.path); page.listeners.push({id:m.id,path:p,ev:m.ev,last:undefined,known:{}}); await this.flush(); return{} }
    if(m.op==='set'||m.op==='cas'){ const p=P(m.path);
      if(m.op==='cas'&&JSON.stringify(this.get(p))!==JSON.stringify(m.expect===undefined?null:m.expect)) return{conflict:true};
      const v=this.clean(m.val); const r=write(this.rules,this.db,p,v,auth);
      this.log.push({page:pid,op:m.op,path:m.path,res:r}); if(r!=='OK')return{error:'PERMISSION_DENIED',detail:r};
      this._apply(p,v); await this.flush(); return{ok:true} }
    if(m.op==='update'){ const base=P(m.path); const writes=Object.entries(m.val).map(([k,v])=>[[...base,...P(k)],this.clean(v)]);
      for(const [p,v] of writes){ const r=write(this.rules,this.db,p,v,auth); this.log.push({page:pid,op:'update',path:p.join('/'),res:r}); if(r!=='OK')return{error:'PERMISSION_DENIED',detail:r+' @ '+p.join('/')} }
      writes.forEach(([p,v])=>this._apply(p,v)); await this.flush(); return{ok:true} }
    return{error:'unknown op'}
  }
  adminSet(path,val){ this._apply(path.split('/').filter(Boolean),this.clean(val)); return this.flush() }
  async flush(){
    for(const [pid,page] of this.pages){ for(const l of page.listeners){
      const r=read(this.rules,this.db,l.path,page.auth);
      if(r!=='OK'){ if(!l.denied){l.denied=true; await page.eval({id:l.id,error:true}).catch(()=>{})} continue }
      l.denied=false; const val=this.get(l.path); const key=l.path[l.path.length-1]||null;
      if(l.ev==='value'){ const s=JSON.stringify(val===undefined?null:val); if(s!==l.last){l.last=s; await page.eval({id:l.id,key,val}).catch(()=>{})} }
      else { const cur=(val&&typeof val==='object')?val:{};
        for(const k of Object.keys(cur)) if(!(k in l.known)||JSON.stringify(l.known[k])!==JSON.stringify(cur[k])){ if(l.ev==='child_added'&&!(k in l.known)) await page.eval({id:l.id,key:k,val:cur[k]}).catch(()=>{}); l.known[k]=cur[k] }
        for(const k of Object.keys(l.known)) if(!(k in cur)){ if(l.ev==='child_removed') await page.eval({id:l.id,key:k,val:l.known[k]}).catch(()=>{}); delete l.known[k] } }
    }}
  }
}
module.exports={Backend};
