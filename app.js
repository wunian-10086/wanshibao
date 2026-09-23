/* ===== 自动更新：发现网页空间上已经是新版本，就自动换成新文件（免得浏览器一直用旧缓存） ===== */
const APP_VER='1.2.9';
(async()=>{
  try{
    if(!/^https?:$/.test(location.protocol))return;
    const html=await (await fetch('index.html',{cache:'no-store'})).text();
    const m=html.match(/app\.js\?v=([0-9.]+)/);
    if(m&&m[1]&&m[1]!==APP_VER){
      if(sessionStorage.getItem('verAutoReload')===m[1])return;      /* 已经自动更新过一次，避免死循环 */
      sessionStorage.setItem('verAutoReload',m[1]);
      location.replace(location.pathname+'?_v='+m[1]);
    }
  }catch(e){}
})();

/* 班级综合素质评价：纯前端、本地存储、离线运行 */
const KEY='class-score-v1', uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let db,page='entry',editing=null;
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today(){return new Date().toISOString().slice(0,10)}
function save(){
  db.classes.forEach(c=>{c.records.forEach(r=>{if(!r.term)r.term=(termOfDate(r.date)||{}).id||db.term});c.exams.forEach(e=>{if(!e.term)e.term=(termOfDate(e.date)||{}).id||db.term})});
  try{localStorage.setItem(user?dataKey(user.id):KEY,JSON.stringify(db))}catch{}
  if(mode!=='server'){setSync('已保存到本机浏览器');clearTimeout(saveTimer);saveTimer=setTimeout(()=>writeBackup(),1200);return}
  setSync('正在保存…');clearTimeout(saveTimer);saveTimer=setTimeout(pushData,500);
}
function cls(){return db.classes.find(x=>x.id===db.current)} function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',2200)}
/* ===== 记住“选哪几次成绩”：第一次进＝全部选中；选过以后＝默认上次的勾选（按班级 + 视角分别记） ===== */
const SEL_KEY='class-score-v1:sel';
function selAll(){try{const o=JSON.parse(localStorage.getItem(user?SEL_KEY+':'+user.id:SEL_KEY)||'{}');return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}}catch(e){return{}}}
function selPick(name,sig,poolIds){
  const box=(selAll()[(cls()&&cls().id)||'c']||{})[name]||{},saved=box[sig];
  if(!Array.isArray(saved))return poolIds.slice();              /* 没选过 → 全部选中 */
  const keep=poolIds.filter(id=>saved.includes(id));
  if(saved.length&&!keep.length)return poolIds.slice();         /* 存的都不在本次范围（换了学期/科目）→ 回到全选 */
  return keep;                                                  /* 选过（含“全不选”）→ 照上次来 */
}
function selSave(name,sig,arr){
  if(!Array.isArray(arr))return;
  const all=selAll(),cid=(cls()&&cls().id)||'c';
  all[cid]=all[cid]||{};all[cid][name]=all[cid][name]||{};all[cid][name][sig]=arr.slice(0,500);
  try{localStorage.setItem(user?SEL_KEY+':'+user.id:SEL_KEY,JSON.stringify(all))}catch(e){}
}
function date(v){if(!v)return '';let x=new Date(v);return isNaN(x)?String(v).slice(0,10):x.toISOString().slice(0,10)}
const SERVER=location.protocol==='http:'||location.protocol==='https:';
let user=null,mode='local',ver=0,saveTimer=null;
function freshDB(){let c=structuredClone(window.INITIAL_CLASS);c.students=[];c.records=[];c.exams=[];return {classes:[c],current:c.id}}
async function api(p,opt){let r=await fetch(p,Object.assign({credentials:'same-origin',headers:{'content-type':'application/json'}},opt));let t=await r.text(),d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw Object.assign(new Error(d.error||('HTTP '+r.status)),{status:r.status});return d}
function setSync(t,bad){let el=document.getElementById('syncState');if(!el)return;el.textContent=t;el.style.color=bad?'#c62828':'#6b7280'}
async function pushData(){if(mode!=='server')return;try{let r=await api('/api/data',{method:'PUT',body:JSON.stringify({version:ver,db})});ver=r.version||ver;setSync('已保存 '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))}catch(e){setSync('保存失败：'+e.message,true)}}
/* 本机账号：账号与数据都只保存在这台电脑上（不上传服务器） */
const ULOCAL='class-score-users',CURKEY=KEY+':current';
let localUsers=[],loginMode='server';
function loadLocalUsers(){try{localUsers=JSON.parse(localStorage.getItem(ULOCAL)||'[]')}catch{localUsers=[]}if(!Array.isArray(localUsers))localUsers=[]}
function saveLocalUsers(){localStorage.setItem(ULOCAL,JSON.stringify(localUsers))}
const dataKey=id=>KEY+':u:'+id;
async function pbkdf2(pass,salt){
  try{
    let e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(pass),'PBKDF2',false,['deriveBits']);
    let b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:e.encode(salt),iterations:60000,hash:'SHA-256'},k,256);
    return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }catch(err){
    let s=salt+'|'+pass,h=5381;
    for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;
    return 'w'+h.toString(16)+'-'+s.length.toString(16);
  }
}
function localBoot(){
  mode='local';loginMode='local';loadLocalUsers();
  let cur=localStorage.getItem(CURKEY),u=localUsers.find(x=>x.id===cur);
  if(!u){user=null;return showLogin(sessionStorage.getItem('wantRegister')==='1')}
  user=u;afterLogin();
}
function afterLogin(){
  let raw=null;try{raw=localStorage.getItem(dataKey(user.id))}catch{}
  if(!raw){
    let legacy=null;try{legacy=localStorage.getItem(KEY)}catch{}
    if(legacy&&confirm('这台电脑上还有一份以前直接打开网页时保存的数据。\n要把它作为账号「'+(user.name||user.username)+'」的起始数据吗？\n（点“取消”＝从空白班级开始）')){
      try{db=JSON.parse(legacy)}catch{db=null}
    }
  }else{try{db=JSON.parse(raw)}catch{db=null}}
  if(!db||!db.classes)db=freshDB();
  delete db.auth;migrate();save();render();pushHist();loadBackupHandle();
}
async function boot(){
  if(!SERVER)return localBoot();
  let me;
  try{me=await api('/api/me')}catch(e){console.warn('没有账号服务器，改用本机账号模式',e);return localBoot()}
  if(!me||typeof me.user==='undefined')return localBoot();
  if(!me.user){window.__inviteRequired=!!me.inviteRequired;return showLogin()}
  user=me.user;mode='server';
  try{
    let d=await api('/api/data');
    if(d.db&&Array.isArray(d.db.classes)){db=d.db;ver=d.version||0}
    else{
      let local=null;try{local=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
      let hasLocal=local&&Array.isArray(local.classes)&&local.classes.some(c=>(c.students||[]).length||(c.records||[]).length||(c.exams||[]).length);
      if(hasLocal&&confirm('你的账号在服务器上还是空的。\n要把这台电脑浏览器里现有的数据上传到账号作为起始数据吗？\n（点“取消”＝从空白班级开始）')){db=local;ver=0}
      else db=freshDB();
    }
  }catch(e){toast('读取数据失败：'+e.message);db=freshDB()}
  delete db.auth;migrate();render();pushHist();pushData();
}
function migrate(){
  db.terms=db.terms||[];
  if(!db.terms.length){let d=defaultTerm();db.terms=[{id:'t1',name:d.name,cohort:defaultCohort(d.name),start:d.start,end:d.end}]}
  db.terms.forEach(t=>{t.id=t.id||uid();t.name=t.name||'未命名学期';t.cohort=t.cohort||'';t.start=t.start||'';t.end=t.end||''});
  if(!db.terms.some(t=>t.id===db.term))db.term=db.terms[0].id;
  db.cohorts=[...new Set(db.terms.map(t=>t.cohort).filter(Boolean))];
  if(!window.scopeTerm||(window.scopeTerm!=='all'&&!db.terms.some(t=>t.id===window.scopeTerm)))window.scopeTerm=db.term;
  db.classes.forEach(c=>{
    c.students=c.students||[];c.records=c.records||[];c.exams=c.exams||[];if(!c.groups||!c.groups.length)c.groups=['未分组'];
    c.records.forEach(r=>{if(!r.term)r.term=(termOfDate(r.date)||{}).id||db.term});
    c.exams.forEach(e=>{
      e.subjects=(e.subjects||[]).filter(Boolean);e.scores=e.scores||{};
      if(e.type!=='quiz'&&e.type!=='major')e.type=e.subjects.length>1?'major':'quiz';
      if(e.type==='quiz'){if(!e.subject)e.subject=e.subjects[0]||'';if(e.subject&&!e.subjects.length)e.subjects=[e.subject]}
      if(!e.term)e.term=(termOfDate(e.date)||{}).id||db.term;
      Object.keys(e.scores).forEach(id=>{let o=e.scores[id];if(!o||typeof o!=='object'){delete e.scores[id];return}o.values=o.values||{};let sum=0;Object.keys(o.values).forEach(k=>{let v=+o.values[k];if(o.values[k]===''||o.values[k]==null||isNaN(v)){delete o.values[k];return}o.values[k]=v;sum+=v});if(!e.subjects.length)Object.keys(o.values).forEach(k=>{if(!e.subjects.includes(k))e.subjects.push(k)});let t=+o.total;o.total=(o.total==null||o.total===''||isNaN(t))?sum:t});
    });
  });
}
function pad2(n){return String(n).padStart(2,'0')}
function defaultTerm(){let d=new Date(),y=d.getFullYear(),m=d.getMonth()+1;if(m>=8)return {name:`${y}-${y+1}学年第一学期`,start:`${y}-09-01`,end:`${y+1}-01-25`};if(m<=1)return {name:`${y-1}-${y}学年第一学期`,start:`${y-1}-09-01`,end:`${y}-01-25`};return {name:`${y-1}-${y}学年第二学期`,start:`${y}-02-10`,end:`${y}-07-15`}}
function defaultCohort(name){let y=+(String(name).match(/^(\d{4})/)||[])[1]||new Date().getFullYear();return (y+2)+'届'}
function termOfDate(d){if(!d||!db||!db.terms)return null;return db.terms.find(t=>t.start&&t.end&&String(d)>=t.start&&String(d)<=t.end)||null}
function termById(id){return db.terms.find(t=>t.id===id)}
function scopeId(){return window.scopeTerm||db.term}
function scopeTerm(){return termById(scopeId())}
function curTerm(){return termById(db.term)||db.terms[0]}
function inScope(o){
  const s=scopeId();
  if(s==='all')return true;
  const t=o.term||db.term;
  if(t===s)return true;
  const tm=termById(s);
  if(!termById(t)){                     // 记录的学期 id 已不存在（换届时常见）：改按日期判断
    return !!(tm&&tm.start&&tm.end&&String(o.date||'')>=tm.start&&String(o.date||'')<=tm.end);
  }
  return false;
}
function scopedRecords(){return cls().records.filter(inScope)}
function scopedExams(){return cls().exams.filter(inScope)}
function isHistory(){return scopeId()!=='all'&&scopeId()!==db.term}
function termLabel(id){if(id==='all')return '全部学期';let t=termById(id);return t?(t.cohort?t.cohort+' · ':'')+t.name:'未分学期'}
function nextTermName(name){let m=String(name).match(/^(\d{4})-(\d{4})学年(第[一二])学期/);if(!m)return name+'（下学期）';if(m[3]==='第一')return `${m[1]}-${m[2]}学年第二学期`;return `${+m[1]+1}-${+m[2]+1}学年第一学期`}
function nextTermRange(t){if(!t||!t.end)return {start:today(),end:''};let d=new Date(t.end);d.setDate(d.getDate()+10);let s=d.toISOString().slice(0,10),e=new Date(d);e.setMonth(e.getMonth()+5);return {start:s,end:e.toISOString().slice(0,10)}}
async function hash(x){let b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function initLock(){let tip=$('#lockTip'),p=$('#password'),a=$('#answer');if(!db.auth){tip.textContent='首次使用：设置管理密码与密保答案';a.hidden=false;a.placeholder='密保答案（必填）';$('#unlock').textContent='设置并进入'}else {tip.textContent='请输入管理密码';a.hidden=true;$('#unlock').textContent='进入系统'} $('#unlock').onclick=async()=>{if(!p.value)return toast('请输入密码');if(!db.auth){if(!a.value)return toast('请填写密保答案');db.auth={p:await hash(p.value),a:await hash(a.value)};save()}else if(await hash(p.value)!==db.auth.p)return toast('密码不正确');p.value='';$('#lock').hidden=true;$('#app').hidden=false;render()};$('#resetPassword').onclick=async()=>{if(!db.auth)return; a.hidden=false;a.placeholder='请输入密保答案';if(a.value&&await hash(a.value)===db.auth.a){db.auth.p=await hash(p.value);save();toast('密码已重置');initLock()}else toast('填写新密码和正确的密保答案后再点此处')}}
function render(){
  let c=cls();
  $('#login').hidden=true;$('#app').hidden=false;
  $('#className').textContent=c.name+' · '+termLabel(scopeId());
  $('#userBox').textContent=user?(user.name+(user.role==='admin'?'（管理员）':'')):'';
  $('#logoutBtn').hidden=!user;
  let nu=$('#navUsers');if(nu){nu.hidden=!(user&&(mode==='local'||user.role==='admin'));nu.textContent=mode==='local'?'本机账号':'账号管理'}
  $('#classSwitch').innerHTML=db.classes.map(x=>`<option value="${x.id}" ${x.id===db.current?'selected':''}>${esc(x.name)}</option>`).join('');
  $('#classSwitch').onchange=e=>{db.current=e.target.value;save();render()};
  let ts=$('#termSwitch');
  if(ts){
    let ids=[db.term,...db.terms.filter(t=>t.id!==db.term).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||''))).map(t=>t.id),'all'];
    ts.innerHTML=ids.map(id=>`<option value="${id}" ${id===scopeId()?'selected':''}>${esc(id===db.term?'当前：'+termLabel(id):termLabel(id))}</option>`).join('');
  ts.onchange=e=>{window.scopeTerm=e.target.value;render()};
  }
  let gi=NAV.findIndex(g=>g.s.includes(page));if(gi<0)gi=0;
  [...$('#nav').children].forEach((b,i)=>{b.classList.toggle('active',i===gi);b.onclick=()=>{page=NAV[i].def;pushHist();render()}});
  let fn=({entry,records,summary,students,groups2:groupManage,personal,groups,board,exams,analysis,history:historyPage,users,data,guide:guidePage})[page]||exams;
  fn();
  const grp=NAV[gi];
  if(grp.s.length>1){
    $('#main').insertAdjacentHTML('afterbegin',`<div class="tabs" id="subTabs" style="padding:0 4px 10px">${grp.s.map(p=>`<button class="${p===page?'active':''}" data-sub="${p}">${SUBNAME[p]||p}</button>`).join('')}</div>`);
    document.querySelectorAll('#subTabs [data-sub]').forEach(b=>b.onclick=()=>{page=b.dataset.sub;pushHist();render()});
  }
  if(isHistory()){
    $('#main').insertAdjacentHTML('afterbegin',`<div class="banner"><b>历史学期浏览</b>　${esc(termLabel(scopeId()))}　·　主页面的表格、统计和成绩只统计当前学期（${esc(termLabel(db.term))}），历史学期在这里查看与导出。<button id="backCurrent">回到当前学期</button></div>`);
    $('#backCurrent').onclick=()=>{window.scopeTerm=db.term;render();toast('已回到当前学期')};
  }else if(scopeId()==='all'){
    $('#main').insertAdjacentHTML('afterbegin',`<div class="banner"><b>全部学期</b>　当前显示所有学期的合计数据，适合做跨学期对比。<button id="backCurrent">回到当前学期</button></div>`);
    $('#backCurrent').onclick=()=>{window.scopeTerm=db.term;render()};
  }
  if(page==='data')enhanceDataPage();
  if(page==='entry')enhanceEntryNote();
  if(page==='exams')enhanceExamsPage();
  if(page==='personal')enhancePersonal();
  if(page==='board')enhanceBoard();
  if(page==='records')enhanceRecordNames();
  wireChips();
  attachChartTools(document);
  pushHist();   /* 每次页面变化都自动进历史：任何跳转都能用“上一页”回来 */
}
function layout(title,tools,body){$('#main').innerHTML=`<section class="card"><div class="toolbar"><h2>${title}</h2>${tools||''}</div>${body}</section>`}
function options(list,value,placeholder='请选择'){return `<option value="">${placeholder}</option>`+list.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join('')}
function entry(){let c=cls(),types=Object.keys(c.rules);layout('数据录入','<button class="primary" id="saveRecord">保存记录</button>',`<div class="grid"><div class="field"><label>日期</label><input id="rdate" type="date" value="${today()}"></div><div class="field"><label>学生</label><input id="rstudent" list="students" placeholder="输入学生姓名"><datalist id="students">${c.students.filter(s=>s.active).map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist></div><div class="field"><label>事项类型</label><select id="rtype">${options(types,'','选择类型')}</select></div><div class="field"><label>事项细则</label><select id="rdetail"><option>请先选择类型</option></select></div><div class="field"><label>赋分成绩</label><input id="rscore" type="number" step="0.5"></div><div class="field"><label>事项简述</label><input id="rbrief" placeholder="如：未交、表扬"></div><div class="field"><label>补充说明</label><input id="rnote"></div></div><p>选择细则后会自动带出分值；可手动微调。支持键盘 Tab 快速切换。</p>`);$('#rtype').onchange=()=>{let arr=c.rules[$('#rtype').value]||[];$('#rdetail').innerHTML=options(arr.map(x=>x.name),'','选择细则');$('#rdetail').onchange=()=>{$('#rscore').value=(arr.find(x=>x.name===$('#rdetail').value)||{}).score??''}};$('#saveRecord').onclick=()=>{let s=findStudent($('#rstudent').value);if(!s)return toast('请选择名单中的学生');let type=$('#rtype').value,detail=$('#rdetail').value;if(!type||!detail)return toast('请选择类型和细则');c.records.unshift({id:uid(),date:$('#rdate').value,studentId:s.id,student:s.name,group:s.group,type,detail,brief:$('#rbrief').value,score:+$('#rscore').value||0,note:$('#rnote').value,created:new Date().toLocaleString()});save();toast('登记成功');render()}}
function findStudent(v){return cls().students.find(s=>s.name===String(v).trim())}
/* 记录明细的筛选条件：放在 __recF 对象里，避免用到 rtype 这种与页面元素 id 同名的全局变量（会被同 id 的下拉框顶替） */
function recF(){let f=window.__recF;if(!f||typeof f!=='object'||Array.isArray(f))f=window.__recF={q:'',from:'',to:'',type:''};f.q=String(f.q??'');f.from=String(f.from??'');f.to=String(f.to??'');f.type=String(f.type??'');return f}
function records(){let c=cls(), rows=filterRecords(),f=recF();layout('考核记录总表',`<input id="q" placeholder="搜索学生、细则、说明"><input id="from" type="date"><input id="to" type="date"><select id="typeFilter">${options(Object.keys(c.rules),'','全部类型')}</select><button id="importRecords">导入 Excel</button><button id="exportRecords">导出 Excel</button><button class="danger" id="bulkDelete">按区间删除</button>`,recordTable(rows));['q','from','to','typeFilter'].forEach(id=>$('#'+id).oninput=()=>records());$('#q').value=f.q;$('#from').value=f.from;$('#to').value=f.to;$('#typeFilter').value=f.type;$('#q').oninput=e=>{recF().q=e.target.value;records()};$('#from').oninput=e=>{recF().from=e.target.value;records()};$('#to').oninput=e=>{recF().to=e.target.value;records()};$('#typeFilter').onchange=e=>{recF().type=e.target.value;records()};$('#importRecords').onclick=()=>pick(f=>importRecords(f));$('#exportRecords').onclick=()=>exportXlsx('考核记录明细',rows.map(r=>({日期:r.date,学生:r.student,小组:r.group,类型:r.type,细则:r.detail,简述:r.brief,赋分:r.score,说明:r.note,登记时间:r.created})));$('#bulkDelete').onclick=()=>{let n=rows.length;if(n&&confirm(`确认删除当前筛选出的 ${n} 条记录？`)){c.records=c.records.filter(r=>!rows.includes(r));save();render();toast('已删除')}}}
function filterRecords(){let f=recF(),records=scopedRecords(),q=f.q.toLowerCase(),fr=f.from,t=f.to,ty=f.type;return records.filter(r=>(!q||Object.values(r).join(' ').toLowerCase().includes(q))&&(!fr||String(r.date)>=fr)&&(!t||String(r.date)<=t)&&(!ty||r.type===ty)).sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
function recordTable(rows){return `<div class="table-wrap"><table><thead><tr><th>日期</th><th>学生</th><th>小组</th><th>类型</th><th>细则</th><th>简述</th><th>赋分</th><th>说明</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td>${esc(r.student)}</td><td>${esc(r.group)}</td><td>${esc(r.type)}</td><td>${esc(r.detail)}</td><td>${esc(r.brief)}</td><td class="${r.score>=0?'positive':'negative'}">${r.score}</td><td>${esc(r.note)}</td><td class="actions"><button onclick="editRecord('${r.id}')">编辑</button><button class="danger" onclick="deleteRecord('${r.id}')">删除</button></td></tr>`).join('')||'<tr><td colspan="9" class="empty">暂无记录，去登记一条吧</td></tr>'}</tbody></table></div>`}
window.deleteRecord=id=>{if(confirm('确认删除此记录？')){cls().records=cls().records.filter(r=>r.id!==id);save();render();toast('已删除')}};
window.editRecord=id=>{let r=cls().records.find(x=>x.id===id), c=cls();modal('编辑考核记录',`<div class="grid"><div class="field"><label>日期</label><input id="mdate" type="date" value="${r.date}"></div><div class="field"><label>赋分</label><input id="mscore" type="number" value="${r.score}"></div><div class="field"><label>简述</label><input id="mbrief" value="${esc(r.brief)}"></div><div class="field"><label>说明</label><input id="mnote" value="${esc(r.note)}"></div></div>`,()=>{r.date=$('#mdate').value;r.score=+$('#mscore').value;r.brief=$('#mbrief').value;r.note=$('#mnote').value;save();closeModal();render();toast('已更新')})}
function dimKeys(){return ['测试成绩','小测均分',...Object.keys(cls().rules)]}
function stats(){let c=cls(),sre=scopedRecords(),out=c.students.filter(s=>s.active).map(s=>{let rs=sre.filter(r=>r.studentId===s.id),msum=examsOf('major').reduce((n,e)=>n+(scoreOf(e,s.id,TOTAL)||0),0),qv=examsOf('quiz').map(e=>scoreOf(e,s.id,TOTAL)).filter(v=>v!==null),dims={'测试成绩':+msum.toFixed(1),'小测均分':qv.length?+(qv.reduce((a,b)=>a+b,0)/qv.length).toFixed(1):0};Object.keys(c.rules).forEach(t=>dims[t]=rs.filter(r=>r.type===t).reduce((n,r)=>n+r.score,0));return {s,dims,total:Object.values(dims).reduce((n,x)=>n+x,0)}}).sort((a,b)=>b.total-a.total);out.forEach((x,i)=>x.rank=i+1);return out}
function personal(){
  const c=cls(),students=c.students.filter(s=>s.active),key=window.pSort||'avg';
  layout('个人成绩统计',
   `<select id="personalSort"><option value="avg" ${key==='avg'?'selected':''}>按所选考试均分</option><option value="hi" ${key==='hi'?'selected':''}>按最高分</option><option value="lo" ${key==='lo'?'selected':''}>按最低分</option><option value="major" ${key==='major'?'selected':''}>按大考总分</option><option value="quiz" ${key==='quiz'?'selected':''}>按小测均分</option><option value="total" ${key==='total'?'selected':''}>按成绩总分</option></select><input id="personSearch" list="studentSearch" placeholder="选择学生查看图表"><datalist id="studentSearch">${students.map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist><button id="exportPersonal">导出统计</button><button id="exportStudentScores">导出学生成绩</button><button class="primary" id="addStudentFromStats">新增学生</button>`,
   `<p class="hint">这一页只做<b>个人成绩分析</b>；量化考核与综合素质评价都在“量化考核”板块，不在这里重复。统计范围：${esc(termLabel(scopeId()))}（切换学期后只统计该学期的考试成绩）。折叠图例：蓝＝本人，橙＝班级均分。</p>
    <div id="chartControls" class="card"><span>图表学生：<b id="chosenStudent">未选择</b></span><span id="subjectToggles"></span></div><div id="personCharts" class="split"></div>`);
  $('#personalSort').onchange=e=>{window.pSort=e.target.value;render()};
  $('#personSearch').value=(stuById(window.peStudent||'')||{}).name||'';
  $('#exportPersonal').onclick=()=>exportXlsx('个人成绩统计',(window.__peRows||[]).map(r=>({名次:r.rank,姓名:r.s.name,所选考试次数:r.cnt,所选考试均分:r.avg,最高:r.hi,最低:r.lo,大考总分:r.major,小测均分:r.quiz,成绩总分:r.total})));
  $('#exportStudentScores').onclick=()=>{let s=findStudent($('#personSearch').value);if(!s)return toast('请先选择一名学生');exportStudentScores(s)};
  $('#addStudentFromStats').onclick=()=>studentModal();
  $('#personSearch').onchange=e=>{const s=findStudent(e.target.value);window.peStudent=s?s.id:'';drawPersonCharts(s);drawPeTrend(s)};
}
/* 个人成绩统计的数据：所选考试（次数/均分/最高/最低）＋成绩（大考总分/小测均分/成绩总分）；不含量化与综合素质 */
function peData(){
  const c=cls(),act=activeStudents();
  const all=[...examsOf('major'),...examsOf('quiz')].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const sig='pe|'+scopeId();
  if(window.peSig!==sig){window.peSig=sig;window.peUse=selPick('peUse',sig,all.map(e=>e.id))}
  if(!Array.isArray(window.peUse))window.peUse=all.map(e=>e.id);
  selSave('peUse',sig,window.peUse);
  const use=all.filter(e=>window.peUse.includes(e.id));
  const idxOf=e=>examType(e)==='quiz'?(examSubjects(e)[0]||''):TOTAL;
  const st=Object.fromEntries(stats().map(x=>[x.s.id,x]));
  const rows=act.map(s=>{
    const v=use.map(e=>scoreOf(e,s.id,idxOf(e))).filter(x=>x!==null);
    const b=st[s.id]||{dims:{}},major=+(b.dims['测试成绩']||0),quiz=+(b.dims['小测均分']||0);
    return {s,cnt:v.length,avg:v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null,hi:v.length?Math.max(...v):null,lo:v.length?Math.min(...v):null,major:+major.toFixed(1),quiz:+quiz.toFixed(1),total:+(major+quiz).toFixed(1)};
  });
  return {c,act,all,use,rows};
}
function sortPe(rows,key){
  key=key||'avg';
  const g=r=>(r[key]==null?-1e18:r[key]);
  const out=[...rows].sort((a,b)=>g(b)-g(a));
  out.forEach((r,i)=>r.rank=i+1);
  return out;
}
function peTable(rows){
  return `<div class="table-wrap" style="max-height:440px"><table><thead><tr><th>名次</th><th>姓名</th><th>所选考试次数</th><th>所选考试均分</th><th>最高</th><th>最低</th><th>大考总分</th><th>小测均分</th><th>成绩总分</th><th>个人成绩统计</th></tr></thead><tbody>
    ${rows.map(r=>`<tr style="cursor:pointer" onclick="pickPerson('${r.s.id}')" title="点这一行＝看他的折线图"><td class="rank">${r.rank}</td>
      <td><a href="javascript:void(0)" onclick="event.stopPropagation();examCompare('${r.s.id}')" title="点姓名：选两次大考做多维对比">${esc(r.s.name)}</a></td>
      <td>${r.cnt}</td><td><b>${r.avg==null?'—':fmtN(r.avg)}</b></td><td>${r.hi==null?'—':fmtN(r.hi)}</td><td>${r.lo==null?'—':fmtN(r.lo)}</td>
      <td>${fmtN(r.major)}</td><td>${fmtN(r.quiz)}</td><td><b>${fmtN(r.total)}</b></td>
      <td class="actions"><button onclick="examCompare('${r.s.id}')">大考对比图</button></td></tr>`).join('')||'<tr><td colspan="10" class="empty">还没有学生</td></tr>'}
    </tbody></table></div>`;
}
window.studentRecords=name=>{let f=recF();f.q=String(name??'');f.from='';f.to='';f.type='';page='records';pushHist();render()};
function exportStudentScores(s){let rows=cls().exams.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>({考试名称:e.name,考试日期:e.date,...e.scores[s.id]?.values,总分:e.scores[s.id]?.total||0}));if(!rows.length)return toast('该学生暂无考试成绩');exportXlsx(`${s.name}考试成绩`,rows)}
function board(){
  /* 名单与名次＝量化考核 → 汇总总表；卡片上的成绩＝所选考试的平均分 */
  const {use,rows,from,to}=sumState();
  const top=rows.slice(0,3),rest=rows.filter(r=>!top.includes(r)),low=rest.slice(-3).reverse();   /* 需关注不与正分之星重复 */
  layout('今日上榜',
   `<button id="bdGoSum">去汇总总表调整参考考试 / 时间</button>`,
   `<p class="hint">榜单名单与名次＝<b>量化考核 → 汇总总表</b>的合计（量化合计＋所选考试成绩合计）；卡片上的<b>成绩＝所选考试的平均分</b>（大考按总分、小测按该科分数）。当前参考 ${use.length} 次考试${(from||to)?`（${from||'不限'} ~ ${to||'不限'}）`:''}。点卡片可看这名学生的量化考核记录。</p>
    <div class="split"><div><h3>正分之星</h3><div class="podium">${podium(top,'正')}</div></div><div><h3>需关注</h3><div class="podium">${podium(low,'负')}</div></div></div>
    <h3>最佳小组</h3>
    ${bestGroupsHTML(rows)}
    <p class="mini">名单与名次已并入下面“综合素质评价”的表格（一行一名学生，含平均成绩、参考考试次数、量化合计与合计）；想让更多/更少考试计入，去“汇总总表”勾选考试或按时间筛选，这里的名次会自动跟着变。</p>`);
  $('#bdGoSum').onclick=()=>{page='summary';pushHist();render()};
  if($('#bdGoGroups'))$('#bdGoGroups').onclick=()=>{window.grScope='major';page='groups';pushHist();render()};
}
/* 最佳小组：按组内平均合计排名（合计＝量化合计＋所选考试成绩合计），同时给出组平均成绩 */
function bestGroupsHTML(rows){
  const byGroup={};
  rows.forEach(r=>{const g=r.s.group||'未分组';(byGroup[g]=byGroup[g]||[]).push(r)});
  const list=Object.entries(byGroup).map(([g,ms])=>({g,ms,n:ms.length,
    avgTotal:+(ms.reduce((a,b)=>a+b.total,0)/ms.length).toFixed(1),
    avgScore:avgOf(ms.map(m=>m.avg).filter(v=>v!=null)),
    avgQ:+(ms.reduce((a,b)=>a+b.q,0)/ms.length).toFixed(1)})).sort((a,b)=>b.avgTotal-a.avgTotal);
  if(!list.length)return '<p class="empty">还没有小组</p>';
  const best=list[0];
  /* 只留“最佳小组”一张名片，不再重复一张小组排名表（要看全部小组排名去“小组分类 → 小组分析”） */
  return `<div class="split" style="align-items:flex-start">
    <article class="stat gold" style="cursor:default"><b>🏆</b><h3>${esc(best.g)}</h3><span>组内平均合计 ${fmtN(best.avgTotal)} · ${best.n} 人</span><div class="mini" style="margin-top:6px">组内平均成绩 ${fmtN(best.avgScore)} · 平均量化 ${fmtN(best.avgQ)}</div></article>
    <p class="mini" style="margin:0">“最佳小组”＝组内平均合计最高的小组（合计＝量化合计＋所选考试成绩合计），只统计在班学生；共 ${list.length} 个小组参评。<button id="bdGoGroups">看全部小组排名</button></p>
  </div>`;
}
window.podiumGo=id=>{const s=stuById(id);if(!s)return toast('名单里找不到这名学生');studentRecordCard(s.id)};
function podium(a,label){return a.map((x,i)=>`<article class="${['gold','silver','bronze'][i]}" style="cursor:pointer" onclick="podiumGo('${x.s.id}')" title="点开看这名学生的量化考核记录"><b>${['🥇','🥈','🥉'][i]}</b><h3>${esc(x.s.name)}</h3><span class="${label==='正'?'positive':'negative'}">成绩 ${x.avg==null?'—':fmtN(x.avg)} · 合计 ${fmtN(x.total)} · 第 ${x.rank} 名</span><div class="mini" style="margin-top:4px">点开看记录 →</div></article>`).join('')||'<p class="empty">暂无数据</p>'}
const TOTAL='__total__',SKIP_COL=/^(序号|编号|学号|考号|准考证号?|班级|小组|分组|总分|总成绩|总分数?|合计|平均分|均分|名次|排名|班名次|班级名次|级名次|年级名次|校名次|等级|备注|说明|评价)$/;
function examType(e){return e.type||((e.subjects||[]).length>1?'major':'quiz')}
function examsOf(t){return scopedExams().filter(e=>examType(e)===t).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))}
function allSubjects(){return [...new Set(scopedExams().flatMap(e=>(e.subjects||[]).filter(Boolean)))]}
function activeStudents(){return cls().students.filter(s=>s.active)}
function stuById(id){return cls().students.find(s=>s.id===id)}
function examSubjects(e){return examType(e)==='quiz'?((e.subjects&&e.subjects.length?e.subjects:[e.subject]).filter(Boolean)):(e.subjects||[])}
function scoreOf(e,sid,key){let o=e.scores&&e.scores[sid];if(!o)return null;if(key===TOTAL){let v=o.total;return (v==null||v===''||isNaN(+v))?null:+v}let v=(o.values||{})[key];return (v==null||v===''||isNaN(+v))?null:+v}
function keyLabel(k){return k===TOTAL?'总分':k}
function avgOf(a){return a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):0}
function classAvg(e,key){return avgOf(activeStudents().map(s=>scoreOf(e,s.id,key)).filter(v=>v!==null))}
function medianOf(a){if(!a.length)return 0;let b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:+((b[m-1]+b[m])/2).toFixed(1)}
function examsForKey(scope,key){let l=examsOf(scope);return scope==='quiz'?l.filter(e=>examSubjects(e)[0]===key):l}
function keysFor(scope){return scope==='major'?[TOTAL,...new Set(examsOf('major').flatMap(e=>examSubjects(e)))]:[...new Set(examsOf('quiz').flatMap(e=>examSubjects(e)))]}
function fmtN(v,n=1){return (v==null||v===''||!isFinite(+v))?'—':(+v).toFixed(n).replace(/\.0+$/,'')}

function exams(){
  let tab=window.examTab||'major',major=tab==='major',list=examsOf(tab);
  let head=major?['考试名称','日期','科目','参考人数','班级均分','操作']:['小测名称','科目','日期','参考人数','班级均分','操作'];
  let rows=list.map(e=>{
    let subs=examSubjects(e),vs=activeStudents().map(s=>scoreOf(e,s.id,TOTAL)).filter(v=>v!==null);
    let nameCell=`<td><button class="linkbtn" onclick="gotoAnalysis('${e.id}')" title="点击进入成绩分析">${esc(e.name)}</button></td>`;
    let subjectCell=major?`<td>${esc(subs.join('、'))}</td>`:`<td><b>${esc(subs[0]||'未填科目')}</b></td><td>${esc(e.date)}</td>`;
    return `<tr>${nameCell}${major?`<td>${esc(e.date)}</td>${subjectCell}`:subjectCell}<td>${vs.length}</td><td>${fmtN(avgOf(vs))}</td><td class="actions"><button onclick="viewExam('${e.id}')">查看/改分</button><button onclick="analyzeExam('${e.id}')">分析</button><button class="danger" onclick="delExam('${e.id}')">删除</button></td></tr>`}).join('');
  layout('成绩管理',`<div class="tabs"><button class="${major?'active':''}" id="tabMajor">大考（多科＋总分）</button><button class="${major?'':'active'}" id="tabQuiz">小测（单科）</button></div><button class="primary" id="importExam">导入${major?'大考':'小测'} Excel</button><button id="newExam">新建${major?'大考':'小测'}</button><button id="exportExamTable">导出成绩总表</button><button id="template">下载导入模板</button>`,
  `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="6" class="empty">暂无${major?'大考':'小测'}成绩，请点上方“导入${major?'大考':'小测'} Excel”或“新建${major?'大考':'小测'}”</td></tr>`}</tbody></table></div>
  <p class="hint">${major?'大考表：一行一名学生，姓名后可有任意多科目列（可含“总分”列，系统会自动核对）。':'小测表：一行一名学生，一列该科分数；科目可在导入时自动识别，也可自己指定。'} 名单外的学生会在导入时自动加入名单（归入小组“未分组”），名单只是起点，可随时清空重来。</p>`);
  $('#tabMajor').onclick=()=>{window.examTab='major';render()};
  $('#tabQuiz').onclick=()=>{window.examTab='quiz';render()};
  $('#importExam').onclick=()=>pick(f=>importExam(f,major?'major':'quiz'));
  $('#newExam').onclick=()=>examModal(null,major?'major':'quiz');
  $('#exportExamTable').onclick=exportExamTable;
  $('#template').onclick=()=>exportExamTemplate(major?'major':'quiz');
}
window.gotoAnalysis=id=>{let e=cls().exams.find(x=>x.id===id);if(!e)return;window.anScope=examType(e);window.anKey=examType(e)==='quiz'?examSubjects(e)[0]:TOTAL;window.anExam=e.id;page='analysis';pushHist();render()};
window.analyzeExam=id=>gotoAnalysis(id);

function examModal(id,type){
  let c=cls(),e=id?c.exams.find(x=>x.id===id):null,isNew=!e;
  if(!e)e={id:uid(),name:'',date:today(),type:type||'major',subject:'',subjects:[],scores:{},note:''};
  modal(isNew?'新建考试/小测':'编辑考试信息',`<div class="grid"><div class="field"><label>类型</label><select id="etype"><option value="major" ${examType(e)==='major'?'selected':''}>大考（多科目＋总分）</option><option value="quiz" ${examType(e)==='quiz'?'selected':''}>小测（单科目）</option></select></div><div class="field"><label>名称</label><input id="ename" value="${esc(e.name)}"></div><div class="field"><label>日期</label><input id="edate" type="date" value="${e.date||today()}"></div><div class="field" id="quizField"><label>小测科目</label><input id="esubject" value="${esc(e.subject||(e.subjects||[])[0]||'')}" placeholder="如：语文"></div><div class="field" id="majorField"><label>科目（顿号或逗号分隔）</label><input id="esubjects" value="${esc((e.subjects||[]).join('、'))}"></div><div class="field"><label>备注</label><input id="enote" value="${esc(e.note||'')}"></div></div><p>创建后可直接填分，也可在成绩管理页导入 Excel。</p>`,()=>{
    let t=$('#etype').value;
    e.type=t;e.name=$('#ename').value.trim()||(t==='quiz'?'未命名小测':'未命名大考');e.date=$('#edate').value||today();e.note=$('#enote').value;
    if(t==='quiz'){e.subject=$('#esubject').value.trim();e.subjects=e.subject?[e.subject]:[]}
    else{e.subjects=$('#esubjects').value.split(/[、,，\s]+/).map(x=>x.trim()).filter(Boolean);e.subject=''}
    e.scores=e.scores||{};
    if(!c.exams.some(x=>x.id===e.id))c.exams.push(e);
    save();closeModal();window.examTab=t;page='exams';window.examViewId=e.id;render();toast('已保存，可填分或导入 Excel')
  });
  let sync=()=>{let q=$('#etype').value==='quiz';$('#quizField').style.display=q?'':'none';$('#majorField').style.display=q?'none':'';$('#ename').placeholder=q?'如：语文第三单元小测':'如：第一次月考'};
  $('#etype').onchange=sync;sync();
}

window.delExam=id=>{let e=cls().exams.find(x=>x.id===id);if(e&&confirm(`确认删除「${e.name}」及本次全部成绩？`)){cls().exams=cls().exams.filter(x=>x.id!==id);save();render();toast('已删除')}};

window.viewExam=id=>{
  let c=cls(),e=c.exams.find(x=>x.id===id);if(!e){page='exams';return render()}
  let subs=examSubjects(e),quiz=examType(e)==='quiz',ss=activeStudents();
  let heads=subs.map(x=>`<th class="clickable" title="点击查看全班该科成绩与波动" onclick="openSubjectRanks('${e.id}','${esc(x)}')">${esc(x)} <span class="zoom">⇗</span></th>`).join('')+(quiz?'':`<th class="clickable" title="点击查看全班总分" onclick="openSubjectRanks('${e.id}','${TOTAL}')">总分 <span class="zoom">⇗</span></th>`);
  let body=ss.map(s=>`<tr><td>${esc(s.name)}</td>${subs.map(x=>`<td><input class="score" data-id="${s.id}" data-sub="${esc(x)}" type="number" step="0.5" value="${scoreOf(e,s.id,x)??''}"></td>`).join('')}${quiz?'':`<td class="rank">${fmtN(scoreOf(e,s.id,TOTAL))}</td>`}</tr>`).join('');
  let foot=subs.map(x=>`<td>${fmtN(classAvg(e,x))}</td>`).join('')+(quiz?'':`<td>${fmtN(classAvg(e,TOTAL))}</td>`);
  layout(`${quiz?'小测':'大考'}：${esc(e.name)}`,`<button id="back">返回成绩管理</button><button id="saveScores" class="primary">保存分数</button><button id="editExam">编辑信息</button><button id="gradeBtn">录入年级均分</button><button id="analyze">成绩分析</button><button id="exportThis">导出本次成绩</button>`,
  `<p class="hint">${esc(e.date)}　${quiz?'科目：'+esc(subs[0]||'未填'):subs.length+' 个科目'}　${esc(e.note||'')}　｜　点表头“科目/总分”可看全班成绩与折线波动，分数可直接在表格里修改。</p>
  <div class="table-wrap"><table><thead><tr><th>学生</th>${heads}</tr></thead><tbody>${body||`<tr><td colspan="${subs.length+2}" class="empty">名单为空：请到“学生与班级”添加或导入名单</td></tr>`}</tbody><tfoot><tr><th>班级均分</th>${foot}</tr></tfoot></table></div>
  <div class="split"><canvas id="subjectAverage" class="chart"></canvas><canvas id="examGroupCompare" class="chart"></canvas></div>`);
  $('#back').onclick=()=>{page='exams';render()};
  $('#editExam').onclick=()=>examModal(e.id);
  $('#gradeBtn').onclick=()=>gradeModal(e.id);
  $('#analyze').onclick=()=>gotoAnalysis(e.id);
  $('#exportThis').onclick=()=>exportExam(e);
  $('#saveScores').onclick=()=>{document.querySelectorAll('.score').forEach(i=>{let v=i.value.trim(),o=e.scores[i.dataset.id]||(e.scores[i.dataset.id]={values:{}});o.values=o.values||{};if(v==='')delete o.values[i.dataset.sub];else o.values[i.dataset.sub]=+v;o.total=Object.values(o.values).reduce((a,b)=>a+(+b||0),0);if(!Object.keys(o.values).length)delete e.scores[i.dataset.id]});save();toast('成绩已保存');viewExam(id)};
  drawExamCharts(e);
};
function students(){let c=cls();layout('学生与班级管理','<button class="primary" id="addStudent">添加学生</button>',`<p>当前班级：${esc(c.name)}；小组：${c.groups.map(esc).join('、')}</p><div class="table-wrap"><table><thead><tr><th>姓名</th><th>小组</th><th>状态</th><th>操作</th></tr></thead><tbody>${c.students.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.group)}</td><td>${s.active?'在班':'已离班'}</td><td><button onclick="studentModal('${s.id}')">编辑</button><button class="danger" onclick="removeStudent('${s.id}')">删除</button></td></tr>`).join('')}</tbody></table></div>`);$('#addStudent').onclick=()=>studentModal()}
window.removeStudent=id=>{if(confirm('删除学生？历史记录会保留。')){cls().students=cls().students.filter(s=>s.id!==id);save();render()}};
window.studentModal=id=>{let c=cls(),s=c.students.find(x=>x.id===id)||{id:uid(),name:'',group:c.groups[0],active:true};modal(id?'编辑学生':'添加学生',`<div class="grid"><div class="field"><label>姓名</label><input id="sname" value="${esc(s.name)}"></div><div class="field"><label>小组</label><select id="sgroup">${options(c.groups,s.group)}</select></div></div>`,()=>{if(!$('#sname').value.trim())return toast('姓名不能为空');s.name=$('#sname').value.trim();s.group=$('#sgroup').value;if(!c.students.includes(s))c.students.push(s);save();closeModal();render()})};
function modal(title,body,onok,okLabel){
  closeModal();
  document.body.insertAdjacentHTML('beforeend',
   `<div class="modal" id="modal"><section class="card">
      <div class="mhead"><h2>${title}</h2><button class="mclose" title="关闭（Esc）">✕ 关闭</button></div>
      <div class="mbody">${body}</div>
      <div class="toolbar mfoot">${onok?'<button id="cancel">取消</button>':''}<button id="ok" class="primary">${okLabel||(onok?'保存':'关闭')}</button></div>
    </section></div>`);
  const m=$('#modal');
  m.querySelector('.mclose').onclick=closeModal;
  m.addEventListener('click',e=>{if(e.target===m)closeModal()});
  $('#cancel')&&($('#cancel').onclick=closeModal);
  $('#ok').onclick=onok||closeModal;
  document.onkeydown=e=>{if(e.key==='Escape'){closeModal();document.onkeydown=null}};
}
function closeModal(){document.querySelectorAll('.modal').forEach(m=>m.remove());document.onkeydown=null}
function pick(cb){let i=$('#fileInput');i.value='';i.onchange=e=>e.target.files[0]&&cb(e.target.files[0]);i.click()} function readBook(f,cb){let r=new FileReader;r.onload=e=>cb(XLSX.read(e.target.result,{type:'array',cellDates:true}));r.readAsArrayBuffer(f)}
function headers(rows){let r=(Array.isArray(rows)&&Array.isArray(rows[0]))?rows[0]:rows;return (r||[]).map(x=>String(x==null?'':x).trim())} function col(h,keys){return h.findIndex(x=>keys.some(k=>x.includes(k)))} function asRows(ws){return XLSX.utils.sheet_to_json(ws,{header:1,defval:''})}
function cleanCell(x){return String(x==null?'':x).replace(/\u3000/g,' ').trim()}
function numOrNull(x){
  if(x==null||x==='')return null;
  if(x instanceof Date)return null;
  if(typeof x==='string'){
    let s=x.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/[\s\u3000]/g,'').replace(/[（(].*?[)）]/g,'');
    s=s.replace(/^(实得|得分|分数|成绩)[:：]?/,'');
    if(!s)return null;
    if(/^(缺考|免考|未考|没考|未参加|弃考|无|待定|[-—–—./\\])$/.test(s))return null;
    if(/^([A-Ea-e](\+|-)?)$/.test(s)||/^(优|良|中|及格|不及格|合格|不合格|优秀|良好)$/.test(s))return null;
    if(/\d\s*\/\s*\d/.test(s))s=s.split('/')[0];
    if(/\d\s*[-~～]\s*\d/.test(s)&&!/^-/.test(s))s=s.split(/[-~～]/)[0];
    s=s.replace(/[分点]$/,'').replace(/^\+/,'');
    let v=+s;return isNaN(v)?null:v;
  }
  let v=+x;return isNaN(v)?null:v;
}
function findHeaderRow(rows){let best=-1,bestScore=-1;rows.slice(0,15).forEach((r,i)=>{let cells=(r||[]).map(cleanCell),score=0;cells.forEach(x=>{if(!x)return;if(/姓名|名字/.test(x)||/^学生$/.test(x))score+=6;else if(/^\d+$/.test(x))score-=0.2;if(/语文|数学|英语|外语|物理|化学|生物|政治|历史|地理|科学|道法|思想|品德|社会|体育|音乐|美术|信息|技术|总分|总成绩|学号|序号|班级|小组|等级|名次|平均|分数|成绩/.test(x))score+=1.5;else if(/^[\u4e00-\u9fa5A-Za-z]{1,6}$/.test(x))score+=0.4});if(cells.filter(x=>x!=='').length>=2&&score>bestScore){bestScore=score;best=i}});return bestScore>=5?best:-1}
function sheetTable(ws){let a=asRows(ws),i=findHeaderRow(a);if(i<0)i=a.findIndex(r=>r.some(x=>/姓名|学生/.test(cleanCell(x))));return {h:headers(a[i<0?0:i]),rows:a.slice((i<0?0:i)+1),headerRow:i<0?0:i}}
const EXCLUDE_COL=/名次|排名|等级|备注|说明|时间|日期|电话|联系|地址|考号|学号|序号|编号|评价|标语|性别|考场|座位|学籍|考籍|身份证|家长|任课|教师|老师|满分|得分率|及格率|优秀率|人数|均分|总分/;
const SUBJECT_NAMES=['语文','数学','英语','物理','化学','生物','政治','历史','地理','道德与法治','科学','信息技术','通用技术','体育','音乐','美术','心理健康'];
function inferSubject(text){let t=String(text==null?'':text);return SUBJECT_NAMES.find(n=>t.includes(n))||''}
function parseExam(ws,fileName,opt={}){
  let rows=asRows(ws),hi=findHeaderRow(rows);
  if(hi<0)return {ok:false,error:'没找到含“姓名”的表头行'};
  let h=headers(rows[hi]).map(x=>{let t=cleanCell(x).replace(/\s+/g,'');let c=t.replace(/(得分|成绩|分数|分值|得分率)$/,'');return c||t});
  let ni=h.findIndex(x=>/姓名|名字/.test(x)||/^学生$/.test(x));
  if(ni<0)return {ok:false,error:'表头里没有“姓名”列'};
  let totalIdx=h.findIndex((x,i)=>i!==ni&&/^(总分|总成绩|总分数|合计|总计)$/.test(x));
  let body=rows.slice(hi+1),idx=[];
  h.forEach((x,i)=>{
    if(!x||i===ni||i===totalIdx)return;
    if(SKIP_COL.test(x)||EXCLUDE_COL.test(x))return;
    let numeric=body.some(r=>numOrNull(r[i])!==null);
    if(numeric)idx.push(i);
  });
  if(!idx.length)idx=h.map((x,i)=>({x,i})).filter(o=>o.x&&o.i!==ni&&o.i!==totalIdx&&!SKIP_COL.test(o.x)&&!EXCLUDE_COL.test(o.x)).map(o=>o.i);
  if(!idx.length)return {ok:false,error:'没识别到分数列：请在“姓名”列右边放各科分数'};
  let subjects=[];
  idx.forEach((i,j)=>{let base=h[i]||('科目'+(j+1)),name=base,k=2;while(subjects.includes(name))name=base+'('+(k++)+')';subjects.push(name)});
  let subCols=idx.map((i,j)=>({idx:i,key:subjects[j]}));
  let type=opt.type||(subjects.length>1?'major':'quiz');
  if(type==='quiz'&&subjects.length>1)return {ok:false,error:`识别到 ${subjects.length} 个科目（${subjects.join('、')}），请改用“导入大考 Excel”`};
  let titleRaw=rows.slice(0,hi).flat().map(cleanCell).find(x=>x&&x.length>1&&!/^(姓名|序号|学生)$/.test(x))||'';
  let src=titleRaw||fileName||'',m=String(src).match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  let date=m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:today();
  let name=String(src).replace(/\(?\s*20\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*[日号]?\s*\)?/g,'').replace(/[（(]\s*[)）]/g,'').replace(/[\s_\-—·|、]+$/,'').trim();
  if(!name)name=type==='quiz'?(subjects[0]+'小测'):'未命名大考';
  if(type==='quiz'&&/^(分数|成绩|得分|分值|考试成绩|总分)$/.test(subjects[0])){let g=inferSubject(name+' '+fileName+' '+titleRaw);if(g){subjects[0]=g;subCols=idx.map((i,j)=>({idx:i,key:subjects[j]}))}else subjects[0]=(inferSubject(name)||subjects[0])}
  let data=[];
  body.forEach(r=>{
    let raw=cleanCell(r[ni]);
    if(!raw||/^(合计|总计|平均|班级平均|最高分?|最低分?|统计)/.test(raw))return;
    let values={},any=false;
    subCols.forEach(c=>{let v=numOrNull(r[c.idx]);if(v!==null){values[c.key]=v;any=true}});
    if(!any)return;
    let tot=totalIdx>=0?numOrNull(r[totalIdx]):null;
    if(tot===null)tot=type==='quiz'?(Object.values(values)[0]??null):Object.values(values).reduce((a,b)=>a+b,0);
    data.push({name:raw,values,total:tot});
  });
  return {ok:true,type,subjects,subCols,data,date,name,titleRaw}
}
function importRecords(f){readBook(f,b=>{let {h,rows:a}=sheetTable(b.Sheets[b.SheetNames[0]]),di=col(h,['日期']),ni=col(h,['姓名','学生']),ti=col(h,['类型','常规事项']),de=col(h,['细则']),si=col(h,['赋分','成绩']),bi=col(h,['简述']),no=col(h,['说明','补充']);if(ni<0||ti<0)return toast('未识别姓名或事项类型列');let c=cls(),n=0,other=0;a.forEach(x=>{let s=findStudent(String(x[ni]||''));if(s&&x[ti]){let d=date(x[di])||today(),tid=(termOfDate(d)||{}).id||db.term;if(tid!==scopeId())other++;c.records.push({id:uid(),date:d,term:tid,studentId:s.id,student:s.name,group:s.group,type:String(x[ti]),detail:String(x[de]||''),brief:String(x[bi]||''),score:+x[si]||0,note:String(x[no]||''),created:new Date().toLocaleString()});n++}});save();toast(`已导入 ${n} 条记录${other?`（其中 ${other} 条属于其它学期，可在“历史学期”查看）`:''}`);render()})}
/* ===== 卷面分（满分）：默认语数英 150、物化生政史地 100；导入时可改，按科目记住 ===== */
function defaultFull(sub){return /语文|数学|英语/.test(String(sub))?150:100}
function fullOf(sub){let f=(cls().fullScores||{})[sub],v=+f;return v>0?v:defaultFull(sub)}
function setFull(sub,v){let c=cls();c.fullScores=c.fullScores||{};let n=+v;if(n>0)c.fullScores[sub]=n;else delete c.fullScores[sub]}
function examFull(e,key){
  if(key!==TOTAL)return fullOf(key);
  let f=+((cls().fullScores||{})['总分']||0);if(f>0)return f;
  return examSubjects(e).reduce((n,s)=>n+fullOf(s),0);
}
function importExam(f,type){readBook(f,b=>{
  let ws=pickExamSheet(b);if(!ws)return toast('导入失败：这个文件里没找到含“姓名”的成绩表');
  let name=f.name.replace(/\.[^.]+$/,''),r=parseExam(ws,name,{type});
  if(!r.ok)return toast('导入失败：'+r.error);
  importConfirmModal(r,ws,name,{type});
})}
/* 导入前核对：识别报告 + 卷面分设置（默认语数英150、其余100，可改并按科目记住） */
function importConfirmModal(r,ws,name,opt){
  let c=cls(),plan=r.type==='quiz'?[r.subjects[0]]:r.subjects;
  let dup=c.exams.some(x=>x.name===r.name&&x.date===r.date&&examType(x)===r.type);
  let rows=plan.map(s=>`<tr><td>${esc(s)}</td><td><input class="fullIn" data-sub="${esc(s)}" type="number" min="1" step="1" value="${fullOf(s)}" style="width:96px"></td><td class="mini passCell">及格 ${Math.round(fullOf(s)*0.6)}</td></tr>`).join('');
  let sum=plan.reduce((n,s)=>n+fullOf(s),0);
  modal(`导入核对 · ${r.type==='quiz'?'小测':'大考'}「${esc(r.name)}」`,
   `<div class="stat-row"><span>日期 <b>${esc(r.date)}</b></span><span>识别到 <b>${r.data.length}</b> 名学生</span><span>科目 <b>${plan.length}</b> 个</span>${dup?'<span class="negative">已存在同名同日期成绩</span>':''}</div>
    <p class="hint">下面是识别出的科目与<b>卷面分（满分）</b>。默认语数英 150、物化生政史地 100，可按你们学校的卷子改；改完会按科目记住，下次导入自动带出。</p>
    <div class="table-wrap" style="max-height:280px"><table><thead><tr><th>科目</th><th>卷面分</th><th>默认及格线（卷面分的 60%）</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${r.type==='quiz'?'':`<p class="mini">总分卷面分＝各科之和：<b>${sum}</b>　总分及格线＝它的 60%</p>`}
    ${dup?'<div class="field"><label>已存在同名同日期的成绩，怎么处理？</label><select id="dupMode"><option value="replace">用新成绩覆盖它</option><option value="new">另存为一份新成绩</option></select></div>':''}`,
   ()=>{
     document.querySelectorAll('#modal .fullIn').forEach(i=>setFull(i.dataset.sub,+i.value));
     let total=plan.reduce((n,s)=>n+fullOf(s),0),c2=cls();c2.fullScores=c2.fullScores||{};
     if(plan.length>1&&total>0)c2.fullScores['总分']=total;
     if(dup&&$('#dupMode'))opt.replace=$('#dupMode').value==='replace';
     closeModal();
     let res=importExamSheet(ws,name,opt,r);if(!res)return;
     save();let tid=res.exam.term||db.term,switched=tid!==scopeId();if(switched)window.scopeTerm=tid;
     toast(`已导入${res.exam.type==='quiz'?'小测':'大考'}「${res.exam.name}」：${res.count} 名学生${res.plan.length>1?`、${res.plan.length} 个科目`:''}${res.added.length?`；自动新增 ${res.added.length} 人（未分组）`:''}${switched?`；已切到学期 ${termLabel(tid)}`:''}`);
     page='exams';window.examTab=res.exam.type;render();
   },'确认导入');
  document.querySelectorAll('#modal .fullIn').forEach(i=>{
    i.oninput=i.onchange=()=>{let v=+i.value||0,cell=i.closest('tr').querySelector('.passCell');if(cell)cell.textContent='及格 '+(v>0?Math.round(v*0.6):'—')};
  });
}
function pickExamSheet(wb){let cands=wb.SheetNames.map(n=>({n,ws:wb.Sheets[n]})).filter(x=>{let rows=asRows(x.ws),hi=findHeaderRow(rows);if(hi<0)return false;return headers(rows[hi]).some(v=>/姓名|名字/.test(cleanCell(v))||/^学生$/.test(cleanCell(v)))});return cands.length?cands[0].ws:null}
function importSmart(f){readBook(f,b=>{let done=[];b.SheetNames.forEach(n=>{let ws=b.Sheets[n],rows=asRows(ws),hi=findHeaderRow(rows);if(hi<0)return;let h=headers(rows[hi]).map(cleanCell);if(h.some(x=>/类型|常规事项|细则/.test(x))){importRecordsSheet(ws);done.push('考核记录')}else if(h.some(x=>/小组|分组/.test(x))&&h.filter(Boolean).length<=4){importStudentsSheet(ws);done.push('学生名单')}else{let r=parseExam(ws,n,{});if(r.ok){importExamSheet(ws,n,{})&&done.push(r.type==='quiz'?'小测成绩':'大考成绩')}}});save();let uniq=[...new Set(done)];toast(uniq.length?'已自动导入：'+uniq.join('、'):'没找到可识别的表头，请到成绩管理按大考/小测分别导入');render()})}
function importStudentsSheet(ws){let {h,rows}=sheetTable(ws),ni=col(h,['姓名','学生']),gi=col(h,['小组','分组']),c=cls();rows.forEach(r=>{if(!r[ni])return;let s=findStudent(String(r[ni]));if(s)s.group=r[gi]||s.group;else c.students.push({id:uid(),name:String(r[ni]),group:String(r[gi]||c.groups[0]),active:true})})}
function importRecordsSheet(ws){let {h,rows}=sheetTable(ws),di=col(h,['日期']),ni=col(h,['姓名','学生']),ti=col(h,['类型','常规事项']),de=col(h,['细则']),si=col(h,['赋分','成绩']),bi=col(h,['简述']),no=col(h,['说明','补充']),c=cls();rows.forEach(x=>{let s=findStudent(String(x[ni]||''));if(s&&x[ti])c.records.push({id:uid(),date:date(x[di])||today(),studentId:s.id,student:s.name,group:s.group,type:String(x[ti]),detail:String(x[de]||''),brief:String(x[bi]||''),score:+x[si]||0,note:String(x[no]||''),created:new Date().toLocaleString()})})}
function importExamSheet(ws,name,opt={},parsed){
  let r=parsed||parseExam(ws,name,opt);
  if(!r.ok){toast('导入失败：'+r.error);return null}
  let c=cls(),added=[],count=0,plan=r.type==='quiz'?[r.subjects[0]]:r.subjects;
  let e={id:uid(),name:r.name,date:r.date,type:r.type,subject:r.type==='quiz'?r.subjects[0]:'',subjects:plan,scores:{},note:'来源：Excel'+(r.titleRaw?'（'+r.titleRaw+'）':''),source:'excel'};
  r.data.forEach(d=>{
    let s=findStudent(d.name);
    if(!s){s={id:uid(),name:d.name,group:(c.groups&&c.groups[0])||'未分组',active:true};c.students.push(s);added.push(d.name)}
    e.scores[s.id]={values:d.values,total:d.total};count++;
  });
  if(!count){toast('导入失败：没有读到有效的学生成绩行');return null}
  let dup=c.exams.findIndex(x=>x.name===e.name&&x.date===e.date&&examType(x)===e.type),replaced=false;
  if(dup>=0&&(opt.replace===true||(opt.replace!==false&&confirm(`已存在「${e.name}」（${e.date}）。\n点“确定”＝用新成绩覆盖它，点“取消”＝另存为一份新成绩`)))){e.id=c.exams[dup].id;c.exams[dup]=e;replaced=true}
  if(!replaced)c.exams.push(e);
  window.examTab=e.type;
  return {exam:e,count,added,replaced,plan}
}
function importBackup(f){let r=new FileReader;r.onload=e=>{try{let x=JSON.parse(e.target.result);if(!x.classes)throw 0;if(confirm('导入将覆盖当前全部数据，确认吗？')){db=x;save();toast('备份已恢复');render()}}catch{toast('不是有效的备份文件')}};r.readAsText(f)}
function exportXlsx(name,data){let ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));XLSX.writeFile(wb,`${name}_${today()}.xlsx`)} function download(s,n,t){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:t}));a.download=n;a.click();URL.revokeObjectURL(a.href)}
function shortLabel(s){let x=String(s);return x.length>9?x.slice(0,8)+'…':x}
function exportChart(cv,name){
  if(!cv)return toast('没有可导出的图表');
  let a=document.createElement('a');a.href=cv.toDataURL('image/png');a.download=(cv.dataset.name||name||'成绩图表')+'.png';a.click();
  toast('已导出图片，见浏览器“下载”文件夹');
}
window.exportChartById=(id,name)=>exportChart(document.getElementById(id),name);
function attachChartTools(root){
  (root||document).querySelectorAll('canvas.chart').forEach(cv=>{
    if(cv.dataset.tools)return;cv.dataset.tools='1';
    let tools=document.createElement('div');tools.className='chart-tools';
    let b=document.createElement('button');b.textContent='导出图片';b.title='把这个图存成 PNG 图片';
    b.onclick=()=>exportChart(cv);
    let full=document.createElement('button');full.textContent='放大';full.title='放大查看';
    full.onclick=()=>{let c2=document.createElement('canvas');c2.className='chart';c2.width=cv.width;c2.height=cv.height;let g=c2.getContext('2d');g.drawImage(cv,0,0);modal('图表：'+esc(cv.dataset.name||''),'',null,'关闭');setTimeout(()=>{$('#modal').querySelector('section').insertBefore(c2,$('#modal').querySelector('.toolbar'));c2.style.width='100%';c2.style.height='auto'},0)};
    tools.appendChild(full);tools.appendChild(b);cv.after(tools);
  });
}
function lineChart(canvas,labels,series,title,zeroBase,onLabelClick){
  if(!canvas||!canvas.clientWidth||!canvas.clientHeight)return;
  let ctx=canvas.getContext('2d'),w=canvas.width=canvas.clientWidth*devicePixelRatio,h=canvas.height=canvas.clientHeight*devicePixelRatio;
  ctx.scale(devicePixelRatio,devicePixelRatio);w/=devicePixelRatio;h/=devicePixelRatio;ctx.clearRect(0,0,w,h);ctx.font='13px system-ui,"Microsoft YaHei",sans-serif';ctx.fillStyle='#52606d';ctx.fillText(title,12,18);
  let all=series.flatMap(x=>x.values).filter(v=>isFinite(v)),dmin=Math.min(...(all.length?all:[0])),dmax=Math.max(...(all.length?all:[1])),span=Math.max(1,dmax-dmin);
  let min=zeroBase?Math.min(0,dmin):dmin-span*0.2,max=zeroBase?Math.max(1,dmax*1.1):dmax+span*0.2;
  if(max<=min)max=min+1;
  let pad={l:45,r:20,t:32,b:36},X=i=>pad.l+(labels.length>1?i*(w-pad.l-pad.r)/(labels.length-1):(w-pad.l-pad.r)/2),Y=v=>h-pad.b-(v-min)*(h-pad.t-pad.b)/(max-min);
  ctx.strokeStyle='#d9e2ec';ctx.fillStyle='#52606d';
  let dec=(max-min)<10?1:0;
  for(let i=0;i<5;i++){let y=pad.t+i*(h-pad.t-pad.b)/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText((max-(max-min)*i/4).toFixed(dec),5,y+4)}
  let colors=['#1769aa','#e67e22','#16a085','#8e44ad','#d35400','#c0392b','#7f8c8d','#2c82c9','#b7791f','#4a7c59','#8e6b9e','#0f766e'];
  series.forEach((s,k)=>{let col=colors[k%colors.length],vals=s.values.map(v=>isFinite(v)?v:0);ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=2;ctx.beginPath();vals.forEach((v,i)=>i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));ctx.stroke();ctx.lineWidth=1;vals.forEach((v,i)=>{let ty=(s.marks||[])[i];ctx.beginPath();if(ty==='major')ctx.rect(X(i)-3.2,Y(v)-3.2,6.4,6.4);else ctx.arc(X(i),Y(v),3,0,7);ctx.fill()});ctx.fillText(s.name,Math.max(pad.l,w-14-ctx.measureText(s.name).width),18+k*15)});
  let step=Math.max(1,Math.ceil(labels.length/Math.max(1,Math.floor((w-pad.l-pad.r)/(onLabelClick?96:78)))));
  let boxes=[];
  ctx.fillStyle='#52606d';labels.forEach((l,i)=>{if(i%step&&i!==labels.length-1)return;let t=shortLabel(l),tw=ctx.measureText(t).width,x=Math.min(w-pad.r-tw,Math.max(pad.l-10,X(i)-tw/2));
    if(onLabelClick){ctx.fillStyle=onLabelClick?'#eaf2ff':'#52606d';ctx.beginPath();ctx.roundRect?ctx.roundRect(x-5,h-27,tw+10,17,4):ctx.rect(x-5,h-27,tw+10,17);ctx.fill();ctx.fillStyle='#1a5fd0'}
    ctx.fillText(t,x,h-14);boxes.push({i,x0:x-5,x1:x+tw+5});ctx.fillStyle='#52606d'});
  canvas.onmousemove=ev=>{if(!labels.length)return;let rect=canvas.getBoundingClientRect(),i=Math.max(0,Math.min(labels.length-1,Math.round((ev.clientX-rect.left-pad.l)/(rect.width-pad.l-pad.r)*Math.max(1,labels.length-1))));canvas.title=`${labels[i]}：${series.map(s=>`${s.name} ${s.values[i]??0}`).join('；')}`};
  canvas.onmouseleave=()=>canvas.title='';
  if(!labels.length){
    ctx.fillStyle='#8b98a7';ctx.font='15px system-ui,"Microsoft YaHei",sans-serif';
    let msg='（未选择考试，图表为空）';ctx.fillText(msg,w/2-ctx.measureText(msg).width/2,h/2);
    canvas.onmousemove=null;canvas.onclick=null;canvas.style.cursor='default';canvas.title='';return;
  }
  canvas.style.cursor='default';
  canvas.onmousemove=ev=>{if(!labels.length)return;let rect=canvas.getBoundingClientRect(),i=Math.max(0,Math.min(labels.length-1,Math.round((ev.clientX-rect.left-pad.l)/(rect.width-pad.l-pad.r)*Math.max(1,labels.length-1))));
    let my=ev.clientY-rect.top,onLabel=!!(onLabelClick&&boxes.some(b=>i===b.i&&my>rect.height-30));
    canvas.style.cursor=onLabel?'pointer':'default';
    canvas.title=`${labels[i]}：${series.map(s=>`${s.name} ${s.values[i]??0}`).join('；')}`+(onLabelClick?'　（点击查看该次全班成绩）':'')};
  canvas.onclick=ev=>{if(!onLabelClick)return;let rect=canvas.getBoundingClientRect(),my=ev.clientY-rect.top;if(my<rect.height-30)return;let x=ev.clientX-rect.left,b=boxes.find(b=>x>=b.x0&&x<=b.x1);if(b)onLabelClick(b.i)};
}
function histChart(canvas,values,title,onBinClick,opts){
  opts=opts||{};
  if(!canvas||!canvas.clientWidth||!values.length)return;
  let ctx=canvas.getContext('2d'),w=canvas.width=canvas.clientWidth*devicePixelRatio,h=canvas.height=canvas.clientHeight*devicePixelRatio;
  ctx.scale(devicePixelRatio,devicePixelRatio);w/=devicePixelRatio;h/=devicePixelRatio;ctx.clearRect(0,0,w,h);ctx.font='13px system-ui,"Microsoft YaHei",sans-serif';ctx.fillStyle='#52606d';ctx.fillText(title,12,18);
  let lo=Math.floor(Math.min(...values)/10)*10,hi=Math.ceil(Math.max(...values)/10)*10;if(hi<=lo)hi=lo+10;
  let n=Math.max(1,Math.min(10,Math.round((hi-lo)/5))),bw=(hi-lo)/n,bins=new Array(n).fill(0);
  values.forEach(v=>{let i=Math.min(n-1,Math.max(0,Math.floor((v-lo)/bw)));bins[i]++});
  let pad={l:40,r:14,t:32,b:34},mc=Math.max(1,...bins),X=i=>pad.l+i*(w-pad.l-pad.r)/n,Y=c=>h-pad.b-c*(h-pad.t-pad.b)/mc;
  ctx.strokeStyle='#d9e2ec';
  for(let i=0;i<5;i++){let y=pad.t+i*(h-pad.t-pad.b)/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillStyle='#52606d';ctx.fillText(String(Math.round(mc-mc*i/4)),5,y+4)}
  let barw=Math.max(3,(w-pad.l-pad.r)/n-5);
  bins.forEach((c,i)=>{if(!c)return;
    const b0=lo+i*bw,b1=lo+(i+1)*bw,isBin=opts.bin&&b0>=opts.bin[0]-0.01&&b1<=opts.bin[1]+0.01;
    const fail=(opts.pass!=null&&b0<opts.pass);
    ctx.fillStyle=opts.bin?(isBin?(fail?'#e06666':'#1f6feb'):(fail?'#f3cccc':'#c9d8e8')):(fail?'#e06666':(onBinClick?'#1f6feb':'#1769aa'));   /* 选了某一段时，其它段变浅，一眼看出只看这一段 */
    let x=X(i)+2.5,y=Y(c);ctx.fillRect(x,y,barw,h-pad.b-y);
    if(isBin){ctx.strokeStyle='#0b4f9e';ctx.lineWidth=2;ctx.strokeRect(x,y,barw,h-pad.b-y);ctx.lineWidth=1}
    ctx.fillStyle='#52606d';ctx.fillText(String(Math.round(b0)),X(i)+2,h-12);ctx.fillText(String(c),X(i)+2,y-4)});
  if(opts.pass!=null&&opts.pass>=lo&&opts.pass<=hi){let x=X((opts.pass-lo)/bw);ctx.strokeStyle='#c0392b';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#c0392b';ctx.fillText('及格 '+opts.pass,x+3,pad.t-6)}
  canvas.style.cursor=onBinClick?'pointer':'default';
  canvas.onclick=ev=>{if(!onBinClick)return;let rect=canvas.getBoundingClientRect(),x=(ev.clientX-rect.left)*(w/rect.width);if(x<pad.l-3||x>w-pad.r)return;let i=Math.floor((x-pad.l)/((w-pad.l-pad.r)/n));if(i<0||i>=n)return;onBinClick(+(lo+i*bw).toFixed(1),+(lo+(i+1)*bw).toFixed(1))};   /* 只选被点的那一段，不要把前面的分段一起带进来 */
}
function drawExamCharts(e){
  let c=cls(),subs=examSubjects(e),quiz=examType(e)==='quiz',active=activeStudents();
  if($('#subjectAverage')){
    if(quiz)histChart($('#subjectAverage'),active.map(s=>scoreOf(e,s.id,subs[0])).filter(v=>v!==null),`${subs[0]||''} 分数段分布（${e.name}）`);
    else barChart($('#subjectAverage'),subs.map(keyLabel),subs.map(x=>classAvg(e,x)),'各科全班平均分');
  }
  if($('#examGroupCompare')){let gs=c.groups.map(g=>{let a=active.filter(s=>s.group===g);return avgOf(a.map(s=>scoreOf(e,s.id,TOTAL)).filter(v=>v!==null))});barChart($('#examGroupCompare'),c.groups,gs,`各小组${quiz?'平均分':'平均总分'}（${e.name}）`)}
}
function barChart(c,l,v,t){lineChart(c,l,[{name:t,values:v}],t,true)} function drawPersonCharts(s){if(!s)return;let e=[...cls().exams].sort((a,b)=>a.date.localeCompare(b.date)),labels=e.map(x=>x.name),subjects=[...new Set(e.flatMap(x=>x.subjects))],selected=Array.isArray(window.subjectLines)?window.subjectLines:selPick('subjectLines','subject|'+scopeId(),['总分',...subjects]);window.subjectLines=selected;selSave('subjectLines','subject|'+scopeId(),selected);$('#chosenStudent').textContent=s.name;$('#subjectToggles').innerHTML=['总分',...subjects].map(x=>`<label><input class="subjectToggle" type="checkbox" value="${esc(x)}" ${selected.includes(x)?'checked':''}>${esc(x)}</label>`).join(' ');document.querySelectorAll('.subjectToggle').forEach(i=>i.onchange=()=>{window.subjectLines=[...document.querySelectorAll('.subjectToggle:checked')].map(x=>x.value);selSave('subjectLines','subject|'+scopeId(),window.subjectLines);drawPersonCharts(s)});let series=window.subjectLines.map(sub=>({name:sub,values:e.map(x=>sub==='总分'?(x.scores[s.id]?.total||0):(x.scores[s.id]?.values?.[sub]||0))})),ranks=e.map(x=>[...cls().students.filter(q=>q.active)].map(q=>({id:q.id,v:x.scores[q.id]?.total||0})).sort((a,b)=>b.v-a.v).findIndex(q=>q.id===s.id)+1);$('#personCharts').innerHTML='<canvas id="scoreLine" class="chart"></canvas><canvas id="rankLine" class="chart"></canvas>';lineChart($('#scoreLine'),labels,series.length?series:[{name:'无已选科目',values:e.map(()=>0)}],`${s.name} 各科及总分变化（悬停查看数值）`);lineChart($('#rankLine'),labels,[{name:'班级名次',values:ranks}],`${s.name} 班级名次变化（数值越小越好）`,true)}
function eventPool(){return scopedExams().slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||'')))}
function eventsFor(key,type,ignorePick){
  return eventPool().filter(e=>{
    let t=examType(e);
    if(type==='major'&&t!=='major')return false;
    if(type==='quiz'&&t!=='quiz')return false;
    if(key===TOTAL){if(t!=='major')return false}
    else if(key&&examSubjects(e).indexOf(key)<0)return false;
    if(window.anFromDate&&String(e.date)<window.anFromDate)return false;
    if(window.anToDate&&String(e.date)>window.anToDate)return false;
    if(!ignorePick&&window.anPicked!==undefined&&window.anPicked.indexOf(e.id)<0)return false;
    return true;
  });
}
function analysisKeys(type){let list=eventPool().filter(e=>type==='all'||examType(e)===type),subs=[...new Set(list.flatMap(e=>examSubjects(e)))],hasMajor=list.some(e=>examType(e)==='major');return [...(hasMajor?[TOTAL]:[]),...subs]}
function termOptions(){let ids=[db.term,...db.terms.filter(t=>t.id!==db.term).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||''))).map(t=>t.id),'all'];return ids.map(id=>`<option value="${id}" ${id===scopeId()?'selected':''}>${esc(id===db.term?'当前学期：'+termLabel(id):termLabel(id))}</option>`).join('')}
function typeTag(e){let q=examType(e)==='quiz';return `<span class="tag${q?' quiz':''}">${q?'小测':'大考'}</span>`}

function analysis(){
  let type=window.anScope||'all',keys=analysisKeys(type);
  let tabs=`<div class="tabs">${[['all','大考＋小测（合并曲线）'],['major','只看大考'],['quiz','只看小测']].map(a=>`<button class="${type===a[0]?'active':''}" data-type="${a[0]}">${a[1]}</button>`).join('')}</div>`;
  let bindTabs=()=>document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{window.anScope=b.dataset.type;window.anKey=null;window.anExam=null;render()});
  if(!keys.length){
    layout('成绩分析',tabs+`<button id="toExams" class="primary">去成绩管理导入</button>`,`<p class="empty">${esc(termLabel(scopeId()))} 里还没有成绩。导入大考或小测 Excel 后，这里会把两者按时间排在同一条曲线上。</p>`);
    bindTabs();$('#toExams').onclick=()=>{window.examTab=type==='quiz'?'quiz':'major';page='exams';render()};
    return;
  }
  if(!keys.includes(window.anKey))window.anKey=keys[0];
  let key=window.anKey,pickable=eventsFor(key,type,true);
  const anSig=type+'|'+key+'|'+scopeId();
  if(window.anSig!==anSig||window.anPicked===undefined){window.anSig=anSig;window.anPicked=selPick('anPicked',anSig,pickable.map(e=>e.id))}
  selSave('anPicked',anSig,window.anPicked);
  let es=eventsFor(key,type),names=activeStudents(),stu=stuById(window.anStudent||'');
  let rows=names.map(s=>{let vals=es.map(e=>scoreOf(e,s.id,key)),have=vals.filter(v=>v!==null);return {s,vals,avg:have.length?+(have.reduce((a,b)=>a+b,0)/have.length).toFixed(1):null,last:vals.length?vals[vals.length-1]:null}});
  let ranked=rows.filter(x=>x.last!==null).sort((a,b)=>b.last-a.last);ranked.forEach((x,i)=>x.rank=i+1);
  rows.sort((a,b)=>(a.rank??1e9)-(b.rank??1e9));
  let classVals=es.map(e=>classAvg(e,key)),marks=es.map(e=>examType(e)),latest=es[es.length-1];
  layout('成绩分析',tabs+`<select id="anTerm" title="选择学期">${termOptions()}</select><label>从 <input id="anFrom" type="date" value="${window.anFromDate||''}"></label><label>到 <input id="anTo" type="date" value="${window.anToDate||''}"></label><button id="anClear">清除时间</button><button id="exportMatrix">导出本页成绩</button>`,
  `<div class="chips">${keys.map(k=>`<button class="chip ${k===key?'active':''}" data-key="${esc(k)}">${esc(keyLabel(k))}</button>`).join('')}</div>
   <div class="filters"><label>看谁：</label><select id="anStudent">${options(names.map(s=>s.name),stu?stu.name:'','全班（只看均分走势）')}</select><button id="openLatest">看最近一次全班排名</button></div>
   <div class="hint"><b>选参考考试</b>（按名称勾选，顺序自动按时间排；不勾＝全部）：
     ${chipsHTML(pickable,'pick',window.anPicked,'这个范围里没有该科目的考试')}
     <button id="pickAll">全选</button><button id="pickNone">全不选</button><button id="pickInvert">反选</button>
   </div>
   <p class="hint">${es.length?`图上共 <b>${es.length}</b> 次：${es.map(e=>`${esc(e.name)}`).join('、')}`:'<b>当前一次考试都没选</b>（图表为空）：点上面的考试标签可以逐个勾选，或点“全选”。'}<br>横坐标是<b>考试名称</b>——点横坐标＝看那一次全班成绩；点表格里的分数＝该生历次波动折线；点表头＝该次全班排名。</p>
   <div class="chart-wrap"><canvas id="classTrend" class="chart" data-name="${esc(keyLabel(key))}走势"></canvas></div>
   <div class="legend"><span><b>■</b> 大考</span><span><b>●</b> 小测</span><span>— 班级均分</span><span>— 年级均分（录入后显示）</span><span>统计范围：${esc(termLabel(scopeId()))}</span></div>
   <div class="table-wrap"><table class="matrix"><thead><tr><th>姓名</th><th>小组</th>${es.map(e=>`<th class="clickable ${e.id===window.anExam?'focusCol':''}" onclick="openSubjectRanks('${e.id}','${esc(key)}')">${typeTag(e)}${esc(String(e.date).slice(5))}<span class="mini">${esc(e.name)}</span></th>`).join('')}<th>均分</th><th>最近名次</th></tr></thead>
   <tbody>${rows.map(x=>`<tr><td>${esc(x.s.name)}</td><td>${esc(x.s.group)}</td>${x.vals.map((v,i)=>`<td class="cell ${v===null?'':(v>=classVals[i]?'up':'down')}" title="点击查看 ${esc(x.s.name)} 的${esc(keyLabel(key))}折线" onclick="openStudentTrend('${x.s.id}','${esc(key)}','${type}')">${v===null?'—':fmtN(v)}</td>`).join('')}<td><b>${fmtN(x.avg)}</b></td><td class="rank">${x.rank||'—'}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">没有可显示的成绩</td></tr>`}</tbody></table></div>`);
  bindTabs();
  $('#anTerm').onchange=e=>{window.scopeTerm=e.target.value;window.anExam=null;render()};
  $('#anFrom').onchange=e=>{window.anFromDate=e.target.value;render()};
  $('#anTo').onchange=e=>{window.anToDate=e.target.value;render()};
  $('#anClear').onclick=()=>{window.anFromDate='';window.anToDate='';render()};
  document.querySelectorAll('.chip[data-key]').forEach(b=>b.onclick=()=>{window.anKey=b.dataset.key;window.anExam=null;window.anPicked=undefined;render()});
  document.querySelectorAll('.chip[data-pick]').forEach(b=>b.onclick=()=>{let id=b.dataset.pick,cur=window.anPicked||[];window.anPicked=cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id);render()});
  $('#pickAll').onclick=()=>{window.anPicked=pickable.map(e=>e.id);render()};
  $('#pickNone').onclick=()=>{window.anPicked=[];render()};
  $('#pickInvert').onclick=()=>{let cur=window.anPicked||[];window.anPicked=pickable.map(e=>e.id).filter(id=>!cur.includes(id));render()};
  $('#anStudent').onchange=e=>{let s=findStudent(e.target.value);window.anStudent=s?s.id:'';render()};
  $('#openLatest').onclick=()=>{if(!latest)return toast('还没有成绩');window.anExam=latest.id;openSubjectRanks(latest.id,key)};
  $('#exportMatrix').onclick=()=>{let out=rows.map(x=>{let o={姓名:x.s.name,小组:x.s.group};es.forEach((e,i)=>o[`${e.date} ${e.name}(${examType(e)==='major'?'大考':'小测'})`]=x.vals[i]==null?'':x.vals[i]);o['均分']=x.avg??'';o['最近名次']=x.rank||'';return o});exportXlsx(`${keyLabel(key)}_成绩表_${termLabel(scopeId())}`,out)};
  let gradeVals=es.map(e=>scoreOfGrade(e,key));
  let series=[{name:'班级均分',values:classVals,marks}];
  if(gradeVals.some(v=>v!==null))series.push({name:'年级均分',values:gradeVals.map(v=>v??0),marks:es.map(()=>'major')});
  if(stu)series.unshift({name:stu.name,values:es.map(e=>scoreOf(e,stu.id,key)??0),marks});
  lineChart($('#classTrend'),es.map(e=>e.name),series,`${keyLabel(key)} 走势（${termLabel(scopeId())}）：${stu?stu.name:'班级均分'}　■ 大考　● 小测`,false,i=>{if(es[i])openSubjectRanks(es[i].id,key)});
  attachChartTools(document);
}

window.openSubjectRanks=(id,key)=>{
  let e=cls().exams.find(x=>x.id===id);if(!e)return;
  let rows=activeStudents().map(s=>({s,v:scoreOf(e,s.id,key)})).filter(x=>x.v!==null).sort((a,b)=>b.v-a.v);
  let vals=rows.map(x=>x.v),avg=avgOf(vals),gv=scoreOfGrade(e,key);
  const c=cls(),subj=key===TOTAL?'':key;
  if(!c.passLines)c.passLines={};
  let fullScore=examFull(e,key)||Math.round(Math.max(...vals,1)/0.6/10)*10; // 卷面分：导入时设置过的按设置来（总分取各科之和），没设过就按班级最高分推算
  let defPass=Math.round(fullScore*0.6);                              // 默认 60% 及格 → 90 / 60
  const pk=subj||'总分';
  let pass=+(c.passLines[pk]??defPass);
  window.__rankBin=null;
  modal(`${esc(e.name)} · ${esc(keyLabel(key))} 全班成绩`,
    `<div class="stat-row" id="rankStat"></div>
     <div class="filters"><label>卷面分 <input id="rankFull" type="number" min="1" step="1" value="${fullScore}" style="width:90px"></label><label>及格分 <input id="rankPass" type="number" step="1" value="${pass}" style="width:82px"></label><span class="mini">默认按卷面分的 60%（语数英 150→90，物化生政史地 100→60），可改成你们学校的线；卷面分会按科目记住</span></div>
     <div class="chart-wrap"><canvas id="rankHist" class="chart" data-name="${esc(e.name)}_${esc(keyLabel(key))}_分数段"></canvas></div>
     <p class="hint">红色柱子＝不及格区间。<b>点某一根柱子＝下面只显示这一段的学生</b>（例如点 606 那根，就只列 606~620 分的人，别的分段不会出现），点“显示全部”恢复全班名单。</p>
     <div id="rankHead"></div><div class="table-wrap" style="max-height:320px"><table><thead><tr><th>名次</th><th>姓名</th><th>小组</th><th>${esc(keyLabel(key))}</th><th>与班级均分差</th>${gv!==null?'<th>与年级均分差</th>':''}<th>波动</th></tr></thead><tbody id="rankBody"></tbody></table></div>`,null,'关闭');
  const drawHist=()=>histChart($('#rankHist'),vals,`${keyLabel(key)} 分数段分布（${e.date}）　点柱子可看该段名单`,(lo,hi)=>{window.__rankBin=[lo,hi];drawHist();paint()},{pass,bin:window.__rankBin});
  let paint=()=>{
    let bin=window.__rankBin,list=rows.map((x,i)=>({...x,rank:i+1})).filter(x=>!bin||(x.v>=bin[0]&&x.v<bin[1]));
    const okN=rows.filter(x=>x.v>=pass).length,badN=rows.length-okN;
    $('#rankStat').innerHTML=`<span>参考 <b>${vals.length}</b> 人</span><span>班级均分 <b>${fmtN(avg)}</b></span>${gv!==null?`<span>年级均分 <b>${fmtN(gv)}</b></span>`:''}<span>最高 <b>${vals.length?fmtN(Math.max(...vals)):'—'}</b></span><span>最低 <b>${vals.length?fmtN(Math.min(...vals)):'—'}</b></span><span>中位数 <b>${fmtN(medianOf(vals))}</b></span><span>及格（≥${pass}）<b class="positive">${okN}</b> 人</span><span>不及格 <b class="negative">${badN}</b> 人</span>`;
    $('#rankHead').innerHTML=bin?`<p class="hint">当前只看 <b>${bin[0]} ~ ${bin[1]}</b> 分：<b>${list.length}</b> 人（共 ${rows.length} 人）　<button id="rankAll">显示全部</button></p>`:'';
    if($('#rankAll'))$('#rankAll').onclick=()=>{window.__rankBin=null;paint()};
    $('#rankBody').innerHTML=list.map(x=>`<tr><td class="rank">${x.rank}</td><td>${esc(x.s.name)}</td><td>${esc(x.s.group)}</td><td><b>${fmtN(x.v)}</b></td><td class="${x.v>=avg?'positive':'negative'}">${x.v>=avg?'+':''}${fmtN(x.v-avg)}</td>${gv!==null?`<td class="${x.v>=gv?'positive':'negative'}">${x.v>=gv?'+':''}${fmtN(x.v-gv)}</td>`:''}<td><button onclick="openStudentTrend('${x.s.id}','${esc(key)}','all')">波动图</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">该分数段没有学生</td></tr>';
    const wrap=$('#rankBody').closest('.table-wrap');if(wrap)wrap.scrollTop=0;   /* 换段后名单回到顶部 */
  };
  $('#rankPass').oninput=$('#rankPass').onchange=ev=>{const v=+ev.target.value;if(!v||v<=0)return;pass=v;c.passLines[pk]=v;save();paint();drawHist()};
  $('#rankFull').oninput=$('#rankFull').onchange=ev=>{
    const v=+ev.target.value;if(!v||v<=0)return;
    const wasDefault=pass===defPass;                 /* 及格分还是默认值时才跟着卷面分一起变 */
    fullScore=v;setFull(pk,v);defPass=Math.round(v*0.6);
    if(wasDefault){pass=defPass;c.passLines[pk]=pass;$('#rankPass').value=pass}
    save();paint();drawHist();
  };
  paint();
  drawHist();
  attachChartTools(document);
};

window.openStudentTrend=(sid,key,type)=>{
  let s=stuById(sid);if(!s)return;
  let k=key||window.anKey||TOTAL,t=type||window.anScope||'all',es=eventsFor(k,t);
  if(!es.length)return toast('这个范围内没有该科目的成绩');
  let mine=es.map(e=>scoreOf(e,s.id,k)),cv=es.map(e=>classAvg(e,k)),marks=es.map(e=>examType(e)),have=mine.filter(v=>v!==null);
  let gvs=es.map(e=>scoreOfGrade(e,k)),hasG=gvs.some(v=>v!==null);
  modal(`${esc(s.name)} · ${esc(keyLabel(k))} 成绩波动`,`<div class="stat-row"><span>共 <b>${have.length}</b> 次</span><span>个人均分 <b>${fmtN(avgOf(have))}</b></span><span>班级均分 <b>${fmtN(avgOf(cv))}</b></span>${hasG?`<span>年级均分 <b>${fmtN(avgOf(gvs.filter(v=>v!==null)))}</b></span>`:''}<span>最高 <b>${have.length?fmtN(Math.max(...have)):'—'}</b></span><span>最低 <b>${have.length?fmtN(Math.min(...have)):'—'}</b></span></div><div class="chart-wrap"><canvas id="stuTrend" class="chart" data-name="${esc(s.name)}_${esc(keyLabel(k))}_波动"></canvas></div><div class="table-wrap" style="max-height:280px"><table><thead><tr><th>类型</th><th>名称</th><th>日期</th><th>个人</th><th>班级均分</th>${hasG?'<th>年级均分</th>':''}<th>与班级均分差</th></tr></thead><tbody>${es.map((e,i)=>`<tr><td>${typeTag(e)}</td><td>${esc(e.name)}</td><td>${esc(e.date)}</td><td class="rank">${fmtN(mine[i])}</td><td>${fmtN(cv[i])}</td>${hasG?`<td>${fmtN(gvs[i])}</td>`:''}<td class="${mine[i]==null||cv[i]==null?'':(mine[i]>=cv[i]?'positive':'negative')}">${mine[i]==null||cv[i]==null?'—':(mine[i]>=cv[i]?'+':'')+fmtN(mine[i]-cv[i])}</td></tr>`).join('')}</tbody></table></div><p class="hint">横坐标是考试名称；点“分数段”图里的柱子可筛人，点表格里的“波动图”可继续看别的同学。</p>`,null,'关闭');
  let ser=[{name:s.name,values:mine.map(v=>v??0),marks},{name:'班级均分',values:cv,marks}];
  if(hasG)ser.push({name:'年级均分',values:gvs.map(v=>v??0),marks:es.map(()=>'major')});
  lineChart($('#stuTrend'),es.map(e=>e.name),ser,`${s.name} ${keyLabel(k)} 折线波动（■ 大考　● 小测）`,false,i=>{if(es[i])openSubjectRanks(es[i].id,k)});
  attachChartTools(document);
};

function scoreOfGrade(e,key){let g=e.grade;if(!g)return null;let v=key===TOTAL?g['总分']:g[key];v=+v;return isNaN(v)?null:v}
window.gradeModal=id=>{
  let e=cls().exams.find(x=>x.id===id);if(!e)return;
  let subs=examSubjects(e),extra=examType(e)==='major'?`<div class="field"><label>总分</label><input data-grade="总分" type="number" step="0.1" value="${e.grade&&e.grade['总分']!=null?e.grade['总分']:''}"></div>`:'';
  modal('录入年级均分（可选）',`<p class="hint">填这次考试各科的年级平均分，留空＝没有。填了以后，成绩分析里的折线图会多出一条“年级均分”对比线，个人曲线可以同时对比班级均分和年级均分。</p><div class="grid">${subs.map(x=>`<div class="field"><label>${esc(x)}</label><input data-grade="${esc(x)}" type="number" step="0.1" value="${e.grade&&e.grade[x]!=null?e.grade[x]:''}"></div>`).join('')}${extra}</div>`,()=>{
    let g={};document.querySelectorAll('[data-grade]').forEach(i=>{let v=i.value.trim();if(v!=='')g[i.dataset.grade]=+v});
    if(Object.keys(g).length)e.grade=g;else delete e.grade;
    save();closeModal();toast('年级均分已保存');render();
  });
};
function exportExam(e){let subs=examSubjects(e),quiz=examType(e)==='quiz',rows=activeStudents().map(s=>{let o={姓名:s.name,小组:s.group};subs.forEach(x=>o[x]=(scoreOf(e,s.id,x)??''));if(!quiz)o['总分']=(scoreOf(e,s.id,TOTAL)??'');return o});if(!rows.length)return toast('暂无数据');exportXlsx(`${e.name}_成绩`,rows)}
function exportExamTable(){let out=[];['major','quiz'].forEach(t=>examsOf(t).forEach(e=>{let subs=examSubjects(e),quiz=t==='quiz';activeStudents().forEach(s=>{let o={类型:quiz?'小测':'大考',名称:e.name,日期:e.date,姓名:s.name,小组:s.group};subs.forEach(x=>o[x]=(scoreOf(e,s.id,x)??''));if(!quiz)o['总分']=(scoreOf(e,s.id,TOTAL)??'');out.push(o)})}));if(!out.length)return toast('暂无成绩数据');exportXlsx('成绩总表',out)}
function exportExamTemplate(type){let ss=activeStudents();if(!ss.length)return toast('名单为空，请先导入或添加学生');let rows=type==='quiz'?ss.map(s=>({姓名:s.name,分数:''})):ss.map((s,i)=>({序号:i+1,姓名:s.name,语文:'',数学:'',英语:'',物理:'',化学:'',生物:'',政治:'',历史:'',地理:'',总分:''}));exportXlsx(type==='quiz'?'小测导入模板':'大考导入模板',rows)}
function historyPage(){   /* 名字不能叫 history：会盖住浏览器的历史对象，导致前进/后退失效 */
  let cohorts=db.cohorts.length?db.cohorts:['未分届'];
  let coh=(window.hisCohort&&cohorts.includes(window.hisCohort))?window.hisCohort:cohorts[0];
  let terms=db.terms.filter(t=>t.cohort===coh);
  if(!terms.length)terms=db.terms.slice();
  terms.sort((a,b)=>String(b.start||'').localeCompare(String(a.start||'')));
  let rows=terms.map(t=>{
    let ex=cls().exams.filter(e=>e.term===t.id),rec=cls().records.filter(r=>r.term===t.id),maj=ex.filter(e=>examType(e)==='major'),qz=ex.filter(e=>examType(e)==='quiz'),vals=[];
    maj.forEach(e=>activeStudents().forEach(s=>{let v=scoreOf(e,s.id,TOTAL);if(v!==null)vals.push(v)}));
    return {t,ex,maj,qz,rec,avg:avgOf(vals)};
  });
  let trend=rows.filter(r=>r.maj.length).slice().sort((a,b)=>String(a.t.start||'').localeCompare(String(b.t.start||'')));
  layout('历史学期',`<div class="tabs"><label>届：</label><select id="hisCohort">${cohorts.map(c=>`<option ${c===coh?'selected':''}>${esc(c)}</option>`).join('')}</select></div><button id="endTerm" class="primary">结束本学期并归档</button><button id="termAdmin">学期管理</button>`,
  `<p class="hint">量化数据按“届 / 学期”分开存放：主页面只统计当前学期 <b>${esc(termLabel(db.term))}</b>，学期结束后点“结束本学期并归档”，旧数据自动从主页面收起，随时可以在这里查回来、做学期走向分析或导出。</p>
   <div class="cards">${rows.map(r=>`<article class="stat"><span>${esc(r.t.name)}${r.t.id===db.term?'（当前学期）':''}${r.t.id===scopeId()?' · 正在查看':''}</span><b>${r.ex.length} 次考试</b><span>大考 ${r.maj.length} 次 · 小测 ${r.qz.length} 次 · 量化记录 ${r.rec.length} 条<br>大考总分均分 ${fmtN(r.avg)}　${esc(r.t.start||'')} ~ ${esc(r.t.end||'')}</span><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button onclick="viewTerm('${r.t.id}')">查看大考走向</button><button onclick="viewTermAll('${r.t.id}')">看该学期全部</button><button onclick="exportTerm('${r.t.id}')">导出成绩</button></div></article>`).join('')||'<p class="empty">还没有学期数据</p>'}</div>
   ${trend.length>1?`<h3>各学期大考总分均分走向（${esc(coh)}）</h3><canvas id="termTrend" class="chart"></canvas>`:''}`);
  $('#hisCohort').onchange=e=>{window.hisCohort=e.target.value;render()};
  $('#endTerm').onclick=endTerm;
  $('#termAdmin').onclick=termAdmin;
  if(trend.length>1)lineChart($('#termTrend'),trend.map(r=>r.t.name),[{name:'大考总分均分',values:trend.map(r=>r.avg)}],`各学期大考总分均分走向（${coh}）`);
}
window.viewTerm=(id,key)=>{window.scopeTerm=id;window.anScope='major';window.anKey=key||TOTAL;window.anExam=null;window.anFromDate='';window.anToDate='';page='analysis';render()};
window.viewTermAll=id=>{window.scopeTerm=id;window.anScope='all';window.anKey=null;window.anExam=null;window.anFromDate='';window.anToDate='';page='analysis';render()};
window.exportTerm=id=>{
  let es=cls().exams.filter(e=>e.term===id),out=[];
  es.forEach(e=>{let subs=examSubjects(e),q=examType(e)==='quiz';activeStudents().forEach(s=>{let o={学期:termLabel(id),类型:q?'小测':'大考',名称:e.name,日期:e.date,姓名:s.name,小组:s.group};subs.forEach(x=>o[x]=(scoreOf(e,s.id,x)??''));if(!q)o['总分']=(scoreOf(e,s.id,TOTAL)??'');out.push(o)})});
  if(!out.length)return toast('这个学期暂无成绩');
  exportXlsx(termLabel(id)+'_成绩',out);
};
function termAdmin(){
  modal('学期管理',`<p>一个“届”下面可以有多个学期。学期的起止日期用于把成绩、量化记录自动归入对应学期。</p><div class="table-wrap" style="max-height:280px"><table><thead><tr><th>届</th><th>学期</th><th>开始</th><th>结束</th><th>操作</th></tr></thead><tbody>${db.terms.map(t=>`<tr><td>${esc(t.cohort||'—')}</td><td>${esc(t.name)}${t.id===db.term?' <span class="tag">当前</span>':''}</td><td>${esc(t.start||'')}</td><td>${esc(t.end||'')}</td><td class="actions"><button onclick="termEdit('${t.id}')">编辑</button>${t.id===db.term?'':`<button onclick="termSetCurrent('${t.id}')">设为当前</button><button class="danger" onclick="termDel('${t.id}')">删除</button>`}</td></tr>`).join('')}</tbody></table></div><p class="hint">改完学期日期后，可回到“数据管理”点“按日期重新归入学期”，把历史成绩重新分配到正确的学期。</p>`,null,'关闭');
}
window.termEdit=id=>{
  let t=termById(id),isNew=!t;t=t||{id:uid(),name:'',cohort:(db.cohorts[0]||''),start:'',end:''};
  modal(isNew?'新增学期':'编辑学期',`<div class="grid"><div class="field"><label>届（如 2027届）</label><input id="tCohort" value="${esc(t.cohort||'')}" list="cohortList"><datalist id="cohortList">${db.cohorts.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label>学期名称</label><input id="tName" value="${esc(t.name)}" placeholder="如 2026-2027学年第一学期"></div><div class="field"><label>开始日期</label><input id="tStart" type="date" value="${t.start||''}"></div><div class="field"><label>结束日期</label><input id="tEnd" type="date" value="${t.end||''}"></div></div>`,()=>{
    t.cohort=$('#tCohort').value.trim();t.name=$('#tName').value.trim()||'未命名学期';t.start=$('#tStart').value;t.end=$('#tEnd').value;
    if(isNew&&!db.terms.some(x=>x.id===t.id))db.terms.push(t);
    db.cohorts=[...new Set(db.terms.map(x=>x.cohort).filter(Boolean))];
    reassignTerms();save();closeModal();toast('学期已保存');render();
  });
};
window.termSetCurrent=id=>{if(!confirm('把这个学期设为当前学期？新录入的成绩与量化记录都会记到它下面。'))return;db.term=id;window.scopeTerm=id;reassignTerms();save();render();toast('已设为当前学期')};
window.termDel=id=>{
  let t=termById(id);if(!t)return;
  let n=cls().exams.filter(e=>e.term===id).length+cls().records.filter(r=>r.term===id).length;
  if(n&&!confirm(`这个学期下面还有 ${n} 条数据。删除学期后这些数据会转到当前学期，确定删除？`))return;
  db.terms=db.terms.filter(x=>x.id!==id);
  cls().records.forEach(r=>{if(r.term===id)r.term=db.term});cls().exams.forEach(e=>{if(e.term===id)e.term=db.term});
  db.cohorts=[...new Set(db.terms.map(x=>x.cohort).filter(Boolean))];
  if(window.scopeTerm===id)window.scopeTerm=db.term;
  save();render();toast('已删除学期');
};
function reassignTerms(){let c=cls();c.records.forEach(r=>{let t=termOfDate(r.date);if(t)r.term=t.id});c.exams.forEach(e=>{let t=termOfDate(e.date);if(t)e.term=t.id})}
function endTerm(){
  let cur=curTerm(),rng=nextTermRange(cur);
  modal('结束本学期并归档',`<p>把 <b>${esc(cur.name)}</b> 归档：它的成绩与量化记录会从主页面收起，可以在“历史学期”里查询、分析和导出，然后开始新学期。</p><div class="grid"><div class="field"><label>新学期名称</label><input id="ntName" value="${esc(nextTermName(cur.name))}"></div><div class="field"><label>届（如 2027届）</label><input id="ntCohort" value="${esc(cur.cohort||'')}" list="cohortList3"><datalist id="cohortList3">${db.cohorts.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div><div class="field"><label>开始日期</label><input id="ntStart" type="date" value="${rng.start}"></div><div class="field"><label>结束日期</label><input id="ntEnd" type="date" value="${rng.end}"></div></div><p class="hint">学生名单、小组和赋分规则会带到新学期，不用重建；成绩与量化记录从零开始统计。</p>`,()=>{
    let t={id:uid(),name:$('#ntName').value.trim()||nextTermName(cur.name),cohort:$('#ntCohort').value.trim(),start:$('#ntStart').value,end:$('#ntEnd').value};
    db.terms.push(t);db.cohorts=[...new Set(db.terms.map(x=>x.cohort).filter(Boolean))];
    db.term=t.id;window.scopeTerm=t.id;window.hisCohort=t.cohort||window.hisCohort;
    save();closeModal();page='history';window.anKey=null;window.anExam=null;render();toast('新学期已开始：'+t.name);
  });
}

/* ---------- 登录 / 账号（服务器模式） ---------- */
function showLogin(startRegister){
  sessionStorage.removeItem('wantRegister');
  $('#login').hidden=false;$('#app').hidden=true;
  $('#lgUser').value='';$('#lgPass').value='';$('#lgName').value='';$('#lgInvite').value='';
  $('#lgToggle').onclick=()=>setLoginMode($('#lgName').hidden);
  $('#lgBtn').onclick=doLogin;
  $('#lgPass').onkeydown=e=>{if(e.key==='Enter')doLogin()};
  $('#lgForgot').onclick=forgotPassword;
  $('#lgForgot').hidden=loginMode!=='local';
  setLoginMode(!!startRegister);
  setTimeout(()=>$('#lgUser').focus(),50);
}
function setLoginMode(register){
  let local=loginMode==='local';
  $('#lgName').hidden=!register;
  $('#lgInvite').hidden=!(register&&!local);
  if(local){
    $('#lgFoot').textContent='账号和数据都保存在这台电脑上（浏览器存储里）。换电脑时用“数据管理 → 导出 JSON 备份 / 导入 JSON 备份”把数据搬过去。';
    $('#lgBtn').textContent=register?'创建本机账号':'登录';
    $('#lgToggle').textContent=register?'已经有账号？去登录':'第一次使用？创建一个本机账号';
    $('#loginTip').textContent=register
      ? '在这台电脑上创建一个账号（用户名＋密码，自己记住就行）。账号和数据都只保存在这台电脑上，不会上传到网上。'
      : '本机账号：数据保存在这台电脑上。同一台电脑可以给多位老师各建一个账号，互相看不到对方的数据。';
  }else{
    $('#lgFoot').textContent='账号由服务器统一保管：换一台电脑、用手机，只要打开同一个网址登录同一账号，就能看到自己的班级数据。同事使用不需要安装任何软件。';
    $('#lgBtn').textContent=register?'用邀请码注册':'登录';
    $('#lgToggle').textContent=register?'已经有账号？去登录':'没有账号？用邀请码注册';
    $('#loginTip').textContent=register
      ? '注册需要邀请码，请向管理员索取（启动服务器的窗口里会显示）。'+(window.__inviteRequired?'':' 这是第一台服务器，第一个注册的账号将成为管理员。')
      : '输入用户名和密码登录。同事只需打开这个网址，不用安装任何软件。';
  }
}
async function doLogin(){
  let username=$('#lgUser').value.trim(),password=$('#lgPass').value,register=$('#lgName').hidden===false;
  if(!username||!password){$('#loginTip').textContent='请输入用户名和密码';return}
  $('#lgBtn').disabled=true;$('#loginTip').textContent=register?'正在创建…':'正在登录…';
  if(loginMode==='local'){
    try{
      loadLocalUsers();
      if(register){
        if(username.length<2)throw new Error('用户名至少 2 个字');
        if(password.length<4)throw new Error('密码至少 4 位（本机账号，方便记忆即可）');
        if(localUsers.some(u=>u.username===username))throw new Error('这台电脑上已经有同名账号了');
        let salt=Math.random().toString(36).slice(2,12);
        let u={id:'u'+Date.now().toString(36),username,name:$('#lgName').value.trim()||username,salt,hash:await pbkdf2(password,salt),createdAt:new Date().toISOString()};
        localUsers.push(u);saveLocalUsers();
        localStorage.setItem(CURKEY,u.id);user=u;afterLogin();
      }else{
        let u=localUsers.find(x=>x.username===username);
        if(!u||await pbkdf2(password,u.salt)!==u.hash)throw new Error('用户名或密码不正确（忘记密码可点下面“忘记密码？”）');
        localStorage.setItem(CURKEY,u.id);user=u;afterLogin();
      }
    }catch(e){$('#loginTip').textContent=e.message;$('#lgBtn').disabled=false;return}
    return;
  }
  try{
    await api(register?'/api/register':'/api/login',{method:'POST',body:JSON.stringify({username,password,name:$('#lgName').value.trim(),invite:$('#lgInvite').value.trim()})});
    location.reload();
  }catch(e){$('#loginTip').textContent=e.message;$('#lgBtn').disabled=false}
}
function forgotPassword(){
  loadLocalUsers();
  let name=prompt('忘记密码：输入你的用户名（本机账号，数据不会被删除，只是重设密码）：');
  if(!name)return;
  let u=localUsers.find(x=>x.username===name.trim());
  if(!u)return alert('这台电脑上没有这个账号：'+name);
  let np=prompt('给「'+u.name+'」设置新密码（至少 4 位）：');
  if(!np||np.length<4)return alert('密码太短，已取消');
  u.salt=Math.random().toString(36).slice(2,12);
  pbkdf2(np,u.salt).then(h=>{u.hash=h;saveLocalUsers();$('#loginTip').textContent='密码已重设，请用新密码登录。';$('#lgBtn').disabled=false});
}
function logout(){
  if(mode==='server'){
    if(!confirm('退出登录？数据已经保存在服务器上，换台电脑登录同一账号就能看到。'))return;
    api('/api/logout',{method:'POST'}).catch(()=>{}).then(()=>location.reload());
  }else{
    if(!confirm('退出登录？数据保存在这台电脑上，重新登录同一账号即可看到。'))return;
    localStorage.removeItem(CURKEY);location.reload();
  }
}
window.passModal=()=>modal('修改密码',`<div class="grid"><div class="field"><label>原密码</label><input id="pwOld" type="password"></div><div class="field"><label>新密码${mode==='local'?'（至少 4 位）':'（至少 6 位）'}</label><input id="pwNew" type="password"></div></div>`,async()=>{
  let o=$('#pwOld').value,n=$('#pwNew').value,min=mode==='local'?4:6;
  if(n.length<min)return toast('新密码至少 '+min+' 位');
  if(mode==='local'){loadLocalUsers();let u=localUsers.find(x=>x.id===user.id);if(!u)return toast('账号不存在');if(await pbkdf2(o,u.salt)!==u.hash)return toast('原密码不正确');u.salt=Math.random().toString(36).slice(2,12);u.hash=await pbkdf2(n,u.salt);saveLocalUsers();closeModal();toast('密码已修改');return}
  try{await api('/api/password',{method:'POST',body:JSON.stringify({old:o,new:n})});closeModal();toast('密码已修改')}catch(e){toast(e.message)}
});
window.nameModal=()=>modal('修改我的姓名',`<div class="grid"><div class="field"><label>显示姓名</label><input id="pfName" value="${esc(user?user.name:'')}"></div></div>`,async()=>{
  let v=$('#pfName').value.trim();if(!v)return toast('请输入姓名');
  if(mode==='local'){loadLocalUsers();let u=localUsers.find(x=>x.id===user.id);if(u){u.name=v;saveLocalUsers();user=u}closeModal();render();toast('已保存');return}
  try{let d=await api('/api/profile',{method:'POST',body:JSON.stringify({name:v})});user=d.user;closeModal();render();toast('已保存')}catch(e){toast(e.message)}
});
window.toggleUser=async(id,active)=>{try{await api('/api/admin/users/'+id,{method:'POST',body:JSON.stringify({active})});loadUsers();toast(active?'已启用':'已停用')}catch(e){toast(e.message)}};
/* 本机账号管理（数据都在本机） */
function localUsersPage(){
  loadLocalUsers();
  let sizeOf=u=>{let s=localStorage.getItem(dataKey(u.id));return s?Math.max(1,Math.round(s.length/1024))+' KB':'空'};
  layout('账号管理',`<button id="newLocalUser" class="primary">新建本机账号</button><button id="bindFile2">本机自动备份文件…</button>`,
  `<p class="hint">这些账号和它们的数据都保存在<b>这台电脑</b>上（浏览器存储里），不会上传到网上。同一台电脑可以给多位老师各建一个账号，互相看不到对方的数据；换电脑请用“导出 JSON 备份／导入 JSON 备份”搬过去。</p>
   <div class="cards">${localUsers.map(u=>`<article class="stat"><span>${esc(u.username)}${u.id===user.id?' · 当前登录':''}</span><b>${esc(u.name)}</b><span>数据 ${sizeOf(u)}　创建于 ${esc((u.createdAt||'').slice(0,10))}</span><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${u.id===user.id?'<button onclick="nameModal()">改我的姓名</button><button onclick="passModal()">改我的密码</button>':'<button onclick="switchLocalUser(\''+u.id+'\')">切换到该账号</button>'}<button onclick="resetLocalPass('${u.id}')">重置密码</button>${localUsers.length>1?`<button class="danger" onclick="delLocalUser('${u.id}')">删除账号</button>`:''}</div></article>`).join('')||'<p class="empty">还没有本机账号</p>'}</div>`);
  $('#newLocalUser').onclick=()=>{localStorage.removeItem(CURKEY);sessionStorage.setItem('wantRegister','1');location.reload()};
  $('#bindFile2').onclick=bindBackupFile;
}
window.switchLocalUser=id=>{loadLocalUsers();let u=localUsers.find(x=>x.id===id);if(!u)return toast('账号不存在');if(!confirm('切换到「'+u.name+'」？当前账号的数据已经保存在这台电脑上。'))return;localStorage.setItem(CURKEY,id);location.reload()};
window.resetLocalPass=id=>{loadLocalUsers();let u=localUsers.find(x=>x.id===id);if(!u)return;let p=prompt('给「'+u.name+'」设置新密码（至少 4 位）：');if(!p||p.length<4)return alert('密码太短，已取消');u.salt=Math.random().toString(36).slice(2,12);pbkdf2(p,u.salt).then(h=>{u.hash=h;saveLocalUsers();toast('密码已重设');localUsersPage()})};
window.delLocalUser=id=>{loadLocalUsers();let u=localUsers.find(x=>x.id===id);if(!u)return;if(!confirm('删除本机账号「'+u.name+'」？该账号的数据会一起从这台电脑删除，不能恢复。\n（建议先登录该账号导出 JSON 备份）'))return;localStorage.removeItem(dataKey(id));localUsers=localUsers.filter(x=>x.id!==id);saveLocalUsers();if(!localUsers.length){localStorage.removeItem(CURKEY);location.reload();return}if(user.id===id){localStorage.setItem(CURKEY,localUsers[0].id);location.reload();return}render();toast('已删除本机账号')};
window.resetUserPass=async(id,name)=>{let p=prompt('给“'+name+'”设置新密码（至少 6 位）');if(!p)return;try{await api('/api/admin/users/'+id,{method:'POST',body:JSON.stringify({password:p})});toast('密码已重置')}catch(e){toast(e.message)}};
window.delUser=async(id,name)=>{if(!confirm('删除账号“'+name+'”？该账号的班级数据会一起删除，不能恢复。'))return;try{await api('/api/admin/users/'+id,{method:'DELETE'});loadUsers();toast('已删除')}catch(e){toast(e.message)}};

function users(){
  if(mode!=='server')return localUsersPage();
  if(!user||user.role!=='admin')return layout('账号管理','',`<p class="empty">只有管理员可以管理账号。</p>`);
  layout('账号管理',`<button id="newUser" class="primary">新建老师账号</button><button id="newInvite">刷新邀请码</button><button onclick="nameModal()">改我的姓名</button><button onclick="passModal()">改我的密码</button>`,
  `<p class="hint">把这个网址发给同事：<b>${esc(location.origin)}</b>　同事用电脑或手机浏览器打开即可使用，<b>不需要下载安装任何软件</b>。每个账号的班级、成绩、学期数据互相独立。</p><div id="userList" class="cards"><p class="empty">正在读取…</p></div>`);
  $('#newUser').onclick=newUserModal;$('#newInvite').onclick=refreshInvite;
  loadUsers();
}
async function loadUsers(){
  try{
    let d=await api('/api/admin/users');
    $('#userList').innerHTML=`<article class="stat"><span>邀请码（新老师注册用）</span><b id="inviteCode">${esc(d.invite)}</b><span>点“刷新邀请码”可作废旧码</span></article>`+
      d.users.map(u=>`<article class="stat"><span>${esc(u.username)}${u.role==='admin'?' · 管理员':''}${u.active?'':' · 已停用'}</span><b>${esc(u.name)}</b><span>数据 ${u.size?Math.round(u.size/1024)+' KB':'空'}　最近登录 ${esc((u.lastLogin||'').slice(0,16).replace('T',' '))||'—'}</span><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${u.id===user.id?'<button onclick="nameModal()">改姓名</button><button onclick="passModal()">改密码</button>':`<button onclick="toggleUser('${u.id}',${u.active?'false':'true'})">${u.active?'停用':'启用'}</button><button onclick="resetUserPass('${u.id}','${esc(u.username)}')">重置密码</button><button class="danger" onclick="delUser('${u.id}','${esc(u.username)}')">删除</button>`}</div></article>`).join('');
  }catch(e){$('#userList').innerHTML=`<p class="empty">读取失败：${esc(e.message)}</p>`}
}
function newUserModal(){modal('新建老师账号',`<div class="grid"><div class="field"><label>用户名（登录用）</label><input id="nuUser" placeholder="如 wanglaoshi"></div><div class="field"><label>姓名</label><input id="nuName" placeholder="如 王老师"></div><div class="field"><label>初始密码（至少 6 位）</label><input id="nuPass" value="123456"></div></div><p class="hint">把网址、用户名、初始密码告诉这位老师，让他登录后自行修改密码。</p>`,async()=>{try{await api('/api/admin/users',{method:'POST',body:JSON.stringify({username:$('#nuUser').value.trim(),name:$('#nuName').value.trim(),password:$('#nuPass').value})});closeModal();loadUsers();toast('已创建账号')}catch(e){toast(e.message)}})}
async function refreshInvite(){try{let d=await api('/api/admin/invite',{method:'POST'});loadUsers();toast('新邀请码：'+d.invite)}catch(e){toast(e.message)}}

/* ---------- 纯网页版：数据留在老师电脑上 + 自动写入本机备份文件 ---------- */
let backupHandle=null;
function idbOpen(){return new Promise((res,rej)=>{let r=indexedDB.open('class-score-fs',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbSet(k,v){let d=await idbOpen();return new Promise((res,rej)=>{let t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
async function idbGet(k){let d=await idbOpen();return new Promise((res,rej)=>{let q=d.transaction('kv','readonly').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
function backupAt(){return +(localStorage.getItem(KEY+':backupAt')||0)}
async function loadBackupHandle(){
  if(!window.showSaveFilePicker)return;
  try{
    backupHandle=(await idbGet('backupHandle'))||null;
    if(backupHandle){let p=await backupHandle.queryPermission({mode:'readwrite'});if(p==='granted')await writeBackup(true)}
  }catch(e){console.warn('读取备份文件句柄失败',e)}
  if(page==='data')enhanceDataPage();
}
async function bindBackupFile(){
  if(!window.showSaveFilePicker)return toast('这个浏览器不支持自动写文件，请用“导出 JSON 备份”手动备份（推荐 Chrome / Edge）');
  try{
    backupHandle=await window.showSaveFilePicker({suggestedName:(cls()?cls().name:'班级评价')+'_数据备份.json',types:[{description:'JSON 备份文件',accept:{'application/json':['.json']}}]});
    await idbSet('backupHandle',backupHandle);
    await writeBackup();
    toast('已绑定本机文件，之后每次改动都会自动写入');
    render();
  }catch(e){if(!e||e.name!=='AbortError')toast('绑定失败：'+(e&&e.message))}
}
async function writeBackup(silent){
  if(!backupHandle)return;
  try{
    let p=await backupHandle.queryPermission({mode:'readwrite'});
    if(p!=='granted'){if(silent)return;p=await backupHandle.requestPermission({mode:'readwrite'})}
    if(p!=='granted')return;
    let w=await backupHandle.createWritable();await w.write(JSON.stringify(db));await w.close();
    localStorage.setItem(KEY+':backupAt',String(Date.now()));
    setSync('已保存（含本机备份文件）');
  }catch(e){if(!silent)toast('写入备份文件失败：'+e.message)}
}
function enhanceDataPage(){
  if(page!=='data'||mode==='server')return;
  let tools=document.querySelector('#main .toolbar');
  if(tools&&!document.querySelector('#bindFile')){
    tools.insertAdjacentHTML('beforeend','<button id="bindFile">本机自动备份文件…</button>');
    document.querySelector('#bindFile').onclick=bindBackupFile;
  }
  let at=backupAt(),days=at?Math.floor((Date.now()-at)/864e5):null;
  let note=backupHandle?'已绑定本机文件，改动会自动写入。':(at?('最近写入本机备份文件：'+new Date(at).toLocaleString('zh-CN')):'');
  let warn=!backupHandle||days===null||days>=7;
  $('#main').insertAdjacentHTML('afterbegin',`<div class="banner"><b>数据在这台电脑上</b>　当前本机账号：<b>${esc(user?user.name:'—')}</b>（${esc(user?user.username:'')}）。名单、量化记录、成绩都保存在这台电脑里，不上传网络；建议点“本机自动备份文件…”选一个文件（例如 D 盘的 班级评价数据.json），以后每次改动都会自动写进去。${note?' '+esc(note):''}${days!==null&&days>=7?'　⚠ 已 '+days+' 天没写入备份文件了。':''}${warn?'':' 也可随时“导出 JSON 备份”。'}</div>`);
}

$('#logoutBtn').onclick=logout;
$('#navBack').onclick=()=>navBack();
$('#navFwd').onclick=()=>navFwd();
document.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();navBack()}else if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();navFwd()}});

/* ===== 小组管理：分组名单的增删改 + 成员调整 ===== */
function groupEnsure(){const c=cls();if(!c.groups)c.groups=[];if(!c.groups.includes('未分组'))c.groups.push('未分组');return c}
window.groupAdd=()=>{
  const c=groupEnsure(),n=(prompt('新小组名称，例如：第八小组')||'').trim();
  if(!n)return;if(c.groups.includes(n))return toast('已经有这个小组了');
  c.groups.push(n);save();render();toast('已新建小组：'+n);
};
window.groupRename=old=>{
  const c=groupEnsure(),n=(prompt('把「'+old+'」改成：',old)||'').trim();
  if(!n||n===old)return;if(c.groups.includes(n))return toast('这个名称已经有了');
  c.groups=c.groups.map(g=>g===old?n:g);c.students.forEach(s=>{if(s.group===old)s.group=n});
  save();render();toast('已改名为 '+n);
};
window.groupDelete=g=>{
  const c=groupEnsure(),n=c.students.filter(s=>s.active&&s.group===g).length;
  if(!confirm('删除小组「'+g+'」？'+(n?`里面的 ${n} 名学生会被移到“未分组”。`:'')))return;
  c.groups=c.groups.filter(x=>x!==g);c.students.forEach(s=>{if(s.group===g)s.group='未分组'});
  save();render();toast('已删除小组');
};
window.groupRemove=id=>{
  const s=stuById(id);if(!s)return;groupEnsure();s.group='未分组';save();render();toast(s.name+' 已移出小组');
};
/* ===== 小组管理：卡片可点开详情；“加入”可选任何不在本组的学生 ===== */
window.groupJoin=(g,inputId,all)=>{
  const sel=$(inputId);if(!sel||!sel.value)return toast('先在下拉里选一名学生');
  const name=String(sel.value).replace(/（[^）]*）\s*$/,'').trim();
  const s=findStudent(name);if(!s)return toast('没找到这名学生：'+name);
  groupEnsure();s.group=g;save();render();toast(s.name+' 已加入 '+g);
};
window.groupAnalyze=g=>{window.grScope=window.grScope||'major';page='groups';render();toast('已切到小组分析：'+g)};
window.groupDetail=g=>{
  const c=groupEnsure(),act=c.students.filter(s=>s.active),ms=act.filter(s=>s.group===g);
  const recs=scopedRecords(),maj=examsOf('major');
  const rows=ms.map(s=>{
    const rule=recs.filter(r=>r.studentId===s.id).reduce((n,r)=>n+r.score,0);
    const total=maj.reduce((n,e)=>n+(scoreOf(e,s.id,TOTAL)||0),0);
    return {s,rule,total};
  }).sort((a,b)=>b.rule-a.rule||b.total-a.total);
  const avg=key=>rows.length?+(rows.reduce((n,r)=>n+r[key],0)/rows.length).toFixed(1):0;
  const others=act.filter(s=>s.group!==g);
  modal('小组详情：'+esc(g),
   `<div class="stat-row"><span>人数 <b>${ms.length}</b></span><span>量化均分 <b>${avg('rule')}</b></span><span>大考总分均分 <b>${avg('total')}</b></span></div>
    <div class="filters" onkeydown="event.stopPropagation()"><select id="gdPick">${options(others.map(s=>s.name+'（'+(s.group||'未分组')+'）'),'','把某位学生加入本组…')}</select><button id="gdAdd">加入本组</button><button id="gdRename">改名字</button><button id="gdDel" class="danger">删除小组</button><button id="gdAna">看小组分析</button></div>
    <div class="table-wrap" style="max-height:320px"><table><thead><tr><th>姓名</th><th>原小组</th><th>量化合计</th><th>大考总分合计</th><th>操作</th></tr></thead><tbody>
      ${rows.map(r=>`<tr style="cursor:pointer" onclick="closeModal();openStudentStat('${r.s.id}')"><td>${esc(r.s.name)}</td><td>${esc(r.s.group)}</td><td>${fmtN(r.rule)}</td><td>${fmtN(r.total)}</td><td><button onclick="event.stopPropagation();groupRemove('${r.s.id}')">移出本组</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">这个小组还没有成员：用上面的下拉把学生加进来</td></tr>'}
    </tbody></table></div><p class="mini">点任意一行 → 看这名学生的个人成绩统计；“移出本组”会把他放回“未分组”。</p>`,null,'关闭');
  $('#gdAdd').onclick=()=>groupJoin(g,'#gdPick');
  $('#gdRename').onclick=()=>{closeModal();groupRename(g)};
  $('#gdDel').onclick=()=>{closeModal();groupDelete(g)};
  $('#gdAna').onclick=()=>{closeModal();groupAnalyze(g)};
};

/* ===== 小组分析：量化 + 成绩（可自选参考考试） ===== */

/* ===== 小组管理：成员一人一行，卡片可点开详情 ===== */
function groupManage(){
  const c=groupEnsure(),act=c.students.filter(s=>s.active);
  const cards=c.groups.filter(g=>g!=='未分组').map((g,i)=>{
    const ms=act.filter(s=>s.group===g),others=act.filter(s=>s.group!==g);
    return `<article class="stat gcard">
      <div class="ghead"><span>第 ${i+1} 组 · ${ms.length} 人</span><b>${esc(g)}</b></div>
      <div class="memberlist">${ms.map(s=>`<div class="member"><span class="mname">${esc(s.name)}</span><button class="del" onclick="groupRemove('${s.id}')">移出</button></div>`).join('')||'<div class="member empty-member">还没有成员</div>'}</div>
      <div class="filters" style="margin-top:10px"><select id="join-${i}">${options(others.map(s=>s.name+'（'+(s.group||'未分组')+'）'),'','把学生加入本组…')}</select><button onclick="groupJoin('${esc(g)}','#join-${i}')">加入</button></div>
      <div class="gfoot"><button onclick="groupDetail('${esc(g)}')">看详情</button><button onclick="groupRename('${esc(g)}')">改名字</button><button onclick="groupDelete('${esc(g)}')">删除</button></div>
    </article>`}).join('');
  layout('小组管理',
    `<button id="gAdd" class="primary">新建小组</button><button id="gImport">导入小组名单 Excel</button><button id="gTpl">下载名单模板</button><button id="gAna">小组分析</button>`,
    `<p class="hint">成员<b>一人一行</b>，点右侧“移出”回到未分组；下面的下拉可以把<b>任何学生</b>（包括从别的小组）直接调进本组；“看详情”能看到本组成员与成绩明细。</p>
     <div class="cards widecards">${cards||'<p class="empty">还没有小组，点“新建小组”。</p>'}</div>
     <h3 style="margin:18px 0 8px">未分组学生（${act.filter(s=>!c.groups.includes(s.group)||s.group==='未分组').length} 人）</h3>
<div class="chips">${act.filter(s=>!c.groups.includes(s.group)||s.group==='未分组').map(s=>`<span class="tag">${esc(s.name)}</span>`).join('')||`<span class="mini">${act.length?'全部学生都已分组':'还没有学生：先到「数据管理 → 导入班级名单」把名单导进来'}</span>`}</div>
     <p class="hint">示例文件：<a href="成绩表格模板/学生名单_导入模板.xlsx" download>下载“学生名单”示例表格</a>（姓名 + 小组两列，导入时自动建组）。</p>`);
  $('#gAdd').onclick=groupAdd;
  $('#gImport').onclick=()=>pick(f=>importStudents(f,'group'));
  $('#gTpl').onclick=()=>exportXlsx('学生名单模板',act.map(s=>({姓名:s.name,小组:s.group})));
  $('#gAna').onclick=()=>{page='groups';render()};
}

/* ===== 小组分析：大考/小测分开 · 按科目选考试 · 各组折线对比 + 班级平均 ===== */
/* ===== 个人成绩统计：自选参考考试（可多选） ===== */

/* ===== 量化汇总总表：列＝已设量化项目 + 自选考试成绩 ===== */
/* ===== 考试标签分组：大考按 月考/联考·模拟/期中/期末，小测按学科 ===== */
/* ===== 页面前进 / 后退（所有页面通用） ===== */
let histStack=[],histPos=-1,navRestoring=false;
/* 记“页面 + 当时看的学生/科目/考试/学期”，这样点“上一页”能回到刚看的那一屏，而不是空白页 */
const HIST_KEYS=['anScope','anKey','anStudent','anExam','grScope','grKey','examTab','examViewId','pSort','scopeTerm','hisCohort'];
function snapshot(){
  const st={};
  HIST_KEYS.forEach(k=>{const v=window[k];st[k]=(v==null||typeof v==='string'||typeof v==='number')?v:null});
  return JSON.stringify({p:page||'entry',s:st});
}
function snapPage(s){try{const o=JSON.parse(s);return (o&&o.p)||'entry'}catch{return typeof s==='string'?s:'entry'}}
function snapName(s){const p=snapPage(s);return SUBNAME[p]||p}
function restoreSnap(s){
  let o=null;try{o=JSON.parse(s)}catch{}
  if(!o||typeof o!=='object')o={p:(typeof s==='string'?s:'entry'),s:{}};
  page=o.p||'entry';
  const st=o.s||{};
  HIST_KEYS.forEach(k=>{window[k]=(st[k]==null?null:st[k])});
}
function syncNavBtns(){
  const b=document.getElementById('navBack'),f=document.getElementById('navFwd');
  if(b){b.disabled=histPos<=0;b.title=histPos>0?('回到上一页：'+snapName(histStack[histPos-1])+'（Alt + ←）'):'已经在第一页'}
  if(f){f.disabled=histPos>=histStack.length-1;f.title=histPos<histStack.length-1?('回到下一页：'+snapName(histStack[histPos+1])+'（Alt + →）'):'已经是最后一页'}
}
function pushHist(fromPop){
  if(navRestoring)return;
  const s=snapshot();if(histStack[histPos]===s){syncNavBtns();return}
  histStack=histStack.slice(0,histPos+1);histStack.push(s);
  if(histStack.length>80)histStack.shift();
  histPos=histStack.length-1;syncNavBtns();
  if(!fromPop)try{
    const url=location.pathname+location.search+'#'+snapPage(s);
    if(histPos===0)history.replaceState({h:s},'',url);else history.pushState({h:s},'',url);
  }catch{}
}
function applySnap(s){
  let i=histStack.lastIndexOf(s);
  if(i<0){histStack=histStack.slice(0,histPos+1);histStack.push(s);i=histStack.length-1}
  histPos=i;navRestoring=true;
  try{restoreSnap(s);render()}finally{navRestoring=false;syncNavBtns()}
}
window.navBack=()=>{if(histPos<=0)return toast('已经是第一页了');histPos--;navRestoring=true;try{restoreSnap(histStack[histPos]);render()}finally{navRestoring=false;syncNavBtns()}};
window.navFwd=()=>{if(histPos>=histStack.length-1)return toast('已经是最后一页了');histPos++;navRestoring=true;try{restoreSnap(histStack[histPos]);render()}finally{navRestoring=false;syncNavBtns()}};
/* 浏览器的“后退/前进”也走同一套历史，键盘 Alt+← 与手机返回手势都能用 */
window.addEventListener('popstate',ev=>{
  const s=ev.state&&ev.state.h?ev.state.h:null;
  if(!s||navRestoring)return;
  try{applySnap(s)}catch(e){}
});


function radarChart(canvas,labels,series,title,raws){
  if(!canvas||!canvas.clientWidth)return;
  const ctx=canvas.getContext('2d'),W=canvas.clientWidth,H=canvas.clientHeight;
  canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);
  ctx.clearRect(0,0,W,H);ctx.font='14px system-ui,"Microsoft YaHei",sans-serif';ctx.fillStyle='#52606d';ctx.fillText(title,12,20);
  const n=labels.length;if(!n)return;
  const cx=W/2,cy=H/2+10,R=Math.min(W,H)/2-70,ang=i=>-Math.PI/2+i*2*Math.PI/n;
  ctx.strokeStyle='#e3e9f0';
  for(let ring=1;ring<=4;ring++){ctx.beginPath();for(let i=0;i<=n;i++){const a=ang(i%n),r=R*ring/4,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}
  ctx.strokeStyle='#eef2f7';
  labels.forEach((lb,i)=>{const a=ang(i);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);ctx.stroke()});
  series.forEach(s=>{
    ctx.beginPath();
    s.values.forEach((v,i)=>{const a=ang(i),r=R*Math.max(0,Math.min(1,v||0)),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
    ctx.closePath();ctx.fillStyle=s.fill;ctx.fill();ctx.strokeStyle=s.color;ctx.lineWidth=s.bold?2.6:1.6;ctx.stroke();ctx.lineWidth=1;
  });
  labels.forEach((lb,i)=>{
    const a=ang(i),lx=cx+Math.cos(a)*(R+14),ly=cy+Math.sin(a)*(R+14);
    ctx.textAlign=(Math.abs(Math.cos(a))<0.3)?'center':(Math.cos(a)>0?'left':'right');
    ctx.fillStyle='#16202c';ctx.font='14px system-ui,"Microsoft YaHei",sans-serif';ctx.fillText(lb,lx,ly+(Math.sin(a)>0.6?14:(Math.sin(a)<-0.6?-6:4)));
    if(raws){
      const t=raws.map(r=>(r[i]==null?'—':fmtN(r[i]))).join(' ／ ');
      ctx.fillStyle=series[0].color;ctx.font='13px system-ui';ctx.fillText(t,lx,ly+(Math.sin(a)>0.6?30:(Math.sin(a)<-0.6?10:20)));
    }
    ctx.textAlign='left';
  });
}
window.examCompare=sid=>{
  const s=stuById(sid);if(!s)return;
  const maj=examsOf('major');
  if(maj.length<2)return toast('至少要两次大考才能对比，请先在“成绩管理”里导入或新建大考');
  const last=maj[maj.length-1],prev=maj[maj.length-2];
  if(!window.__cmp)window.__cmp={a:last.id,b:prev.id};
  const opts=sel=>maj.map(e=>`<option value="${e.id}" ${e.id===sel?'selected':''}>${esc(String(e.date).slice(5))} ${esc(e.name)}</option>`).join('');
  modal(`${esc(s.name)} · 大考多维对比`,
   `<p class="hint">选两次大考做对比（<b>只能选两次</b>）：<b>深色＝较近的一次</b>，<b>浅色＝上一次</b>；每个轴是该科得分（按这两次的全班最高分归一化），轴旁数字是原始分。</p>
    <div class="filters"><label>对比一 <select id="cmpA">${opts(window.__cmp.a)}</select></label><label>对比二 <select id="cmpB">${opts(window.__cmp.b)}</select></label><button id="cmpSwap">交换</button></div>
    <div class="chart-wrap"><canvas id="cmpRadar" class="chart" style="height:430px" data-name="${esc(s.name)}_大考多维对比"></canvas></div>
    <div class="table-wrap" style="max-height:220px"><table><thead><tr><th>科目</th><th id="cmpHN">本次（深）</th><th id="cmpHO">上次（浅）</th><th>差值</th></tr></thead><tbody id="cmpBody"></tbody></table></div>`,null,'关闭');
  const draw=()=>{
    const A=maj.find(e=>e.id===$('#cmpA').value),B=maj.find(e=>e.id===$('#cmpB').value);
    if(!A||!B)return;
    window.__cmp={a:A.id,b:B.id};
    const newer=String(A.date)>=String(B.date)?A:B,older=newer===A?B:A;
    const subs=[...new Set([...examSubjects(newer),...examSubjects(older)])];
    const cMax=x=>Math.max(1,...activeStudents().flatMap(st=>[scoreOf(newer,st.id,x),scoreOf(older,st.id,x)]).filter(v=>v!==null));
    const nv=subs.map(x=>(scoreOf(newer,s.id,x)??0)/(cMax(x)/100)),ov=subs.map(x=>(scoreOf(older,s.id,x)??0)/(cMax(x)/100));
    const nr=subs.map(x=>scoreOf(newer,s.id,x)),or=subs.map(x=>scoreOf(older,s.id,x));
    radarChart($('#cmpRadar'),subs,[
      {name:newer.name,values:nv,color:'#b3261e',fill:'rgba(179,38,30,.16)',bold:true},
      {name:older.name,values:ov,color:'#f1998f',fill:'rgba(241,153,143,.30)',bold:false},
    ],`${s.name} 大考多维对比（深色＝${newer.name}，浅色＝${older.name}）`,[nr,or]);
    $('#cmpHN').textContent=newer.name+'（深·较近）';
    $('#cmpHO').textContent=older.name+'（浅·上一次）';
    $('#cmpBody').innerHTML=subs.map((x,i)=>`<tr><td>${esc(x)}</td><td><b>${nr[i]==null?'—':fmtN(nr[i])}</b></td><td>${or[i]==null?'—':fmtN(or[i])}</td><td class="${(nr[i]??0)>=(or[i]??0)?'positive':'negative'}">${nr[i]==null||or[i]==null?'—':((nr[i]-or[i]>=0?'+':'')+fmtN(nr[i]-or[i]))}</td></tr>`).join('');
    attachChartTools(document);
  };
  $('#cmpA').onchange=draw;$('#cmpB').onchange=draw;
  $('#cmpSwap').onclick=()=>{const a=$('#cmpA').value,b=$('#cmpB').value;$('#cmpA').value=b;$('#cmpB').value=a;draw()};
  draw();
};

const MAJOR_CATS=['月考','联考/模拟','期中','期末','其它大考'];
function examCatOf(e){
  const n=String(e.name||'');
  if(/期末/.test(n))return '期末';
  if(/期中/.test(n))return '期中';
  if(/联考|联测|统考|一模|二模|三模|模拟|模考|质检|适应性/.test(n))return '联考/模拟';
  if(/月考/.test(n))return '月考';
  return '其它大考';
}
function groupChips(list){
  const byDate=(a,b)=>String(a.date||'').localeCompare(String(b.date||''));
  const out=[];
  const mm=new Map();
  list.filter(e=>examType(e)==='major').forEach(e=>{const k=examCatOf(e);if(!mm.has(k))mm.set(k,[]);mm.get(k).push(e)});
  MAJOR_CATS.forEach(k=>{if(mm.has(k))out.push({label:k,list:mm.get(k).sort(byDate)})});
  const qm=new Map();
  list.filter(e=>examType(e)==='quiz').forEach(e=>{const k=examSubjects(e)[0]||'其它';if(!qm.has(k))qm.set(k,[]);qm.get(k).push(e)});
  [...qm.keys()].sort((a,b)=>a.localeCompare(b,'zh')).forEach(k=>out.push({label:k+' 小测',list:qm.get(k).sort(byDate)}));
  return out;
}
function pickedOf(attr){
  if(attr==='pe')return {get:()=>window.peUse||[],set:v=>window.peUse=v};
  if(attr==='sum')return {get:()=>window.sumUse||[],set:v=>window.sumUse=v};
  if(attr==='gp')return {get:()=>window.grPicked||[],set:v=>window.grPicked=v};
  return {get:()=>window.anPicked||[],set:v=>window.anPicked=v};
}
function chipsHTML(list,attr,picked,emptyMsg){
  if(!list.length)return `<div class="chips"><span class="mini">${esc(emptyMsg||'没有可选的考试')}</span></div>`;
  const open=(window.chipOpen??={}),st=(open[attr]??={}),ids=(window.__chipIds??={}),gi=(ids[attr]??={});
  return groupChips(list).map(g=>{
    const gids=g.list.map(e=>e.id);gi[g.label]=gids;
    const sel=gids.filter(id=>picked.includes(id)).length,isOpen=!!st[g.label];
    return `<div class="cgroup">
      <div class="chead" data-ctg="${attr}" data-clabel="${esc(g.label)}">
        <b>${isOpen?'▾':'▸'} ${esc(g.label)}</b>
        <span class="tag">已选 ${sel}/${gids.length}</span>
        <span class="cbtns">
          <button data-call="${attr}" data-clabel="${esc(g.label)}" data-mode="1">全选本组</button>
          <button data-call="${attr}" data-clabel="${esc(g.label)}" data-mode="0">清空本组</button>
        </span>
      </div>
      <div class="cbody" style="display:${isOpen?'flex':'none'}">
        ${g.list.map(e=>`<button class="chip ${picked.includes(e.id)?'active':''}" data-${attr}="${e.id}">${esc(String(e.date).slice(5))} ${esc(e.name)}</button>`).join('')}
      </div></div>`;
  }).join('');
}
function wireChips(){
  document.querySelectorAll('#main .chead').forEach(h=>{
    h.onclick=e=>{
      if(e.target.closest('button'))return;
      const a=h.dataset.ctg,l=h.dataset.clabel,st=((window.chipOpen??={})[a]??={});
      st[l]=!st[l];render();
    };
  });
  document.querySelectorAll('#main [data-call]').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();
      const a=b.dataset.call,l=b.dataset.clabel,all=b.dataset.mode==='1';
      const gids=((window.__chipIds||{})[a]||{})[l]||[];
      if(!gids.length)return;
      const p=pickedOf(a);
      p.set(all?[...new Set(p.get().concat(gids))]:p.get().filter(x=>!gids.includes(x)));
      render();
    };
  });
}

/* ===== 记录明细：点学生姓名 → 该生全部量化考核记录 ===== */
function enhanceRecordNames(){
  if(page!=='records')return;
  const rows=filterRecords(),trs=document.querySelectorAll('#main tbody tr');
  trs.forEach((tr,i)=>{
    const r=rows[i];if(!r)return;
    const td=tr.children[1];
    if(!td||td.dataset.named)return;
    td.dataset.named='1';
    td.innerHTML=`<a href="javascript:void(0)" onclick="studentRecordCard('${r.studentId}')" title="看这名学生的全部量化考核记录">${esc(r.student)}</a>`;
  });
}
window.studentRecordCard=sid=>{
  const s=stuById(sid)||{name:'',group:''};
  const all=cls().records.filter(r=>r.studentId===sid||(s.name&&r.student===s.name)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const dims={};Object.keys(cls().rules).forEach(t=>dims[t]=0);
  all.forEach(r=>dims[r.type]=(dims[r.type]||0)+r.score);
  const sc=scopeId(),inTerm=all.filter(r=>sc==='all'||(r.term||db.term)===sc);
  const sumAll=+all.reduce((n,r)=>n+r.score,0).toFixed(1),sumTerm=+inTerm.reduce((n,r)=>n+r.score,0).toFixed(1);
  modal(`${esc(s.name)} 的量化考核记录`,
   `<div class="stat-row"><span>记录条数 <b>${all.length}</b></span><span>累计得分 <b>${fmtN(sumAll)}</b></span><span>本学期得分 <b>${fmtN(sumTerm)}</b></span><span>小组 <b>${esc(s.group||'—')}</b></span></div>
    <div class="chips">${Object.entries(dims).filter(x=>x[1]!==0).map(x=>`<span class="tag">${esc(x[0])} ${x[1]>0?'+':''}${fmtN(x[1])}</span>`).join('')||'<span class="mini">还没有记录</span>'}</div>
    <div class="filters"><button id="srcStat">看他的个人成绩统计</button><button id="srcExport">导出他的记录 Excel</button></div>
    <div class="table-wrap" style="max-height:340px"><table><thead><tr><th>日期</th><th>学期</th><th>类型</th><th>细则</th><th>简述</th><th>赋分</th><th>说明</th></tr></thead><tbody>
      ${all.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc((termById(r.term||db.term)||{}).name||'')}</td><td>${esc(r.type)}</td><td>${esc(r.detail)}</td><td>${esc(r.brief)}</td><td class="${r.score>=0?'positive':'negative'}">${r.score>0?'+':''}${r.score}</td><td>${esc(r.note)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">这名学生还没有量化考核记录</td></tr>'}
    </tbody></table></div>`,null,'关闭');
  $('#srcStat').onclick=()=>{closeModal();openStudentStat(sid)};
  $('#srcExport').onclick=()=>exportXlsx(`${s.name}_量化考核记录`,all.map(r=>({日期:r.date,学期:(termById(r.term||db.term)||{}).name||'',类型:r.type,细则:r.detail,简述:r.brief,赋分:r.score,说明:r.note})));
};

/* 量化汇总总表的唯一计算口径：今日上榜也用它，保证“名单由汇总总表决定” */
function sumState(){
  const c=cls(),act=activeStudents(),rules=Object.keys(c.rules);
  const all=[...examsOf('major'),...examsOf('quiz')].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const sig='sum|'+scopeId();
  if(window.sumSig!==sig){window.sumSig=sig;window.sumUse=selPick('sumUse',sig,all.map(e=>e.id));window.sumFrom='';window.sumTo=''}
  if(!Array.isArray(window.sumUse))window.sumUse=all.map(e=>e.id);
  selSave('sumUse',sig,window.sumUse);
  const from=window.sumFrom||'',to=window.sumTo||'';
  const inRange=e=>(!from||String(e.date)>=from)&&(!to||String(e.date)<=to);
  const pickable=all.filter(inRange);
  const use=pickable.filter(e=>window.sumUse.includes(e.id));
  const recs=scopedRecords(),idxOf=e=>examType(e)==='quiz'?(examSubjects(e)[0]||''):TOTAL;
  const rows=act.map(s=>{
    const dims={};rules.forEach(t=>dims[t]=+recs.filter(r=>r.studentId===s.id&&r.type===t).reduce((n,r)=>n+r.score,0).toFixed(1));
    const q=+Object.values(dims).reduce((a,b)=>a+b,0).toFixed(1);
    const scores=use.map(e=>scoreOf(e,s.id,idxOf(e)));
    const vals=scores.filter(v=>v!==null);
    const sc=+vals.reduce((a,b)=>a+b,0).toFixed(1);
    const avg=vals.length?+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):null;   /* 平均成绩＝所选考试的平均分 */
    return {s,dims,q,scores,sc,vals,avg,cnt:vals.length,total:+(q+sc).toFixed(1)};
  }).sort((a,b)=>b.total-a.total);
  rows.forEach((r,i)=>r.rank=i+1);
  return {c,act,rules,all,pickable,use,rows,from,to};
}
function summary(){
  const {c,act,rules,all,pickable,use,rows,from,to}=sumState();
  const chip=e=>`<button class="chip ${window.sumUse.includes(e.id)?'active':''}" data-sum="${e.id}">${esc(String(e.date).slice(5))} ${esc(e.name)}</button>`;
  layout('量化汇总总表',
   `<button id="sumRules">考核项目设置</button><button id="sumAll">全选考试</button><button id="sumNone">全不选</button><button id="sumExport">导出 Excel</button>`,
   `<p class="hint">表格的列＝你设好的<b>量化项目</b>（每类一列）＋<b>你挑选的考试</b>（大考取总分、小测取该科分数）；最后给出量化合计、成绩合计与总分排名。没有成绩的项显示“—”。</p>
    <div class="filters"><label>考试时间从 <input id="sumFrom" type="date" value="${from}"></label><label>到 <input id="sumTo" type="date" value="${to}"></label><button id="sumClear">清除时间</button>
      <span class="tag">已选 ${use.length} 次</span></div>
    ${chipsHTML(pickable,'sum',window.sumUse,'这个学期还没有成绩，先去“成绩管理”导入')}
    ${use.length?'':'<p class="hint"><b>还没选考试</b>：总表暂时只统计量化项目，勾选上面的考试就会加上成绩列。</p>'}
    <div class="table-wrap"><table><thead><tr><th>名次</th><th>姓名</th><th>小组</th>${rules.map(t=>`<th>${esc(t)}</th>`).join('')}<th>量化合计</th>${use.map(e=>`<th>${esc(e.name)}<span class="mini">${examType(e)==='major'?'大考·总分':esc(examSubjects(e)[0]||'小测')}</span></th>`).join('')}<th>成绩合计</th><th>合计</th></tr></thead>
     <tbody>${rows.map(r=>`<tr style="cursor:pointer" onclick="pickPerson('${r.s.id}')"><td class="rank">${r.rank}</td><td>${esc(r.s.name)}</td><td>${esc(r.s.group)}</td>${rules.map(t=>`<td>${fmtN(r.dims[t])}</td>`).join('')}<td><b>${fmtN(r.q)}</b></td>${r.scores.map(v=>`<td>${v===null?'—':fmtN(v)}</td>`).join('')}<td>${fmtN(r.sc)}</td><td><b>${fmtN(r.total)}</b></td></tr>`).join('')||'<tr><td colspan="6" class="empty">还没有学生</td></tr>'}</tbody></table></div>
    <p class="mini">点任意一行 → 看这名学生的个人成绩统计；“考核项目设置”可增删考核类型与细则。</p>`);
  $('#sumRules').onclick=rulesModal;
  $('#sumAll').onclick=()=>{window.sumUse=all.map(e=>e.id);render()};
  $('#sumNone').onclick=()=>{window.sumUse=[];render()};
  $('#sumFrom').onchange=e=>{window.sumFrom=e.target.value;render()};
  $('#sumTo').onchange=e=>{window.sumTo=e.target.value;render()};
  $('#sumClear').onclick=()=>{window.sumFrom='';window.sumTo='';render()};
  document.querySelectorAll('[data-sum]').forEach(b=>b.onclick=()=>{const id=b.dataset.sum;window.sumUse=window.sumUse.includes(id)?window.sumUse.filter(x=>x!==id):window.sumUse.concat(id);render()});
  $('#sumExport').onclick=()=>exportXlsx('量化汇总总表',rows.map(r=>({名次:r.rank,姓名:r.s.name,小组:r.s.group,...r.dims,量化合计:r.q,...Object.fromEntries(use.map((e,i)=>[e.name,r.scores[i]])),成绩合计:r.sc,合计:r.total})));
}

/* 所选考试的走势图（蓝＝本人，橙＝班级均分） */
function drawPeTrend(s){
  const cv=$('#peTrend');if(!cv)return;
  const {act,use}=peData();
  const idx=e=>examType(e)==='quiz'?(examSubjects(e)[0]||''):TOTAL;
  const valOf=(x,e)=>scoreOf(e,x.id,idx(e));
  const classAvg=use.map(e=>avgOf(act.map(x=>valOf(x,e)).filter(v=>v!==null)));
  if(use.length&&s)lineChart(cv,use.map(e=>e.name),[{name:s.name,values:use.map(e=>valOf(s,e)??0)},{name:'班级均分',values:classAvg}],`${s.name} 所选考试的走势（✔ ${use.length} 次，蓝＝本人，橙＝班级均分）`);
  else if(use.length)lineChart(cv,use.map(e=>e.name),[{name:'班级均分',values:classAvg}],'所选考试的班级均分走势（点下面表格里的学生可看他的曲线）');
  else lineChart(cv,[],[],'未选择考试');
}
function enhancePersonal(){
  if(page!=='personal'||$('#peTop'))return;
  const {act,all,use,rows:raw}=peData();
  const maj=all.filter(e=>examType(e)==='major'),qz=all.filter(e=>examType(e)==='quiz');
  const rows=sortPe(raw,window.pSort||'avg');
  window.__peRows=rows;
  const idx=e=>examType(e)==='quiz'?(examSubjects(e)[0]||''):TOTAL;
  const valOf=(s,e)=>scoreOf(e,s.id,idx(e));
  const chip=e=>`<button class="chip ${window.peUse.includes(e.id)?'active':''}" data-pe="${e.id}">${esc(String(e.date).slice(5))} ${esc(e.name)}</button>`;
  $('#main .card .toolbar').insertAdjacentHTML('afterend',
   `<div id="peTop">
     <div class="toolbar"><h3 style="margin:0 auto 0 0">参考考试（决定下面统计用哪几次成绩）</h3>
       <button id="peAll">全选</button><button id="peNone">全不选</button><button id="peMajor">只看大考</button><button id="peQuiz">只看小测</button>
       <span class="tag">已选 ${use.length} 次</span></div>
     <p class="hint">大考按<b>总分</b>计入、小测按<b>该科分数</b>计入；勾选哪几次，下面的折线图和统计表就按哪几次算（顺序按时间）。</p>
     ${chipsHTML(all,'pe',window.peUse,'这个学期还没有成绩，先去“成绩管理”导入')}
     ${use.length?'':'<p class="hint"><b>当前一次考试都没选</b>：统计为空，勾选上面的考试或点“全选”。</p>'}
     <div class="chart-wrap"><canvas id="peTrend" class="chart" data-name="所选考试走势"></canvas></div>
   </div>`);
  /* 合并后的一张统计表，放在折线图下面 */
  $('#main').insertAdjacentHTML('beforeend',
   `<section class="card" id="peTable"><div class="toolbar"><h2>全班成绩统计表</h2><span class="mini">共 ${rows.length} 人 · 点姓名或“大考对比图”＝选两次大考做多维对比</span></div>
     ${peTable(rows)}
     <p class="mini">“所选考试”列只统计上面勾选的那几次考试（大考取总分、小测取该科分数）；“大考总分 / 小测均分 / 成绩总分”按整个学期统计。量化考核与综合素质评价在“量化考核”板块查看。</p></section>`);
  document.querySelectorAll('[data-pe]').forEach(b=>b.onclick=()=>{const id=b.dataset.pe;window.peUse=window.peUse.includes(id)?window.peUse.filter(x=>x!==id):window.peUse.concat(id);render()});
  $('#peAll').onclick=()=>{window.peUse=all.map(e=>e.id);render()};
  $('#peNone').onclick=()=>{window.peUse=[];render()};
  $('#peMajor').onclick=()=>{window.peUse=maj.map(e=>e.id);render()};
  $('#peQuiz').onclick=()=>{window.peUse=qz.map(e=>e.id);render()};
  drawPeTrend(stuById(window.peStudent||''));
  attachChartTools(document);
}
window.pickPerson=id=>{
  const s=stuById(id);if(!s)return;
  window.peStudent=id;
  const el=$('#personSearch');if(el)el.value=s.name;
  if(page==='personal'){drawPersonCharts(s);drawPeTrend(s)}
  else render();
  window.scrollTo({top:0,behavior:'smooth'});
};

function groups(){
  const c=groupEnsure(),act=activeStudents(),type=window.grScope==='quiz'?'quiz':'major';
  const all=scopedExams().filter(e=>examType(e)===type).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const subOpts=[...(type==='major'?['总分']:[]),...new Set(all.flatMap(e=>examSubjects(e)))];
  let key=window.grKey||subOpts[0]||'';
  if(!subOpts.includes(key))key=subOpts[0]||'';
  const q=key==='总分'?TOTAL:key;
  const pool=all.filter(e=>q===TOTAL||examSubjects(e).includes(q));
  const grSig=type+'|'+key;
  if(window.grSig!==grSig){window.grSig=grSig;window.grPicked=selPick('grPicked',grSig,pool.map(e=>e.id))}
  selSave('grPicked',grSig,window.grPicked);
  const picked=window.grPicked,use=pool.filter(e=>picked.includes(e.id));
  const allGroups=c.groups.filter(g=>g!=='未分组');
  const gs=allGroups.filter(g=>act.some(s=>s.group===g)),emptyGroups=allGroups.length-gs.length,recs=scopedRecords();
  const rows=gs.map(g=>{
    const ms=act.filter(s=>s.group===g);
    const vals=use.map(e=>avgOf(ms.map(s=>scoreOf(e,s.id,q)).filter(v=>v!==null)));
    const rule=ms.length?+(ms.reduce((n,s)=>n+recs.filter(r=>r.studentId===s.id).reduce((m,r)=>m+r.score,0),0)/ms.length).toFixed(1):0;
    const have=vals.filter(v=>v!==0||true);
    const avg=vals.length?+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):0;
    return {g,ms,vals,rule,avg};
  }).sort((a,b)=>b.avg-a.avg);
  const classVals=use.map(e=>classAvg(e,q)),cAvg=avgOf(classVals);
  layout('小组分析',
   `<div class="tabs">${[['major','大考'],['quiz','小测']].map(a=>`<button class="${type===a[0]?'active':''}" data-gt="${a[0]}">只看${a[1]}</button>`).join('')}</div>
    <label class="lbl">科目 <select id="grKey">${subOpts.map(s=>`<option ${s===key?'selected':''}>${esc(s)}</option>`).join('')||'<option>暂无</option>'}</select></label>
    <button id="grAll">全选</button><button id="grNone">全不选</button><button id="grExport">导出 Excel</button>`,
   `<p class="hint">先选<b>大考或小测</b>、再选<b>科目</b>，然后勾选要比的几次考试（默认全选，可逐个取消；<b>一次都不选时图表为空</b>；考试顺序按时间）。表里是<b>各小组在这几次考试上的平均分</b>（由组内每位学生的成绩取平均），图中每个小组一条折线，并加入<b>班级平均</b>。</p>
    ${chipsHTML(pool,'gp',picked,'这个科目还没有这类考试')}
    ${use.length?'':'<p class="hint"><b>当前一次考试都没选</b>：图表为空，点上面的考试标签勾选，或点“全选”。</p>'}
    <div class="table-wrap"><table><thead><tr><th>名次</th><th>小组</th><th>人数</th><th>量化均分</th>${use.map(e=>`<th>${esc(e.name)}</th>`).join('')}<th>${esc(key)}均分</th><th>与班均差</th></tr></thead>
     <tbody>${rows.map((r,i)=>`<tr><td class="rank">${i+1}</td><td>${esc(r.g)}</td><td>${r.ms.length}</td><td>${fmtN(r.rule)}</td>${r.vals.map(v=>`<td>${fmtN(v)}</td>`).join('')}<td><b>${fmtN(r.avg)}</b></td><td class="${r.avg>=cAvg?'positive':'negative'}">${r.avg>=cAvg?'+':''}${fmtN(r.avg-cAvg)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">还没有小组或成绩</td></tr>'}
      ${rows.length&&use.length?`<tr><td></td><td><b>班级平均</b></td><td>${act.length}</td><td></td>${classVals.map(v=>`<td><b>${fmtN(v)}</b></td>`).join('')}<td><b>${fmtN(cAvg)}</b></td><td>—</td></tr>`:''}</tbody></table></div>
    ${emptyGroups?`<p class="mini">另有 ${emptyGroups} 个小组还没有成员，未列入排名和图。</p>`:''}
    <div class="chart-wrap"><canvas id="groupChart" class="chart" data-name="${esc(key)}小组对比"></canvas></div>`);
  document.querySelectorAll('[data-gt]').forEach(b=>b.onclick=()=>{window.grScope=b.dataset.gt;window.grPicked=undefined;window.grKey=null;render()});
  document.querySelectorAll('[data-gp]').forEach(b=>b.onclick=()=>{const id=b.dataset.gp,cur=window.grPicked||[];window.grPicked=cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id);render()});
  $('#grKey').onchange=e=>{window.grKey=e.target.value;window.grPicked=undefined;render()};
  $('#grAll').onclick=()=>{window.grPicked=pool.map(e=>e.id);render()};
  $('#grNone').onclick=()=>{window.grPicked=[];render()};
  $('#grExport').onclick=()=>exportXlsx('小组分析_'+key,rows.map((r,i)=>({名次:i+1,小组:r.g,人数:r.ms.length,量化均分:r.rule,...Object.fromEntries(use.map((e,j)=>[e.name,r.vals[j]])),[key+'均分']:r.avg})));
  if(rows.length&&use.length)lineChart($('#groupChart'),use.map(e=>e.name),[...rows.map(r=>({name:r.g,values:r.vals})),{name:'班级平均',values:classVals}],`各小组「${key}」折线对比（含班级平均）`,false,i=>{if(use[i])openSubjectRanks(use[i].id,q)});
  attachChartTools(document);
}

/* ===== 量化考核项目设置（可增删类型与细则、可要求填备注） ===== */
function rulesModal(){
  const c=cls(),draft=[];
  Object.keys(c.rules).forEach(t=>(c.rules[t]||[]).forEach(it=>draft.push({t,n:it.name,s:it.score,note:!!it.note})));
  if(!draft.length)draft.push({t:'一日常规',n:'',s:0,note:false});
  const rowsHtml=()=>draft.map((r,i)=>`<tr><td><input data-r="${i}" data-k="t" value="${esc(r.t)}" list="typeList" style="width:120px"></td><td><input data-r="${i}" data-k="n" value="${esc(r.n)}" placeholder="细则名称" style="width:150px"></td><td><input data-r="${i}" data-k="s" type="number" step="0.5" value="${r.s}" style="width:80px"></td><td><input data-r="${i}" data-k="note" type="checkbox" ${r.note?'checked':''}></td><td><button data-del="${i}">删除</button></td></tr>`).join('');
  const pull=()=>document.querySelectorAll('[data-r]').forEach(i=>{const idx=+i.dataset.r,k=i.dataset.k;draft[idx]=draft[idx]||{};draft[idx][k]=k==='note'?i.checked:(k==='s'?(+i.value||0):i.value.trim())});
  const paint=()=>{$('#ruleBody').innerHTML=rowsHtml();document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{pull();draft.splice(+b.dataset.del,1);if(!draft.length)draft.push({t:'',n:'',s:0,note:false});paint()})};
  modal('量化考核项目设置',
    `<p class="hint">这里就是“量化记录”里能选的项目：同一个类型（如“一日常规”）下面可以有很多条细则，各自设分值；勾上“要备注”的细则，录入时会要求填写一句说明。<b>删掉某个类型的全部细则＝删除该类型</b>。</p>
     <datalist id="typeList">${Object.keys(c.rules).map(t=>`<option value="${esc(t)}">`).join('')}</datalist>
     <div class="table-wrap" style="max-height:380px"><table><thead><tr><th>类型</th><th>细则</th><th>分值</th><th>要备注</th><th>操作</th></tr></thead><tbody id="ruleBody"></tbody></table></div>
     <div class="toolbar"><button id="rAdd">新增一条</button><button id="rAddSame">同类型再加一条</button></div>`,
    ()=>{
      pull();
      const out={};
      draft.forEach(r=>{if(!r.t||!r.n)return;(out[r.t]=out[r.t]||[]).push(r.note?{name:r.n,score:r.s,note:true}:{name:r.n,score:r.s})});
      if(!Object.keys(out).length)return toast('至少保留一条完整细则（类型＋细则名）');
      c.rules=out;save();closeModal();toast('考核项目已保存');render();
    });
  paint();
  $('#rAdd').onclick=()=>{pull();draft.push({t:'',n:'',s:0,note:false});paint()};
  $('#rAddSame').onclick=()=>{pull();const last=draft[draft.length-1]||{t:''};draft.push({t:last.t,n:'',s:0,note:false});paint()};
}
/* 录入时：勾了“要备注”的细则必须填说明 */
function enhanceEntryNote(){
  if(page!=='entry')return;
  const btn=$('#saveRecord');if(!btn||btn.dataset.noteHook)return;btn.dataset.noteHook='1';
  const orig=btn.onclick;
  btn.onclick=()=>{
    const t=$('#rtype').value,d=$('#rdetail').value,item=((cls().rules[t]||[]).find(x=>x.name===d))||{};
    if(item.note&&!$('#rnote').value.trim())return toast('“'+d+'”这条要求填写补充说明');
    orig();
  };
}
function clus(){return cls()}

/* ===== 成绩管理：按科目分组入口（小测按科目、大考按总分与各科） ===== */
function enhanceExamsPage(){
  if(page!=='exams')return;
  const ex=scopedExams(),hist=$('#main .table-wrap');
  if(!hist||$('#subjectCards'))return;
  const subs=[...new Set(ex.flatMap(e=>examSubjects(e)))];
  if(!subs.length)return;
  const maj=ex.filter(e=>examType(e)==='major'),qz=ex.filter(e=>examType(e)==='quiz');
  const rows=subs.map(sub=>{
    const m=maj.filter(e=>examSubjects(e).includes(sub)),q=qz.filter(e=>examSubjects(e).includes(sub));
    return {sub,m:m.length,q:q.length,avg:avgOf([...m,...q].map(e=>classAvg(e,sub)))};
  }).sort((a,b)=>(b.m+b.q)-(a.m+a.q));
  hist.insertAdjacentHTML('afterend',
    `<h3 id="subjectCards" style="margin:20px 0 8px">按科目看（点科目＝看该科目历次大考＋小测的成绩）</h3>
     <div class="cards">${rows.map(r=>`<article class="stat">
        <span>${r.m?`大考 ${r.m} 次`:''}${r.m&&r.q?' · ':''}${r.q?`小测 ${r.q} 次`:''}</span>
        <b>${esc(r.sub)}</b><span>平均 ${fmtN(r.avg)}</span>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button onclick="goSubject('${esc(r.sub)}')">看该科目成绩</button><button onclick="goSubject('${esc(r.sub)}','quiz')">只看小测</button></div>
      </article>`).join('')}</div>
     <p class="hint">大考的总分分析在“成绩分析”里选“总分”；某个科目的大考与小测会自动排在同一条时间线上。</p>`);
}
window.goSubject=(sub,onlyQuiz)=>{
  window.anScope=onlyQuiz==='quiz'?'quiz':'all';
  window.anKey=sub;window.anPicked=undefined;window.anExam=null;window.anFromDate='';window.anToDate='';
  page='analysis';render();
};

/* ===== 个人统计：大考各科多维对比 + 该科小测折线 ===== */

/* ===== 登录后先选“届 / 学期 / 班级”（每个浏览器会话问一次，之后可在顶栏随时切换） ===== */
/* ===== 综合素质评价：自选参考项与占比，点名片/行跳转个人统计 ===== */
/* ===== 五大板块导航（其余页面合并为板块内标签） ===== */
const NAV=[
  {k:'小组分类',def:'groups2',s:['groups2','students','groups']},
  {k:'量化考核',def:'board',s:['board','entry','summary','records']},
  {k:'成绩管理',def:'exams',s:['exams','analysis','personal']},
  {k:'数据管理',def:'data',s:['data','guide','history','users']},
];
const SUBNAME={groups2:'小组管理',students:'学生名单',groups:'小组分析',entry:'量化录入',summary:'汇总总表',records:'记录明细',exams:'考试列表',analysis:'成绩分析',personal:'个人成绩统计',board:'综合素质评价',data:'数据与备份',guide:'使用说明',history:'历史学期',users:'本机账号'};

/* ===== 危险操作：统一的二次确认页（必须输入确认词） ===== */
function dangerConfirm(title,desc,word,onOk){
  modal(title,
   `<p class="hint" style="background:#fdeeee;border-left-color:#d64545;color:#8d2b2b">${desc}<br><b>此操作不可复原</b>，建议先到“数据管理 → 导出 JSON 备份”留一份底。</p>
    <div class="field"><label>请输入「${word}」以确认</label><input id="dgWord" placeholder="${word}"></div>`,
   ()=>{ if($('#dgWord').value.trim()!==word)return toast('请输入「'+word+'」再确认'); closeModal(); onOk() });
}
/* ===== 新建届 / 学期向导 ===== */
function newTermWizard(){
  const cur=curTerm(),rng=nextTermRange(cur);
  modal('新建届 / 学期',
   `<p class="hint">新学期从零开始统计成绩和量化记录；届可以沿用，也可以换成新的一届（比如新高一）。</p>
    <div class="grid">
      <div class="field"><label>届（如 2027届）</label><input id="nwCohort" value="${esc(cur.cohort||'')}" list="cohortListX"><datalist id="cohortListX">${db.cohorts.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="field"><label>学期名称</label><input id="nwName" value="${esc(nextTermName(cur.name))}"></div>
      <div class="field"><label>开始日期</label><input id="nwStart" type="date" value="${rng.start}"></div>
      <div class="field"><label>结束日期</label><input id="nwEnd" type="date" value="${rng.end}"></div>
      <div class="field"><label>学生名单</label><select id="nwRoster"><option value="keep">沿用现在的名单（推荐）</option><option value="clear">清空名单，我重新导入新的</option></select></div>
    </div>`,
   ()=>{
     const t={id:uid(),name:$('#nwName').value.trim()||nextTermName(cur.name),cohort:$('#nwCohort').value.trim(),start:$('#nwStart').value,end:$('#nwEnd').value};
     db.terms.push(t);db.cohorts=[...new Set(db.terms.map(x=>x.cohort).filter(Boolean))];
     db.term=t.id;window.scopeTerm=t.id;window.anKey=null;window.anExam=null;
     const cleared=$('#nwRoster').value==='clear';
     if(cleared)cls().students.forEach(s=>s.active=false);
     save();closeModal();page='history';render();
     toast('已开始新学期：'+t.name+(cleared?'（名单已清空，请重新导入）':'（名单已沿用）'));
   });
}
/* ===== 名单导入：班级名单（只姓名）/ 小组名单（姓名＋小组）分开 ===== */
function importStudents(f,mode){
  readBook(f,b=>{
    const {h,rows:a}=sheetTable(b.Sheets[b.SheetNames[0]]),ni=col(h,['姓名','学生']),pi=col(h,['拼音']),gi=col(h,['小组','分组']);
    if(ni<0)return toast('未识别到“姓名”列，请检查表头');
    if(mode==='group'&&gi<0)return toast('这份表里没有“小组/分组”列；只想导入姓名请用“导入班级名单”');
    const c=cls();let add=0,upd=0;
    a.forEach(r=>{
      const nm=String(r[ni]||'').trim();if(!nm)return;
      const s=findStudent(nm);
      const g=mode==='group'?(String(r[gi]||'').trim()||(s?s.group:(c.groups[0]||'未分组'))):(s?s.group:(c.groups[0]||'未分组'));
      if(c.groups&&g&&!c.groups.includes(g))c.groups.push(g);
      if(s){if(mode==='group'&&g&&s.group!==g){s.group=g;upd++}}
      else{c.students.push({id:uid(),name:nm,pinyin:String(r[pi]||''),group:g||'未分组',active:true});add++}
    });
    save();toast(`名单已导入：新增 ${add} 人${upd?`，更新分组 ${upd} 人`:''}`);render();
  });
}
/* ===== 数据管理页（向导 + 二次确认） ===== */
function data(){
  const c=cls();
  layout('数据管理',
   `<button id="backup" class="primary">导出 JSON 备份</button><button id="restore">导入 JSON 备份</button><button id="bindFile">本机自动备份文件…</button><button id="toGuide">使用说明</button>`,
   `<div class="split">
      <section>
        <h3>届与学期</h3>
        <p>当前学期：<b>${esc(termLabel(db.term))}</b>　共 ${db.terms.length} 个学期 · ${db.cohorts.length} 届。</p>
        <p><button id="wizard" class="primary">新建届 / 学期</button><button id="termAdmin">学期管理</button><button id="endTerm">结束本学期并归档</button><button id="reassign">按日期重新归入学期</button></p>
        <h3>Excel 导入</h3>
        <p>成绩在“成绩管理”里按大考/小测导入；下面是名单、小组和考核记录。</p>
        <p><button id="smartImport" class="primary">智能识别并导入 Excel</button><button id="importStudents">导入班级名单（只姓名）</button><button id="importGroups">导入小组名单（姓名＋小组）</button><button id="exportStudents">导出名单 Excel</button><button id="importRecords">导入考核记录 Excel</button></p>
        <p class="hint">示例文件：<a href="成绩表格模板/学生名单_导入模板.xlsx" download>学生名单</a>　<a href="成绩表格模板/考核记录_导入模板.xlsx" download>考核记录</a>　<a href="成绩表格模板/大考成绩_导入模板.xlsx" download>大考成绩</a>　<a href="成绩表格模板/小测成绩_导入模板.xlsx" download>小测成绩</a></p>
        <h3>班级管理</h3>
        <div class="toolbar"><input id="newClass" placeholder="新班级名称"><button id="addClass">新建班级</button></div>
        <div class="toolbar"><input id="renameClass" value="${esc(c.name)}"><button id="rename">重命名当前班级</button><button class="danger" id="deleteClass">删除当前班级</button></div>
      </section>
      <section>
        <h3>换届与清空</h3>
        <p>下面每项都会弹出二次确认页，必须输入确认词才会执行，并明确提示不可复原。</p>
        <p><button class="danger" id="clearRecords">清空本学期考核记录</button></p>
        <p><button class="danger" id="clearAll">清空本学期的记录和成绩</button></p>
        <p><button class="danger" id="clearStudents">清空名单（记录保留为已离班）</button></p>
        <p><button class="danger" id="clearEverything">清空这个班级的全部数据（名单＋所有学期记录与成绩，一键重来）</button></p>
        <p class="hint">“按区间删记录 / 删单条”在“记录总表”；“删除某次成绩”在“成绩管理”。</p>
      </section>
    </div>`);
  $('#backup').onclick=()=>download(JSON.stringify(db,null,2),'班级评价备份.json','application/json');
  $('#restore').onclick=()=>pick(importBackup);
  $('#bindFile').onclick=bindBackupFile;
  $('#toGuide').onclick=()=>{page='guide';pushHist();render()};
  $('#wizard').onclick=newTermWizard;
  $('#termAdmin').onclick=termAdmin;
  $('#endTerm').onclick=endTerm;
  $('#reassign').onclick=()=>{if(!confirm('按每条数据的日期重新归入对应学期？日期不在任何学期范围内的保持不变。'))return;reassignTerms();save();render();toast('已按日期重新归入学期')};
  $('#smartImport').onclick=()=>pick(importSmart);
  $('#importStudents').onclick=()=>pick(f=>importStudents(f,'name'));
  $('#importGroups').onclick=()=>pick(f=>importStudents(f,'group'));
  $('#importRecords').onclick=()=>pick(importRecords);
  $('#exportStudents').onclick=()=>exportXlsx('学生名单',c.students.map(s=>({姓名:s.name,小组:s.group,状态:s.active?'在班':'已离班'})));
  $('#addClass').onclick=()=>{const n=$('#newClass').value.trim();if(!n)return toast('请输入班级名称');const base=structuredClone(c);base.id=uid();base.name=n;base.students=[];base.records=[];base.exams=[];db.classes.push(base);db.current=base.id;save();render();toast('已新建班级：'+n)};
  $('#rename').onclick=()=>{c.name=$('#renameClass').value.trim()||c.name;save();render();toast('已重命名')};
  $('#deleteClass').onclick=()=>{
    if(db.classes.length===1)return dangerConfirm('清空这个班级的全部数据','「'+c.name+'」的 '+c.students.length+' 名学生、'+c.records.length+' 条量化记录、'+c.exams.length+' 次考试成绩都会被清空（班级保留，可以重新导入）。','清空',
      ()=>{c.students=[];c.records=[];c.exams=[];c.groups=[];save();render();toast('已清空，可以重新导入名单和成绩了')});
    dangerConfirm('删除班级','将删除班级「'+c.name+'」的 '+c.students.length+' 名学生、'+c.records.length+' 条量化记录和 '+c.exams.length+' 次考试成绩。','删除',
      ()=>{db.classes=db.classes.filter(x=>x!==c);db.current=db.classes[0].id;save();render();toast('班级已删除')});
  };
  const inScope=x=>{const s=scopeId();return s==='all'||(x.term||db.term)===s};
  $('#clearRecords').onclick=()=>{
    const n=scopedRecords().length;
    dangerConfirm('清空本学期考核记录','本学期（'+termLabel(scopeId())+'）的 '+n+' 条量化记录将被删除。','清空',
      ()=>{c.records=c.records.filter(r=>!inScope(r));save();render();toast('已清空本学期的 '+n+' 条记录')});
  };
  $('#clearAll').onclick=()=>{
    const n=scopedRecords().length,e=scopedExams().length;
    dangerConfirm('清空本学期记录和成绩','本学期（'+termLabel(scopeId())+'）的 '+n+' 条量化记录和 '+e+' 次考试成绩将被删除。','清空',
      ()=>{c.records=c.records.filter(r=>!inScope(r));c.exams=c.exams.filter(x=>!inScope(x));save();render();toast('已清空本学期数据')});
  };
  $('#clearStudents').onclick=()=>dangerConfirm('清空名单','全部 '+c.students.length+' 名学生会被标记为“已离班”，历史记录保留。','清空',
    ()=>{c.students.forEach(s=>s.active=false);save();render();toast('名单已清空')});
  $('#clearEverything').onclick=()=>dangerConfirm('清空全部数据（所有学期）',
    '将清空「'+c.name+'」的 '+c.students.length+' 名学生、'+c.records.length+' 条量化记录、'+c.exams.length+' 次考试成绩（所有学期）。班级、届与学期设置、考核项目设置会保留，之后可以重新导入自己的名单和成绩。','清空',
    ()=>{c.students=[];c.records=[];c.exams=[];c.groups=[];window.scopeTerm=db.term;save();render();toast('已清空，可以重新导入名单和成绩了')});
}

/* ===== 使用说明（网页内，可打印） ===== */
function guidePage(){
  layout('使用说明 · 老师的操作步骤',
   `<button id="gdPrint" class="primary">打印 / 存成 PDF</button><button id="gdData">去数据管理</button><button id="gdBoard">去看榜单</button>`,
   `<p class="hint">数据只保存在<b>你自己的电脑</b>（浏览器里），不会上传到网上；同一台电脑可以给多位老师各建一个账号，互相看不到对方的数据。换电脑用「数据管理 → 导出/导入 JSON 备份」搬。</p>
    <div class="split">
      <section>
        <h3>① 第一次使用：建一个账号</h3>
        <p>打开网址 → 点「第一次使用？创建一个本机账号」→ 填用户名、密码（至少 4 位）、姓名 → 登录。以后每次打开用这个账号登录即可；忘记密码就点「忘记密码？」，用当初的密保答案重置。</p>
        <h3>② 选好届 / 学期 / 班级</h3>
        <p>登录后如果弹出「选择届 / 学期 / 班级」，确认一下点保存（右上角随时能换）。带完一届要开始新的，去「数据管理 → 新建届 / 学期」，可以选「沿用现在的名单」或「清空名单重新导入」。</p>
        <h3>③ 把学生名单导进来</h3>
        <p>「数据管理 → 导入班级名单（只姓名）」＝表格只要一列姓名；「导入小组名单（姓名＋小组）」＝姓名＋小组两列，导入时自动建小组。也可以在表格里点「添加学生」手工加。</p>
        <p class="mini">模板下载：<a href="成绩表格模板/学生名单_导入模板.xlsx" download>学生名单_导入模板.xlsx</a></p>
        <h3>④ 导入考试成绩</h3>
        <p>「成绩管理 → 导入大考 Excel」：一行一名学生，姓名列右边放各科分数（可以有总分列）。「导入小测 Excel」：一张表一科。名单外的学生会自动加进名单（归到「未分组」）。</p>
        <p>选好文件后会先弹「<b>导入核对</b>」：看清识别到多少学生、多少科目，并确认<b>卷面分</b>（默认语数英 150、物化生政史地 100，可改，改完按科目记住）；同名同日期的成绩会让你选「覆盖」还是「另存一份」。</p>
        <p class="mini">模板下载：<a href="成绩表格模板/大考成绩_导入模板.xlsx" download>大考成绩_导入模板.xlsx</a>　<a href="成绩表格模板/小测成绩_导入模板.xlsx" download>小测成绩_导入模板.xlsx</a></p>
      </section>
      <section>
        <h3>⑤ 平时登记量化考核</h3>
        <p>「量化考核 → 量化录入」：选日期、学生、事项类型、细则，分数会自动带出来（可微调），点「保存记录」。有哪些类型、细则、各扣几分，在「量化考核 → 考核项目设置」里自己加，可以勾“要备注”。</p>
        <p>要批量导入以前的记录，用「数据管理 → 导入考核记录 Excel」（模板：<a href="成绩表格模板/考核记录_导入模板.xlsx" download>考核记录_导入模板.xlsx</a>）。想查某个学生的全部记录，在「记录明细」里点他的姓名。</p>
        <h3>⑥ 看榜单和综合素质评价</h3>
        <p>「量化考核 → 综合素质评价」：上面是<b>今日上榜</b>（正分之星 / 需关注卡片）和<b>最佳小组</b>；下面是<b>综合素质评价</b>——勾选要计入的项目、设占比、给每个量化项目设「参评时间」，点「生成综合排名」得到排名表。</p>
        <p>口径说明：量化分和考试分先按全班拉平到 0~100 分再加权，避免某一项压过其他项；其中「成绩」这一项按「汇总总表」所选考试的<b>平均分</b>算（想换参考哪几次考试，去「汇总总表」勾）。</p>
        <h3>⑦ 小组和成绩分析</h3>
        <p>「小组分类」：小组管理（放人、改名）、学生名单、小组分析（各小组平均分对比）。</p>
        <p>「成绩管理 → 成绩分析」：大考和小测排在同一条时间线上，横坐标是考试名称——点横坐标看那一次全班成绩，点表格里的分数看某个学生的历次曲线，点表头看全班排名；分数段柱形图点一段就看这一段的学生。</p>
        <p>「成绩管理 → 个人成绩统计」：所选考试的均分 / 最高 / 最低、大考总分、小测均分；点姓名可以做<b>两次大考的多维对比</b>。</p>
        <h3>⑧ 数据备份与重新开始</h3>
        <p>建议定期「数据管理 → 导出 JSON 备份」，或点「本机自动备份文件…」绑定一个文件（例如 <code>D:\\班级评价数据.json</code>），以后每次改动自动写进去。换电脑：老电脑导出、新电脑导入。</p>
        <p>想全部推倒重来：<b>数据管理 → 清空这个班级的全部数据</b>（名单＋所有学期的记录和成绩），班级和学期设置保留，之后重新导入即可。</p>
        <h3>常见问题</h3>
        <p>· <b>导入失败</b>：检查表里有没有「姓名」列，且成绩列在姓名列右边；小测表一科一张。<br>
           · <b>看不到刚导入的成绩</b>：看右上角「学期」是不是选对了——成绩、记录都按学期归类，旧学期要去「历史学期」看。<br>
           · <b>班级平均分不对</b>：检查「卷面分 / 及格分」（点了分数段柱形图可以改，按科目记住）。<br>
           · <b>想把数据给别人</b>：导出 JSON 备份发给对方，对方在「数据管理 → 导入 JSON 备份」即可（注意：这是覆盖式导入）。</p>
      </section>
    </div>`);
  $('#gdPrint').onclick=()=>window.print();
  $('#gdData').onclick=()=>{page='data';pushHist();render()};
  $('#gdBoard').onclick=()=>{page='board';pushHist();render()};
}
/* ===== 第一次打开时的“三步上手”提示（每个浏览器只弹一次） ===== */
const WELCOME_KEY='class-score-v1:welcomed';
function maybeWelcome(){
  let seen=null;try{seen=localStorage.getItem(WELCOME_KEY)}catch{}
  if(seen)return;
  if($('#modal'))return setTimeout(maybeWelcome,1200);      /* 等前面的弹窗先关掉 */
  const seenMark=()=>{try{localStorage.setItem(WELCOME_KEY,'1')}catch{}};
  modal('欢迎使用 · 三步上手',
   `<p class="hint">这个网站的数据<b>只存在你自己的电脑</b>上，第一次用按下面走就行：</p>
    <p><b>①</b> 在「选择届 / 学期 / 班级」里确认一下点保存（右上角随时能换）。<br>
       <b>②</b> 「数据管理 → 导入班级名单」把学生名单导进来（有模板可下载）。<br>
       <b>③</b> 「成绩管理 → 导入大考 / 小测 Excel」导入成绩，导入时会让你核对卷面分。</p>
    <p class="mini">平时在「量化录入」记加减分，在「综合素质评价」看出榜和综合排名。每一步的详细说明、模板和常见问题都在「数据管理 → 使用说明」里。<br><button class="link" id="welcomeSkip">先不用看，我自己摸索（以后不再提示）</button></p>`,
   ()=>{seenMark();closeModal();page='guide';pushHist();render()},
   '看使用说明');
  const skip=$('#welcomeSkip');
  if(skip)skip.onclick=()=>{seenMark();closeModal()};
}

function boardCfg(){
  const c=cls();
  if(!c.boardCfg)c.boardCfg={on:{},w:{},from:{},to:{}};
  const g=c.boardCfg;g.on=g.on||{};g.w=g.w||{};g.from=g.from||{};g.to=g.to||{};
  return g;
}
function boardItems(){
  const c=cls(),cfg=boardCfg();
  /* 每个量化项目可以单独设“参评时间”（从 / 到）：只统计这段时间内的记录，留空＝全部时间 */
  const inTime=(k,d)=>{const f=cfg.from[k]||'',t=cfg.to[k]||'';return (!f||String(d||'')>=f)&&(!t||String(d||'')<=t)};
  return [
    ...Object.keys(c.rules).map(t=>{const k='rule:'+t;return {key:k,label:t,time:true,
      get:s=>scopedRecords().filter(r=>r.studentId===s.id&&r.type===t&&inTime(k,r.date)).reduce((n,r)=>n+r.score,0)}}),
    {key:'score',label:'成绩',get:s=>{
      const all=[...examsOf('major'),...examsOf('quiz')];
      const sel=all.filter(e=>(window.sumUse||all.map(x=>x.id)).includes(e.id));
      const v=sel.map(e=>scoreOf(e,s.id,examType(e)==='quiz'?(examSubjects(e)[0]||''):TOTAL)).filter(x=>x!==null);
      return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):0;
    }},
  ];
}
function normalizeVals(vals){const mn=Math.min(...vals),mx=Math.max(...vals);if(mx===mn)return vals.map(()=>vals[0]===0?0:50);return vals.map(v=>+(((v-mn)/(mx-mn))*100).toFixed(1))}
function enhanceBoard(){
  if(page!=='board'||$('#boardExtra'))return;
  const cfg=boardCfg(),items=boardItems(),act=activeStudents();
  if(!act.length||!items.length){
    $('#main').insertAdjacentHTML('beforeend',
     `<div class="card" id="boardExtra"><div class="toolbar"><h2>综合素质评价</h2></div>
      <p class="hint">还没有学生：先到「数据管理 → 导入班级名单（只姓名）」或「导入小组名单（姓名＋小组）」把名单导进来；<b>成绩在「成绩管理」按大考/小测导入</b>，量化记录在「量化录入」里登记。名单进来以后，这里会按你设的项目和占比自动算综合排名。</p>
      <p class="toolbar"><button id="bdGoImport" class="primary">去导入名单</button><button id="bdGoGuide">看使用说明</button></p></div>`);
    if($('#bdGoImport'))$('#bdGoImport').onclick=()=>{page='data';pushHist();render()};
    if($('#bdGoGuide'))$('#bdGoGuide').onclick=()=>{page='guide';pushHist();render()};
    return;
  }
  $('#main').insertAdjacentHTML('beforeend',
   `<div class="card" id="boardExtra"><div class="toolbar"><h2>综合素质评价</h2><button id="bdCalc" class="primary">生成综合排名</button><button id="bdExport">导出 Excel</button></div>
    <p class="hint">自己决定“算哪些项目、各占多少比例”，<b>每个量化项目还能单独设“参评时间”（从 / 到）</b>——只统计这段时间内的记录，留空＝全部时间。<b>“成绩”这一项按所选考试的<u>平均分</u>参与测评</b>（想换参考哪几次考试，去“量化考核 → 汇总总表”勾选）。量化分与考试分量纲不同，程序先把每项按全班拉平到 0~100 分再加权，避免某一项压过其他项。<button id="bdGoSum">去设置参考考试</button></p>
    <div class="table-wrap" style="max-height:260px"><table><thead><tr><th>计入</th><th>参考项</th><th>参评时间（从 / 到）</th><th>占比</th></tr></thead><tbody>
    ${items.map(it=>`<tr><td><input type="checkbox" data-on="${esc(it.key)}" ${cfg.on[it.key]===false?'':'checked'}></td><td>${esc(it.label)}</td>
      <td>${it.time?`<input type="date" data-from="${esc(it.key)}" value="${cfg.from[it.key]||''}"> ~ <input type="date" data-to="${esc(it.key)}" value="${cfg.to[it.key]||''}">`:'<span class="mini">按汇总总表所选考试的均分</span>'}</td>
      <td><input type="number" min="0" step="0.5" style="width:90px" data-w="${esc(it.key)}" value="${cfg.w[it.key]??1}"></td></tr>`).join('')}
    </tbody></table></div>
    <div id="bdResult"></div></div>`);
  const calc=()=>{
    items.forEach(it=>{
      cfg.on[it.key]=document.querySelector(`[data-on="${it.key}"]`).checked;
      cfg.w[it.key]=+document.querySelector(`[data-w="${it.key}"]`).value||0;
      if(it.time){
        const f=document.querySelector(`[data-from="${it.key}"]`),t=document.querySelector(`[data-to="${it.key}"]`);
        cfg.from[it.key]=f?f.value:'';cfg.to[it.key]=t?t.value:'';
      }
    });
    const all=items.filter(it=>cfg.on[it.key]&&(cfg.w[it.key]||0)>0);
    const use=all.filter(it=>act.some(s=>{const v=it.get(s);return v!==0&&v!==null&&v!==''}));
    const skipped=all.filter(it=>!use.includes(it)).map(it=>it.label);
    if(!use.length)return toast('至少勾选一个项目并给它正数占比');
    const norm=use.map(it=>({it,vals:act.map(s=>it.get(s))}));
    norm.forEach(r=>r.n=normalizeVals(r.vals));
    const wsum=norm.reduce((n,r)=>n+(cfg.w[r.it.key]||0),0);
    const sumRows=sumState().rows,byId=Object.fromEntries(sumRows.map(r=>[r.s.id,r]));   /* 并入“今日上榜/汇总总表”的那几列 */
    const rows=act.map((s,i)=>({s,score:+(norm.reduce((n,r)=>n+r.n[i]*(cfg.w[r.it.key]||0),0)/wsum).toFixed(1),vals:norm.map(r=>r.vals[i])}))
      .sort((a,b)=>b.score-a.score);
    rows.forEach((r,i)=>r.rank=i+1);
    window.__bdRows=rows;window.__bdUse=use;
    const hasScore=use.some(it=>it.key==='score');   /* “成绩”项本身就是所选考试的平均分，就不重复一列“平均成绩” */
    $('#bdResult').innerHTML=`${skipped.length?`<p class="hint">这些勾选项全班都还没有数据，本次已自动忽略：${skipped.map(esc).join('、')}</p>`:''}
      <div class="table-wrap" style="max-height:480px"><table><thead><tr><th>名次</th><th>姓名</th><th>小组</th>${hasScore?'':'<th>平均成绩</th>'}<th>参考考试次数</th><th>量化合计</th>${use.map(it=>`<th>${esc(it.label)}</th>`).join('')}<th>合计</th><th>综合得分</th></tr></thead><tbody>
      ${rows.map(r=>{const b=byId[r.s.id]||{};return `<tr style="cursor:pointer" onclick="openStudentStat('${r.s.id}')"><td class="rank">${r.rank}</td><td>${esc(r.s.name)}</td><td>${esc(r.s.group)}</td>
        ${hasScore?'':`<td>${b.avg==null?'—':fmtN(b.avg)}</td>`}<td>${b.cnt||0}</td><td>${fmtN(b.q)}</td>${r.vals.map(v=>`<td>${fmtN(v)}</td>`).join('')}<td><b>${fmtN(b.total)}</b></td><td><b>${r.score}</b></td></tr>`}).join('')}
      </tbody></table></div><p class="mini">点任意一行 → 这名学生的个人成绩统计。“平均成绩 / 参考考试次数 / 量化合计 / 合计”四列来自“量化考核 → 汇总总表”，会随那里勾选的考试与时间自动变化；“综合得分”按上面各项占比归一化加权算出。</p>`;
    save();
  };
  $('#bdCalc').onclick=calc;
  document.querySelectorAll('#boardExtra [data-from],#boardExtra [data-to]').forEach(i=>i.onchange=()=>calc());   /* 改参评时间即时重算 */
  if($('#bdGoSum'))$('#bdGoSum').onclick=()=>{page='summary';render()};
  $('#bdExport').onclick=()=>{
    if(!window.__bdRows)return toast('先点“生成综合排名”');
    exportXlsx('综合素质评价',window.__bdRows.map(r=>({名次:r.rank,姓名:r.s.name,小组:r.s.group,...Object.fromEntries(window.__bdUse.map((it,i)=>[it.label,r.vals[i]])),综合得分:r.score})));
  };
  calc();
}
window.openStudentStat=id=>{
  const s=stuById(id);if(!s)return;
  page='personal';render();
  setTimeout(()=>{const el=$('#personSearch');if(el){el.value=s.name;el.dispatchEvent(new Event('change'))}window.scrollTo({top:0,behavior:'smooth'})},80);
};

function pickerModal(){
  try{if(sessionStorage.getItem('pickedOnce'))return}catch{}
  const c=cls(),cohorts=db.cohorts.length?db.cohorts:[(termById(db.term)||{}).cohort||'（未分届）'];
  const curCohort=(termById(scopeId())||termById(db.term)||{}).cohort||cohorts[0];
  const termOpts=coh=>db.terms.filter(t=>t.cohort===coh).sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  const paint=()=>{
    const coh=$('#pkCohort').value,terms=termOpts(coh);
    $('#pkTerm').innerHTML=terms.map(t=>`<option value="${t.id}" ${t.id===scopeId()?'selected':''}>${esc(t.name)}${t.id===db.term?'（当前）':''}</option>`).join('')||'<option value="">（这个届还没有学期）</option>';
  };
  modal('选择届 / 学期 / 班级',
   `<p class="hint">每个老师可以带多个届；选好以后就是你的工作范围，主页面右上角随时能换。</p>
    <div class="grid">
      <div class="field"><label>届</label><select id="pkCohort">${cohorts.map(x=>`<option ${x===curCohort?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label>学期</label><select id="pkTerm"></select></div>
      <div class="field"><label>班级</label><select id="pkClass">${db.classes.map(x=>`<option value="${x.id}" ${x.id===db.current?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
    </div>`,
   ()=>{
     const clsId=$('#pkClass').value,termId=$('#pkTerm').value;
     db.current=clsId;if(termId)window.scopeTerm=termId;
     try{sessionStorage.setItem('pickedOnce','1')}catch{}
     closeModal();save();render();toast('已进入：'+termLabel(scopeId())+' · '+cls().name);
   });
  paint();
  $('#pkCohort').onchange=paint;
}
/* 个人成绩统计页：该生各科折线图后面再补一条“班级均分”对比线 */
function addClassAvgToPersonChart(s){
  const cv=$('#scoreLine');if(!cv)return;
  const e=[...cls().exams].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const sel=window.subjectLines||['总分'];
  const own=sel.map(sub=>({name:sub,values:e.map(x=>sub==='总分'?(x.scores[s.id]?.total||0):(x.scores[s.id]?.values?.[sub]||0))}));
  /* 只给“总分”补一条班级均分对比线，避免科目线太多看不清 */
  const avg=sel.filter(sub=>sub==='总分').map(sub=>({name:'总分·班级均分',values:e.map(x=>avgOf(activeStudents().map(q=>x.scores[q.id]?.total).filter(v=>v!=null&&v!==''&&!isNaN(+v)).map(Number)))}));
  lineChart(cv,e.map(x=>x.name),own.concat(avg),`${s.name} 各科及总分变化（含班级均分对比，悬停查看数值）`);
}
(function(){const orig=drawPersonCharts;window.drawPersonCharts=drawPersonCharts=s=>{orig(s);try{addClassAvgToPersonChart(s)}catch(e){}}})();
const _bootDone=boot;
boot=async()=>{ await _bootDone(); setTimeout(()=>{try{if(user&&mode==='local'||user) pickerModal()}catch(e){}},300); setTimeout(()=>{try{maybeWelcome()}catch(e){}},1600) };

boot();
