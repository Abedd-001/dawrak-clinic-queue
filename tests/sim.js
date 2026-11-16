// Minimal Firebase RTDB rules simulator (write + validate only) — enough to test these rule files.
String.prototype.matches=function(r){return r.test(this)};
String.prototype.contains=function(s){return this.includes(s)};
class Snap{constructor(v){this.v=v===undefined?null:v}
  val(){return this.v} exists(){return this.v!==null}
  child(p){let c=this.v;for(const k of String(p).split('/').filter(Boolean)){c=(c&&typeof c==='object'&&k in c)?c[k]:null}return new Snap(c)}
  hasChildren(l){if(!this.v||typeof this.v!=='object')return false;return l?l.every(k=>k in this.v):Object.keys(this.v).length>0}
  isNumber(){return typeof this.v==='number'} isString(){return typeof this.v==='string'} isBoolean(){return typeof this.v==='boolean'}}
const get=(o,path)=>path.reduce((c,k)=>(c&&typeof c==='object'&&k in c)?c[k]:null,o);
function setIn(o,path,val){o=JSON.parse(JSON.stringify(o||{}));if(!path.length)return val;let c=o;
  path.slice(0,-1).forEach(k=>{if(typeof c[k]!=='object'||c[k]===null)c[k]={};c=c[k]});
  const last=path[path.length-1];if(val===null)delete c[last];else c[last]=val;return o}
function ev(expr,ctx){if(typeof expr==='boolean')return expr;
  const names=Object.keys(ctx);return !!new Function(...names,'return ('+expr+')')(...names.map(n=>ctx[n]))}
function match(node,key,vars){if(key in node)return [node[key],vars];
  const w=Object.keys(node).find(k=>k.startsWith('$'));return w?[node[w],{...vars,[w]:key}]:[null,vars]}
function write(rules,db,path,val,auth){
  const root=new Snap(db), nroot=setIn(db,path,val);
  const base={auth,now:Date.now(),root};
  let node=rules.rules,vars={},granted=false;
  for(let i=0;i<=path.length;i++){
    if(node['.write']!==undefined){
      const ctx={...base,...vars,data:new Snap(get(db,path.slice(0,i))),newData:new Snap(get(nroot,path.slice(0,i)))};
      if(ev(node['.write'],ctx)){granted=true;break}}
    if(i===path.length)break;
    [node,vars]=match(node,path[i],vars);if(!node)break}
  if(!granted)return 'DENIED(write)';
  // validate: at written location and all descendants present in new data
  function validate(node,vars,p){
    const nd=get(nroot,p);if(nd===null||nd===undefined)return true;
    if(node['.validate']!==undefined){
      const ctx={...base,...vars,data:new Snap(get(db,p)),newData:new Snap(nd)};
      if(!ev(node['.validate'],ctx))return false}
    if(typeof nd==='object')for(const k of Object.keys(nd)){
      const [cn,cv]=match(node,k,vars);if(!cn)continue; if(!validate(cn,cv,[...p,k]))return false}
    return true}
  // locate rule node for written path
  let n=rules.rules,v={};for(const k of path){[n,v]=match(n,k,v);if(!n)return 'OK'}
  return validate(n,v,path)?'OK':'DENIED(validate)'}
module.exports={write};
function read(rules,db,path,auth){
  const root=new Snap(db),base={auth,now:Date.now(),root};
  let node=rules.rules,vars={};
  for(let i=0;i<=path.length;i++){
    if(node['.read']!==undefined){
      const d=new Snap(get(db,path.slice(0,i)));
      if(ev(node['.read'],{...base,...vars,data:d,newData:d}))return 'OK'}
    if(i===path.length)break;
    [node,vars]=match(node,path[i],vars);if(!node)break}
  return 'DENIED(read)'}
module.exports.read=read;
