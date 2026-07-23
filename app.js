const TEMPLATES = window.QPC_TEMPLATES || [];
const INSTRUCTIVOS = window.QPC_INSTRUCTIVOS || [];
const MAPEOS = window.QPC_MAPEOS || [];

const STORAGE_KEY = 'qpc_supabase_v6_cache';
const REMOTE_STATE_ID = 'main';
if (!window.supabase?.createClient) {
  throw new Error('No cargó la librería oficial de Supabase.');
}
if (!window.QPC_SUPABASE_URL || !window.QPC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Faltan la URL o la Publishable Key de Supabase.');
}
const supabaseClient = window.supabase.createClient(
  window.QPC_SUPABASE_URL,
  window.QPC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
let authenticatedUser = null;
let saveTimer = null;
const ENGINEER_TARGET = 95;
const MAX_ATTACHMENT_BYTES = 1200000;
const MAX_TOTAL_ATTACHMENT_BYTES = 3500000;
let data = null;

const ROLE_LABELS = {
  EJECUCION: 'Ingeniero de Ejecución',
  CALIDAD: 'Ingeniero de Calidad',
  COORDINADOR_CALIDAD: 'Coordinador de Calidad',
  GERENCIA: 'Gerente de Proyecto',
  PRESIDENTE: 'Presidente'
};

const AREA_LABELS = {
  ESTRUCTURA: 'Estructura',
  TERMINACION: 'Terminación'
};

const USERS = [
  {id:'exec-1',name:'Ing. Ejecución Demo A',email:'ejecucion1@codelpa.demo',role:'EJECUCION',executionArea:'TERMINACION',projectIds:['LCE']},
  {id:'quality-1',name:'Ing. Calidad Demo 1',email:'calidad1@codelpa.demo',role:'CALIDAD',projectIds:['LCE']},
  {id:'coord-1',name:'Coordinador Calidad Demo',email:'coordinador@codelpa.demo',role:'COORDINADOR_CALIDAD',projectIds:['LCE']},
  {id:'manager-1',name:'Gerente de Proyecto Demo',email:'gerencia@codelpa.demo',role:'GERENCIA',projectIds:['LCE']},
  {id:'president-1',name:'Presidente Demo',email:'presidente@codelpa.demo',role:'PRESIDENTE',projectIds:['LCE','VC','CN','RC']}
];

function templateById(id){ return TEMPLATES.find(t=>t.id===id); }
function mappingById(id){ return [...MAPEOS,...(data?.customMappings||[])].find(m=>m.id===id); }
function userById(id){ return data.users.find(u=>u.id===id); }
function currentUser(){ return authenticatedUser; }
function canOperateQuality(user){ return ['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role); }
function canReadProject(user){ return ['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(user.role); }
function canConfigure(user){ return user.role==='COORDINADOR_CALIDAD'; }
function canOpenInspectionResources(user,inspection){
  if(user.role==='EJECUCION')return inspection.createdBy===user.id;
  // Todo el personal de Calidad puede revisar los adjuntos desde la bandeja,
  // incluso antes de tomar o asignarse la inspección.
  if(['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role))return true;
  return ['GERENCIA','PRESIDENTE'].includes(user.role);
}
function escapeHtml(value=''){ return String(value).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function initials(name){ return name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
function nowISO(){ return new Date().toISOString(); }
function formatDate(value){ if(!value)return '—'; return new Date(value+'T12:00:00').toLocaleDateString('es-DO'); }
function formatDateTime(value){ if(!value)return '—'; return new Date(value).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'}); }
function round1(v){ return Math.round((Number(v)||0)*10)/10; }
function mean(values){ const nums=values.filter(v=>Number.isFinite(Number(v))).map(Number); return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0; }
function trafficFor(score,objective){ const d=score-objective; return d>=0?'Verde':d>=-5?'Amarillo':'Rojo'; }
function statusFromDecision(decision){ return decision==='Liberada'?'LIBERADA':decision==='Con observaciones'?'CON_OBSERVACIONES':'NO_LIBERADA'; }
function csvEscape(v){ const s=String(v??''); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function monthKey(date){ return String(date||'').slice(0,7); }
function toISODate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function qualityWeekStart(dateString){
  const d=new Date(`${dateString}T12:00:00`);
  const offset=(d.getDay()-4+7)%7;
  d.setDate(d.getDate()-offset);
  return toISODate(d);
}
function qualityWeekEnd(start){ const d=new Date(`${start}T12:00:00`);d.setDate(d.getDate()+6);return toISODate(d); }
function qualityWeekLabel(start){ return `${formatDate(start)} al ${formatDate(qualityWeekEnd(start))}`; }
function periodMatches(date,mode,value){ return mode==='week'?qualityWeekStart(date)===value:monthKey(date)===value; }
function nextCode(){ return `INSP-LCE-2026-${String(data.inspections.length+1).padStart(4,'0')}`; }
function nextPackage(template,mapping){
  const activity=(template?.activity||'ACT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'').slice(0,5).toUpperCase();
  return `PL-${mapping?.block||'LCE'}-${(mapping?.level||'N00').replace(/\s/g,'')}-${activity}-${String(data.inspections.length+1).padStart(3,'0')}`;
}
function toast(message){
  const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3000);
}
function downloadFile(filename,content,type='text/csv;charset=utf-8;'){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function findTemplate(activity,stage='General'){
  return TEMPLATES.find(t=>t.activity===activity&&t.stage===stage)||TEMPLATES.find(t=>t.activity===activity)||TEMPLATES[0];
}
function templatesForActivity(activity){ return TEMPLATES.filter(t=>t.activity===activity); }
function stageDisplay(stage){ return stage==='Terminación'?'Terminación / cierre':stage; }
function bestOption(criterion){ return [...criterion.options].filter(o=>o.factor!==null).sort((a,b)=>b.factor-a.factor)[0]; }
function lowerOption(criterion,severity=1){
  const opts=[...criterion.options].filter(o=>o.factor!==null).sort((a,b)=>a.factor-b.factor);
  if(!opts.length)return null;
  if(severity===1){return opts.find(o=>o.factor>=.5&&o.factor<1)||opts[Math.min(1,opts.length-1)]||opts[0];}
  return opts[0];
}
function answerFactor(criterion,label){ const option=criterion.options.find(o=>o.label===label);return option?option.factor:null; }
function buildSeedAnswers(template,weakCriteria=[],severity=1){
  const answers={};
  template.criteria.forEach(c=>{answers[c.id]=bestOption(c)?.label||'';});
  weakCriteria.forEach(name=>{
    const c=template.criteria.find(x=>x.name===name||x.name.toLowerCase().includes(String(name).toLowerCase()));
    if(c)answers[c.id]=lowerOption(c,severity)?.label||answers[c.id];
  });
  return answers;
}
function calculateAnswers(template,answers){
  let techNum=0,techDen=0,visitNum=0,visitDen=0,totalNum=0,totalDen=0,answered=0;
  template.criteria.forEach(c=>{
    const label=answers?.[c.id];if(!label)return;answered++;
    const factor=answerFactor(c,label);if(factor===null)return;
    totalNum+=c.weight*factor;totalDen+=c.weight;
    if(c.isVisitCriterion){visitNum+=c.weight*factor;visitDen+=c.weight;}else{techNum+=c.weight*factor;techDen+=c.weight;}
  });
  const technical=techDen?techNum/techDen*100:0;
  const visit=visitDen?visitNum/visitDen*100:100;
  const final=totalDen?totalNum/totalDen*100:0;
  return {technical,visit,final,answered,total:template.criteria.length};
}
function makeSeedVisit(template,number,date,qualityId,weakCriteria=[],severity=1,perfect=false){
  const answers=buildSeedAnswers(template,perfect?[]:weakCriteria,severity);
  const score=calculateAnswers(template,answers);
  return {
    id:`v-${date}-${number}-${Math.random().toString(36).slice(2,7)}`,
    number,templateId:template.id,stage:template.stage,startedAt:`${date}T08:10:00`,finishedAt:`${date}T09:05:00`,startedBy:qualityId,finishedBy:qualityId,
    answers,notes:{},generalObservation:perfect?'Área conforme en la visita.':'Se registraron oportunidades de mejora.',
    technicalScore:round1(score.technical),visitScore:round1(score.visit),finalScore:round1(score.final),objective:template.objective,traffic:trafficFor(score.final,template.objective),
    decision:score.final>=template.objective?'Liberada':score.final>=template.objective-5?'Con observaciones':'No liberada',weakCriteria:[...weakCriteria],status:'FINALIZADA'
  };
}
function seedCompleted(id,createdBy,activity,stage,date,qualityId,mappingId,weakCriteria=[],visitCount=1,severity=1){
  const t=findTemplate(activity,stage);const map=mappingById(mappingId)||MAPEOS[0];
  const visits=[];
  if(visitCount>1)visits.push(makeSeedVisit(t,1,date,qualityId,[],1,true));
  const finalDate=visitCount>1?toISODate(new Date(new Date(`${date}T12:00:00`).getTime()+86400000)):date;
  visits.push(makeSeedVisit(t,visitCount,finalDate,qualityId,weakCriteria,severity,false));
  const latest=visits[visits.length-1];
  return {
    id,code:`INSP-LCE-2026-${id.replace(/\D/g,'').padStart(4,'0')}`,projectId:'LCE',createdBy,templateId:t.id,mappingId:map.id,
    contractor:['exec-2','exec-4','exec-6'].includes(createdBy)?'Contratista Estructura Demo':'Contratista Terminación Demo',location:`${map.block} · ${map.level} · ${map.area}`,
    packageCode:`PL-${map.code}-${id.toUpperCase()}`,scope:`Inspección de ${t.activity} - ${stageDisplay(t.stage)}`,
    requestedDate:date,requestedTime:'08:00',ready:true,status:statusFromDecision(latest.decision),assignedQualityId:qualityId,
    createdAt:`${date}T07:30:00`,startedAt:visits[0].startedAt,completedAt:latest.finishedAt,closedBy:qualityId,
    technicalScore:latest.technicalScore,visitScore:latest.visitScore,finalScore:latest.finalScore,objective:latest.objective,traffic:latest.traffic,decision:latest.decision,
    visitsCount:visits.length,firstVisit:visits.length===1,weakCriteria:latest.weakCriteria,visitEvaluations:visits,activeVisitId:null,
    attachments:[{name:'Evidencia fotográfica registrada',type:'image/jpeg',dataUrl:null,kind:'Fotografía'}],mappingAnnotation:null,
    audit:[
      {at:`${date}T07:30:00`,userId:createdBy,action:'Solicitud enviada a Calidad'},
      {at:`${date}T07:35:00`,userId:createdBy,action:'Área confirmada como lista'},
      ...visits.flatMap(v=>[
        {at:v.startedAt,userId:qualityId,action:`Visita ${v.number} iniciada · ${stageDisplay(v.stage)}`},
        {at:v.finishedAt,userId:qualityId,action:`Visita ${v.number} cerrada con ${v.finalScore}% · ${v.decision}`}
      ])
    ]
  };
}
function initialData(){
  return {version:6,users:[],inspections:[],customMappings:[],customDocuments:[]};
}
function profileToUser(profile){
  return {
    id: profile.legacy_id,
    authId: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    executionArea: profile.execution_area || null,
    projectIds: profile.project_ids || ['LCE'],
    isActive: profile.is_active !== false
  };
}
async function loadProfiles(){
  const {data: profiles,error}=await supabaseClient.from('profiles').select('*').eq('is_active',true);
  if(error) throw error;
  data.users=(profiles||[]).map(profileToUser);
}
async function loadRemoteData(){
  const {data: row,error}=await supabaseClient.from('app_state').select('payload').eq('id',REMOTE_STATE_ID).maybeSingle();
  if(error) throw error;
  const remote=row?.payload;
  data=remote&&remote.version===6?remote:initialData();
  await loadProfiles();
  if(!row){
    const {error: insertError}=await supabaseClient.from('app_state').insert({id:REMOTE_STATE_ID,payload:data});
    if(insertError) throw insertError;
  }
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}
function saveData(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    const payload={...data,users:[]};
    const {error}=await supabaseClient.from('app_state').upsert({id:REMOTE_STATE_ID,payload,updated_at:new Date().toISOString()});
    if(error){console.error(error);toast('No se pudo sincronizar con Supabase');}
  },250);
}
data=initialData();
let ui={
  view:'home',selectedId:null,queueTab:'DISPONIBLES',reportMode:'month',reportValue:'2026-07',docSearch:'',mapSearch:'',templateFilter:'',
  requestDraft:{templateId:'',mappingId:MAPEOS[0]?.id||'',contractor:'Contratista Terminación Demo',date:'2026-07-24',time:'08:00',scope:'Área completa según el mapeo seleccionado.',ready:true,annotationData:null},
  activeVisitId:null,annotator:{drawing:false,color:'#ef4444',size:8,eraser:false}
};
function render(){
  const user=currentUser();document.getElementById('app').innerHTML=user?renderShell(user):renderLogin();bindGlobal();if(user)bindView(user);
}
function renderLogin(){
  return `<div class="login-shell">
    <section class="login-brand"><div><div class="brand-lockup"><div class="logo">C</div><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#c9d9e8">CODELPA</div></div></div><h1>Inspecciones, visitas, planillas y calificaciones con trazabilidad completa.</h1><p>Esta versión permite ver exactamente dónde se descontaron puntos, registrar calificaciones distintas por visita, marcar mapeos y generar análisis semanales de jueves a miércoles.</p><div class="feature-grid"><div class="feature">✓ Desglose de puntos por criterio y visita</div><div class="feature">✓ Liberación, seguimiento y terminación</div><div class="feature">✓ Semanas de jueves a miércoles</div><div class="feature">✓ Puntos débiles y comparación de ingenieros</div></div></div><div class="login-note">Demo funcional conectada a Supabase. Las sesiones y los datos se comparten entre usuarios autorizados.</div></section>
    <section class="login-panel"><div class="login-card"><h2>Iniciar sesión</h2><p>El sistema identifica el rol y el área de cada usuario.</p><div id="loginError"></div><div class="field"><label>Correo electrónico</label><input id="loginEmail" type="email" placeholder="usuario@codelpa.demo" autocomplete="username"></div><div class="field" style="margin-top:14px"><label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••" autocomplete="current-password"></div><button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button><div class="demo-users"><h3>Usuarios de demostración</h3><div class="helper" style="margin-bottom:10px">Selecciona un usuario para completar automáticamente sus credenciales.</div>${USERS.filter(u=>['exec-1','quality-1','coord-1','manager-1','president-1'].includes(u.id)).map(u=>`<div class="demo-user"><div><strong>${escapeHtml(ROLE_LABELS[u.role])}</strong><br><span>${escapeHtml(u.email)}</span><br><span>Contraseña: <strong>12345678</strong></span></div><button data-demo-email="${escapeHtml(u.email)}">Usar</button></div>`).join('')}</div></div></section>
  </div>`;
}
function navItems(user){
  if(user.role==='EJECUCION')return [['home','⌂','Mi dashboard'],['newRequest','＋','Solicitar inspección'],['myInspections','☷','Mis inspecciones'],['documents','▤','Instructivos'],['mappings','▦','Mapeos']];
  if(canOperateQuality(user))return [['home','⌂','Inicio'],['qualityQueue','☷','Bandeja de Calidad'],['myInspections','✓','Mis inspecciones'],['ratings','▥','Calificaciones'],['exports','⇩','Exportaciones'],['documents','▤','Instructivos'],['mappings','▦','Mapeos'],...(canConfigure(user)?[['users','⚙','Usuarios y permisos']]:[])];
  return [['home','⌂','Dashboard'],['ratings','▥','Calificaciones'],['documents','▤','Instructivos']];
}
function viewTitle(){return {home:'Inicio',newRequest:'Solicitar inspección',annotateMap:'Marcar mapeo',myInspections:'Inspecciones',qualityQueue:'Bandeja de Calidad',detail:'Detalle de inspección',evaluate:'Planilla digital',documents:'Instructivos',mappings:'Mapeos',ratings:'Calificaciones',exports:'Exportaciones',users:'Usuarios y permisos'}[ui.view]||'Quality Project Control';}
function renderShell(user){
  const selected=ui.selectedId?data.inspections.find(i=>i.id===ui.selectedId):null;
  return `<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand"><div class="logo">C</div><div><strong>QUALITY PROJECT CONTROL</strong><small>CODELPA</small></div></div><div class="user-chip"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(ROLE_LABELS[user.role])}</span>${user.executionArea?`<span>Área: ${escapeHtml(AREA_LABELS[user.executionArea])}</span>`:''}<span>Proyecto: Lopesan La Ceiba</span></div><div class="nav-label">Navegación</div>${navItems(user).map(([id,icon,label])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-nav="${id}"><span>${icon}</span>${label}</button>`).join('')}<div class="sidebar-footer"><button id="resetBtn">Restablecer demo</button><button id="logoutBtn">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div class="top-left"><button id="menuBtn" class="mobile-menu">☰</button><div><h1>${viewTitle()}</h1><p>${selected?escapeHtml(selected.code):'Proyecto Lopesan La Ceiba'}</p></div></div><div class="top-right"><span class="role-pill">${escapeHtml(ROLE_LABELS[user.role])}</span><div class="avatar">${initials(user.name)}</div></div></header><div class="content">${renderView(user)}</div></main></div><div id="overlay" class="drawer-overlay hidden"></div>`;
}
function renderView(user){
  switch(ui.view){
    case 'newRequest':return renderNewRequest(user);
    case 'annotateMap':return renderAnnotateMap(user);
    case 'myInspections':return renderMyInspections(user);
    case 'qualityQueue':return renderQueue(user);
    case 'detail':return renderDetail(user);
    case 'evaluate':return renderEvaluation(user);
    case 'documents':return renderDocuments(user);
    case 'mappings':return renderMappings(user);
    case 'ratings':return renderRatings(user);
    case 'exports':return renderExports(user);
    case 'users':return renderUsers(user);
    default:return renderHome(user);
  }
}
function metric(label,value,foot,tone=''){return `<div class="card"><div class="metric-label">${label}</div><div class="metric-value ${tone}">${value}</div><div class="metric-foot">${foot}</div></div>`;}
function badge(status){const map={BORRADOR:['Borrador','badge-gray'],SOLICITADA:['Solicitada','badge-blue'],TOMADA:['Tomada','badge-blue'],EN_EVALUACION:['En evaluación','badge-yellow'],CON_OBSERVACIONES:['Con observaciones','badge-yellow'],LIBERADA:['Liberada','badge-green'],NO_LIBERADA:['No liberada','badge-red'],IMPROCEDENTE:['Improcedente','badge-red'],EN_REINSPECCION:['En reinspección','badge-yellow'],CERRADA:['Cerrada','badge-green']};const [label,cls]=map[status]||[status,'badge-gray'];return `<span class="badge ${cls}">${label}</span>`;}
function trafficBadge(t){const cls=t==='Verde'?'badge-green':t==='Amarillo'?'badge-yellow':'badge-red';return t?`<span class="badge ${cls}">${t}</span>`:'—';}
function noAccess(){return `<div class="alert alert-danger">No tiene permisos para acceder a esta vista.</div>`;}
function completedInspections(){return data.inspections.filter(i=>Number.isFinite(i.finalScore)&&i.completedAt);}
function inspectionsForExecution(user){return data.inspections.filter(i=>i.createdBy===user.id);}
function evaluationRecords(){
  const records=[];
  data.inspections.forEach(i=>{
    (i.visitEvaluations||[]).filter(v=>v.status==='FINALIZADA'&&Number.isFinite(v.finalScore)).forEach(v=>{
      const t=templateById(v.templateId||i.templateId);records.push({inspection:i,visit:v,template:t,createdBy:i.createdBy,completedDate:v.finishedAt.slice(0,10),finalScore:v.finalScore,technicalScore:v.technicalScore,visitScore:v.visitScore,objective:v.objective||t.objective,firstVisit:v.number===1,status:i.status});
    });
  });
  return records;
}
function monthlyRecordsForUser(user,month='2026-07'){return evaluationRecords().filter(r=>r.createdBy===user.id&&monthKey(r.completedDate)===month);}
function renderHome(user){if(user.role==='EJECUCION')return renderExecutionDashboard(user);return renderOperationalDashboard(user);}
function renderExecutionDashboard(user){
  const month='2026-07',own=inspectionsForExecution(user),records=monthlyRecordsForUser(user,month),avg=mean(records.map(r=>r.finalScore));
  const released=own.filter(i=>i.status==='LIBERADA'&&i.completedAt&&monthKey(i.completedAt)==month).length;
  const first=records.filter(r=>r.firstVisit&&r.visit.decision==='Liberada').length;
  const byActivity=groupRatings(records,'activityStage');
  return `<div class="page-head"><div><h2>Mi dashboard de Ejecución</h2><p>Calificación mensual, historial, visitas y puntos descontados.</p></div><div class="button-row"><button class="btn btn-primary btn-lg" data-nav="newRequest">＋ Solicitar inspección</button></div></div><div class="grid grid-4">${metric('Calificación de julio',`${round1(avg)}%`,'Promedio de todas las visitas evaluadas',avg>=90?'positive':avg>=85?'warning':'critical')}${metric('Inspecciones colocadas',own.length,'Historial completo')}${metric('Liberadas',released,'Cerradas durante julio','positive')}${metric('Liberadas en 1ra visita',first,'Visitas aprobadas sin seguimiento')}</div><div class="grid grid-2" style="margin-top:16px"><div class="card"><h3>Calificación por taller y etapa</h3>${byActivity.length?byActivity.map(r=>bar(`${r.activity} · ${stageDisplay(r.stage)}`,r.average,r.objective)).join(''):'<div class="empty">Sin evaluaciones cerradas.</div>'}</div><div class="card"><h3>Resumen de gestión</h3><div class="kv"><div>Área de trabajo</div><div>${escapeHtml(AREA_LABELS[user.executionArea]||'—')}</div><div>Visitas evaluadas</div><div>${records.length}</div><div>Promedio técnico</div><div>${round1(mean(records.map(r=>r.technicalScore)))}%</div><div>Promedio preparación / visitas</div><div>${round1(mean(records.map(r=>r.visitScore)))}%</div><div>Con observaciones</div><div>${own.filter(i=>i.status==='CON_OBSERVACIONES').length}</div></div></div></div><div class="section-title"><h3>Mis inspecciones recientes</h3></div>${inspectionsTable([...own].sort((a,b)=>(b.completedAt||b.createdAt).localeCompare(a.completedAt||a.createdAt)).slice(0,10),user)}`;
}
function renderOperationalDashboard(user){
  const records=evaluationRecords(),byActivity=groupRatings(records.filter(r=>monthKey(r.completedDate)==='2026-07'),'activityStage');
  return `<div class="page-head"><div><h2>${user.role==='PRESIDENTE'?'Resumen ejecutivo':'Operación de Calidad'}</h2><p>Seguimiento del proyecto, talleres e ingenieros.</p></div>${canOperateQuality(user)?'<div class="button-row"><button class="btn btn-primary" data-nav="qualityQueue">Abrir bandeja</button></div>':''}</div><div class="grid grid-4">${metric('Disponibles para tomar',data.inspections.filter(i=>i.status==='SOLICITADA'&&i.ready).length,'Áreas listas')}${metric('Visitas evaluadas',records.length,'Incluye segundas visitas')}${metric('Promedio de julio',`${round1(mean(records.filter(r=>monthKey(r.completedDate)==='2026-07').map(r=>r.finalScore)))}%`,'Media general','positive')}${metric('Talleres bajo meta',byActivity.filter(r=>r.average<r.objective).length,'Requieren puntos débiles','warning')}</div><div class="grid grid-2" style="margin-top:16px"><div class="card"><h3>Resultado por taller</h3>${byActivity.map(r=>bar(`${r.activity} · ${stageDisplay(r.stage)}`,r.average,r.objective)).join('')}</div><div class="card"><h3>Puntos de atención</h3>${renderWeaknesses(records)}</div></div><div class="section-title"><h3>Inspecciones recientes</h3></div>${inspectionsTable([...data.inspections].sort((a,b)=>(b.completedAt||b.createdAt).localeCompare(a.completedAt||a.createdAt)).slice(0,10),user)}`;
}
function bar(label,value,objective=95){const width=Math.max(0,Math.min(100,value));const tone=value>=objective?'#15803d':value>=objective-5?'#b7791f':'#b42318';return `<div class="bar-row"><strong>${escapeHtml(label)}</strong><div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${tone}"></div></div><strong>${round1(value)}%</strong></div>`;}
function renderWeaknesses(records){
  const counts={};records.forEach(r=>criterionLosses(r.visit,r.template).forEach(x=>{const k=`${r.template.activity} · ${x.name}`;counts[k]=(counts[k]||0)+1;}));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);if(!top.length)return '<div class="empty">No hay criterios recurrentes registrados.</div>';
  return `<div class="timeline">${top.map(([name,count])=>`<div class="timeline-item"><span class="timeline-dot"></span><strong>${escapeHtml(name)}</strong><p>${count} fallo${count===1?'':'s'} registrado${count===1?'':'s'}</p></div>`).join('')}</div>`;
}
function inspectionsTable(rows,user){
  if(!rows.length)return '<div class="card empty">No hay inspecciones para mostrar.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Fecha</th><th>Taller / etapa actual</th><th>Ubicación</th><th>Ingeniero de ejecución</th><th>Calidad</th><th>Último resultado</th><th>Visitas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows.map(i=>{const t=templateById(i.templateId),exec=userById(i.createdBy),quality=userById(i.assignedQualityId);return `<tr><td><strong>${escapeHtml(i.code)}</strong></td><td>${formatDate(i.completedAt?i.completedAt.slice(0,10):i.requestedDate)}<br><span class="helper">${escapeHtml(i.requestedTime||'')}</span></td><td>${escapeHtml(t?.activity||'—')}<br><span class="helper">${escapeHtml(stageDisplay(t?.stage||'General'))}</span></td><td>${escapeHtml(i.location)}</td><td>${escapeHtml(exec?.name||'—')}<br><span class="helper">${escapeHtml(AREA_LABELS[exec?.executionArea]||'')}</span></td><td>${escapeHtml(quality?.name||'Sin asignar')}</td><td>${Number.isFinite(i.finalScore)?`${round1(i.finalScore)}% ${trafficBadge(i.traffic)}`:'—'}</td><td>${i.visitEvaluations?.length||0}</td><td>${badge(i.status)}</td><td><div class="actions"><button class="btn btn-outline" data-open="${i.id}">Ver</button>${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar</button>`:''}${canOperateQuality(user)&&i.assignedQualityId===user.id&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Evaluar</button>`:''}</div></td></tr>`;}).join('')}</tbody></table></div>`;
}
function renderMyInspections(user){const rows=user.role==='EJECUCION'?data.inspections.filter(i=>i.createdBy===user.id):canOperateQuality(user)?data.inspections.filter(i=>i.assignedQualityId===user.id):data.inspections;return `<div class="page-head"><div><h2>${user.role==='EJECUCION'?'Mi historial de inspecciones':'Mis inspecciones de Calidad'}</h2><p>${user.role==='EJECUCION'?'Abra una inspección para ver cada visita y los puntos descontados.':'Inspecciones tomadas o asignadas a su usuario.'}</p></div>${user.role==='EJECUCION'?'<div class="button-row"><button class="btn btn-primary" data-nav="newRequest">＋ Nueva solicitud</button></div>':''}</div>${inspectionsTable(rows,user)}`;}
function templateOptions(selectedId){const groups={};TEMPLATES.forEach(t=>{(groups[t.activity]??=[]).push(t)});return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([activity,items])=>`<optgroup label="${escapeHtml(activity)}">${items.map(t=>`<option value="${t.id}" ${t.id===selectedId?'selected':''}>${escapeHtml(stageDisplay(t.stage))} · ${escapeHtml(t.title)}</option>`).join('')}</optgroup>`).join('');}
function captureRequestDraft(){
  const ids=['reqTemplate','reqMapping','reqContractor','reqDate','reqTime','reqScope','reqReady'];
  if(!document.getElementById('reqTemplate'))return;
  ui.requestDraft.templateId=document.getElementById('reqTemplate').value;
  ui.requestDraft.mappingId=document.getElementById('reqMapping').value;
  ui.requestDraft.contractor=document.getElementById('reqContractor').value;
  ui.requestDraft.date=document.getElementById('reqDate').value;
  ui.requestDraft.time=document.getElementById('reqTime').value;
  ui.requestDraft.scope=document.getElementById('reqScope').value;
  ui.requestDraft.ready=document.getElementById('reqReady').checked;
}
function renderNewRequest(user){
  if(user.role!=='EJECUCION')return noAccess();
  const defaultTemplate=templateById(ui.requestDraft.templateId)||findTemplate('Mampostería','General');ui.requestDraft.templateId=defaultTemplate.id;
  const selectedMap=mappingById(ui.requestDraft.mappingId)||MAPEOS[0];ui.requestDraft.mappingId=selectedMap.id;
  const docs=INSTRUCTIVOS.filter(d=>d.activities.includes(defaultTemplate.activity));
  return `<div class="page-head"><div><h2>Solicitar inspección</h2><p>Seleccione la etapa, marque el alcance directamente sobre el mapeo y adjunte evidencias.</p></div></div><div class="grid grid-2" style="grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)"><div class="card"><div class="form-grid"><div class="field full"><label>Planilla / taller / etapa</label><select id="reqTemplate">${templateOptions(defaultTemplate.id)}</select><div class="helper">Las actividades con varias etapas incluyen Liberación, Seguimiento y Terminación / cierre.</div></div><div class="field"><label>Objetivo</label><input value="${defaultTemplate.objective}%" readonly></div><div class="field"><label>Contratista</label><input id="reqContractor" value="${escapeHtml(ui.requestDraft.contractor)}"></div><div class="field full"><label>Mapeo existente</label><select id="reqMapping">${[...MAPEOS,...(data.customMappings||[])].map(m=>`<option value="${m.id}" ${m.id===selectedMap.id?'selected':''}>${escapeHtml(m.code)} · ${escapeHtml(m.area)} · ${escapeHtml(m.version)}</option>`).join('')}</select><div class="helper">Seleccione el mapeo desde la base y marque el área que requiere revisión.</div></div><div class="field"><label>Fecha propuesta</label><input id="reqDate" type="date" value="${escapeHtml(ui.requestDraft.date)}"></div><div class="field"><label>Hora propuesta</label><input id="reqTime" type="time" value="${escapeHtml(ui.requestDraft.time)}"></div><div class="field full"><label>Alcance a inspeccionar</label><textarea id="reqScope">${escapeHtml(ui.requestDraft.scope)}</textarea></div><div class="field full"><label class="check-row"><input id="reqReady" type="checkbox" ${ui.requestDraft.ready?'checked':''}><span>Confirmo que el trabajo está terminado, el área está limpia y accesible, y el responsable estará disponible.</span></label></div><div class="field"><label>Fotografías previas</label><input id="reqPhotos" type="file" multiple accept="image/*"><div class="helper">Archivos pequeños se guardan localmente para que Calidad pueda abrirlos en el demo.</div></div><div class="field"><label>Planos u otros documentos</label><input id="reqDocs" type="file" multiple accept="image/*,.pdf"><div class="helper">Máximo aproximado de 1.2 MB por archivo en esta versión estática.</div></div></div><div class="form-actions"><button class="btn btn-secondary" data-nav="home">Cancelar</button><div class="button-row"><button id="saveDraft" class="btn btn-outline">Guardar borrador</button><button id="submitRequest" class="btn btn-primary">Enviar a Calidad</button></div></div></div><aside><div class="card map-card"><img src="${escapeHtml(ui.requestDraft.annotationData||selectedMap.file)}" alt="${escapeHtml(selectedMap.title)}"><div class="body"><h3>${escapeHtml(selectedMap.title)}</h3><div class="helper">${escapeHtml(selectedMap.code)} · ${escapeHtml(selectedMap.version)}</div><div class="button-row" style="margin-top:12px"><button id="openAnnotator" class="btn btn-primary">✎ Colorear o rayar mapeo</button><a class="btn btn-outline" href="${escapeHtml(selectedMap.file)}" target="_blank">Abrir original</a></div>${ui.requestDraft.annotationData?'<div class="alert alert-success" style="margin-top:12px">El mapeo marcado se adjuntará a la solicitud.</div>':''}</div></div><div class="card" style="margin-top:16px"><h3>Planilla seleccionada</h3><div class="kv"><div>Actividad</div><div>${escapeHtml(defaultTemplate.activity)}</div><div>Etapa</div><div>${escapeHtml(stageDisplay(defaultTemplate.stage))}</div><div>Criterios</div><div>${defaultTemplate.criteria.length}</div><div>Objetivo</div><div>${defaultTemplate.objective}%</div></div></div><div class="card" style="margin-top:16px"><h3>Instructivos relacionados</h3>${docs.length?docs.map(d=>`<div style="margin-bottom:10px"><span class="doc-code">${escapeHtml(d.code)} ${escapeHtml(d.version)}</span><br><strong>${escapeHtml(d.title)}</strong></div>`).join(''):'<div class="helper">No hay instructivo vinculado todavía.</div>'}</div></aside></div>`;
}
function renderAnnotateMap(user){
  if(user.role!=='EJECUCION')return noAccess();const m=mappingById(ui.requestDraft.mappingId)||MAPEOS[0];
  return `<div class="page-head"><div><h2>Marcar alcance en el mapeo</h2><p>Coloree, raye o delimite el área que quiere que Calidad revise.</p></div></div><div class="card annotator-card"><div class="annotator-toolbar"><label>Color <input id="drawColor" type="color" value="${escapeHtml(ui.annotator.color)}"></label><label>Grosor <input id="drawSize" type="range" min="2" max="30" value="${ui.annotator.size}"></label><button id="eraserBtn" class="btn btn-outline">Borrador</button><button id="clearMapBtn" class="btn btn-danger">Limpiar marcas</button></div><div class="canvas-wrap"><canvas id="mapCanvas" width="1200" height="760" aria-label="Mapeo editable"></canvas></div><div class="form-actions"><button id="cancelAnnotation" class="btn btn-secondary">Volver sin guardar</button><button id="saveAnnotation" class="btn btn-primary">Guardar mapeo marcado</button></div><div class="helper">Mapeo: ${escapeHtml(m.code)} · ${escapeHtml(m.title)}. Las marcas se guardan dentro de la solicitud.</div></div>`;
}
function sortQueue(rows){return [...rows].sort((a,b)=>{if(a.ready!==b.ready)return a.ready?-1:1;return `${a.requestedDate}T${a.requestedTime}`.localeCompare(`${b.requestedDate}T${b.requestedTime}`)||a.createdAt.localeCompare(b.createdAt);});}
function renderQueue(user){if(!canOperateQuality(user))return noAccess();let rows=data.inspections;if(ui.queueTab==='DISPONIBLES')rows=rows.filter(i=>i.status==='SOLICITADA'&&i.ready);if(ui.queueTab==='NO_LISTAS')rows=rows.filter(i=>!i.ready&&['BORRADOR','SOLICITADA'].includes(i.status));if(ui.queueTab==='TODAS')rows=rows;return `<div class="page-head"><div><h2>Bandeja de Calidad</h2><p>Ordenada por disponibilidad real, fecha y hora solicitada.</p></div></div><div class="tabs"><button class="tab ${ui.queueTab==='DISPONIBLES'?'active':''}" data-queue="DISPONIBLES">Disponibles para tomar</button><button class="tab ${ui.queueTab==='NO_LISTAS'?'active':''}" data-queue="NO_LISTAS">Áreas no listas</button><button class="tab ${ui.queueTab==='TODAS'?'active':''}" data-queue="TODAS">Todas las del proyecto</button></div>${inspectionsTable(sortQueue(rows),user)}`;}
function criterionLosses(visit,template){
  if(!visit||!template)return [];
  const rows=[];
  template.criteria.forEach(c=>{
    const label=visit.answers?.[c.id];if(!label)return;const factor=answerFactor(c,label);if(factor===null||factor>=1)return;
    const earned=round1(c.weight*factor),lost=round1(c.weight-earned);
    rows.push({id:c.id,name:c.name,stage:template.stage,response:label,weight:c.weight,earned,lost,note:visit.notes?.[c.id]||'',isVisitCriterion:c.isVisitCriterion});
  });
  if(!rows.length&&(visit.weakCriteria||[]).length){visit.weakCriteria.forEach(name=>rows.push({id:'—',name,stage:template.stage,response:'Incumplimiento registrado',weight:'—',earned:'—',lost:'—',note:'Registro histórico de demostración',isVisitCriterion:false}));}
  return rows.sort((a,b)=>(Number(b.lost)||0)-(Number(a.lost)||0));
}
function renderVisitHistory(i,user){
  const visits=i.visitEvaluations||[];if(!visits.length)return '<div class="card empty">Esta inspección todavía no tiene visitas calificadas.</div>';
  return visits.map(v=>{const t=templateById(v.templateId),losses=criterionLosses(v,t),inspector=userById(v.finishedBy||v.startedBy);return `<article class="card visit-card"><div class="visit-head"><div><span class="badge badge-blue">Visita ${v.number}</span><h3>${escapeHtml(t?.activity||'—')} · ${escapeHtml(stageDisplay(t?.stage||v.stage||'General'))}</h3><div class="helper">${formatDateTime(v.finishedAt||v.startedAt)} · ${escapeHtml(inspector?.name||'—')}</div></div><div class="visit-score ${v.finalScore>=v.objective?'positive':v.finalScore>=v.objective-5?'warning':'critical'}">${round1(v.finalScore)}%</div></div><div class="grid grid-4 compact-metrics">${metric('Técnico',`${round1(v.technicalScore)}%`,'Criterios técnicos')}${metric('Visitas / preparación',`${round1(v.visitScore)}%`,'Criterios de visita')}${metric('Objetivo',`${v.objective}%`,'Meta aplicable')}${metric('Decisión',escapeHtml(v.decision),'Cierre de la visita')}</div><div class="section-title"><h3>Puntos descontados en esta visita</h3><span class="badge ${losses.length?'badge-red':'badge-green'}">${losses.length?`${losses.length} criterios con descuento`:'Sin descuentos'}</span></div>${renderLossTable(losses)}</article>`;}).join('');
}
function renderLossTable(losses){
  if(!losses.length)return '<div class="alert alert-success">No se descontaron puntos en esta visita.</div>';
  return `<div class="table-wrap"><table class="deduction-table"><thead><tr><th>Criterio</th><th>Etapa</th><th>Respuesta</th><th>Peso</th><th>Obtenido</th><th>Descontado</th><th>Observación</th></tr></thead><tbody>${losses.map(x=>`<tr><td><strong>${escapeHtml(x.name)}</strong><br><span class="helper">${escapeHtml(x.id)}</span></td><td>${escapeHtml(stageDisplay(x.stage))}</td><td>${escapeHtml(x.response)}</td><td>${x.weight}</td><td>${x.earned}</td><td><strong class="critical">${x.lost}</strong></td><td>${escapeHtml(x.note||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderResources(i,m,docs,user){
  if(!canOpenInspectionResources(user,i))return '<div class="alert alert-warning">Los documentos solo están disponibles para el solicitante, el inspector asignado y los roles autorizados.</div>';
  const attachments=(i.attachments||[]).map((a,index)=>typeof a==='string'?{name:a,type:'',dataUrl:null,kind:'Archivo',index}:{...a,index});
  return `<div class="resource-grid"><article class="resource-item"><strong>Mapeo original</strong><span>${escapeHtml(m?.code||'—')}</span>${m?.file?`<a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Abrir mapeo</a>`:'<button class="btn btn-secondary" disabled>Sin archivo</button>'}</article>${i.mappingAnnotation?`<article class="resource-item"><strong>Mapeo marcado por Ejecución</strong><span>Alcance señalado en la solicitud</span><button class="btn btn-primary" data-open-annotation="${i.id}">Abrir marcas</button></article>`:''}${attachments.map(a=>{const isImage=(a.type||'').startsWith('image/');return `<article class="resource-item attachment-resource"><strong>${escapeHtml(a.kind||'Adjunto')}</strong><span>${escapeHtml(a.name)}</span>${a.dataUrl&&isImage?`<button class="attachment-preview" data-open-attachment="${i.id}" data-attachment-index="${a.index}" aria-label="Abrir ${escapeHtml(a.name)}"><img src="${a.dataUrl}" alt="Vista previa de ${escapeHtml(a.name)}"></button>`:''}${a.dataUrl?`<div class="button-row"><button class="btn btn-primary" data-open-attachment="${i.id}" data-attachment-index="${a.index}">${isImage?'Ver fotografía':'Abrir documento'}</button><a class="btn btn-outline" href="${a.dataUrl}" download="${escapeHtml(a.name)}">Descargar</a></div>`:'<button class="btn btn-secondary" disabled>Archivo no almacenado por exceder el límite</button>'}</article>`;}).join('')}${docs.map(d=>`<article class="resource-item"><strong>${escapeHtml(d.code)} ${escapeHtml(d.version)}</strong><span>${escapeHtml(d.title)}</span>${d.file?`<a class="btn btn-outline" href="${escapeHtml(d.file)}" target="_blank">Abrir instructivo</a>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>'}</article>`).join('')}</div>`;
}
function renderDetail(user){
  const i=data.inspections.find(x=>x.id===ui.selectedId);if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';if(user.role==='EJECUCION'&&i.createdBy!==user.id)return noAccess();
  const t=templateById(i.templateId),m=mappingById(i.mappingId),exec=userById(i.createdBy),quality=userById(i.assignedQualityId),docs=INSTRUCTIVOS.filter(d=>d.activities.includes(t?.activity));
  const nextTemplates=templatesForActivity(t?.activity||'');
  return `<div class="page-head"><div><h2>${escapeHtml(i.code)}</h2><p>${escapeHtml(t?.activity||'—')} · ${escapeHtml(stageDisplay(t?.stage||'General'))} · ${escapeHtml(i.location)}</p></div><div class="button-row">${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar inspección</button>`:''}${canOperateQuality(user)&&i.assignedQualityId===user.id&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Abrir planilla actual</button>`:''}${canOperateQuality(user)&&['SOLICITADA','TOMADA'].includes(i.status)?`<button class="btn btn-danger" data-improper="${i.id}">Marcar improcedente</button>`:''}</div></div><div class="grid grid-2"><div class="card"><h3>Datos de la inspección</h3><div class="kv"><div>Solicitante</div><div>${escapeHtml(exec?.name||'—')} · ${escapeHtml(AREA_LABELS[exec?.executionArea]||'')}</div><div>Contratista</div><div>${escapeHtml(i.contractor)}</div><div>Etapa actual</div><div>${escapeHtml(stageDisplay(t?.stage||'General'))}</div><div>Planilla</div><div>${escapeHtml(t?.title||'—')} · ${escapeHtml(t?.version||'—')}</div><div>Paquete</div><div>${escapeHtml(i.packageCode)}</div><div>Fecha / hora</div><div>${formatDate(i.requestedDate)} · ${escapeHtml(i.requestedTime)}</div><div>Responsable Calidad</div><div>${escapeHtml(quality?.name||'Sin asignar')}</div><div>Estado</div><div>${badge(i.status)}</div></div><p style="margin-bottom:0"><strong>Alcance:</strong> ${escapeHtml(i.scope)}</p></div><div class="card map-card">${m?`<img src="${escapeHtml(i.mappingAnnotation||m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${i.mappingAnnotation?'Mapeo marcado de la solicitud':escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)} · ${escapeHtml(m.status)}</div></div>`:'<div class="empty">Sin mapeo asociado.</div>'}</div></div>${Number.isFinite(i.finalScore)?`<div class="grid grid-4" style="margin-top:16px">${metric('Último resultado técnico',`${round1(i.technicalScore)}%`,'Última visita')}${metric('Última preparación / visitas',`${round1(i.visitScore)}%`,'Última visita')}${metric('Calificación vigente',`${round1(i.finalScore)}%`,'La calificación de la visita más reciente',i.finalScore>=i.objective?'positive':i.finalScore>=i.objective-5?'warning':'critical')}${metric('Visitas calificadas',i.visitEvaluations?.length||0,'Cada visita conserva su puntaje')}</div>`:''}${canOperateQuality(user)&&i.assignedQualityId===user.id&&Number.isFinite(i.finalScore)?`<div class="card" style="margin-top:16px"><h3>Registrar una nueva visita o etapa</h3><div class="form-grid"><div class="field"><label>Planilla para la nueva visita</label><select id="nextVisitTemplate">${nextTemplates.map(x=>`<option value="${x.id}" ${x.id===i.templateId?'selected':''}>${escapeHtml(stageDisplay(x.stage))} · ${escapeHtml(x.title)}</option>`).join('')}</select></div><div class="field"><label>Funcionamiento</label><input value="La nueva visita tendrá una calificación independiente" readonly></div></div><div class="button-row" style="margin-top:12px"><button class="btn btn-primary" data-new-visit="${i.id}">＋ Registrar visita ${Number(i.visitEvaluations?.length||0)+1}</button></div><div class="helper">Se copian las respuestas de la visita anterior para facilitar la revisión. Calidad puede subir o bajar cualquier criterio y el sistema conserva ambos puntajes.</div></div>`:''}<div class="section-title"><h3>Calificaciones y puntos descontados por visita</h3></div><div class="visit-list">${renderVisitHistory(i,user)}</div><div class="section-title"><h3>Documentos, mapeos y evidencias</h3></div><div class="card">${renderResources(i,m,docs,user)}</div><div class="section-title"><h3>Trazabilidad</h3></div><div class="card"><div class="timeline">${renderAudit(i.audit)}</div></div>`;
}
function renderAudit(audit){return audit?.length?audit.map(a=>{const u=userById(a.userId);return `<div class="timeline-item"><span class="timeline-dot"></span><strong>${escapeHtml(a.action)}</strong><p>${escapeHtml(u?.name||'Sistema')} · ${formatDateTime(a.at)}</p></div>`;}).join(''):'<div class="empty">Sin eventos.</div>';}
function currentVisit(i){return (i.visitEvaluations||[]).find(v=>v.id===i.activeVisitId)||(i.visitEvaluations||[]).find(v=>v.status==='EN_PROCESO')||null;}
function renderEvaluation(user){
  if(!canOperateQuality(user))return noAccess();const i=data.inspections.find(x=>x.id===ui.selectedId);if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';if(i.assignedQualityId!==user.id&&user.role!=='COORDINADOR_CALIDAD')return noAccess();
  const visit=currentVisit(i);if(!visit)return '<div class="alert alert-warning">No hay una visita activa. Regrese al detalle y registre una nueva visita.</div>';const t=templateById(visit.templateId),score=calculateAnswers(t,visit.answers||{});
  return `<div class="page-head"><div><h2>Planilla digital · Visita ${visit.number}</h2><p>${escapeHtml(i.code)} · ${escapeHtml(t.activity)} · ${escapeHtml(stageDisplay(t.stage))}</p></div><div class="button-row"><button id="markCompliant" class="btn btn-outline">Marcar todo conforme</button></div></div><div class="alert alert-info">Esta visita tendrá su propio puntaje. Las visitas anteriores no se sobrescriben y permanecen visibles para Ejecución y Calidad.</div><div class="grid grid-2" style="grid-template-columns:minmax(0,2fr) minmax(285px,1fr)"><div><div class="card" style="margin-bottom:16px"><div class="grid grid-4"><div><div class="metric-label">Número de visita</div><strong>${visit.number}</strong></div><div><div class="metric-label">Etapa</div><strong>${escapeHtml(stageDisplay(t.stage))}</strong></div><div><div class="metric-label">Criterios</div><strong>${t.criteria.length}</strong></div><div><div class="metric-label">Objetivo</div><strong>${t.objective}%</strong></div></div></div><div class="criteria">${t.criteria.map(c=>renderCriterion(visit,c)).join('')}</div><div class="card" style="margin-top:16px"><div class="field"><label>Observación general de esta visita</label><textarea id="generalObservation">${escapeHtml(visit.generalObservation||'')}</textarea></div><div class="form-actions"><button class="btn btn-secondary" data-open="${i.id}">Volver</button><div class="button-row"><button class="btn btn-success" data-finish="Liberada">Guardar y liberar</button><button class="btn btn-warning" data-finish="Con observaciones">Guardar con observaciones</button><button class="btn btn-danger" data-finish="No liberada">Guardar y no liberar</button></div></div></div></div><aside class="card score-box"><div class="metric-label">Resultado preliminar de la visita ${visit.number}</div><div class="score-number">${round1(score.final)}%</div><div class="progress"><span style="width:${Math.min(100,score.final)}%"></span></div><div style="margin-top:17px" class="traffic">${trafficHtml(score.final,t.objective)}</div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="kv"><div>Técnico</div><div>${round1(score.technical)}%</div><div>Visitas / preparación</div><div>${round1(score.visit)}%</div><div>Completados</div><div>${score.answered} de ${score.total}</div><div>Objetivo</div><div>${t.objective}%</div></div>${visit.number>1?`<div class="alert alert-warning" style="margin-top:15px">La calificación vigente de la inspección se actualizará con esta visita, pero la anterior seguirá en el historial.</div>`:''}</aside></div>`;
}
function renderCriterion(visit,c){return `<article class="criterion"><span class="badge ${c.isVisitCriterion?'badge-yellow':'badge-blue'}">${c.isVisitCriterion?'Visitas / preparación':'Criterio técnico'}</span><h4>${escapeHtml(c.id)} · ${escapeHtml(c.name)}</h4><div class="meta">Peso: ${c.weight} · Respuesta: ${escapeHtml(c.responseType)} · Fila fuente: ${c.sourceRow}</div>${c.description?`<div class="description">${escapeHtml(c.description)}</div>`:''}<div class="criteria-grid"><div class="field"><label>Evaluación</label><select data-answer="${c.id}"><option value="">Seleccione…</option>${c.options.map(o=>`<option value="${escapeHtml(o.label)}" ${visit.answers?.[c.id]===o.label?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div><div class="field"><label>Observación</label><input data-note="${c.id}" value="${escapeHtml(visit.notes?.[c.id]||'')}" placeholder="Explique el descuento cuando aplique"></div></div></article>`;}
function trafficHtml(score,objective){const t=trafficFor(score,objective),cls=t==='Verde'?'green':t==='Amarillo'?'yellow':'red';return `<span class="light ${cls}"></span>${t} · ${round1(score)}%`;}
function renderDocuments(user){const search=ui.docSearch.toLowerCase(),all=[...INSTRUCTIVOS,...(data.customDocuments||[])],rows=all.filter(d=>!search||`${d.code} ${d.version} ${d.title} ${(d.activities||[]).join(' ')} ${d.status}`.toLowerCase().includes(search));return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Consulta por código, actividad, versión y vigencia.</p></div></div><div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch)}" placeholder="Ej.: Mampostería, IT-CP-05, Pintura..."></div></div><div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3 style="margin-top:8px">${escapeHtml(d.title)}</h3><span class="badge ${d.status==='Vigente'?'badge-green':'badge-yellow'}">${escapeHtml(d.status)}</span><div class="tag-list">${(d.activities||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div><p class="helper">${escapeHtml(d.note||'')}</p></div><div class="button-row">${d.file?`<a class="btn btn-primary" href="${escapeHtml(d.file)}" target="_blank">Abrir documento</a>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>'}</div></article>`).join('')||'<div class="card empty">No se encontraron documentos.</div>'}</div>`;}
function renderMappings(user){const search=ui.mapSearch.toLowerCase(),all=[...MAPEOS,...(data.customMappings||[])],rows=all.filter(m=>!search||`${m.code} ${m.block} ${m.level} ${m.area} ${m.title}`.toLowerCase().includes(search));return `<div class="page-head"><div><h2>Biblioteca de mapeos</h2><p>Los mapeos pueden seleccionarse y marcarse durante la solicitud.</p></div></div><div class="filters"><div class="field full"><label>Buscar mapeo</label><input id="mapSearch" value="${escapeHtml(ui.mapSearch)}" placeholder="Bloque, nivel, habitación, código..."></div></div><div class="grid grid-3">${rows.map(m=>`<article class="card map-card"><img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)}</div><div class="tag-list"><span class="tag">${escapeHtml(m.block)}</span><span class="tag">${escapeHtml(m.level)}</span><span class="tag">${escapeHtml(m.area)}</span></div><div class="button-row" style="margin-top:12px"><a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Ver mapeo</a>${user.role==='EJECUCION'?`<button class="btn btn-primary" data-use-mapping="${m.id}">Usar y marcar</button>`:''}</div></div></article>`).join('')}</div>`;}
function groupRatings(records,type){
  const groups={};records.forEach(r=>{const t=r.template,exec=userById(r.createdBy);let key;if(type==='engineer')key=r.createdBy;else if(type==='activity')key=t.activity;else key=`${t.activity}|||${t.stage}`;if(!groups[key])groups[key]={activity:t.activity,stage:type==='activity'?'Todas':t.stage,engineerId:r.createdBy,engineer:exec?.name||'—',executionArea:exec?.executionArea||'',records:[],objective:t.objective};groups[key].records.push(r);});
  return Object.values(groups).map(g=>({...g,count:g.records.length,average:mean(g.records.map(r=>r.finalScore)),technical:mean(g.records.map(r=>r.technicalScore)),visit:mean(g.records.map(r=>r.visitScore)),firstVisitPct:g.records.length?g.records.filter(r=>r.firstVisit&&r.visit.decision==='Liberada').length/g.records.length*100:0,improper:g.records.filter(r=>r.inspection.status==='IMPROCEDENTE').length})).sort((a,b)=>a.average-b.average);
}
function availableWeekStarts(){const starts=[...new Set(evaluationRecords().map(r=>qualityWeekStart(r.completedDate)))].sort().reverse();return starts.length?starts:[qualityWeekStart('2026-07-22')];}
function periodControl(prefix){
  if(ui.reportMode==='week')return `<div class="field"><label>Semana (jueves a miércoles)</label><select id="${prefix}Value">${availableWeekStarts().map(s=>`<option value="${s}" ${s===ui.reportValue?'selected':''}>${escapeHtml(qualityWeekLabel(s))}</option>`).join('')}</select></div>`;
  return `<div class="field"><label>Mes</label><input id="${prefix}Value" type="month" value="${escapeHtml(ui.reportValue)}"></div>`;
}
function weaknessStats(records,activity){
  const selected=records.filter(r=>r.template.activity===activity),stats={};
  selected.forEach(r=>{
    const t=r.template,v=r.visit;
    t.criteria.forEach(c=>{
      const label=v.answers?.[c.id];if(!label)return;const factor=answerFactor(c,label);if(factor===null)return;
      const key=`${t.stage}|||${c.id}|||${c.name}`;
      if(!stats[key])stats[key]={stage:t.stage,id:c.id,name:c.name,evaluated:0,failed:0,pointsLost:0,weight:c.weight};
      stats[key].evaluated++;
      if(factor<1){stats[key].failed++;stats[key].pointsLost+=c.weight*(1-factor);}
    });
  });
  return Object.values(stats).filter(x=>x.failed>0).map(x=>({...x,frequency:x.evaluated?x.failed/x.evaluated*100:0,pointsLost:round1(x.pointsLost)})).sort((a,b)=>b.failed-a.failed||b.pointsLost-a.pointsLost);
}
function renderMonthlyWeakTables(records){
  const workshopGroups=groupRatings(records,'activity').filter(g=>g.average<g.objective);
  if(!workshopGroups.length)return '<div class="alert alert-success">Todos los talleres alcanzan su promedio mensual requerido.</div>';
  return workshopGroups.map(g=>{const stats=weaknessStats(records,g.activity).slice(0,12);return `<article class="card weak-workshop"><div class="visit-head"><div><span class="badge badge-red">Por debajo de la meta</span><h3>${escapeHtml(g.activity)}</h3><div class="helper">Promedio ${round1(g.average)}% · Objetivo ${g.objective}% · ${g.count} evaluaciones</div></div><div class="visit-score critical">${round1(g.average)}%</div></div>${stats.length?`<div class="table-wrap"><table><thead><tr><th>Punto débil</th><th>Etapa</th><th>Fallos</th><th>Evaluaciones</th><th>Frecuencia</th><th>Puntos perdidos acumulados</th></tr></thead><tbody>${stats.map(s=>`<tr><td><strong>${escapeHtml(s.name)}</strong><br><span class="helper">${escapeHtml(s.id)}</span></td><td>${escapeHtml(stageDisplay(s.stage))}</td><td>${s.failed}</td><td>${s.evaluated}</td><td>${round1(s.frequency)}%</td><td>${s.pointsLost}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay detalle de criterios para este taller.</div>'}</article>`;}).join('');
}
function renderEngineerChart(groups,area){
  const rows=groups.filter(g=>g.executionArea===area).sort((a,b)=>b.average-a.average);if(!rows.length)return '<div class="card empty">No hay ingenieros de esta área en el periodo.</div>';
  const generalMean=mean(rows.map(r=>r.average));
  return `<div class="card comparison-card"><div class="comparison-head"><div><h3>${escapeHtml(AREA_LABELS[area])}</h3><div class="helper">Meta requerida: ${ENGINEER_TARGET}% · Media del grupo: ${round1(generalMean)}%</div></div><div class="chart-legend"><span><i class="legend-target"></i>Meta ${ENGINEER_TARGET}%</span><span><i class="legend-mean"></i>Media ${round1(generalMean)}%</span></div></div><div class="comparison-chart">${rows.map(r=>`<div class="comparison-row"><div class="comparison-name"><strong>${escapeHtml(r.engineer)}</strong><span>${r.count} evaluaciones</span></div><div class="comparison-track"><div class="comparison-fill" style="width:${Math.min(100,r.average)}%;background:${r.average>=ENGINEER_TARGET?'#15803d':r.average>=ENGINEER_TARGET-5?'#b7791f':'#b42318'}"></div><span class="target-marker" style="left:${ENGINEER_TARGET}%"></span><span class="mean-marker" style="left:${Math.min(100,generalMean)}%"></span></div><div class="comparison-value">${round1(r.average)}%</div></div>`).join('')}</div></div>`;
}
function renderRatings(user){
  if(!canReadProject(user))return noAccess();const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),workshops=groupRatings(records,'activityStage'),engineers=groupRatings(records,'engineer');
  return `<div class="page-head"><div><h2>Calificaciones semanales y mensuales</h2><p>Las semanas cierran los miércoles: cada periodo va de jueves a miércoles, ambos inclusive.</p></div></div><div class="card" style="margin-bottom:16px"><div class="filters"><div class="field"><label>Tipo de periodo</label><select id="reportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('report')}<div class="field"><label>Evaluaciones incluidas</label><input value="${records.length}" readonly></div><div class="field"><label>Media general</label><input value="${round1(mean(records.map(r=>r.finalScore)))}%" readonly></div></div></div><div class="section-title"><h3>Calificación por taller y etapa</h3></div>${ratingWorkshopTable(workshops)}<div class="section-title"><h3>Comparación de ingenieros de Ejecución</h3></div><div class="grid grid-2">${renderEngineerChart(engineers,'ESTRUCTURA')}${renderEngineerChart(engineers,'TERMINACION')}</div><div class="section-title"><h3>Tabla detallada por ingeniero</h3></div>${ratingEngineerTable(engineers)}<div class="section-title"><h3>Puntos débiles de talleres por debajo del promedio mensual</h3></div>${ui.reportMode==='month'?renderMonthlyWeakTables(records):'<div class="alert alert-info">Seleccione un periodo mensual para generar las tablas de puntos débiles contra la meta mensual.</div>'}`;
}
function ratingWorkshopTable(rows){if(!rows.length)return '<div class="card empty">No hay visitas cerradas en el periodo.</div>';return `<div class="table-wrap"><table><thead><tr><th>Taller</th><th>Etapa</th><th>Evaluaciones</th><th>Técnico</th><th>Visitas / preparación</th><th>Resultado</th><th>Objetivo</th><th>Diferencia</th><th>Semáforo</th></tr></thead><tbody>${rows.map(r=>{const diff=r.average-r.objective;return `<tr><td><strong>${escapeHtml(r.activity)}</strong></td><td>${escapeHtml(stageDisplay(r.stage))}</td><td>${r.count}</td><td>${round1(r.technical)}%</td><td>${round1(r.visit)}%</td><td><strong>${round1(r.average)}%</strong></td><td>${r.objective}%</td><td>${diff>=0?'+':''}${round1(diff)}</td><td>${trafficBadge(trafficFor(r.average,r.objective))}</td></tr>`;}).join('')}</tbody></table></div>`;}
function ratingEngineerTable(rows){if(!rows.length)return '<div class="card empty">No hay visitas cerradas en el periodo.</div>';return `<div class="table-wrap"><table><thead><tr><th>Ingeniero de ejecución</th><th>Área</th><th>Evaluaciones</th><th>Técnico</th><th>Visitas / preparación</th><th>Resultado final</th><th>Meta</th><th>Liberadas en 1ra visita</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${escapeHtml(r.engineer)}</strong></td><td>${escapeHtml(AREA_LABELS[r.executionArea]||'—')}</td><td>${r.count}</td><td>${round1(r.technical)}%</td><td>${round1(r.visit)}%</td><td><strong>${round1(r.average)}%</strong></td><td>${ENGINEER_TARGET}%</td><td>${round1(r.firstVisitPct)}%</td></tr>`).join('')}</tbody></table></div>`;}
function renderExports(user){
  if(!canOperateQuality(user))return noAccess();return `<div class="page-head"><div><h2>Exportaciones para Calidad</h2><p>Los exportables semanales utilizan periodos de jueves a miércoles.</p></div></div><div class="alert alert-info">Las exportaciones de inspecciones y criterios incluyen el número de visita y la etapa evaluada para conservar las calificaciones de primera, segunda y visitas posteriores.</div><div class="grid grid-2">${exportCard('Inspecciones y visitas realizadas','Una fila por visita con etapa, puntaje, inspector, semáforo y decisión.','exportInspections','Exportar CSV')}${exportCard('Detalle de criterios y descuentos','Una fila por criterio evaluado y puntos descontados por visita.','exportCriteria','Exportar CSV')}${exportCard('Calificación por taller','Promedios semanales o mensuales por taller y etapa.','exportWorkshops','Exportar periodo')}${exportCard('Calificación por ingeniero','Comparación por área, meta 95% y media general.','exportEngineers','Exportar periodo')}${exportCard('Puntos débiles mensuales','Talleres bajo meta y criterios que más fallaron en el mes.','exportWeakPoints','Exportar puntos débiles')}${exportCard('Respaldo completo','Descarga todos los datos del demo en JSON.','exportBackup','Descargar JSON')}</div><div class="card" style="margin-top:16px"><h3>Periodo para reportes</h3><div class="filters"><div class="field"><label>Tipo</label><select id="exportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('export')}</div></div>`;
}
function exportCard(title,desc,id,label){return `<div class="card export-card"><div><h3>${title}</h3><p>${desc}</p></div><div class="button-row"><button id="${id}" class="btn btn-primary">${label}</button></div></div>`;}
function renderUsers(user){if(!canConfigure(user))return noAccess();return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>Clasificación por rol, proyecto y área de ejecución.</p></div></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyecto</th><th>Permisos principales</th></tr></thead><tbody>${data.users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge ${u.role==='EJECUCION'?'badge-blue':u.role.includes('CALIDAD')?'badge-green':'badge-gray'}">${escapeHtml(ROLE_LABELS[u.role])}</span></td><td>${escapeHtml(AREA_LABELS[u.executionArea]||'—')}</td><td>${escapeHtml(u.projectIds.join(', '))}</td><td>${escapeHtml(permissionSummary(u.role))}</td></tr>`).join('')}</tbody></table></div>`;}
function permissionSummary(role){return {EJECUCION:'Solicitar, marcar mapeos, abrir sus adjuntos y consultar descuentos por visita',CALIDAD:'Abrir recursos, calificar por visita, exportar y analizar puntos débiles',COORDINADOR_CALIDAD:'Permisos de Calidad, monitoreo y configuración',GERENCIA:'Consulta del proyecto y calificaciones',PRESIDENTE:'Consulta ejecutiva global'}[role]||'Consulta';}
function bindGlobal(){
  document.querySelectorAll('[data-demo-email]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('loginEmail').value=b.dataset.demoEmail;document.getElementById('loginPassword').value='12345678';}));
  document.getElementById('loginBtn')?.addEventListener('click',login);['loginEmail','loginPassword'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')login();}));
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  document.getElementById('logoutBtn')?.addEventListener('click',async()=>{await supabaseClient.auth.signOut();authenticatedUser=null;ui.view='home';render();});
  document.getElementById('resetBtn')?.addEventListener('click',()=>{if(confirm('¿Eliminar todas las inspecciones y datos creados? Los usuarios permanecerán.')){const users=data.users;data=initialData();data.users=users;saveData();toast('Datos operativos eliminados');navigate('home');}});
  document.getElementById('menuBtn')?.addEventListener('click',()=>{document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.remove('hidden');});document.getElementById('overlay')?.addEventListener('click',closeDrawer);
}
function bindView(user){
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{ui.selectedId=b.dataset.open;ui.view='detail';render();}));
  document.querySelectorAll('[data-take]').forEach(b=>b.addEventListener('click',()=>takeInspection(user,b.dataset.take)));
  document.querySelectorAll('[data-evaluate]').forEach(b=>b.addEventListener('click',()=>openEvaluation(user,b.dataset.evaluate)));
  document.querySelectorAll('[data-improper]').forEach(b=>b.addEventListener('click',()=>markImproper(user,b.dataset.improper)));
  document.querySelectorAll('[data-new-visit]').forEach(b=>b.addEventListener('click',()=>startNewVisit(user,b.dataset.newVisit,document.getElementById('nextVisitTemplate').value)));
  document.querySelectorAll('[data-queue]').forEach(b=>b.addEventListener('click',()=>{ui.queueTab=b.dataset.queue;render();}));
  document.querySelectorAll('[data-open-attachment]').forEach(b=>b.addEventListener('click',()=>openAttachment(b.dataset.openAttachment,Number(b.dataset.attachmentIndex))));
  document.querySelectorAll('[data-open-annotation]').forEach(b=>b.addEventListener('click',()=>openAnnotation(b.dataset.openAnnotation)));
  document.querySelectorAll('[data-use-mapping]').forEach(b=>b.addEventListener('click',()=>{ui.requestDraft.mappingId=b.dataset.useMapping;ui.requestDraft.annotationData=null;ui.view='newRequest';render();}));
  document.getElementById('reqTemplate')?.addEventListener('change',e=>{captureRequestDraft();ui.requestDraft.templateId=e.target.value;render();});
  document.getElementById('reqMapping')?.addEventListener('change',e=>{captureRequestDraft();ui.requestDraft.mappingId=e.target.value;ui.requestDraft.annotationData=null;render();});
  document.getElementById('openAnnotator')?.addEventListener('click',()=>{captureRequestDraft();ui.view='annotateMap';render();});
  document.getElementById('saveDraft')?.addEventListener('click',()=>createInspection(user,false));document.getElementById('submitRequest')?.addEventListener('click',()=>createInspection(user,true));
  if(ui.view==='annotateMap')initAnnotatorCanvas();
  document.querySelectorAll('[data-answer]').forEach(s=>s.addEventListener('change',()=>{const i=data.inspections.find(x=>x.id===ui.selectedId),v=currentVisit(i);v.answers[s.dataset.answer]=s.value;saveData();render();}));
  document.querySelectorAll('[data-note]').forEach(x=>x.addEventListener('change',()=>{const i=data.inspections.find(v=>v.id===ui.selectedId),visit=currentVisit(i);visit.notes[x.dataset.note]=x.value;saveData();}));
  document.getElementById('generalObservation')?.addEventListener('change',e=>{const i=data.inspections.find(x=>x.id===ui.selectedId),v=currentVisit(i);v.generalObservation=e.target.value;saveData();});
  document.getElementById('markCompliant')?.addEventListener('click',()=>markAllCompliant());document.querySelectorAll('[data-finish]').forEach(b=>b.addEventListener('click',()=>finishEvaluation(user,b.dataset.finish)));
  document.getElementById('docSearch')?.addEventListener('input',e=>{ui.docSearch=e.target.value;render();document.getElementById('docSearch')?.focus();});document.getElementById('mapSearch')?.addEventListener('input',e=>{ui.mapSearch=e.target.value;render();document.getElementById('mapSearch')?.focus();});
  document.getElementById('reportMode')?.addEventListener('change',e=>{ui.reportMode=e.target.value;ui.reportValue=e.target.value==='week'?availableWeekStarts()[0]:'2026-07';render();});document.getElementById('reportValue')?.addEventListener('change',e=>{ui.reportValue=e.target.value;render();});
  document.getElementById('exportMode')?.addEventListener('change',e=>{ui.reportMode=e.target.value;ui.reportValue=e.target.value==='week'?availableWeekStarts()[0]:'2026-07';render();});document.getElementById('exportValue')?.addEventListener('change',e=>{ui.reportValue=e.target.value;render();});
  document.getElementById('exportInspections')?.addEventListener('click',exportInspections);document.getElementById('exportCriteria')?.addEventListener('click',exportCriteria);document.getElementById('exportWorkshops')?.addEventListener('click',exportWorkshops);document.getElementById('exportEngineers')?.addEventListener('click',exportEngineers);document.getElementById('exportWeakPoints')?.addEventListener('click',exportWeakPoints);document.getElementById('exportBackup')?.addEventListener('click',()=>downloadFile('quality_project_control_respaldo_v4.json',JSON.stringify(data,null,2),'application/json'));
}
async function login(){
  const email=document.getElementById('loginEmail').value.trim().toLowerCase();
  const password=document.getElementById('loginPassword').value;
  const button=document.getElementById('loginBtn');
  button.disabled=true;button.textContent='Entrando...';
  const {data: authData,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){
    console.error('Error real de Supabase Auth:', error);
    const detail = escapeHtml(error.message || error.code || 'Error desconocido');
    document.getElementById('loginError').innerHTML=`<div class="login-error"><strong>No se pudo iniciar sesión.</strong><br><span>${detail}</span></div>`;
    button.disabled=false;button.textContent='Entrar';return;
  }
  try{
    await loadRemoteData();
  }catch(loadError){
    console.error(loadError);
    await supabaseClient.auth.signOut();
    document.getElementById('loginError').innerHTML='<div class="login-error">Se autenticó el usuario, pero no se pudieron cargar los datos.</div>';
    button.disabled=false;button.textContent='Entrar';return;
  }
  const profile=data.users.find(u=>u.authId===authData.user.id);
  if(!profile){
    await supabaseClient.auth.signOut();
    document.getElementById('loginError').innerHTML='<div class="login-error">El usuario no tiene un perfil activo.</div>';
    button.disabled=false;button.textContent='Entrar';return;
  }
  authenticatedUser=profile;ui.view='home';render();
}
function navigate(view){if(ui.view==='newRequest')captureRequestDraft();ui.view=view;if(!['detail','evaluate'].includes(view))ui.selectedId=null;render();closeDrawer();window.scrollTo({top:0});}
function closeDrawer(){document.getElementById('sidebar')?.classList.remove('open');document.getElementById('overlay')?.classList.add('hidden');}
async function filesToAttachments(fileLists){
  const files=fileLists.flatMap(x=>[...x]),total=files.reduce((a,f)=>a+f.size,0);if(total>MAX_TOTAL_ATTACHMENT_BYTES)toast('Algunos archivos son muy grandes para guardarse en este demo estático.');
  const output=[];for(const f of files){if(f.size>MAX_ATTACHMENT_BYTES||total>MAX_TOTAL_ATTACHMENT_BYTES){output.push({name:f.name,type:f.type,dataUrl:null,kind:f.type.includes('image')?'Fotografía':'Documento'});continue;}const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});output.push({name:f.name,type:f.type,dataUrl,kind:f.type.includes('image')?'Fotografía':'Documento'});}return output;
}
async function createInspection(user,submit){
  captureRequestDraft();const t=templateById(ui.requestDraft.templateId),m=mappingById(ui.requestDraft.mappingId),photos=document.getElementById('reqPhotos')?.files||[],docs=document.getElementById('reqDocs')?.files||[];const attachments=await filesToAttachments([photos,docs]);
  const i={id:'i-'+Date.now(),code:nextCode(),projectId:'LCE',createdBy:user.id,templateId:t.id,mappingId:m.id,contractor:ui.requestDraft.contractor.trim(),location:`${m.block} · ${m.level} · ${m.area}`,packageCode:nextPackage(t,m),scope:ui.requestDraft.scope.trim(),requestedDate:ui.requestDraft.date,requestedTime:ui.requestDraft.time,ready:ui.requestDraft.ready,status:submit?'SOLICITADA':'BORRADOR',assignedQualityId:null,createdAt:nowISO(),technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],visitEvaluations:[],activeVisitId:null,attachments,mappingAnnotation:ui.requestDraft.annotationData,audit:[{at:nowISO(),userId:user.id,action:submit?'Solicitud enviada a Calidad':'Borrador creado'}]};
  data.inspections.unshift(i);saveData();ui.requestDraft.annotationData=null;toast(submit?'Solicitud enviada a Calidad':'Borrador guardado');ui.view='myInspections';render();
}
function takeInspection(user,id){const i=data.inspections.find(x=>x.id===id);if(!i||i.status!=='SOLICITADA')return;i.assignedQualityId=user.id;i.status='TOMADA';i.audit.push({at:nowISO(),userId:user.id,action:'Inspección tomada por Calidad'});saveData();toast('Inspección asignada a su usuario');ui.selectedId=id;ui.view='detail';render();}
function createActiveVisit(i,user,templateId,copyPrevious=true){
  const t=templateById(templateId),previous=(i.visitEvaluations||[]).slice(-1)[0];const visit={id:`visit-${Date.now()}`,number:(i.visitEvaluations?.length||0)+1,templateId:t.id,stage:t.stage,startedAt:nowISO(),finishedAt:null,startedBy:user.id,finishedBy:null,answers:copyPrevious&&previous?{...previous.answers}:{},notes:{},generalObservation:'',technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,weakCriteria:[],status:'EN_PROCESO'};i.visitEvaluations=i.visitEvaluations||[];i.visitEvaluations.push(visit);i.activeVisitId=visit.id;i.templateId=t.id;i.status='EN_EVALUACION';i.startedAt=i.startedAt||visit.startedAt;i.audit.push({at:visit.startedAt,userId:user.id,action:`Visita ${visit.number} iniciada · ${stageDisplay(t.stage)}`});return visit;
}
function openEvaluation(user,id){const i=data.inspections.find(x=>x.id===id);if(!i)return;if(!currentVisit(i))createActiveVisit(i,user,i.templateId,false);saveData();ui.selectedId=id;ui.view='evaluate';render();}
function startNewVisit(user,id,templateId){const i=data.inspections.find(x=>x.id===id);if(!i)return;if(i.assignedQualityId!==user.id&&user.role!=='COORDINADOR_CALIDAD'){toast('Solo el inspector asignado o Coordinación puede registrar la visita.');return;}createActiveVisit(i,user,templateId,true);saveData();ui.selectedId=id;ui.view='evaluate';render();}
function markImproper(user,id){const i=data.inspections.find(x=>x.id===id);if(!i)return;if(!confirm('¿Marcar esta inspección como improcedente por área no lista u otra causa?'))return;i.status='IMPROCEDENTE';i.decision='Improcedente';i.completedAt=nowISO();i.closedBy=user.id;i.audit.push({at:nowISO(),userId:user.id,action:'Inspección marcada como improcedente'});saveData();toast('Inspección improcedente registrada');ui.selectedId=id;ui.view='detail';render();}
function markAllCompliant(){const i=data.inspections.find(x=>x.id===ui.selectedId),visit=currentVisit(i),t=templateById(visit.templateId);t.criteria.forEach(c=>{visit.answers[c.id]=bestOption(c)?.label||'';});saveData();render();}
function finishEvaluation(user,decision){
  const i=data.inspections.find(x=>x.id===ui.selectedId),visit=currentVisit(i),t=templateById(visit.templateId);const unanswered=t.criteria.filter(c=>!visit.answers[c.id]);if(unanswered.length){toast(`Faltan ${unanswered.length} criterios por evaluar`);return;}
  const s=calculateAnswers(t,visit.answers);visit.technicalScore=round1(s.technical);visit.visitScore=round1(s.visit);visit.finalScore=round1(s.final);visit.objective=t.objective;visit.traffic=trafficFor(s.final,t.objective);visit.decision=decision;visit.status='FINALIZADA';visit.finishedAt=nowISO();visit.finishedBy=user.id;visit.weakCriteria=criterionLosses(visit,t).map(x=>x.name);
  i.activeVisitId=null;i.templateId=t.id;i.technicalScore=visit.technicalScore;i.visitScore=visit.visitScore;i.finalScore=visit.finalScore;i.objective=t.objective;i.traffic=visit.traffic;i.decision=decision;i.status=statusFromDecision(decision);i.completedAt=visit.finishedAt;i.closedBy=user.id;i.visitsCount=i.visitEvaluations.length;i.firstVisit=i.visitEvaluations.length===1;i.weakCriteria=visit.weakCriteria;i.audit.push({at:visit.finishedAt,userId:user.id,action:`Visita ${visit.number} cerrada con ${visit.finalScore}% · ${decision}`});saveData();toast(`Visita ${visit.number} guardada con ${visit.finalScore}%`);ui.view='detail';render();
}
function initAnnotatorCanvas(){
  const canvas=document.getElementById('mapCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d'),m=mappingById(ui.requestDraft.mappingId),base=new Image();
  const baseCanvas=document.createElement('canvas');baseCanvas.width=canvas.width;baseCanvas.height=canvas.height;const baseCtx=baseCanvas.getContext('2d');
  function drawBase(){
    ctx.clearRect(0,0,canvas.width,canvas.height);baseCtx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);baseCtx.fillStyle='#fff';baseCtx.fillRect(0,0,canvas.width,canvas.height);
    const scale=Math.min(canvas.width/base.width,canvas.height/base.height),w=base.width*scale,h=base.height*scale,x=(canvas.width-w)/2,y=(canvas.height-h)/2;
    ctx.drawImage(base,x,y,w,h);baseCtx.drawImage(base,x,y,w,h);
  }
  base.onload=()=>{drawBase();if(ui.requestDraft.annotationData){const ann=new Image();ann.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(ann,0,0,canvas.width,canvas.height);};ann.src=ui.requestDraft.annotationData;}};base.src=m.file;
  let drawing=false,lastX=0,lastY=0;
  const point=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];};
  canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);[lastX,lastY]=point(e);});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=point(e);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Number(document.getElementById('drawSize').value);ctx.strokeStyle=document.getElementById('drawColor').value;ctx.globalCompositeOperation=ui.annotator.eraser?'destination-out':'source-over';ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(x,y);ctx.stroke();[lastX,lastY]=[x,y];});
  const end=()=>{if(ui.annotator.eraser){ctx.globalCompositeOperation='destination-over';ctx.drawImage(baseCanvas,0,0);ctx.globalCompositeOperation='source-over';}drawing=false;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  document.getElementById('drawColor').addEventListener('change',e=>ui.annotator.color=e.target.value);document.getElementById('drawSize').addEventListener('change',e=>ui.annotator.size=Number(e.target.value));
  document.getElementById('eraserBtn').addEventListener('click',()=>{ui.annotator.eraser=!ui.annotator.eraser;document.getElementById('eraserBtn').textContent=ui.annotator.eraser?'Volver a dibujar':'Borrador';});
  document.getElementById('clearMapBtn').addEventListener('click',()=>{ui.requestDraft.annotationData=null;drawBase();});
  document.getElementById('cancelAnnotation').addEventListener('click',()=>{ui.view='newRequest';render();});
  document.getElementById('saveAnnotation').addEventListener('click',()=>{ui.requestDraft.annotationData=canvas.toDataURL('image/png');ui.view='newRequest';toast('Mapeo marcado guardado');render();});
}
function openAttachment(inspectionId,index){
  const i=data.inspections.find(x=>x.id===inspectionId),a=i?.attachments?.[index];
  if(!a?.dataUrl){toast('El archivo no está almacenado porque excedió el límite permitido.');return;}
  const win=window.open('','_blank');
  if(!win){toast('El navegador bloqueó la ventana. Permita ventanas emergentes para abrir el adjunto.');return;}
  const safeName=escapeHtml(a.name||'Adjunto');
  const isImage=(a.type||'').startsWith('image/');
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName}</title><style>html,body{margin:0;min-height:100%;background:#202124;color:#fff;font-family:Arial,sans-serif}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;background:#111}.top a{color:#fff;border:1px solid #fff;padding:8px 12px;border-radius:6px;text-decoration:none}.viewer{display:flex;justify-content:center;align-items:flex-start;min-height:calc(100vh - 62px)}img{max-width:100%;height:auto;display:block;background:#fff}iframe{border:0;width:100%;height:calc(100vh - 62px);background:#fff}</style></head><body><div class="top"><strong>${safeName}</strong><a href="${a.dataUrl}" download="${safeName}">Descargar</a></div><div class="viewer">${isImage?`<img src="${a.dataUrl}" alt="${safeName}">`:`<iframe src="${a.dataUrl}" title="${safeName}"></iframe>`}</div></body></html>`);
  win.document.close();
}
function openAnnotation(inspectionId){const i=data.inspections.find(x=>x.id===inspectionId);if(!i?.mappingAnnotation)return;const win=window.open();win.document.write(`<title>Mapeo marcado</title><img src="${i.mappingAnnotation}" style="max-width:100%;height:auto;display:block;margin:auto">`);}
function exportInspections(){
  const headers=['Código inspección','Número de visita','Fecha solicitud','Fecha de visita','Proyecto','Taller','Etapa','Planilla','Versión','Ingeniero de ejecución','Área del ingeniero','Ingeniero de Calidad','Contratista','Ubicación','Mapeo','Paquete','Resultado técnico','Resultado visitas/preparación','Resultado de la visita','Objetivo','Diferencia','Semáforo','Decisión','Es primera visita','Observación general'];
  const rows=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)).map(r=>{const i=r.inspection,v=r.visit,t=r.template,e=userById(i.createdBy),q=userById(v.finishedBy||i.assignedQualityId),m=mappingById(i.mappingId);return [i.code,v.number,i.requestedDate,r.completedDate,'Lopesan La Ceiba',t.activity,stageDisplay(t.stage),t.title,t.version,e?.name,AREA_LABELS[e?.executionArea]||'',q?.name||'',i.contractor,i.location,m?.code||'',i.packageCode,v.technicalScore,v.visitScore,v.finalScore,v.objective,round1(v.finalScore-v.objective),v.traffic,v.decision,v.number===1?'Sí':'No',v.generalObservation||''];});downloadCSV(`inspecciones_visitas_${ui.reportValue}.csv`,headers,rows);
}
function exportCriteria(){
  const headers=['Código inspección','Número de visita','Fecha de visita','Taller','Etapa','Ingeniero de ejecución','Área','Criterio','Descripción','Peso','Tipo de respuesta','Respuesta','Factor','Puntos obtenidos','Puntos descontados','Observación','Es criterio de visita','Hoja Excel','Fila fuente'];const rows=[];
  evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)).forEach(r=>{const i=r.inspection,v=r.visit,t=r.template,e=userById(i.createdBy);t.criteria.forEach(c=>{const factor=answerFactor(c,v.answers?.[c.id]);const earned=factor===null?'':round1(c.weight*factor),lost=factor===null?'':round1(c.weight-earned);rows.push([i.code,v.number,r.completedDate,t.activity,stageDisplay(t.stage),e?.name,AREA_LABELS[e?.executionArea]||'',c.name,c.description,c.weight,c.responseType,v.answers?.[c.id]||'',factor,earned,lost,v.notes?.[c.id]||'',c.isVisitCriterion?'Sí':'No',t.sheet,c.sourceRow]);});});downloadCSV(`detalle_criterios_visitas_${ui.reportValue}.csv`,headers,rows);
}
function exportWorkshops(){const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),grouped=groupRatings(records,'activityStage');downloadCSV(`calificacion_talleres_${ui.reportValue}.csv`,['Periodo','Etiqueta del periodo','Taller','Etapa','Evaluaciones','Promedio técnico','Promedio visitas/preparación','Resultado final','Objetivo','Diferencia','Semáforo'],grouped.map(r=>[ui.reportValue,ui.reportMode==='week'?qualityWeekLabel(ui.reportValue):ui.reportValue,r.activity,stageDisplay(r.stage),r.count,round1(r.technical),round1(r.visit),round1(r.average),r.objective,round1(r.average-r.objective),trafficFor(r.average,r.objective)]));}
function exportEngineers(){const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),grouped=groupRatings(records,'engineer'),overall=round1(mean(grouped.map(g=>g.average)));downloadCSV(`calificacion_ingenieros_${ui.reportValue}.csv`,['Periodo','Etiqueta','Ingeniero de ejecución','Área','Evaluaciones','Promedio técnico','Promedio visitas/preparación','Resultado final','Meta requerida','Media general','Liberadas en primera visita (%)'],grouped.map(r=>[ui.reportValue,ui.reportMode==='week'?qualityWeekLabel(ui.reportValue):ui.reportValue,r.engineer,AREA_LABELS[r.executionArea]||'',r.count,round1(r.technical),round1(r.visit),round1(r.average),ENGINEER_TARGET,overall,round1(r.firstVisitPct)]));}
function exportWeakPoints(){
  if(ui.reportMode!=='month'){toast('Los puntos débiles se generan para periodos mensuales.');return;}const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,'month',ui.reportValue)),groups=groupRatings(records,'activity').filter(g=>g.average<g.objective),rows=[];groups.forEach(g=>weaknessStats(records,g.activity).forEach(s=>rows.push([ui.reportValue,g.activity,round1(g.average),g.objective,stageDisplay(s.stage),s.id,s.name,s.failed,s.evaluated,round1(s.frequency),s.pointsLost])));downloadCSV(`puntos_debiles_${ui.reportValue}.csv`,['Mes','Taller','Promedio mensual','Objetivo','Etapa','Código criterio','Punto débil','Fallos','Evaluaciones','Frecuencia (%)','Puntos perdidos acumulados'],rows);
}
function downloadCSV(filename,headers,rows){const csv='\ufeff'+[headers,...rows].map(r=>r.map(csvEscape).join(',')).join('\n');downloadFile(filename,csv);toast('Archivo generado');}
async function bootstrap(){
  document.getElementById('app').innerHTML='<div class="loading-screen">Conectando con Supabase...</div>';
  try{
    const {data: sessionData,error: sessionError}=await supabaseClient.auth.getSession();
    if(sessionError) throw sessionError;
    let session=sessionData.session;

    // Una sesión vieja guardada por el navegador puede existir, pero tener el JWT vencido.
    // Intentamos renovarla antes de consultar tablas protegidas por RLS.
    if(session){
      const {data: refreshed,error: refreshError}=await supabaseClient.auth.refreshSession();
      if(!refreshError && refreshed.session) session=refreshed.session;
      else if(refreshError){
        console.warn('Sesión antigua descartada:',refreshError.message);
        await supabaseClient.auth.signOut({scope:'local'});
        session=null;
      }
    }

    const authId=session?.user?.id;
    if(!authId){
      data=initialData();
      data.users=USERS.map(u=>({...u}));
      authenticatedUser=null;
      render();
      return;
    }

    try{
      await loadRemoteData();
    }catch(syncError){
      // Si Supabase rechaza una sesión guardada, regresamos al login en vez de bloquear la página.
      if(/row-level security|jwt|session|permission|not authenticated/i.test(syncError.message||'')){
        console.warn('Sesión inválida o sin permisos; regresando al login:',syncError);
        await supabaseClient.auth.signOut({scope:'local'});
        data=initialData();
        data.users=USERS.map(u=>({...u}));
        authenticatedUser=null;
        render();
        setTimeout(()=>toast('La sesión anterior venció. Inicia sesión nuevamente.'),50);
        return;
      }
      throw syncError;
    }

    authenticatedUser=data.users.find(u=>u.authId===authId)||null;
    if(!authenticatedUser){
      await supabaseClient.auth.signOut({scope:'local'});
      data=initialData();
      data.users=USERS.map(u=>({...u}));
      render();
      return;
    }
    render();
  }catch(error){
    console.error(error);
    data=initialData();
    data.users=USERS.map(u=>({...u}));
    authenticatedUser=null;
    render();
    setTimeout(()=>toast('No se pudo conectar con Supabase: '+(error.message||String(error))),50);
  }
}
bootstrap();
