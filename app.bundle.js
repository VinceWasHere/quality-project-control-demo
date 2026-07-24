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
const ATTACHMENT_BUCKET = 'qpc-attachments';
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB por archivo; configurable en Supabase Storage
let data = null;

const ROLE_LABELS = {
  EJECUCION: 'Ingeniero de Ejecución',
  CALIDAD: 'Ingeniero de Calidad',
  COORDINADOR_CALIDAD: 'Gerente de Calidad',
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
function canOperateQuality(user){ return ['CALIDAD','COORDINADOR_CALIDAD','IT'].includes(user.role); }
function canReadProject(user){ return ['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'].includes(user.role); }
function canConfigure(user){ return ['COORDINADOR_CALIDAD','IT'].includes(user.role); }
function canOpenInspectionResources(user,inspection){
  if(user.role==='EJECUCION')return inspection.createdBy===user.id;
  // Todo el personal de Calidad puede revisar los adjuntos desde la bandeja,
  // incluso antes de tomar o asignarse la inspección.
  if(['CALIDAD','COORDINADOR_CALIDAD','IT'].includes(user.role))return true;
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
  const first=records.filter(r=>r.firstVisit&&((r.visit?.decision)||(r.inspection?.decision))==='Liberada').length;
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
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Fecha</th><th>Taller / etapa actual</th><th>Ubicación</th><th>Ingeniero de ejecución</th><th>Calidad</th><th>Último resultado</th><th>Visitas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows.map(i=>{const t=templateById(i.templateId),exec=userById(i.createdBy),quality=userById(i.assignedQualityId);return `<tr><td><strong>${escapeHtml(i.code)}</strong></td><td>${formatDate(i.completedAt?i.completedAt.slice(0,10):i.requestedDate)}<br><span class="helper">${escapeHtml(i.requestedTime||'')}</span></td><td>${escapeHtml(t?.activity||'—')}<br><span class="helper">${escapeHtml(stageDisplay(t?.stage||'General'))}</span></td><td>${escapeHtml(i.location)}</td><td>${escapeHtml(exec?.name||'—')}<br><span class="helper">${escapeHtml(AREA_LABELS[exec?.executionArea]||'')}</span></td><td>${escapeHtml(quality?.name||'Sin asignar')}</td><td>${Number.isFinite(i.finalScore)?`${round1(i.finalScore)}% ${trafficBadge(i.traffic)}`:'—'}</td><td>${i.visitEvaluations?.length||0}</td><td>${badge(i.status)}</td><td><div class="actions"><button class="btn btn-outline" data-open="${i.id}">Ver</button>${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar</button>`:''}${canOperateQuality(user)&&(i.assignedQualityId===user.id||user.role==='IT')&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Evaluar</button>`:''}</div></td></tr>`;}).join('')}</tbody></table></div>`;
}
function renderMyInspections(user){const rows=user.role==='EJECUCION'?data.inspections.filter(i=>i.createdBy===user.id):user.role==='IT'?data.inspections:canOperateQuality(user)?data.inspections.filter(i=>i.assignedQualityId===user.id):data.inspections;return `<div class="page-head"><div><h2>${user.role==='EJECUCION'?'Mi historial de inspecciones':'Mis inspecciones de Calidad'}</h2><p>${user.role==='EJECUCION'?'Abra una inspección para ver cada visita y los puntos descontados.':'Inspecciones tomadas o asignadas a su usuario.'}</p></div>${user.role==='EJECUCION'?'<div class="button-row"><button class="btn btn-primary" data-nav="newRequest">＋ Nueva solicitud</button></div>':''}</div>${inspectionsTable(rows,user)}`;}
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
  return `<div class="page-head"><div><h2>Solicitar inspección</h2><p>Seleccione la etapa, marque el alcance directamente sobre el mapeo y adjunte evidencias.</p></div></div><div class="grid grid-2" style="grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)"><div class="card"><div class="form-grid"><div class="field full"><label>Planilla / taller / etapa</label><select id="reqTemplate">${templateOptions(defaultTemplate.id)}</select><div class="helper">Las actividades con varias etapas incluyen Liberación, Seguimiento y Terminación / cierre.</div></div><div class="field"><label>Objetivo</label><input value="${defaultTemplate.objective}%" readonly></div><div class="field"><label>Contratista</label><input id="reqContractor" value="${escapeHtml(ui.requestDraft.contractor)}"></div><div class="field full"><label>Mapeo existente</label><select id="reqMapping">${[...MAPEOS,...(data.customMappings||[])].map(m=>`<option value="${m.id}" ${m.id===selectedMap.id?'selected':''}>${escapeHtml(m.code)} · ${escapeHtml(m.area)} · ${escapeHtml(m.version)}</option>`).join('')}</select><div class="helper">Seleccione el mapeo desde la base y marque el área que requiere revisión.</div></div><div class="field"><label>Fecha propuesta</label><input id="reqDate" type="date" value="${escapeHtml(ui.requestDraft.date)}"></div><div class="field"><label>Hora propuesta</label><input id="reqTime" type="time" value="${escapeHtml(ui.requestDraft.time)}"></div><div class="field full"><label>Alcance a inspeccionar</label><textarea id="reqScope">${escapeHtml(ui.requestDraft.scope)}</textarea></div><div class="field full"><label class="check-row"><input id="reqReady" type="checkbox" ${ui.requestDraft.ready?'checked':''}><span>Confirmo que el trabajo está terminado, el área está limpia y accesible, y el responsable estará disponible.</span></label></div><div class="field"><label>Fotografías previas</label><input id="reqPhotos" type="file" multiple accept="image/*"><div class="helper">Las fotografías se almacenan de forma privada en Supabase Storage.</div></div><div class="field"><label>Planos u otros documentos</label><input id="reqDocs" type="file" multiple accept="image/*,.pdf"><div class="helper">Se aceptan imágenes y PDF de hasta 50 MB por archivo.</div></div></div><div class="form-actions"><button class="btn btn-secondary" data-nav="home">Cancelar</button><div class="button-row"><button id="saveDraft" class="btn btn-outline">Guardar borrador</button><button id="submitRequest" class="btn btn-primary">Enviar a Calidad</button></div></div></div><aside><div class="card map-card"><img src="${escapeHtml(ui.requestDraft.annotationData||selectedMap.file)}" alt="${escapeHtml(selectedMap.title)}"><div class="body"><h3>${escapeHtml(selectedMap.title)}</h3><div class="helper">${escapeHtml(selectedMap.code)} · ${escapeHtml(selectedMap.version)}</div><div class="button-row" style="margin-top:12px"><button id="openAnnotator" class="btn btn-primary">✎ Colorear o rayar mapeo</button><a class="btn btn-outline" href="${escapeHtml(selectedMap.file)}" target="_blank">Abrir original</a></div>${ui.requestDraft.annotationData?'<div class="alert alert-success" style="margin-top:12px">El mapeo marcado se adjuntará a la solicitud.</div>':''}</div></div><div class="card" style="margin-top:16px"><h3>Planilla seleccionada</h3><div class="kv"><div>Actividad</div><div>${escapeHtml(defaultTemplate.activity)}</div><div>Etapa</div><div>${escapeHtml(stageDisplay(defaultTemplate.stage))}</div><div>Criterios</div><div>${defaultTemplate.criteria.length}</div><div>Objetivo</div><div>${defaultTemplate.objective}%</div></div></div><div class="card" style="margin-top:16px"><h3>Instructivos relacionados</h3>${docs.length?docs.map(d=>`<div style="margin-bottom:10px"><span class="doc-code">${escapeHtml(d.code)} ${escapeHtml(d.version)}</span><br><strong>${escapeHtml(d.title)}</strong></div>`).join(''):'<div class="helper">No hay instructivo vinculado todavía.</div>'}</div></aside></div>`;
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
  return `<div class="resource-grid"><article class="resource-item"><strong>Mapeo original</strong><span>${escapeHtml(m?.code||'—')}</span>${m?.file?`<a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Abrir mapeo</a>`:'<button class="btn btn-secondary" disabled>Sin archivo</button>'}</article>${i.mappingAnnotation?`<article class="resource-item"><strong>Mapeo marcado por Ejecución</strong><span>Alcance señalado en la solicitud</span><button class="btn btn-primary" data-open-annotation="${i.id}">Abrir marcas</button></article>`:''}${attachments.map(a=>{const isImage=(a.type||'').startsWith('image/');const stored=Boolean(a.storagePath||a.dataUrl);return `<article class="resource-item attachment-resource"><strong>${escapeHtml(a.kind||'Adjunto')}</strong><span>${escapeHtml(a.name)}</span>${a.dataUrl&&isImage?`<button class="attachment-preview" data-open-attachment="${i.id}" data-attachment-index="${a.index}" aria-label="Abrir ${escapeHtml(a.name)}"><img src="${a.dataUrl}" alt="Vista previa de ${escapeHtml(a.name)}"></button>`:''}${stored?`<div class="button-row"><button class="btn btn-primary" data-open-attachment="${i.id}" data-attachment-index="${a.index}">${isImage?'Ver fotografía':'Abrir documento'}</button><button class="btn btn-outline" data-download-attachment="${i.id}" data-attachment-index="${a.index}">Descargar</button></div>`:'<button class="btn btn-secondary" disabled>Archivo no disponible</button>'}</article>`;}).join('')}${docs.map(d=>`<article class="resource-item"><strong>${escapeHtml(d.code)} ${escapeHtml(d.version)}</strong><span>${escapeHtml(d.title)}</span>${d.file?`<a class="btn btn-outline" href="${escapeHtml(d.file)}" target="_blank">Abrir instructivo</a>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>'}</article>`).join('')}</div>`;
}
function renderDetail(user){
  const i=data.inspections.find(x=>x.id===ui.selectedId);if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';if(user.role==='EJECUCION'&&i.createdBy!==user.id)return noAccess();
  const t=templateById(i.templateId),m=mappingById(i.mappingId),exec=userById(i.createdBy),quality=userById(i.assignedQualityId),docs=INSTRUCTIVOS.filter(d=>d.activities.includes(t?.activity));
  const nextTemplates=templatesForActivity(t?.activity||'');
  return `<div class="page-head"><div><h2>${escapeHtml(i.code)}</h2><p>${escapeHtml(t?.activity||'—')} · ${escapeHtml(stageDisplay(t?.stage||'General'))} · ${escapeHtml(i.location)}</p></div><div class="button-row">${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar inspección</button>`:''}${canOperateQuality(user)&&(i.assignedQualityId===user.id||user.role==='IT')&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Abrir planilla actual</button>`:''}${canOperateQuality(user)&&['SOLICITADA','TOMADA'].includes(i.status)?`<button class="btn btn-danger" data-improper="${i.id}">Marcar improcedente</button>`:''}</div></div><div class="grid grid-2"><div class="card"><h3>Datos de la inspección</h3><div class="kv"><div>Solicitante</div><div>${escapeHtml(exec?.name||'—')} · ${escapeHtml(AREA_LABELS[exec?.executionArea]||'')}</div><div>Contratista</div><div>${escapeHtml(i.contractor)}</div><div>Etapa actual</div><div>${escapeHtml(stageDisplay(t?.stage||'General'))}</div><div>Planilla</div><div>${escapeHtml(t?.title||'—')} · ${escapeHtml(t?.version||'—')}</div><div>Paquete</div><div>${escapeHtml(i.packageCode)}</div><div>Fecha / hora</div><div>${formatDate(i.requestedDate)} · ${escapeHtml(i.requestedTime)}</div><div>Responsable Calidad</div><div>${escapeHtml(quality?.name||'Sin asignar')}</div><div>Estado</div><div>${badge(i.status)}</div></div><p style="margin-bottom:0"><strong>Alcance:</strong> ${escapeHtml(i.scope)}</p></div><div class="card map-card">${m?`<img src="${escapeHtml(i.mappingAnnotation||m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${i.mappingAnnotation?'Mapeo marcado de la solicitud':escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)} · ${escapeHtml(m.status)}</div></div>`:'<div class="empty">Sin mapeo asociado.</div>'}</div></div>${Number.isFinite(i.finalScore)?`<div class="grid grid-4" style="margin-top:16px">${metric('Último resultado técnico',`${round1(i.technicalScore)}%`,'Última visita')}${metric('Última preparación / visitas',`${round1(i.visitScore)}%`,'Última visita')}${metric('Calificación vigente',`${round1(i.finalScore)}%`,'La calificación de la visita más reciente',i.finalScore>=i.objective?'positive':i.finalScore>=i.objective-5?'warning':'critical')}${metric('Visitas calificadas',i.visitEvaluations?.length||0,'Cada visita conserva su puntaje')}</div>`:''}${canOperateQuality(user)&&(i.assignedQualityId===user.id||user.role==='IT')&&Number.isFinite(i.finalScore)?`<div class="card" style="margin-top:16px"><h3>Registrar una nueva visita o etapa</h3><div class="form-grid"><div class="field"><label>Planilla para la nueva visita</label><select id="nextVisitTemplate">${nextTemplates.map(x=>`<option value="${x.id}" ${x.id===i.templateId?'selected':''}>${escapeHtml(stageDisplay(x.stage))} · ${escapeHtml(x.title)}</option>`).join('')}</select></div><div class="field"><label>Funcionamiento</label><input value="La nueva visita tendrá una calificación independiente" readonly></div></div><div class="button-row" style="margin-top:12px"><button class="btn btn-primary" data-new-visit="${i.id}">＋ Registrar visita ${Number(i.visitEvaluations?.length||0)+1}</button></div><div class="helper">Se copian las respuestas de la visita anterior para facilitar la revisión. Calidad puede subir o bajar cualquier criterio y el sistema conserva ambos puntajes.</div></div>`:''}<div class="section-title"><h3>Calificaciones y puntos descontados por visita</h3></div><div class="visit-list">${renderVisitHistory(i,user)}</div><div class="section-title"><h3>Documentos, mapeos y evidencias</h3></div><div class="card">${renderResources(i,m,docs,user)}</div><div class="section-title"><h3>Trazabilidad</h3></div><div class="card"><div class="timeline">${renderAudit(i.audit)}</div></div>`;
}
function renderAudit(audit){return audit?.length?audit.map(a=>{const u=userById(a.userId);return `<div class="timeline-item"><span class="timeline-dot"></span><strong>${escapeHtml(a.action)}</strong><p>${escapeHtml(u?.name||'Sistema')} · ${formatDateTime(a.at)}</p></div>`;}).join(''):'<div class="empty">Sin eventos.</div>';}
function currentVisit(i){return (i.visitEvaluations||[]).find(v=>v.id===i.activeVisitId)||(i.visitEvaluations||[]).find(v=>v.status==='EN_PROCESO')||null;}
function renderEvaluation(user){
  if(!canOperateQuality(user))return noAccess();const i=data.inspections.find(x=>x.id===ui.selectedId);if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';if(i.assignedQualityId!==user.id&&!['COORDINADOR_CALIDAD','IT'].includes(user.role))return noAccess();
  const visit=currentVisit(i);if(!visit)return '<div class="alert alert-warning">No hay una visita activa. Regrese al detalle y registre una nueva visita.</div>';const t=templateById(visit.templateId),score=calculateAnswers(t,visit.answers||{});
  return `<div class="page-head"><div><h2>Planilla digital · Visita ${visit.number}</h2><p>${escapeHtml(i.code)} · ${escapeHtml(t.activity)} · ${escapeHtml(stageDisplay(t.stage))}</p></div><div class="button-row"><button id="markCompliant" class="btn btn-outline">Marcar todo conforme</button></div></div><div class="alert alert-info">Esta visita tendrá su propio puntaje. Las visitas anteriores no se sobrescriben y permanecen visibles para Ejecución y Calidad.</div><div class="grid grid-2 inspection-workspace"><div class="inspection-main"><div class="card visit-summary-card" style="margin-bottom:16px"><div class="grid grid-4"><div><div class="metric-label">Número de visita</div><strong>${visit.number}</strong></div><div><div class="metric-label">Etapa</div><strong>${escapeHtml(stageDisplay(t.stage))}</strong></div><div><div class="metric-label">Criterios</div><strong>${t.criteria.length}</strong></div><div><div class="metric-label">Objetivo</div><strong>${t.objective}%</strong></div></div></div><div class="criteria">${t.criteria.map(c=>renderCriterion(visit,c)).join('')}</div><div class="card visit-actions-card" style="margin-top:16px"><div class="field"><label>Observación general de esta visita</label><textarea id="generalObservation">${escapeHtml(visit.generalObservation||'')}</textarea></div><div class="form-actions"><button class="btn btn-secondary" data-open="${i.id}">Volver</button><div class="button-row"><button class="btn btn-success" data-finish="Liberada">Guardar y liberar</button><button class="btn btn-warning" data-finish="Con observaciones">Guardar con observaciones</button><button class="btn btn-danger" data-finish="No liberada">Guardar y no liberar</button></div></div></div></div><aside class="card score-box"><div class="metric-label">Resultado preliminar de la visita ${visit.number}</div><div class="score-number">${round1(score.final)}%</div><div class="progress"><span style="width:${Math.min(100,score.final)}%"></span></div><div style="margin-top:17px" class="traffic">${trafficHtml(score.final,t.objective)}</div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="kv"><div>Técnico</div><div>${round1(score.technical)}%</div><div>Visitas / preparación</div><div>${round1(score.visit)}%</div><div>Completados</div><div>${score.answered} de ${score.total}</div><div>Objetivo</div><div>${t.objective}%</div></div>${visit.number>1?`<div class="alert alert-warning" style="margin-top:15px">La calificación vigente de la inspección se actualizará con esta visita, pero la anterior seguirá en el historial.</div>`:''}</aside></div>`;
}
function renderCriterion(visit,c){return `<article class="criterion"><span class="badge ${c.isVisitCriterion?'badge-yellow':'badge-blue'}">${c.isVisitCriterion?'Visitas / preparación':'Criterio técnico'}</span><h4>${escapeHtml(c.id)} · ${escapeHtml(c.name)}</h4><div class="meta">Peso: ${c.weight} · Respuesta: ${escapeHtml(c.responseType)} · Fila fuente: ${c.sourceRow}</div>${c.description?`<div class="description">${escapeHtml(c.description)}</div>`:''}<div class="criteria-grid"><div class="field"><label>Evaluación</label><select data-answer="${c.id}"><option value="">Seleccione…</option>${c.options.map(o=>`<option value="${escapeHtml(o.label)}" ${visit.answers?.[c.id]===o.label?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div><div class="field"><label>Observación</label><input data-note="${c.id}" value="${escapeHtml(visit.notes?.[c.id]||'')}" placeholder="Explique el descuento cuando aplique"></div></div></article>`;}
function trafficHtml(score,objective){const t=trafficFor(score,objective),cls=t==='Verde'?'green':t==='Amarillo'?'yellow':'red';return `<span class="light ${cls}"></span>${t} · ${round1(score)}%`;}
function renderDocuments(user){const search=ui.docSearch.toLowerCase(),all=[...INSTRUCTIVOS,...(data.customDocuments||[])],rows=all.filter(d=>!search||`${d.code} ${d.version} ${d.title} ${(d.activities||[]).join(' ')} ${d.status}`.toLowerCase().includes(search));return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Consulta por código, actividad, versión y vigencia.</p></div></div><div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch)}" placeholder="Ej.: Mampostería, IT-CP-05, Pintura..."></div></div><div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3 style="margin-top:8px">${escapeHtml(d.title)}</h3><span class="badge ${d.status==='Vigente'?'badge-green':'badge-yellow'}">${escapeHtml(d.status)}</span><div class="tag-list">${(d.activities||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div><p class="helper">${escapeHtml(d.note||'')}</p></div><div class="button-row">${d.file?`<a class="btn btn-primary" href="${escapeHtml(d.file)}" target="_blank">Abrir documento</a>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>'}</div></article>`).join('')||'<div class="card empty">No se encontraron documentos.</div>'}</div>`;}
function renderMappings(user){const search=ui.mapSearch.toLowerCase(),all=[...MAPEOS,...(data.customMappings||[])],rows=all.filter(m=>!search||`${m.code} ${m.block} ${m.level} ${m.area} ${m.title}`.toLowerCase().includes(search));return `<div class="page-head"><div><h2>Biblioteca de mapeos</h2><p>Los mapeos pueden seleccionarse y marcarse durante la solicitud.</p></div></div><div class="filters"><div class="field full"><label>Buscar mapeo</label><input id="mapSearch" value="${escapeHtml(ui.mapSearch)}" placeholder="Bloque, nivel, habitación, código..."></div></div><div class="grid grid-3">${rows.map(m=>`<article class="card map-card"><img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)}</div><div class="tag-list"><span class="tag">${escapeHtml(m.block)}</span><span class="tag">${escapeHtml(m.level)}</span><span class="tag">${escapeHtml(m.area)}</span></div><div class="button-row" style="margin-top:12px"><a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Ver mapeo</a>${user.role==='EJECUCION'?`<button class="btn btn-primary" data-use-mapping="${m.id}">Usar y marcar</button>`:''}</div></div></article>`).join('')}</div>`;}
function groupRatings(records,type){
  const groups={};records.forEach(r=>{const t=r.template,exec=userById(r.createdBy);let key;if(type==='engineer')key=r.createdBy;else if(type==='activity')key=t.activity;else key=`${t.activity}|||${t.stage}`;if(!groups[key])groups[key]={activity:t.activity,stage:type==='activity'?'Todas':t.stage,engineerId:r.createdBy,engineer:exec?.name||'—',executionArea:exec?.executionArea||'',records:[],objective:t.objective};groups[key].records.push(r);});
  return Object.values(groups).map(g=>({...g,count:g.records.length,average:mean(g.records.map(r=>r.finalScore)),technical:mean(g.records.map(r=>r.technicalScore)),visit:mean(g.records.map(r=>r.visitScore)),firstVisitPct:g.records.length?g.records.filter(r=>r.firstVisit&&((r.visit?.decision)||(r.inspection?.decision))==='Liberada').length/g.records.length*100:0,improper:g.records.filter(r=>r.inspection.status==='IMPROCEDENTE').length})).sort((a,b)=>a.average-b.average);
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
  document.querySelectorAll('[data-download-attachment]').forEach(b=>b.addEventListener('click',()=>downloadAttachment(b.dataset.downloadAttachment,Number(b.dataset.attachmentIndex))));
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
async function filesToAttachments(fileLists, inspectionId){
  const files=fileLists.flatMap(x=>[...x]);
  const user=currentUser();
  if(!user?.authId) throw new Error('No existe una sesión válida para subir archivos.');
  const output=[];
  for(const file of files){
    if(file.size>MAX_ATTACHMENT_BYTES){
      throw new Error(`${file.name} excede el máximo de 50 MB.`);
    }
    const safeName=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]/g,'_');
    const unique=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const path=`${typeof projectId==='function'?projectId():'LCE'}/${user.authId}/${inspectionId}/${unique}-${safeName}`;
    const {error}=await supabaseClient.storage.from(ATTACHMENT_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
    if(error) throw new Error(`No se pudo subir ${file.name}: ${error.message}`);
    output.push({name:file.name,type:file.type,size:file.size,storagePath:path,bucket:ATTACHMENT_BUCKET,kind:file.type.startsWith('image/')?'Fotografía':'Documento'});
  }
  return output;
}

async function createInspection(user,submit){
  captureRequestDraft();const t=templateById(ui.requestDraft.templateId),m=mappingById(ui.requestDraft.mappingId),photos=document.getElementById('reqPhotos')?.files||[],docs=document.getElementById('reqDocs')?.files||[];const inspectionId='i-'+Date.now();const attachments=await filesToAttachments([photos,docs],inspectionId);
  const i={id:inspectionId,code:nextCode(),projectId:'LCE',createdBy:user.id,templateId:t.id,mappingId:m.id,contractor:ui.requestDraft.contractor.trim(),location:`${m.block} · ${m.level} · ${m.area}`,packageCode:nextPackage(t,m),scope:ui.requestDraft.scope.trim(),requestedDate:ui.requestDraft.date,requestedTime:ui.requestDraft.time,ready:ui.requestDraft.ready,status:submit?'SOLICITADA':'BORRADOR',assignedQualityId:null,createdAt:nowISO(),technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],visitEvaluations:[],activeVisitId:null,attachments,mappingAnnotation:ui.requestDraft.annotationData,audit:[{at:nowISO(),userId:user.id,action:submit?'Solicitud enviada a Calidad':'Borrador creado'}]};
  data.inspections.unshift(i);saveData();ui.requestDraft.annotationData=null;toast(submit?'Solicitud enviada a Calidad':'Borrador guardado');ui.view='myInspections';render();
}
function takeInspection(user,id){const i=data.inspections.find(x=>x.id===id);if(!i||i.status!=='SOLICITADA')return;i.assignedQualityId=user.id;i.status='TOMADA';i.audit.push({at:nowISO(),userId:user.id,action:'Inspección tomada por Calidad'});saveData();toast('Inspección asignada a su usuario');ui.selectedId=id;ui.view='detail';render();}
function createActiveVisit(i,user,templateId,copyPrevious=true){
  const t=templateById(templateId),previous=(i.visitEvaluations||[]).slice(-1)[0];const visit={id:`visit-${Date.now()}`,number:(i.visitEvaluations?.length||0)+1,templateId:t.id,stage:t.stage,startedAt:nowISO(),finishedAt:null,startedBy:user.id,finishedBy:null,answers:copyPrevious&&previous?{...previous.answers}:{},notes:{},generalObservation:'',technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,weakCriteria:[],status:'EN_PROCESO'};i.visitEvaluations=i.visitEvaluations||[];i.visitEvaluations.push(visit);i.activeVisitId=visit.id;i.templateId=t.id;i.status='EN_EVALUACION';i.startedAt=i.startedAt||visit.startedAt;i.audit.push({at:visit.startedAt,userId:user.id,action:`Visita ${visit.number} iniciada · ${stageDisplay(t.stage)}`});return visit;
}
function openEvaluation(user,id){const i=data.inspections.find(x=>x.id===id);if(!i)return;if(!currentVisit(i))createActiveVisit(i,user,i.templateId,false);saveData();ui.selectedId=id;ui.view='evaluate';render();}
function startNewVisit(user,id,templateId){const i=data.inspections.find(x=>x.id===id);if(!i)return;if(i.assignedQualityId!==user.id&&!['COORDINADOR_CALIDAD','IT'].includes(user.role)){toast('Solo el inspector asignado, Gerencia de Calidad o Tecnología puede registrar la visita.');return;}createActiveVisit(i,user,templateId,true);saveData();ui.selectedId=id;ui.view='evaluate';render();}
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
async function attachmentUrl(a, expiresIn=900){
  if(a?.dataUrl)return a.dataUrl;
  if(!a?.storagePath)throw new Error('El archivo no tiene una ruta de almacenamiento.');
  const {data:signed,error}=await supabaseClient.storage.from(a.bucket||ATTACHMENT_BUCKET).createSignedUrl(a.storagePath,expiresIn);
  if(error)throw error;
  return signed.signedUrl;
}
async function openAttachment(inspectionId,index){
  const i=data.inspections.find(x=>x.id===inspectionId),a=i?.attachments?.[index];
  if(!a){toast('No se encontró el adjunto.');return;}
  const win=window.open('about:blank','_blank');
  try{
    const url=await attachmentUrl(a,900);
    if(!win){window.open(url,'_blank');return;}
    win.location.href=url;
  }catch(error){
    if(win)win.close();
    console.error(error);toast('No se pudo abrir el adjunto: '+(error.message||error));
  }
}
async function downloadAttachment(inspectionId,index){
  const i=data.inspections.find(x=>x.id===inspectionId),a=i?.attachments?.[index];
  if(!a){toast('No se encontró el adjunto.');return;}
  try{
    if(a.dataUrl){const link=document.createElement('a');link.href=a.dataUrl;link.download=a.name||'adjunto';link.click();return;}
    const {data:blob,error}=await supabaseClient.storage.from(a.bucket||ATTACHMENT_BUCKET).download(a.storagePath);
    if(error)throw error;
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=a.name||'adjunto';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){console.error(error);toast('No se pudo descargar el adjunto: '+(error.message||error));}
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
// El arranque se ejecuta en v613.js después de cargar todos los módulos.

/* Quality Project Control V5
   Extensiones sobre V4: multiproyecto, promedio por visitas, N/A universal,
   gráficos FO-CP-11, PDF, gestión documental, equipos de medición y resaltador. */

const QPC_PROJECTS = {
  LCE:{id:'LCE',name:'Lopesan La Ceiba',hotelCode:'HLLC'},
  VC:{id:'VC',name:'Villa Corales',hotelCode:'HVC'}
};
const QPC_COLORS={red:'#c8102e',blue:'#1e6687',orange:'#ef6c2f',green:'#1b6f2a',cyan:'#199ed1',gray:'#707070'};
let qpcCharts=[];

function projectId(){return ui.activeProjectId||'LCE';}
function projectInfo(){return QPC_PROJECTS[projectId()]||QPC_PROJECTS.LCE;}
function projectInspections(){return data.inspections.filter(i=>(i.projectId||'LCE')===projectId());}
function projectDocuments(){return [...INSTRUCTIVOS,...(data.customDocuments||[])].filter(d=>!d.projectId||d.projectId===projectId());}
function projectMappings(){return [...MAPEOS,...(data.customMappings||[])].filter(m=>!m.projectId||m.projectId===projectId());}
function currentMonth(){return ui.reportValue&&/^\d{4}-\d{2}$/.test(ui.reportValue)?ui.reportValue:'2026-07';}
function previousMonths(month,count=3){const [y,m]=month.split('-').map(Number),out=[];for(let k=count-1;k>=0;k--){const d=new Date(y,m-1-k,1);out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}return out;}
function monthName(key){const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('es-DO',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());}
function shortCode(project,date){
  const p=QPC_PROJECTS[project]||QPC_PROJECTS.LCE;
  const d=new Date(`${date||toISODate(new Date())}T12:00:00`);
  const base=`I-${p.hotelCode}-${String(d.getFullYear()).slice(-2)}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const same=data.inspections.filter(i=>(i.projectId||'LCE')===project&&i.requestedDate===(date||toISODate(new Date()))).length;
  return same?`${base}-${String(same+1).padStart(2,'0')}`:base;
}
nextCode=function(date){return shortCode(projectId(),date||ui.requestDraft.date);};

function finalizedVisits(i){return (i.visitEvaluations||[]).filter(v=>v.status==='FINALIZADA'&&Number.isFinite(Number(v.finalScore)));}
function recalcInspection(i){
  const visits=finalizedVisits(i);if(!visits.length)return i;
  const latest=visits[visits.length-1];
  i.technicalScore=round1(mean(visits.map(v=>v.technicalScore)));
  i.visitScore=round1(mean(visits.map(v=>v.visitScore)));
  i.finalScore=round1(mean(visits.map(v=>v.finalScore)));
  i.objective=round1(mean(visits.map(v=>v.objective)));
  i.traffic=trafficFor(i.finalScore,i.objective);
  i.decision=latest.decision;
  i.status=statusFromDecision(latest.decision);
  i.completedAt=latest.finishedAt;i.closedBy=latest.finishedBy;i.visitsCount=visits.length;i.firstVisit=visits.length===1;
  i.weakCriteria=[...new Set(visits.flatMap(v=>v.weakCriteria||[]))];
  return i;
}
function aggregateRecords(){
  return projectInspections().filter(i=>finalizedVisits(i).length).map(i=>{
    recalcInspection(i);const latest=finalizedVisits(i).slice(-1)[0],t=templateById(latest?.templateId||i.templateId);
    return {inspection:i,template:t,createdBy:i.createdBy,completedDate:(i.completedAt||latest.finishedAt).slice(0,10),finalScore:i.finalScore,technicalScore:i.technicalScore,visitScore:i.visitScore,objective:i.objective,firstVisit:i.firstVisit,status:i.status,visits:finalizedVisits(i)};
  });
}
evaluationRecords=function(){
  const records=[];projectInspections().forEach(i=>finalizedVisits(i).forEach(v=>{const t=templateById(v.templateId||i.templateId);records.push({inspection:i,visit:v,template:t,createdBy:i.createdBy,completedDate:v.finishedAt.slice(0,10),finalScore:v.finalScore,technicalScore:v.technicalScore,visitScore:v.visitScore,objective:v.objective||t.objective,firstVisit:v.number===1,status:i.status});}));return records;
};
completedInspections=function(){return projectInspections().filter(i=>finalizedVisits(i).length);};
inspectionsForExecution=function(user){return projectInspections().filter(i=>i.createdBy===user.id);};
monthlyRecordsForUser=function(user,month=currentMonth()){return aggregateRecords().filter(r=>r.createdBy===user.id&&monthKey(r.completedDate)===month);};
availableWeekStarts=function(){const starts=[...new Set(aggregateRecords().map(r=>qualityWeekStart(r.completedDate)))].sort().reverse();return starts.length?starts:[qualityWeekStart(toISODate(new Date()))];};

function migrateV5(){
  data.users.forEach(u=>{if(['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(u.role))u.projectIds=['LCE','VC'];else u.projectIds=['LCE','VC'];});
  data.projects=Object.values(QPC_PROJECTS);
  data.customMappings=data.customMappings||[];data.customDocuments=data.customDocuments||[];
  data.equipmentRecords=data.equipmentRecords?.length?data.equipmentRecords:JSON.parse(JSON.stringify(window.QPC_EQUIPMENT_SEED?.records||[]));
  data.equipmentFrequency=data.equipmentFrequency?.length?data.equipmentFrequency:JSON.parse(JSON.stringify(window.QPC_EQUIPMENT_SEED?.frequencyMatrix||[]));
  data.inspections.forEach(i=>{i.projectId=i.projectId||'LCE';recalcInspection(i);});
  if(!data.customMappings.some(m=>m.id==='MAP-VC-V01-N01'))data.customMappings.push({id:'MAP-VC-V01-N01',projectId:'VC',code:'MAP-VC-V01-N01',title:'Villa 01 · Nivel 01',block:'Villa 01',level:'Nivel 01',area:'Área general',version:'V01',status:'Vigente',file:'assets/mapeos/map_vc_villa_01.svg',uploadedBy:'coord-1',updatedAt:nowISO()});
  if(!data.inspections.some(i=>i.projectId==='VC')){
    const t=findTemplate('Mampostería','General');
    const v=makeSeedVisit(t,1,'2026-07-15','quality-1',['Espesor y llenado de Juntas'],1,false);
    const i={id:'vc-seed-1',code:'I-HVC-26-07-15',projectId:'VC',createdBy:'exec-3',templateId:t.id,mappingId:'MAP-VC-V01-N01',contractor:'Contratista Villa Corales Demo',location:'Villa 01 · Nivel 01 · Área general',packageCode:'PL-VC-V01-MAMP-001',scope:'Mampostería interior Villa 01',requestedDate:'2026-07-15',requestedTime:'08:00',ready:true,status:'CON_OBSERVACIONES',assignedQualityId:'quality-1',createdAt:'2026-07-15T07:20:00',visitEvaluations:[v],activeVisitId:null,attachments:[],mappingAnnotation:null,audit:[{at:'2026-07-15T07:20:00',userId:'exec-3',action:'Solicitud enviada a Calidad'},{at:v.finishedAt,userId:'quality-1',action:`Visita 1 cerrada con ${v.finalScore}%`} ]};recalcInspection(i);data.inspections.push(i);
  }
  // Recodificar los códigos largos existentes al formato corto, conservando unicidad.
  const groups={};data.inspections.sort((a,b)=>(a.requestedDate||'').localeCompare(b.requestedDate||'')).forEach(i=>{const p=QPC_PROJECTS[i.projectId]||QPC_PROJECTS.LCE,d=i.requestedDate||toISODate(new Date()),key=`${i.projectId}|${d}`,n=(groups[key]||0)+1;groups[key]=n;const dt=new Date(`${d}T12:00:00`);const base=`I-${p.hotelCode}-${String(dt.getFullYear()).slice(-2)}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;i.code=n===1?base:`${base}-${String(n).padStart(2,'0')}`;});
  saveData();
}

answerFactor=function(criterion,label){if(!label||label==='N/A')return null;const option=criterion.options.find(o=>o.label===label);return option?option.factor:null;};

/* Login y autenticación se gestionan exclusivamente en app.js mediante Supabase Auth. */
createInspection=async function(user,submit){captureRequestDraft();const t=templateById(ui.requestDraft.templateId),m=mappingById(ui.requestDraft.mappingId),photos=document.getElementById('reqPhotos')?.files||[],docs=document.getElementById('reqDocs')?.files||[],inspectionId='i-'+Date.now(),attachments=await filesToAttachments([photos,docs],inspectionId);const i={id:inspectionId,code:nextCode(ui.requestDraft.date),projectId:projectId(),createdBy:user.id,templateId:t.id,mappingId:m.id,contractor:ui.requestDraft.contractor.trim(),location:`${m.block} · ${m.level} · ${m.area}`,packageCode:nextPackage(t,m),scope:ui.requestDraft.scope.trim(),requestedDate:ui.requestDraft.date,requestedTime:ui.requestDraft.time,ready:ui.requestDraft.ready,status:submit?'SOLICITADA':'BORRADOR',assignedQualityId:null,createdAt:nowISO(),technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],visitEvaluations:[],activeVisitId:null,attachments,mappingAnnotation:ui.requestDraft.annotationData,audit:[{at:nowISO(),userId:user.id,action:submit?'Solicitud enviada a Calidad':'Borrador creado'}]};data.inspections.unshift(i);saveData();ui.requestDraft.annotationData=null;toast(submit?'Solicitud enviada a Calidad':'Borrador guardado');ui.view='myInspections';render();};

function fileToDataUrl(file,max=1400000){return new Promise(resolve=>{if(!file||file.size>max)return resolve(null);const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>resolve(null);r.readAsDataURL(file);});}
renderDocuments=function(user){const rows=projectDocuments().filter(d=>!ui.docSearch||`${d.code} ${d.version} ${d.title} ${(d.activities||[]).join(' ')} ${d.status}`.toLowerCase().includes(ui.docSearch.toLowerCase())),manage=canOperateQuality(user);return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Calidad puede cargar, actualizar versiones y cambiar la vigencia.</p></div></div>${manage?`<div class="card library-admin"><h3>Subir o actualizar instructivo</h3><div class="form-grid"><div class="field"><label>Código</label><input id="docCode" placeholder="IT-CP-05"></div><div class="field"><label>Versión</label><input id="docVersion" placeholder="V03"></div><div class="field full"><label>Título</label><input id="docTitle" placeholder="Colocación de Bloques"></div><div class="field"><label>Actividad relacionada</label><input id="docActivity" placeholder="Mampostería"></div><div class="field"><label>Estado</label><select id="docStatus"><option>Vigente</option><option>Obsoleto</option><option>Pendiente de validación</option></select></div><div class="field full"><label>Archivo PDF o imagen</label><input id="docFile" type="file" accept=".pdf,image/*"></div></div><button id="saveDocumentBtn" class="btn btn-primary" style="margin-top:12px">Guardar documento</button></div>`:''}<div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch)}" placeholder="Código, actividad, versión..."></div></div><div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3>${escapeHtml(d.title)}</h3><span class="badge ${d.status==='Vigente'?'badge-green':'badge-yellow'}">${escapeHtml(d.status)}</span><div class="tag-list">${(d.activities||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div><p class="helper">Actualizado: ${formatDateTime(d.updatedAt)}</p></div><div class="button-row">${d.file?`<a class="btn btn-primary" href="${escapeHtml(d.file)}" target="_blank">Abrir</a>`:'<button class="btn btn-secondary" disabled>Archivo no almacenado</button>'}${manage?`<button class="btn btn-outline" data-edit-document="${d.id||d.code}">Modificar</button>`:''}</div></article>`).join('')||'<div class="card empty">No hay documentos.</div>'}</div>`;};
renderMappings=function(user){const rows=projectMappings().filter(m=>!ui.mapSearch||`${m.code} ${m.block} ${m.level} ${m.area} ${m.title}`.toLowerCase().includes(ui.mapSearch.toLowerCase())),manage=canOperateQuality(user);return `<div class="page-head"><div><h2>Biblioteca de mapeos</h2><p>Calidad administra los mapeos; Ejecución los selecciona y resalta al solicitar.</p></div></div>${manage?`<div class="card library-admin"><h3>Subir o actualizar mapeo</h3><div class="form-grid"><div class="field"><label>Código</label><input id="mapCode" placeholder="MAP-${projectInfo().hotelCode}-D1-N02"></div><div class="field"><label>Versión</label><input id="mapVersion" value="V01"></div><div class="field"><label>Bloque / villa</label><input id="mapBlock" placeholder="D1 o Villa 01"></div><div class="field"><label>Nivel</label><input id="mapLevel" placeholder="Nivel 02"></div><div class="field full"><label>Área</label><input id="mapArea" placeholder="Habitación 2101"></div><div class="field full"><label>Imagen del mapeo</label><input id="mapFile" type="file" accept="image/*,.svg"></div></div><button id="saveMappingBtn" class="btn btn-primary" style="margin-top:12px">Guardar mapeo</button></div>`:''}<div class="filters"><div class="field full"><label>Buscar mapeo</label><input id="mapSearch" value="${escapeHtml(ui.mapSearch)}" placeholder="Bloque, nivel, habitación, código..."></div></div><div class="grid grid-3">${rows.map(m=>`<article class="card map-card"><img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)}</div><div class="tag-list"><span class="tag">${escapeHtml(m.block)}</span><span class="tag">${escapeHtml(m.level)}</span><span class="tag">${escapeHtml(m.area)}</span></div><div class="button-row" style="margin-top:12px"><a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Ver</a>${user.role==='EJECUCION'?`<button class="btn btn-primary" data-use-mapping="${m.id}">Usar y resaltar</button>`:''}${manage?`<button class="btn btn-outline" data-edit-mapping="${m.id}">Modificar</button>`:''}</div></div></article>`).join('')||'<div class="card empty">No hay mapeos para este proyecto.</div>'}</div>`;};
async function saveDocument(){const code=document.getElementById('docCode').value.trim(),version=document.getElementById('docVersion').value.trim(),title=document.getElementById('docTitle').value.trim(),activity=document.getElementById('docActivity').value.trim(),status=document.getElementById('docStatus').value,file=document.getElementById('docFile').files[0];if(!code||!title){toast('Complete código y título');return;}const dataUrl=await fileToDataUrl(file);const existing=data.customDocuments.find(d=>d.projectId===projectId()&&d.code===code);const record={id:existing?.id||`DOC-${Date.now()}`,projectId:projectId(),code,version:version||'V01',title,status,activities:activity?[activity]:[],file:dataUrl||existing?.file||null,fileName:file?.name||existing?.fileName||'',updatedBy:currentUser().id,updatedAt:nowISO(),note:'Documento administrado desde la plataforma'};if(existing)Object.assign(existing,record);else data.customDocuments.push(record);saveData();toast(existing?'Instructivo actualizado':'Instructivo cargado');render();}
async function saveMapping(){const code=document.getElementById('mapCode').value.trim(),version=document.getElementById('mapVersion').value.trim(),block=document.getElementById('mapBlock').value.trim(),level=document.getElementById('mapLevel').value.trim(),area=document.getElementById('mapArea').value.trim(),file=document.getElementById('mapFile').files[0];if(!code||!area){toast('Complete código y área');return;}const dataUrl=await fileToDataUrl(file);const existing=data.customMappings.find(m=>m.projectId===projectId()&&m.code===code);const record={id:existing?.id||`MAP-${Date.now()}`,projectId:projectId(),code,title:`${block||projectInfo().name} · ${area}`,block:block||projectInfo().hotelCode,level:level||'—',area,version:version||'V01',status:'Vigente',file:dataUrl||existing?.file||projectMappings()[0]?.file,uploadedBy:currentUser().id,updatedAt:nowISO()};if(existing)Object.assign(existing,record);else data.customMappings.push(record);saveData();toast(existing?'Mapeo actualizado':'Mapeo cargado');render();}

function criterionStatsForActivity(visitRecords,activity){const selected=visitRecords.filter(r=>r.template.activity===activity),stats={};selected.forEach(r=>{r.template.criteria.forEach(c=>{const label=r.visit.answers?.[c.id];if(!label)return;const factor=answerFactor(c,label),key=`${r.template.stage}|${c.id}|${c.name}`;if(!stats[key])stats[key]={stage:r.template.stage,id:c.id,name:c.name,evaluated:0,na:0,sumPct:0,pointsLost:0,weight:c.weight};if(factor===null){stats[key].na++;return;}stats[key].evaluated++;stats[key].sumPct+=factor*100;stats[key].pointsLost+=c.weight*(1-factor);});});return Object.values(stats).map(s=>({...s,average:s.evaluated?s.sumPct/s.evaluated:0,pointsLost:round1(s.pointsLost)})).sort((a,b)=>a.average-b.average||b.evaluated-a.evaluated);}
renderMonthlyWeakTables=function(visitRecords){const agg=aggregateRecords().filter(r=>monthKey(r.completedDate)===ui.reportValue),workshops=groupAggregate(agg,'activity').filter(g=>g.average<g.objective);if(!workshops.length)return '<div class="alert alert-success">Todos los talleres alcanzan su objetivo mensual.</div>';return workshops.map(g=>{const stats=criterionStatsForActivity(visitRecords,g.activity);return `<article class="card weak-workshop"><div class="visit-head"><div><span class="badge badge-red">Taller bajo meta</span><h3>${escapeHtml(g.activity)}</h3><div class="helper">Promedio ${round1(g.average)}% · Objetivo ${g.objective}% · ${g.count} inspecciones</div></div><div class="visit-score critical">${round1(g.average)}%</div></div><div class="table-wrap"><table><thead><tr><th>Punto de evaluación</th><th>Etapa</th><th>Evaluaciones</th><th>N/A</th><th>Promedio del inciso</th><th>Objetivo</th><th>Puntos perdidos</th></tr></thead><tbody>${stats.map(s=>`<tr class="${s.evaluated&&s.average<g.objective?'weak-row':''}"><td><strong>${escapeHtml(s.name)}</strong><br><span class="helper">${escapeHtml(s.id)}</span></td><td>${escapeHtml(stageDisplay(s.stage))}</td><td>${s.evaluated}</td><td>${s.na}</td><td><strong>${s.evaluated?round1(s.average)+'%':'N/A'}</strong></td><td>${g.objective}%</td><td>${s.pointsLost}</td></tr>`).join('')}</tbody></table></div></article>`;}).join('');};

function chartCard(id,title,subtitle,wide=false){return `<div class="card chart-card ${wide?'chart-wide':''}"><h3>${title}</h3><p class="helper">${subtitle}</p><div class="chart-scroll"><div class="chart-holder ${wide?'wide':''}"><canvas id="${id}"></canvas></div></div></div>`;}
renderRatings=function(user){if(!canReadProject(user))return noAccess();const agg=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),visitRecords=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),workshops=groupAggregate(agg,'activity'),engineers=groupAggregate(agg,'engineer');return `<div class="page-head"><div><h2>Calificaciones y comparativos</h2><p>Gráficos construidos con la misma lógica visual del cierre mensual FO-CP-11.</p></div></div><div class="card" style="margin-bottom:16px"><div class="filters"><div class="field"><label>Tipo de periodo</label><select id="reportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('report')}<div class="field"><label>Inspecciones incluidas</label><input value="${agg.length}" readonly></div><div class="field"><label>Media general</label><input value="${round1(mean(agg.map(r=>r.finalScore)))}%" readonly></div></div></div>${chartCard('qualityObjectivesChart','Resumen de objetivos de calidad','Puntaje obtenido por taller y línea de objetivo.',true)}<div class="section-title"><h3>Comparativo por ingenieros</h3></div>${chartCard('engineerStructureChart','Comparativo por Estructura','Tres meses, objetivo y media general.',true)}${chartCard('engineerFinishingChart','Comparativo por Terminación','Tres meses, objetivo y media general.',true)}<div class="section-title"><h3>Tabla de talleres</h3></div>${ratingWorkshopTable(workshops.map(g=>({...g,stage:'Todas'})))}<div class="section-title"><h3>Tabla de ingenieros</h3></div>${ratingEngineerTable(engineers)}<div class="section-title"><h3>Puntos débiles mensuales</h3></div>${ui.reportMode==='month'?renderMonthlyWeakTables(visitRecords):'<div class="alert alert-info">Seleccione un periodo mensual para ver todos los incisos y destacar en rojo los que queden por debajo del objetivo.</div>'}`;};

function chartDatasets(){
  const agg=aggregateRecords(),periodAgg=agg.filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),workshops=groupAggregate(periodAgg,'activity').sort((a,b)=>a.activity.localeCompare(b.activity));
  const objective={labels:workshops.map(g=>g.activity),scores:workshops.map(g=>round1(g.average)),targets:workshops.map(g=>g.objective)};
  const months=previousMonths(ui.reportMode==='month'?ui.reportValue:monthKey(ui.reportValue),3);
  function engineerArea(area){const users=data.users.filter(u=>u.role==='EJECUCION'&&u.executionArea===area),series=months.map(month=>users.map(u=>{const rs=agg.filter(r=>r.createdBy===u.id&&monthKey(r.completedDate)===month);return rs.length?round1(mean(rs.map(r=>r.finalScore))):null;})),latest=series[series.length-1].filter(v=>v!==null),general=latest.length?round1(mean(latest)):0;return {labels:users.map(u=>u.name.replace('Ing. ','')),months,series,target:ENGINEER_TARGET,general};}
  return {objective,structure:engineerArea('ESTRUCTURA'),finishing:engineerArea('TERMINACION')};
}
function chartValuePlugin(){return {id:'qpcValues',afterDatasetsDraw(chart){const ctx=chart.ctx;ctx.save();ctx.font='11px Arial';ctx.fillStyle='#3f3f46';ctx.textAlign='center';chart.data.datasets.forEach((ds,di)=>{if(ds.type==='line')return;const meta=chart.getDatasetMeta(di);meta.data.forEach((el,idx)=>{const v=ds.data[idx];if(v===null||v===undefined)return;ctx.fillText(round1(v),el.x,el.y-5);});});ctx.restore();}};}
function clearCharts(){qpcCharts.forEach(c=>{try{c.destroy()}catch{}});qpcCharts=[];}
function baseChartOptions(min=70){return {responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:'bottom',labels:{boxWidth:22}},tooltip:{mode:'index',intersect:false}},scales:{y:{min,max:105,ticks:{stepSize:5},grid:{color:'#d7d7d7'}},x:{ticks:{maxRotation:48,minRotation:35,autoSkip:false}}}};}
function initRatingCharts(){if(typeof Chart==='undefined')return;clearCharts();const d=chartDatasets(),objectiveEl=document.getElementById('qualityObjectivesChart');if(objectiveEl)qpcCharts.push(new Chart(objectiveEl,{type:'bar',data:{labels:d.objective.labels,datasets:[{label:'PUNTAJE OBTENIDO',data:d.objective.scores,backgroundColor:QPC_COLORS.blue,borderColor:QPC_COLORS.blue},{label:'OBJETIVO',data:d.objective.targets,type:'line',borderColor:QPC_COLORS.orange,backgroundColor:QPC_COLORS.orange,borderWidth:3,pointRadius:0,tension:0}]},options:baseChartOptions(70),plugins:[chartValuePlugin()]}));[['engineerStructureChart',d.structure],['engineerFinishingChart',d.finishing]].forEach(([id,x])=>{const el=document.getElementById(id);if(!el)return;const colors=[QPC_COLORS.green,QPC_COLORS.orange,QPC_COLORS.blue];const datasets=x.months.map((m,idx)=>({label:monthName(m).split(' ')[0].toUpperCase(),data:x.series[idx],backgroundColor:colors[idx],borderColor:colors[idx]}));datasets.push({label:'OBJETIVO',data:x.labels.map(()=>x.target),type:'line',borderColor:QPC_COLORS.cyan,backgroundColor:QPC_COLORS.cyan,borderWidth:3,pointRadius:0});datasets.push({label:`MEDIA GENERAL ${x.general}%`,data:x.labels.map(()=>x.general),type:'line',borderColor:QPC_COLORS.red,backgroundColor:QPC_COLORS.red,borderWidth:2,borderDash:[8,5],pointRadius:0});qpcCharts.push(new Chart(el,{type:'bar',data:{labels:x.labels,datasets},options:baseChartOptions(70),plugins:[chartValuePlugin()]}));});}

renderExports=function(user){if(!canOperateQuality(user))return noAccess();return `<div class="page-head"><div><h2>Exportaciones para Calidad</h2><p>Todo lo que alimenta los informes semanales y mensuales puede salir en CSV y PDF.</p></div></div><div class="alert alert-info">Los PDF incluyen gráficos comparativos, resumen de talleres, ingenieros, puntos débiles e indicadores del periodo.</div><div class="grid grid-2">${exportCard('Inspecciones y visitas','Detalle de inspecciones, visitas, etapas y promedio acumulado.','exportInspections','Exportar CSV')}${exportCard('Detalle de criterios','Respuestas, N/A, puntos obtenidos y descontados.','exportCriteria','Exportar CSV')}${exportCard('Calificación por taller','Promedios del periodo y objetivos.','exportWorkshops','Exportar CSV')}${exportCard('Calificación por ingeniero','Estructura, Terminación, meta y media.','exportEngineers','Exportar CSV')}${exportCard('Puntos débiles','Todos los incisos de talleres bajo meta.','exportWeakPoints','Exportar CSV')}${exportCard('Informe completo presentable','Resumen, gráficos, tablas y puntos débiles.','exportMonthlyPDF','Exportar PDF')}${exportCard('Inspecciones legibles','Listado tabular de inspecciones y promedios.','exportInspectionsPDF','Exportar PDF')}${exportCard('Gráficos comparativos','Objetivos, Estructura y Terminación.','exportChartsPDF','Exportar PDF')}${exportCard('Respaldo completo','Todos los datos del demo.','exportBackup','Descargar JSON')}</div><div class="card" style="margin-top:16px"><h3>Periodo</h3><div class="filters"><div class="field"><label>Tipo</label><select id="exportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('export')}</div></div>`;};

exportInspections=function(){const headers=['Código','Proyecto','Fecha solicitud','Fecha cierre','Taller','Ingeniero de ejecución','Área','Ingeniero de Calidad','Ubicación','Visitas','Promedio técnico','Promedio preparación','Promedio inspección','Objetivo','Semáforo','Última decisión'];const rows=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)).map(r=>{const i=r.inspection,e=userById(i.createdBy),q=userById(i.closedBy||i.assignedQualityId);return[i.code,projectInfo().name,i.requestedDate,r.completedDate,r.template.activity,e?.name,AREA_LABELS[e?.executionArea]||'',q?.name||'',i.location,r.visits.length,r.technicalScore,r.visitScore,r.finalScore,r.objective,r.inspection.traffic,r.inspection.decision];});downloadCSV(`inspecciones_${projectInfo().hotelCode}_${ui.reportValue}.csv`,headers,rows);};
exportCriteria=function(){const headers=['Código','Visita','Fecha','Taller','Etapa','Ingeniero','Criterio','Peso','Respuesta','Promedio normalizado','Puntos obtenidos','Puntos descontados','N/A','Observación'];const rows=[];evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)).forEach(r=>{const e=userById(r.inspection.createdBy);r.template.criteria.forEach(c=>{const label=r.visit.answers?.[c.id]||'',factor=answerFactor(c,label),earned=factor===null?'':round1(c.weight*factor),lost=factor===null?'':round1(c.weight-earned);rows.push([r.inspection.code,r.visit.number,r.completedDate,r.template.activity,stageDisplay(r.template.stage),e?.name,c.name,c.weight,label,factor===null?'':round1(factor*100),earned,lost,factor===null?'Sí':'No',r.visit.notes?.[c.id]||'']);});});downloadCSV(`criterios_${projectInfo().hotelCode}_${ui.reportValue}.csv`,headers,rows);};
exportWorkshops=function(){const rows=groupAggregate(aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),'activity');downloadCSV(`talleres_${projectInfo().hotelCode}_${ui.reportValue}.csv`,['Periodo','Taller','Inspecciones','Técnico','Preparación','Promedio','Objetivo','Diferencia','Semáforo'],rows.map(r=>[ui.reportValue,r.activity,r.count,round1(r.technical),round1(r.visit),round1(r.average),r.objective,round1(r.average-r.objective),trafficFor(r.average,r.objective)]));};
exportEngineers=function(){const rows=groupAggregate(aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),'engineer'),overall=round1(mean(rows.map(r=>r.average)));downloadCSV(`ingenieros_${projectInfo().hotelCode}_${ui.reportValue}.csv`,['Periodo','Ingeniero','Área','Inspecciones','Promedio','Meta','Media general','Liberadas 1ra visita'],rows.map(r=>[ui.reportValue,r.engineer,AREA_LABELS[r.executionArea]||'',r.count,round1(r.average),ENGINEER_TARGET,overall,round1(r.firstVisitPct)]));};
exportWeakPoints=function(){if(ui.reportMode!=='month'){toast('Seleccione un periodo mensual.');return;}const agg=aggregateRecords().filter(r=>monthKey(r.completedDate)===ui.reportValue),vis=evaluationRecords().filter(r=>monthKey(r.completedDate)===ui.reportValue),groups=groupAggregate(agg,'activity').filter(g=>g.average<g.objective),rows=[];groups.forEach(g=>criterionStatsForActivity(vis,g.activity).forEach(s=>rows.push([ui.reportValue,g.activity,round1(g.average),g.objective,stageDisplay(s.stage),s.id,s.name,s.evaluated,s.na,round1(s.average),s.evaluated&&s.average<g.objective?'Bajo objetivo':'Cumple / N/A',s.pointsLost])));downloadCSV(`puntos_debiles_${projectInfo().hotelCode}_${ui.reportValue}.csv`,['Mes','Taller','Promedio taller','Objetivo','Etapa','Código','Punto de evaluación','Evaluaciones','N/A','Promedio inciso','Estado','Puntos perdidos'],rows);};

async function imageData(url){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);resolve(c.toDataURL('image/png'));};img.onerror=()=>resolve(null);img.src=url;});}
async function chartImage(config,width=1400,height=650){if(typeof Chart==='undefined')return null;const c=document.createElement('canvas');c.width=width;c.height=height;const chart=new Chart(c.getContext('2d'),{...config,options:{...(config.options||{}),responsive:false,animation:false},plugins:[chartValuePlugin()]});chart.update();const out=c.toDataURL('image/png',1);chart.destroy();return out;}
function objectiveChartConfig(d){return {type:'bar',data:{labels:d.labels,datasets:[{label:'PUNTAJE OBTENIDO',data:d.scores,backgroundColor:QPC_COLORS.blue},{label:'OBJETIVO',data:d.targets,type:'line',borderColor:QPC_COLORS.orange,backgroundColor:QPC_COLORS.orange,borderWidth:3,pointRadius:0}]},options:baseChartOptions(70)};}
function engineerChartConfig(x){const colors=[QPC_COLORS.green,QPC_COLORS.orange,QPC_COLORS.blue],datasets=x.months.map((m,idx)=>({label:monthName(m).split(' ')[0].toUpperCase(),data:x.series[idx],backgroundColor:colors[idx]}));datasets.push({label:'OBJETIVO',data:x.labels.map(()=>x.target),type:'line',borderColor:QPC_COLORS.cyan,borderWidth:3,pointRadius:0});datasets.push({label:'MEDIA GENERAL',data:x.labels.map(()=>x.general),type:'line',borderColor:QPC_COLORS.red,borderWidth:2,borderDash:[8,5],pointRadius:0});return {type:'bar',data:{labels:x.labels,datasets},options:baseChartOptions(70)};}
async function exportCompletePDF(mode='complete'){
  if(!window.jspdf){toast('La librería PDF no cargó. Verifique su conexión.');return;}const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),logo=await imageData('assets/codelpa_logo_red.png'),p=projectInfo(),label=ui.reportMode==='week'?qualityWeekLabel(ui.reportValue):monthName(ui.reportValue),agg=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),vis=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),groups=groupAggregate(agg,'activity'),engineers=groupAggregate(agg,'engineer'),d=chartDatasets();
  const header=title=>{if(logo)doc.addImage(logo,'PNG',10,8,31,9);doc.setTextColor(25);doc.setFontSize(17);doc.text(title,148,15,{align:'center'});doc.setFontSize(9);doc.setTextColor(90);doc.text(`${p.name} · ${label}`,148,21,{align:'center'});doc.setDrawColor(200,16,46);doc.line(10,25,287,25);};
  header('QUALITY PROJECT CONTROL · INFORME DE CALIDAD');doc.autoTable({startY:31,head:[['Indicador','Valor']],body:[['Inspecciones evaluadas',agg.length],['Promedio general',`${round1(mean(agg.map(r=>r.finalScore)))}%`],['Talleres bajo meta',groups.filter(g=>g.average<g.objective).length],['Ingenieros evaluados',engineers.length],['Semana de Calidad',ui.reportMode==='week'?'Jueves a miércoles':'No aplica']],theme:'grid',styles:{fontSize:10},headStyles:{fillColor:[30,102,135]}});
  const objectiveImg=await chartImage(objectiveChartConfig(d.objective));doc.addPage('a4','landscape');header('RESUMEN DE OBJETIVOS DE CALIDAD');if(objectiveImg)doc.addImage(objectiveImg,'PNG',12,31,273,150);
  if(mode!=='inspections'){
    for(const [title,x] of [['COMPARATIVO POR ESTRUCTURA',d.structure],['COMPARATIVO POR TERMINACIÓN',d.finishing]]){doc.addPage('a4','landscape');header(title);const img=await chartImage(engineerChartConfig(x),1600,650);if(img)doc.addImage(img,'PNG',10,31,277,150);}
  }
  doc.addPage('a4','landscape');header('RESUMEN DE PLANILLAS');doc.autoTable({startY:31,head:[['Taller','Inspecciones','Técnico','Preparación','Promedio','Objetivo','Estado']],body:groups.map(g=>[g.activity,g.count,round1(g.technical),round1(g.visit),round1(g.average),g.objective,trafficFor(g.average,g.objective)]),theme:'grid',styles:{fontSize:8},headStyles:{fillColor:[30,102,135]}});
  if(ui.reportMode==='month'&&mode!=='inspections'){
    const below=groups.filter(g=>g.average<g.objective);for(const g of below){doc.addPage('a4','landscape');header(`PUNTOS DÉBILES · ${g.activity}`);const stats=criterionStatsForActivity(vis,g.activity);doc.autoTable({startY:31,head:[['Punto de evaluación','Etapa','Eval.','N/A','Promedio','Objetivo','Puntos perdidos']],body:stats.map(s=>[s.name,stageDisplay(s.stage),s.evaluated,s.na,s.evaluated?round1(s.average):'N/A',g.objective,s.pointsLost]),theme:'grid',styles:{fontSize:7},headStyles:{fillColor:[30,102,135]},didParseCell(h){if(h.section==='body'&&h.column.index===4){const v=Number(h.cell.raw);if(Number.isFinite(v)&&v<g.objective){h.cell.styles.textColor=[180,35,24];h.cell.styles.fillColor=[254,228,226];h.cell.styles.fontStyle='bold';}}}});}
  }
  doc.addPage('a4','landscape');header('INSPECCIONES DEL PERIODO');doc.autoTable({startY:31,head:[['Código','Fecha','Taller','Ingeniero','Área','Visitas','Promedio','Objetivo','Estado']],body:agg.map(r=>{const e=userById(r.createdBy);return[r.inspection.code,r.completedDate,r.template.activity,e?.name,AREA_LABELS[e?.executionArea]||'',r.visits.length,round1(r.finalScore),r.objective,r.inspection.decision];}),theme:'grid',styles:{fontSize:7},headStyles:{fillColor:[30,102,135]}});
  doc.save(`QPC_${p.hotelCode}_${ui.reportValue}_${mode}.pdf`);toast('PDF generado');
}
function exportMonthlyPDF(){exportCompletePDF('complete');}function exportInspectionsPDF(){exportCompletePDF('inspections');}async function exportChartsPDF(){if(!window.jspdf)return;const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),d=chartDatasets(),logo=await imageData('assets/codelpa_logo_red.png');const add=async(title,config,w=1400)=>{if(doc.getNumberOfPages()>1||doc.internal.getCurrentPageInfo().pageNumber>1){}if(logo)doc.addImage(logo,'PNG',10,8,31,9);doc.setFontSize(18);doc.text(title,148,18,{align:'center'});const img=await chartImage(config,w,650);if(img)doc.addImage(img,'PNG',10,30,277,153);};await add('RESUMEN DE OBJETIVOS DE CALIDAD',objectiveChartConfig(d.objective));doc.addPage();await add('COMPARATIVO POR ESTRUCTURA',engineerChartConfig(d.structure),1600);doc.addPage();await add('COMPARATIVO POR TERMINACIÓN',engineerChartConfig(d.finishing),1800);doc.save(`graficos_${projectInfo().hotelCode}_${ui.reportValue}.pdf`);toast('PDF de gráficos generado');}

function equipmentStatus(r){const next=[r.nextCalibrationDate,r.nextVerificationDate].filter(x=>x&&x!=='N/A').sort()[0];if(!next)return r.observations||'SIN FECHA';const today=toISODate(new Date()),soon=toISODate(new Date(Date.now()+30*86400000));return next<today?'VENCIDO':next<=soon?'PRÓXIMO':'VIGENTE';}
function equipmentSummary(){const rows=data.equipmentRecords||[];return {total:rows.length,current:rows.filter(r=>equipmentStatus(r)==='VIGENTE').length,soon:rows.filter(r=>equipmentStatus(r)==='PRÓXIMO').length,expired:rows.filter(r=>equipmentStatus(r)==='VENCIDO').length};}
renderEquipment=function(user){if(!canOperateQuality(user))return noAccess();const q=(ui.equipmentSearch||'').toLowerCase(),status=ui.equipmentStatus||'TODOS',rows=(data.equipmentRecords||[]).filter(r=>(status==='TODOS'||equipmentStatus(r)===status)&&(!q||`${r.id} ${r.type} ${r.brandModel} ${r.location} ${r.responsible}`.toLowerCase().includes(q))).slice(0,250),s=equipmentSummary(),selected=(data.equipmentRecords||[]).find(r=>r.id===ui.equipmentSelectedId);return `<div class="page-head"><div><h2>Verificación de equipos</h2><p>Importe el FO-GC-23, edite registros, actualice verificaciones y exporte el seguimiento.</p></div></div><div class="grid grid-4">${metric('Equipos registrados',s.total,'En la base local')}${metric('Vigentes',s.current,'Fuera de los próximos 30 días','positive')}${metric('Próximos',s.soon,'Vencen en 30 días','warning')}${metric('Vencidos',s.expired,'Requieren seguimiento','critical')}</div><div class="card" style="margin-top:16px"><h3>Importar Excel FO-GC-23</h3><div class="form-grid"><div class="field full"><label>Archivo XLSX</label><input id="equipmentFile" type="file" accept=".xlsx,.xls"></div></div><div class="button-row" style="margin-top:12px"><button id="importEquipmentBtn" class="btn btn-primary">Importar y reemplazar lista</button><button id="exportEquipmentCSV" class="btn btn-outline">Exportar CSV</button><button id="exportEquipmentPDF" class="btn btn-outline">Exportar PDF</button></div></div>${selected?equipmentEditCard(selected):''}<div class="filters"><div class="field"><label>Buscar</label><input id="equipmentSearch" value="${escapeHtml(ui.equipmentSearch||'')}" placeholder="ID, tipo, responsable..."></div><div class="field"><label>Estado</label><select id="equipmentStatus"><option>TODOS</option><option ${status==='VIGENTE'?'selected':''}>VIGENTE</option><option ${status==='PRÓXIMO'?'selected':''}>PRÓXIMO</option><option ${status==='VENCIDO'?'selected':''}>VENCIDO</option></select></div></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Equipo</th><th>Marca / modelo</th><th>Ubicación</th><th>Responsable</th><th>Frecuencia</th><th>Próxima calibración</th><th>Próxima verificación</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${escapeHtml(r.id)}</strong></td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.brandModel)}</td><td>${escapeHtml(r.location)}</td><td>${escapeHtml(r.responsible)}</td><td>${r.frequencyDays||'—'} días</td><td>${escapeHtml(r.nextCalibrationDate||'—')}</td><td>${escapeHtml(r.nextVerificationDate||'—')}</td><td><span class="badge ${equipmentStatus(r)==='VIGENTE'?'badge-green':equipmentStatus(r)==='PRÓXIMO'?'badge-yellow':'badge-red'}">${equipmentStatus(r)}</span></td><td><button class="btn btn-outline" data-edit-equipment="${escapeHtml(r.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div><div class="helper">Mostrando ${rows.length} registros de ${(data.equipmentRecords||[]).length}.</div>`;};
function equipmentEditCard(r){return `<div class="card" style="margin-top:16px"><h3>Editar equipo ${escapeHtml(r.id)}</h3><div class="form-grid"><div class="field"><label>Ubicación</label><input id="eqLocation" value="${escapeHtml(r.location)}"></div><div class="field"><label>Responsable</label><input id="eqResponsible" value="${escapeHtml(r.responsible)}"></div><div class="field"><label>Fecha verificación</label><input id="eqVerification" type="date" value="${r.verificationDate&&r.verificationDate!=='N/A'?r.verificationDate:''}"></div><div class="field"><label>Próxima verificación</label><input id="eqNextVerification" type="date" value="${r.nextVerificationDate&&r.nextVerificationDate!=='N/A'?r.nextVerificationDate:''}"></div><div class="field"><label>Fecha calibración</label><input id="eqCalibration" type="date" value="${r.calibrationDate&&r.calibrationDate!=='N/A'?r.calibrationDate:''}"></div><div class="field"><label>Próxima calibración</label><input id="eqNextCalibration" type="date" value="${r.nextCalibrationDate&&r.nextCalibrationDate!=='N/A'?r.nextCalibrationDate:''}"></div><div class="field full"><label>Observaciones</label><input id="eqObservations" value="${escapeHtml(r.observations||'')}"></div></div><div class="button-row" style="margin-top:12px"><button id="saveEquipmentBtn" class="btn btn-primary">Guardar cambios</button><button id="verifyTodayBtn" class="btn btn-success">Registrar verificación hoy</button><button id="closeEquipmentEdit" class="btn btn-secondary">Cerrar</button></div></div>`;}
function parseExcelDate(v){if(!v)return null;if(typeof v==='number'&&window.XLSX){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null;}const d=new Date(v);return isNaN(d)?String(v):toISODate(d);}
async function importEquipment(){const file=document.getElementById('equipmentFile').files[0];if(!file||!window.XLSX){toast('Seleccione un Excel y verifique la conexión.');return;}const buffer=await file.arrayBuffer(),book=XLSX.read(buffer,{type:'array'}),sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}),headerIndex=rows.findIndex(r=>String(r[0]).toUpperCase().includes('IDENTIFICACIÓN'));if(headerIndex<0){toast('No se encontró el encabezado FO-GC-23.');return;}const parsed=rows.slice(headerIndex+1).filter(r=>r[0]).map(r=>({id:String(r[0]).trim(),type:String(r[1]||'').trim(),brandModel:String(r[2]||'').trim(),description:String(r[3]||'').trim(),location:String(r[4]||'').trim(),responsible:String(r[5]||'').trim(),frequencyDays:Number(r[6])||null,calibrationDate:parseExcelDate(r[7]),nextCalibrationDate:String(r[8]).toUpperCase()==='N/A'?'N/A':parseExcelDate(r[8]),verificationDate:parseExcelDate(r[9]),nextVerificationDate:String(r[10]).toUpperCase()==='N/A'?'N/A':parseExcelDate(r[10]),observations:String(r[11]||'').trim()}));data.equipmentRecords=parsed;saveData();toast(`${parsed.length} equipos importados`);render();}
function saveEquipmentEdit(){const r=(data.equipmentRecords||[]).find(x=>x.id===ui.equipmentSelectedId);if(!r)return;r.location=document.getElementById('eqLocation').value;r.responsible=document.getElementById('eqResponsible').value;r.verificationDate=document.getElementById('eqVerification').value||null;r.nextVerificationDate=document.getElementById('eqNextVerification').value||'N/A';r.calibrationDate=document.getElementById('eqCalibration').value||null;r.nextCalibrationDate=document.getElementById('eqNextCalibration').value||'N/A';r.observations=document.getElementById('eqObservations').value;saveData();toast('Equipo actualizado');render();}
function verifyEquipmentToday(){const r=(data.equipmentRecords||[]).find(x=>x.id===ui.equipmentSelectedId);if(!r)return;const today=new Date(),next=new Date(today);next.setDate(next.getDate()+(r.frequencyDays||180));r.verificationDate=toISODate(today);r.nextVerificationDate=toISODate(next);r.observations='VIGENTE';saveData();toast('Verificación registrada');render();}
function exportEquipmentCSV(){const rows=(data.equipmentRecords||[]).map(r=>[r.id,r.type,r.brandModel,r.description,r.location,r.responsible,r.frequencyDays,r.calibrationDate,r.nextCalibrationDate,r.verificationDate,r.nextVerificationDate,equipmentStatus(r),r.observations]);downloadCSV(`equipos_${projectInfo().hotelCode}.csv`,['ID','Tipo','Marca / modelo','Descripción','Ubicación','Responsable','Frecuencia','Fecha calibración','Próxima calibración','Fecha verificación','Próxima verificación','Estado','Observaciones'],rows);}
async function exportEquipmentPDF(){if(!window.jspdf)return;const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),s=equipmentSummary(),logo=await imageData('assets/codelpa_logo_red.png');if(logo)doc.addImage(logo,'PNG',10,8,31,9);doc.setFontSize(16);doc.text('SEGUIMIENTO, CALIBRACIÓN Y VERIFICACIÓN DE EQUIPOS',148,17,{align:'center'});doc.autoTable({startY:27,head:[['Total','Vigentes','Próximos','Vencidos']],body:[[s.total,s.current,s.soon,s.expired]],headStyles:{fillColor:[30,102,135]}});doc.autoTable({startY:doc.lastAutoTable.finalY+8,head:[['ID','Tipo','Ubicación','Responsable','Próxima calibración','Próxima verificación','Estado']],body:(data.equipmentRecords||[]).map(r=>[r.id,r.type,r.location,r.responsible,r.nextCalibrationDate||'—',r.nextVerificationDate||'—',equipmentStatus(r)]),styles:{fontSize:6},headStyles:{fillColor:[30,102,135]}});doc.save(`equipos_${projectInfo().hotelCode}.pdf`);toast('PDF de equipos generado');}

const bindViewV4=bindView;
bindView=function(user){bindViewV4(user);document.getElementById('saveDocumentBtn')?.addEventListener('click',saveDocument);document.getElementById('saveMappingBtn')?.addEventListener('click',saveMapping);document.querySelectorAll('[data-edit-document]').forEach(b=>b.addEventListener('click',()=>{const d=projectDocuments().find(x=>(x.id||x.code)===b.dataset.editDocument);if(!d)return;document.getElementById('docCode').value=d.code;document.getElementById('docVersion').value=d.version;document.getElementById('docTitle').value=d.title;document.getElementById('docActivity').value=(d.activities||[])[0]||'';document.getElementById('docStatus').value=d.status;window.scrollTo({top:0,behavior:'smooth'});}));document.querySelectorAll('[data-edit-mapping]').forEach(b=>b.addEventListener('click',()=>{const m=mappingById(b.dataset.editMapping);if(!m)return;document.getElementById('mapCode').value=m.code;document.getElementById('mapVersion').value=m.version;document.getElementById('mapBlock').value=m.block;document.getElementById('mapLevel').value=m.level;document.getElementById('mapArea').value=m.area;window.scrollTo({top:0,behavior:'smooth'});}));document.getElementById('exportMonthlyPDF')?.addEventListener('click',exportMonthlyPDF);document.getElementById('exportInspectionsPDF')?.addEventListener('click',exportInspectionsPDF);document.getElementById('exportChartsPDF')?.addEventListener('click',exportChartsPDF);document.getElementById('importEquipmentBtn')?.addEventListener('click',importEquipment);document.getElementById('equipmentSearch')?.addEventListener('input',e=>{ui.equipmentSearch=e.target.value;render();document.getElementById('equipmentSearch')?.focus();});document.getElementById('equipmentStatus')?.addEventListener('change',e=>{ui.equipmentStatus=e.target.value;render();});document.querySelectorAll('[data-edit-equipment]').forEach(b=>b.addEventListener('click',()=>{ui.equipmentSelectedId=b.dataset.editEquipment;render();window.scrollTo({top:0,behavior:'smooth'});}));document.getElementById('saveEquipmentBtn')?.addEventListener('click',saveEquipmentEdit);document.getElementById('verifyTodayBtn')?.addEventListener('click',verifyEquipmentToday);document.getElementById('closeEquipmentEdit')?.addEventListener('click',()=>{ui.equipmentSelectedId=null;render();});document.getElementById('exportEquipmentCSV')?.addEventListener('click',exportEquipmentCSV);document.getElementById('exportEquipmentPDF')?.addEventListener('click',exportEquipmentPDF);if(ui.view==='ratings')setTimeout(initRatingCharts,0);};

// Añadir campos UI de V5.
ui.equipmentSearch=ui.equipmentSearch||'';ui.equipmentStatus=ui.equipmentStatus||'TODOS';ui.equipmentSelectedId=null;ui.activeProjectId=ui.activeProjectId||'LCE';

/* Ajustes finales V5 para bibliotecas y solicitud multiproyecto. */
projectMappings=function(){
  const base=(projectId()==='LCE'?MAPEOS:[]).map(m=>({...m,projectId:'LCE'}));
  return [...base,...(data.customMappings||[]).filter(m=>(m.projectId||'LCE')===projectId())];
};
renderNewRequest=function(user){
  if(user.role!=='EJECUCION')return noAccess();const maps=projectMappings();if(!maps.length)return '<div class="alert alert-warning">Calidad debe cargar al menos un mapeo para este proyecto.</div>';
  const defaultTemplate=templateById(ui.requestDraft.templateId)||findTemplate('Mampostería','General');ui.requestDraft.templateId=defaultTemplate.id;
  const selectedMap=maps.find(m=>m.id===ui.requestDraft.mappingId)||maps[0];ui.requestDraft.mappingId=selectedMap.id;
  const docs=projectDocuments().filter(d=>(d.activities||[]).includes(defaultTemplate.activity));
  return `<div class="page-head"><div><h2>Solicitar inspección</h2><p>${escapeHtml(projectInfo().name)} · Seleccione la etapa, el mapeo y resalte el alcance.</p></div></div><div class="grid grid-2" style="grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)"><div class="card"><div class="form-grid"><div class="field full"><label>Planilla / taller / etapa</label><select id="reqTemplate">${templateOptions(defaultTemplate.id)}</select><div class="helper">Las actividades pueden incluir Liberación, Seguimiento y Terminación / cierre.</div></div><div class="field"><label>Objetivo</label><input value="${defaultTemplate.objective}%" readonly></div><div class="field"><label>Contratista</label><input id="reqContractor" value="${escapeHtml(ui.requestDraft.contractor)}"></div><div class="field full"><label>Mapeo existente</label><select id="reqMapping">${maps.map(m=>`<option value="${m.id}" ${m.id===selectedMap.id?'selected':''}>${escapeHtml(m.code)} · ${escapeHtml(m.area)} · ${escapeHtml(m.version)}</option>`).join('')}</select><div class="helper">Los mapeos son administrados por Calidad y seleccionados desde la base.</div></div><div class="field"><label>Fecha propuesta</label><input id="reqDate" type="date" value="${escapeHtml(ui.requestDraft.date)}"></div><div class="field"><label>Hora propuesta</label><input id="reqTime" type="time" value="${escapeHtml(ui.requestDraft.time)}"></div><div class="field full"><label>Alcance a inspeccionar</label><textarea id="reqScope">${escapeHtml(ui.requestDraft.scope)}</textarea></div><div class="field full"><label class="check-row"><input id="reqReady" type="checkbox" ${ui.requestDraft.ready?'checked':''}><span>Confirmo que el trabajo está terminado, el área está limpia y accesible, y el responsable estará disponible.</span></label></div><div class="field"><label>Fotografías previas</label><input id="reqPhotos" type="file" multiple accept="image/*"></div><div class="field"><label>Planos u otros documentos</label><input id="reqDocs" type="file" multiple accept="image/*,.pdf"></div></div><div class="form-actions"><button class="btn btn-secondary" data-nav="home">Cancelar</button><div class="button-row"><button id="saveDraft" class="btn btn-outline">Guardar borrador</button><button id="submitRequest" class="btn btn-primary">Enviar a Calidad</button></div></div></div><aside><div class="card map-card"><img src="${escapeHtml(ui.requestDraft.annotationData||selectedMap.file)}" alt="${escapeHtml(selectedMap.title)}"><div class="body"><h3>${escapeHtml(selectedMap.title)}</h3><div class="helper">${escapeHtml(selectedMap.code)} · ${escapeHtml(selectedMap.version)}</div><div class="button-row" style="margin-top:12px"><button id="openAnnotator" class="btn btn-primary">▰ Resaltar alcance</button><a class="btn btn-outline" href="${escapeHtml(selectedMap.file)}" target="_blank">Abrir original</a></div>${ui.requestDraft.annotationData?'<div class="alert alert-success" style="margin-top:12px">El mapeo resaltado se adjuntará a la solicitud.</div>':''}</div></div><div class="card" style="margin-top:16px"><h3>Planilla seleccionada</h3><div class="kv"><div>Actividad</div><div>${escapeHtml(defaultTemplate.activity)}</div><div>Etapa</div><div>${escapeHtml(stageDisplay(defaultTemplate.stage))}</div><div>Criterios</div><div>${defaultTemplate.criteria.length}</div><div>Objetivo</div><div>${defaultTemplate.objective}%</div></div></div><div class="card" style="margin-top:16px"><h3>Instructivos relacionados</h3>${docs.length?docs.map(d=>`<div style="margin-bottom:10px"><span class="doc-code">${escapeHtml(d.code)} ${escapeHtml(d.version)}</span><br><strong>${escapeHtml(d.title)}</strong></div>`).join(''):'<div class="helper">No hay instructivo vinculado todavía.</div>'}</div></aside></div>`;
};

/* Quality Project Control V6.9 - cambios funcionales solicitados */
ROLE_LABELS.COORDINADOR_CALIDAD='Gerente de Calidad';
const QPC_PERMISSIONS={
 EJECUCION:{export:false,addExecution:false,manageQuality:false,manageDocuments:false},
 CALIDAD:{export:true,addExecution:true,manageQuality:false,manageDocuments:true},
 COORDINADOR_CALIDAD:{export:true,addExecution:true,manageQuality:true,manageDocuments:true},
 GERENCIA:{export:true,addExecution:true,manageQuality:false,manageDocuments:false},
 PRESIDENTE:{export:true,addExecution:true,manageQuality:false,manageDocuments:false}
};
function qpcPerm(user,key){return Boolean(QPC_PERMISSIONS[user?.role]?.[key]);}
canConfigure=function(user){return user?.role==='COORDINADOR_CALIDAD';};
function canExportQPC(user){return qpcPerm(user,'export');}

ui.userSelectedId=ui.userSelectedId||null;
ui.equipmentSelectedId=ui.equipmentSelectedId||null;
ui.fileViewer=null;

const navItemsV69Base=navItems;
navItems=function(user){
 if(user.role==='EJECUCION')return navItemsV69Base(user);
 const items=[['home','⌂','Inicio']];
 if(['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role))items.push(['qualityQueue','☷','Bandeja de Calidad'],['myInspections','✓','Mis inspecciones']);
 items.push(['ratings','▥','Calificaciones']);
 if(canExportQPC(user))items.push(['exports','⇩','Exportaciones']);
 if(['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role))items.push(['equipment','⌁','Verificación de equipos']);
 items.push(['documents','▤','Instructivos'],['mappings','▦','Mapeos']);
 if(qpcPerm(user,'addExecution')||qpcPerm(user,'manageQuality'))items.push(['users','⚙','Usuarios y permisos']);
 return items;
};

const renderViewV69Base=renderView;
renderView=function(user){if(ui.view==='equipment')return renderEquipment(user);return renderViewV69Base(user);};
const viewTitleV69Base=viewTitle;
viewTitle=function(){return ui.view==='equipment'?'Verificación de equipos':viewTitleV69Base();};

function projectOptions(user){
 const ids=(user.projectIds&&user.projectIds.length?user.projectIds:Object.keys(window.QPC_PROJECTS||{LCE:{name:'Lopesan La Ceiba'}}));
 return ids.map(id=>{const p=(window.QPC_PROJECTS||{})[id]||{name:id};return `<option value="${escapeHtml(id)}" ${projectId()===id?'selected':''}>${escapeHtml(p.name)}</option>`}).join('');
}

function qpcLogo(kind='white'){return `<img class="brand-logo-img" src="assets/codelpa_logo_${kind}.png" alt="CODELPA">`;}

function renderShellV69(user,mainMode){
 const selected=ui.selectedId?data.inspections.find(i=>i.id===ui.selectedId):null,p=projectInfo();
 return `<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand">${qpcLogo('white')}<div><strong>QUALITY PROJECT CONTROL</strong><small>CODELPA</small></div></div><div class="user-chip"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(ROLE_LABELS[user.role])}</span>${user.executionArea?`<span>Área: ${escapeHtml(AREA_LABELS[user.executionArea])}</span>`:''}<label class="project-switch-label">Proyecto<select id="activeProjectSelect">${projectOptions(user)}</select></label></div><div class="nav-label">Navegación</div>${navItems(user).map(([id,icon,label])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-nav="${id}"><span>${icon}</span>${label}</button>`).join('')}<div class="sidebar-footer">${mainMode?'':'<button id="resetBtn">Restablecer demo</button>'}<button id="logoutBtn">Cerrar sesión</button></div></aside><main class="main"><header class="topbar"><div class="top-left"><button id="menuBtn" class="mobile-menu">☰</button><div><h1>${viewTitle()}</h1><p>${selected?escapeHtml(selected.code):escapeHtml(p.name)}</p></div></div><div class="top-right"><span class="project-pill">${escapeHtml(p.hotelCode||projectId())}</span><span class="role-pill">${escapeHtml(ROLE_LABELS[user.role])}</span><div class="avatar">${initials(user.name)}</div></div></header><div class="content">${renderView(user)}</div></main></div><div id="overlay" class="drawer-overlay hidden"></div><div id="qpcViewerRoot"></div>`;
}

function qpcFileType(url,type,name){const t=(type||'').toLowerCase(),n=(name||url||'').toLowerCase();if(t.includes('pdf')||n.endsWith('.pdf'))return 'pdf';if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(n))return 'image';return 'other';}
function showFileViewer(url,name='Archivo',type=''){
 const kind=qpcFileType(url,type,name),root=document.getElementById('qpcViewerRoot')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'qpcViewerRoot'}));
 const content=kind==='image'?`<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}">`:kind==='pdf'?`<iframe src="${escapeHtml(url)}#toolbar=1" title="${escapeHtml(name)}"></iframe>`:`<div class="viewer-unsupported"><p>Este formato no permite vista previa integrada.</p><a class="btn btn-primary" href="${escapeHtml(url)}" download>Descargar archivo</a></div>`;
 root.innerHTML=`<div class="file-viewer-backdrop"><section class="file-viewer" role="dialog" aria-modal="true"><header><strong>${escapeHtml(name)}</strong><div class="button-row"><a class="btn btn-outline" href="${escapeHtml(url)}" download>Descargar</a><button class="btn btn-danger" id="closeFileViewer">Cerrar</button></div></header><div class="file-viewer-body">${content}</div></section></div>`;
 document.getElementById('closeFileViewer')?.addEventListener('click',()=>root.innerHTML='');root.querySelector('.file-viewer-backdrop')?.addEventListener('click',e=>{if(e.target.classList.contains('file-viewer-backdrop'))root.innerHTML='';});
}

function viewerButton(file,name,type,label='Visualizar'){return file?`<button class="btn btn-primary" data-view-file="${encodeURIComponent(file)}" data-view-name="${encodeURIComponent(name||'Archivo')}" data-view-type="${encodeURIComponent(type||'')}">${label}</button>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>';}

renderDocuments=function(user){
 const manage=qpcPerm(user,'manageDocuments'),rows=projectDocuments().filter(d=>!ui.docSearch||`${d.code} ${d.version} ${d.title} ${(d.activities||[]).join(' ')} ${d.status}`.toLowerCase().includes(ui.docSearch.toLowerCase()));
 return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Consulta, visualización y control documental desde la aplicación.</p></div></div>${manage?`<div class="card library-admin"><h3>Agregar o actualizar instructivo</h3><div class="form-grid"><div class="field"><label>Código</label><input id="docCode" placeholder="IT-CP-05"></div><div class="field"><label>Versión</label><input id="docVersion" placeholder="V03"></div><div class="field full"><label>Título</label><input id="docTitle"></div><div class="field"><label>Actividad relacionada</label><input id="docActivity"></div><div class="field"><label>Estado</label><select id="docStatus"><option>Vigente</option><option>Obsoleto</option><option>Pendiente de validación</option></select></div><div class="field full"><label>Archivo PDF o imagen</label><input id="docFile" type="file" accept=".pdf,image/*"></div></div><button id="saveDocumentBtn" class="btn btn-primary" style="margin-top:12px">Guardar instructivo</button></div>`:''}<div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch)}"></div></div><div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3>${escapeHtml(d.title)}</h3><span class="badge ${d.status==='Vigente'?'badge-green':'badge-yellow'}">${escapeHtml(d.status)}</span><div class="tag-list">${(d.activities||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div></div><div class="button-row">${viewerButton(d.file,d.fileName||d.title,d.fileType,'Visualizar')}${manage?`<button class="btn btn-outline" data-edit-document="${d.id||d.code}">Modificar</button><button class="btn btn-danger" data-delete-document="${d.id||d.code}">Borrar</button>`:''}</div></article>`).join('')||'<div class="card empty">No hay documentos.</div>'}</div>`;
};

function qpcExportMenu(title,desc,csvId,pdfId){return `<details class="card export-group"><summary><div><h3>${title}</h3><p>${desc}</p></div><span>Formatos ▾</span></summary><div class="export-options">${csvId?`<button id="${csvId}" class="btn btn-outline">CSV</button>`:''}${pdfId?`<button id="${pdfId}" class="btn btn-primary">PDF</button>`:''}</div></details>`;}
renderExports=function(user){if(!canExportQPC(user))return noAccess();return `<div class="page-head"><div><h2>Exportaciones</h2><p>Seleccione una categoría y luego el formato requerido.</p></div></div><div class="grid grid-2">${qpcExportMenu('Inspecciones y visitas','Detalle del periodo.','exportInspections','exportInspectionsPDF')}${qpcExportMenu('Talleres y puntos débiles','Resultados y criterios bajo meta.','exportWeakPoints','exportMonthlyPDF')}${qpcExportMenu('Ingenieros','Calificación por ingeniero y área.','exportEngineers','exportChartsPDF')}${qpcExportMenu('Equipos','Seguimiento de calibración y verificación.','exportEquipmentCSV','exportEquipmentPDF')}</div><div class="card" style="margin-top:16px"><h3>Periodo</h3><div class="filters"><div class="field"><label>Tipo</label><select id="exportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('export')}</div></div>`;};

exportWeakPoints=function(){const agg=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),vis=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)),groups=groupAggregate(agg,'activity').filter(g=>g.average<g.objective),rows=[];groups.forEach(g=>criterionStatsForActivity(vis,g.activity).forEach(s=>rows.push([ui.reportValue,g.activity,round1(g.average),g.objective,stageDisplay(s.stage),s.id,s.name,s.evaluated,s.na,round1(s.average),s.evaluated&&s.average<g.objective?'Bajo objetivo':'Cumple / N/A',s.pointsLost])));downloadCSV(`puntos_debiles_${projectInfo().hotelCode}_${ui.reportValue}.csv`,['Periodo','Taller','Promedio taller','Objetivo','Etapa','Código','Punto de evaluación','Evaluaciones','N/A','Promedio inciso','Estado','Puntos perdidos'],rows);};

function blankEquipment(){return {id:'',type:'',brandModel:'',description:'',location:'',responsible:'',frequencyDays:180,calibrationDate:null,nextCalibrationDate:'N/A',verificationDate:null,nextVerificationDate:'N/A',observations:''};}
equipmentEditCard=function(r){const isNew=!r.id;return `<div class="card" style="margin-top:16px"><h3>${isNew?'Agregar equipo':`Editar equipo ${escapeHtml(r.id)}`}</h3><div class="form-grid"><div class="field"><label>ID</label><input id="eqId" value="${escapeHtml(r.id)}" ${isNew?'':'readonly'}></div><div class="field"><label>Tipo</label><input id="eqType" value="${escapeHtml(r.type)}"></div><div class="field"><label>Marca / modelo</label><input id="eqBrand" value="${escapeHtml(r.brandModel)}"></div><div class="field"><label>Descripción</label><input id="eqDescription" value="${escapeHtml(r.description||'')}"></div><div class="field"><label>Ubicación</label><input id="eqLocation" value="${escapeHtml(r.location)}"></div><div class="field"><label>Responsable</label><input id="eqResponsible" value="${escapeHtml(r.responsible)}"></div><div class="field"><label>Frecuencia (días)</label><input id="eqFrequency" type="number" value="${r.frequencyDays||180}"></div><div class="field"><label>Fecha verificación</label><input id="eqVerification" type="date" value="${r.verificationDate&&r.verificationDate!=='N/A'?r.verificationDate:''}"></div><div class="field"><label>Próxima verificación</label><input id="eqNextVerification" type="date" value="${r.nextVerificationDate&&r.nextVerificationDate!=='N/A'?r.nextVerificationDate:''}"></div><div class="field"><label>Fecha calibración</label><input id="eqCalibration" type="date" value="${r.calibrationDate&&r.calibrationDate!=='N/A'?r.calibrationDate:''}"></div><div class="field"><label>Próxima calibración</label><input id="eqNextCalibration" type="date" value="${r.nextCalibrationDate&&r.nextCalibrationDate!=='N/A'?r.nextCalibrationDate:''}"></div><div class="field full"><label>Observaciones</label><input id="eqObservations" value="${escapeHtml(r.observations||'')}"></div></div><div class="button-row" style="margin-top:12px"><button id="saveEquipmentBtn" class="btn btn-primary">Guardar</button>${!isNew?'<button id="deleteEquipmentBtn" class="btn btn-danger">Eliminar</button><button id="verifyTodayBtn" class="btn btn-success">Verificar hoy</button>':''}<button id="closeEquipmentEdit" class="btn btn-secondary">Cerrar</button></div></div>`;};
const renderEquipmentV69Base=renderEquipment;
renderEquipment=function(user){if(!canOperateQuality(user))return noAccess();let html=renderEquipmentV69Base(user);html=html.replace('<div class="card" style="margin-top:16px"><h3>Importar Excel FO-GC-23</h3>',`<div class="card" style="margin-top:16px"><div class="page-head"><div><h3>Importar Excel FO-GC-23</h3></div><button id="addEquipmentBtn" class="btn btn-primary">＋ Agregar equipo</button></div>`);if(ui.equipmentSelectedId==='__NEW__')html=html.replace('<div class="filters">',equipmentEditCard(blankEquipment())+'<div class="filters">');return html;};
saveEquipmentEdit=function(){const id=document.getElementById('eqId')?.value.trim();if(!id){toast('Indique el ID del equipo');return;}let r=(data.equipmentRecords||[]).find(x=>x.id===ui.equipmentSelectedId);if(!r){r=blankEquipment();r.id=id;data.equipmentRecords.push(r);}r.type=document.getElementById('eqType').value;r.brandModel=document.getElementById('eqBrand').value;r.description=document.getElementById('eqDescription').value;r.location=document.getElementById('eqLocation').value;r.responsible=document.getElementById('eqResponsible').value;r.frequencyDays=Number(document.getElementById('eqFrequency').value)||180;r.verificationDate=document.getElementById('eqVerification').value||null;r.nextVerificationDate=document.getElementById('eqNextVerification').value||'N/A';r.calibrationDate=document.getElementById('eqCalibration').value||null;r.nextCalibrationDate=document.getElementById('eqNextCalibration').value||'N/A';r.observations=document.getElementById('eqObservations').value;ui.equipmentSelectedId=r.id;saveData();toast('Equipo guardado');render();};

function userEditor(u={}){const editing=Boolean(u.id);return `<div class="card"><h3>${editing?'Editar usuario':'Agregar ingeniero de ejecución'}</h3><div class="form-grid"><div class="field"><label>Nombre</label><input id="usrName" value="${escapeHtml(u.name||'')}"></div><div class="field"><label>Correo</label><input id="usrEmail" type="email" value="${escapeHtml(u.email||'')}"></div><div class="field"><label>Rol</label><select id="usrRole"><option value="EJECUCION" ${(u.role||'EJECUCION')==='EJECUCION'?'selected':''}>Ingeniero de Ejecución</option>${canConfigure(currentUser())?`<option value="CALIDAD" ${u.role==='CALIDAD'?'selected':''}>Ingeniero de Calidad</option>`:''}</select></div><div class="field"><label>Área</label><select id="usrArea"><option value="TERMINACION" ${u.executionArea==='TERMINACION'?'selected':''}>Terminación</option><option value="ESTRUCTURA" ${u.executionArea==='ESTRUCTURA'?'selected':''}>Estructura</option></select></div><div class="field full"><label>Proyectos</label><input id="usrProjects" value="${escapeHtml((u.projectIds||[projectId()]).join(','))}" placeholder="LCE,VC"></div><div class="field full"><label class="check-row"><input id="usrActive" type="checkbox" ${u.isActive===false?'':'checked'}><span>Usuario activo</span></label></div></div><div class="button-row" style="margin-top:12px"><button id="saveUserBtn" class="btn btn-primary">Guardar usuario</button>${editing?'<button id="cancelUserBtn" class="btn btn-secondary">Cancelar</button>':''}</div></div>`;}
renderUsers=function(user){if(!(qpcPerm(user,'addExecution')||qpcPerm(user,'manageQuality')))return noAccess();const selected=data.users.find(u=>u.id===ui.userSelectedId);return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>Calidad, Gerencia y Presidencia pueden agregar ingenieros de Ejecución. El Gerente de Calidad administra Calidad y Ejecución.</p></div></div>${userEditor(selected||{})}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyecto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${data.users.filter(u=>['EJECUCION','CALIDAD'].includes(u.role)).map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(ROLE_LABELS[u.role])}</td><td>${escapeHtml(AREA_LABELS[u.executionArea]||'—')}</td><td>${escapeHtml((u.projectIds||[]).join(', '))}</td><td>${u.isActive===false?'Inactivo':'Activo'}</td><td>${u.role==='EJECUCION'||canConfigure(user)?`<button class="btn btn-outline" data-edit-user="${u.id}">Editar</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`;};

function saveUserV69(){const role=document.getElementById('usrRole').value;if(role==='CALIDAD'&&!canConfigure(currentUser())){toast('Solo el Gerente de Calidad puede administrar Calidad');return;}const email=document.getElementById('usrEmail').value.trim().toLowerCase(),name=document.getElementById('usrName').value.trim();if(!email||!name){toast('Complete nombre y correo');return;}let u=data.users.find(x=>x.id===ui.userSelectedId);if(!u){u={id:`usr-${Date.now()}`};data.users.push(u);}Object.assign(u,{name,email,role,executionArea:document.getElementById('usrArea').value,projectIds:document.getElementById('usrProjects').value.split(',').map(x=>x.trim()).filter(Boolean),isActive:document.getElementById('usrActive').checked,permissions:{canExport:qpcPerm({role},'export'),canCreateExecution:qpcPerm({role},'addExecution')}});ui.userSelectedId=null;saveData();toast('Usuario y permisos guardados');render();}

const renderResourcesV69Base=renderResources;
renderResources=function(i,m,docs,user){const attachments=(i.attachments||[]).map((a,index)=>({...a,index}));return `<div class="resource-grid"><article class="resource-item"><strong>Mapeo original</strong><span>${escapeHtml(m?.code||'—')}</span>${viewerButton(m?.file,m?.title||'Mapeo','image/*','Visualizar')}</article>${i.mappingAnnotation?`<article class="resource-item"><strong>Mapeo marcado</strong><span>Alcance señalado</span>${viewerButton(i.mappingAnnotation,'Mapeo marcado','image/png','Visualizar')}</article>`:''}${attachments.map(a=>`<article class="resource-item"><strong>${escapeHtml(a.kind||'Adjunto')}</strong><span>${escapeHtml(a.name||'Archivo')}</span><button class="btn btn-primary" data-open-attachment="${i.id}" data-attachment-index="${a.index}">Visualizar</button><button class="btn btn-outline" data-download-attachment="${i.id}" data-attachment-index="${a.index}">Descargar</button></article>`).join('')}${docs.map(d=>`<article class="resource-item"><strong>${escapeHtml(d.code)} ${escapeHtml(d.version)}</strong><span>${escapeHtml(d.title)}</span>${viewerButton(d.file,d.fileName||d.title,d.fileType,'Visualizar')}</article>`).join('')}</div>`;};

const bindGlobalV69Base=bindGlobal;
bindGlobal=function(){bindGlobalV69Base();document.getElementById('activeProjectSelect')?.addEventListener('change',e=>{ui.activeProjectId=e.target.value;ui.selectedId=null;ui.requestDraft.mappingId='';saveData();render();});};
const bindViewV69Base=bindView;
bindView=function(user){bindViewV69Base(user);document.querySelectorAll('[data-view-file]').forEach(b=>b.addEventListener('click',()=>showFileViewer(decodeURIComponent(b.dataset.viewFile),decodeURIComponent(b.dataset.viewName),decodeURIComponent(b.dataset.viewType))));document.querySelectorAll('[data-delete-document]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('¿Borrar este instructivo?'))return;const id=b.dataset.deleteDocument;data.customDocuments=(data.customDocuments||[]).filter(d=>(d.id||d.code)!==id);saveData();toast('Instructivo eliminado');render();}));document.getElementById('addEquipmentBtn')?.addEventListener('click',()=>{ui.equipmentSelectedId='__NEW__';render();});document.getElementById('deleteEquipmentBtn')?.addEventListener('click',()=>{if(!confirm('¿Eliminar este equipo?'))return;data.equipmentRecords=(data.equipmentRecords||[]).filter(r=>r.id!==ui.equipmentSelectedId);ui.equipmentSelectedId=null;saveData();toast('Equipo eliminado');render();});document.querySelectorAll('[data-edit-user]').forEach(b=>b.addEventListener('click',()=>{ui.userSelectedId=b.dataset.editUser;render();}));document.getElementById('saveUserBtn')?.addEventListener('click',saveUserV69);document.getElementById('cancelUserBtn')?.addEventListener('click',()=>{ui.userSelectedId=null;render();});};


renderShell=function(user){return renderShellV69(user,true);};
const openAttachmentV69Main=openAttachment;
openAttachment=async function(inspectionId,index){const i=data.inspections.find(x=>x.id===inspectionId),a=i?.attachments?.[index];if(!a)return;if(a.dataUrl)return showFileViewer(a.dataUrl,a.name,a.type);if(a.storagePath){const {data:signed,error}=await supabaseClient.storage.from(ATTACHMENT_BUCKET).createSignedUrl(a.storagePath,3600);if(error){toast('No se pudo abrir el archivo');return;}showFileViewer(signed.signedUrl,a.name,a.type);}};
/* Quality Project Control V6.10 - puntos débiles semanales, logo de login y visor universal */
(function(){
  const previousShowFileViewer = window.showFileViewer;

  function fileKind(url='', type='', name=''){
    const value = `${type} ${name} ${url}`.toLowerCase().split('?')[0].split('#')[0];
    if(type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/.test(value)) return 'image';
    if(type.includes('pdf') || /\.pdf$/.test(value)) return 'pdf';
    if(type.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/.test(value)) return 'video';
    if(type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/.test(value)) return 'audio';
    if(type.startsWith('text/') || /\.(txt|csv|json|xml|md|log)$/.test(value)) return 'text';
    if(/\.(doc|docx|xls|xlsx|ppt|pptx|dwg|dxf|zip|rar|7z)$/.test(value)) return 'document';
    return 'other';
  }

  window.showFileViewer = function(url, name='Archivo', type=''){
    const kind=fileKind(url,type,name);
    const root=document.getElementById('qpcViewerRoot') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'qpcViewerRoot'}));
    let content='';
    if(kind==='image') content=`<img class="universal-view-image" src="${escapeHtml(url)}" alt="${escapeHtml(name)}">`;
    else if(kind==='pdf') content=`<iframe src="${escapeHtml(url)}#toolbar=1&navpanes=1" title="${escapeHtml(name)}"></iframe>`;
    else if(kind==='video') content=`<video class="universal-media" src="${escapeHtml(url)}" controls playsinline>El navegador no puede reproducir este video.</video>`;
    else if(kind==='audio') content=`<div class="viewer-media-wrap"><audio class="universal-audio" src="${escapeHtml(url)}" controls>El navegador no puede reproducir este audio.</audio></div>`;
    else if(kind==='text') content=`<iframe src="${escapeHtml(url)}" title="${escapeHtml(name)}"></iframe>`;
    else content=`<div class="viewer-unsupported"><h3>Vista previa del archivo</h3><p>El archivo está disponible dentro del visor. Este formato depende de las capacidades del navegador y puede no mostrar su contenido directamente.</p><div class="file-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(type||'Tipo no identificado')}</span></div><a class="btn btn-primary" href="${escapeHtml(url)}" download>Descargar para abrir</a></div>`;
    root.innerHTML=`<div class="file-viewer-backdrop"><section class="file-viewer universal-file-viewer" role="dialog" aria-modal="true" aria-label="Visor de ${escapeHtml(name)}"><header><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(type||kind)}</small></div><div class="button-row"><a class="btn btn-outline" href="${escapeHtml(url)}" download>Descargar</a><button class="btn btn-danger" id="closeFileViewer" type="button">Cerrar</button></div></header><div class="file-viewer-body">${content}</div></section></div>`;
    const close=()=>root.innerHTML='';
    document.getElementById('closeFileViewer')?.addEventListener('click',close);
    root.querySelector('.file-viewer-backdrop')?.addEventListener('click',e=>{if(e.target.classList.contains('file-viewer-backdrop'))close();});
    const esc=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);}};
    document.addEventListener('keydown',esc);
  };

  window.renderRatings=function(user){
    if(!canReadProject(user))return noAccess();
    const agg=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue));
    const visitRecords=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue));
    const workshops=groupAggregate(agg,'activity'), engineers=groupAggregate(agg,'engineer');
    const weekly=ui.reportMode==='week';
    const weakTitle=weekly?'Puntos débiles semanales':'Puntos débiles mensuales';
    const weakHelp=weekly?'Incisos evaluados durante la semana seleccionada; se destacan en rojo los resultados por debajo del objetivo.':'Incisos evaluados durante el mes seleccionado; se destacan en rojo los resultados por debajo del objetivo.';
    return `<div class="page-head"><div><h2>Calificaciones y comparativos</h2><p>Los reportes semanales se calculan de jueves a miércoles y los mensuales por mes calendario.</p></div></div><div class="card" style="margin-bottom:16px"><div class="filters"><div class="field"><label>Tipo de periodo</label><select id="reportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal · Jueves a miércoles</option></select></div>${periodControl('report')}<div class="field"><label>Inspecciones incluidas</label><input value="${agg.length}" readonly></div><div class="field"><label>Media general</label><input value="${round1(mean(agg.map(r=>r.finalScore)))}%" readonly></div></div></div>${chartCard('qualityObjectivesChart','Resumen de objetivos de calidad','Puntaje obtenido por taller y línea de objetivo.',true)}<div class="section-title"><h3>Comparativo por ingenieros</h3></div>${chartCard('engineerStructureChart','Comparativo por Estructura','Resultados, objetivo y media general.',true)}${chartCard('engineerFinishingChart','Comparativo por Terminación','Resultados, objetivo y media general.',true)}<div class="section-title"><h3>Tabla de talleres</h3></div>${ratingWorkshopTable(workshops.map(g=>({...g,stage:'Todas'})))}<div class="section-title"><h3>Tabla de ingenieros</h3></div>${ratingEngineerTable(engineers)}<div class="section-title"><div><h3>${weakTitle}</h3><p class="helper">${weakHelp}</p></div></div>${renderMonthlyWeakTables(visitRecords)}`;
  };

  // MAIN: logo real de CODELPA en ambos lados del login. En demo se conserva su login y solo se asegura el visor.
  window.renderLogin=function(){return `<div class="login-shell"><section class="login-brand"><div><div class="brand-lockup"><img class="login-logo" src="assets/codelpa_logo_white.png" alt="CODELPA"><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#f4d8dc">Gestión de Calidad de Proyectos</div></div></div><h1>Inspecciones, visitas, equipos y reportes con trazabilidad completa.</h1><p>Acceda con su cuenta autorizada para consultar el proyecto, registrar inspecciones y administrar la información de Calidad.</p><div class="feature-grid"><div class="feature">✓ Desglose por criterio y visita</div><div class="feature">✓ Reportes semanales y mensuales</div><div class="feature">✓ Archivos privados en Supabase</div><div class="feature">✓ Visor integrado de documentos</div></div></div><div class="login-note">Versión principal conectada a Supabase. Los datos se comparten entre usuarios autorizados.</div></section><section class="login-panel"><div class="login-card"><img class="form-logo" src="assets/codelpa_logo_red.png" alt="CODELPA"><h2>Iniciar sesión</h2><p>El sistema identifica el rol y los proyectos permitidos.</p><div id="loginError"></div><div class="field"><label>Correo electrónico</label><input id="loginEmail" type="email" placeholder="usuario@codelpa.demo" autocomplete="username"></div><div class="field" style="margin-top:14px"><label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••" autocomplete="current-password"></div><button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button></div></section></div>`;};

  const previousBindView=window.bindView;
  window.bindView=function(user){
    previousBindView(user);
    document.querySelectorAll('a[target="_blank"]').forEach(link=>{
      if(link.dataset.qpcViewerBound)return;
      link.dataset.qpcViewerBound='1';
      link.addEventListener('click',e=>{
        const href=link.getAttribute('href');
        if(!href || href.startsWith('javascript:'))return;
        e.preventDefault();
        showFileViewer(link.href,link.getAttribute('download')||link.textContent.trim()||'Archivo','');
      });
    });
  };
})();
/* Quality Project Control V6.11 - objetivo asignado por taller y credenciales demo visibles en MAIN */
(function(){
  window.renderMonthlyWeakTables=function(visitRecords){
    const periodLabel=ui.reportMode==='week'?'semanal':'mensual';
    const agg=aggregateRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue));
    const workshops=groupAggregate(agg,'activity').filter(g=>g.average<g.objective);
    if(!workshops.length){
      return `<div class="alert alert-success">Todos los talleres alcanzan su objetivo asignado en el periodo ${periodLabel} seleccionado.</div>`;
    }
    return workshops.map(g=>{
      const stats=criterionStatsForActivity(visitRecords,g.activity);
      return `<article class="card weak-workshop"><div class="visit-head"><div><span class="badge badge-red">Taller bajo objetivo</span><h3>${escapeHtml(g.activity)}</h3><div class="helper">Promedio ${round1(g.average)}% · Objetivo asignado ${g.objective}% · ${g.count} inspecciones</div></div><div class="visit-score critical">${round1(g.average)}%</div></div><div class="table-wrap"><table><thead><tr><th>Punto de evaluación</th><th>Etapa</th><th>Evaluaciones</th><th>N/A</th><th>Promedio del inciso</th><th>Objetivo asignado</th><th>Puntos perdidos</th></tr></thead><tbody>${stats.map(s=>`<tr class="${s.evaluated&&s.average<g.objective?'weak-row':''}"><td><strong>${escapeHtml(s.name)}</strong><br><span class="helper">${escapeHtml(s.id)}</span></td><td>${escapeHtml(stageDisplay(s.stage))}</td><td>${s.evaluated}</td><td>${s.na}</td><td><strong>${s.evaluated?round1(s.average)+'%':'N/A'}</strong></td><td>${g.objective}%</td><td>${s.pointsLost}</td></tr>`).join('')}</tbody></table></div></article>`;
    }).join('');
  };

  window.renderLogin=function(){
    const demoIds=['exec-1','quality-1','coord-1','manager-1','president-1'];
    const demoUsers=USERS.filter(u=>demoIds.includes(u.id));
    return `<div class="login-shell">
      <section class="login-brand"><div><div class="brand-lockup"><img class="login-logo" src="assets/codelpa_logo_white.png" alt="CODELPA"><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#f4d8dc">Gestión de Calidad de Proyectos</div></div></div><h1>Inspecciones, visitas, equipos y reportes con trazabilidad completa.</h1><p>Acceda con su cuenta autorizada para consultar el proyecto, registrar inspecciones y administrar la información de Calidad.</p><div class="feature-grid"><div class="feature">✓ Desglose por criterio y visita</div><div class="feature">✓ Reportes semanales y mensuales</div><div class="feature">✓ Archivos privados en Supabase</div><div class="feature">✓ Visor integrado de documentos</div></div></div><div class="login-note">Versión principal conectada a Supabase. Los datos se comparten entre usuarios autorizados.</div></section>
      <section class="login-panel"><div class="login-card"><img class="form-logo" src="assets/codelpa_logo_red.png" alt="CODELPA"><h2>Iniciar sesión</h2><p>El sistema identifica el rol y los proyectos permitidos.</p><div id="loginError"></div><div class="field"><label>Correo electrónico</label><input id="loginEmail" type="email" placeholder="usuario@codelpa.demo" autocomplete="username"></div><div class="field" style="margin-top:14px"><label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••" autocomplete="current-password"></div><button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button><div class="demo-users"><h3>Usuarios de demostración</h3>${demoUsers.map(u=>`<div class="demo-user"><div><strong>${escapeHtml(ROLE_LABELS[u.role])}</strong><br><span>${escapeHtml(u.email)}</span></div><button data-demo-email="${escapeHtml(u.email)}" type="button">Usar</button></div>`).join('')}<div class="helper">Contraseña para todos: <strong>12345678</strong></div></div></div></section>
    </div>`;
  };
})();
/* Quality Project Control V6.12
   - Calificaciones robustas y corrección de datos incompletos
   - Semáforo por fila para equipos vencidos
   - Menú por rol ajustado
*/
(function(){
  function safeArray(value){ return Array.isArray(value) ? value : []; }

  window.qpcNormalizeState = function(){
    if(!data || typeof data !== 'object') data = initialData();
    data.users = safeArray(data.users);
    data.inspections = safeArray(data.inspections).filter(Boolean).map(i=>{
      i.visitEvaluations = safeArray(i.visitEvaluations).filter(Boolean).map((v,index)=>({
        ...v,
        number: Number(v.number)||index+1,
        answers: v.answers && typeof v.answers==='object' ? v.answers : {},
        notes: v.notes && typeof v.notes==='object' ? v.notes : {},
        weakCriteria: safeArray(v.weakCriteria),
        decision: v.decision || null,
        status: v.status || (Number.isFinite(Number(v.finalScore))?'FINALIZADA':'EN_PROCESO')
      }));
      i.attachments = safeArray(i.attachments);
      i.audit = safeArray(i.audit);
      i.weakCriteria = safeArray(i.weakCriteria);
      return i;
    });
    data.customMappings = safeArray(data.customMappings);
    data.customDocuments = safeArray(data.customDocuments);
    data.equipmentRecords = safeArray(data.equipmentRecords);
    return data;
  };

  // Agrupación tolerante a registros incompletos. Corrige la apertura de Calificaciones
  // y evita errores al leer "decision" cuando una inspección aún no tiene visita finalizada.
  window.groupAggregate = function(records,type){
    const groups={};
    safeArray(records).filter(Boolean).forEach(r=>{
      const inspection=r.inspection||{};
      const template=r.template||templateById(inspection.templateId)||{};
      const engineer=userById(r.createdBy||inspection.createdBy)||{};
      const activity=template.activity||'Sin taller';
      const key=type==='engineer'?(engineer.id||engineer.name||'Sin ingeniero'):activity;
      if(!groups[key]) groups[key]={
        activity,
        engineer:engineer.name||'Sin ingeniero',
        executionArea:engineer.executionArea||null,
        objective:Number(r.objective??template.objective??0),
        records:[]
      };
      groups[key].records.push(r);
    });
    return Object.values(groups).map(g=>{
      const rs=g.records;
      const firstReleased=rs.filter(r=>{
        const decision=r.inspection?.decision || r.visits?.[0]?.decision || r.visit?.decision || null;
        return Boolean(r.firstVisit) && decision==='Liberada';
      }).length;
      return {
        ...g,
        count:rs.length,
        average:mean(rs.map(r=>r.finalScore)),
        technical:mean(rs.map(r=>r.technicalScore)),
        visit:mean(rs.map(r=>r.visitScore)),
        objective:round1(mean(rs.map(r=>Number(r.objective??g.objective)))),
        firstVisitPct:rs.length?firstReleased/rs.length*100:0,
        improper:rs.filter(r=>r.inspection?.status==='IMPROCEDENTE').length
      };
    }).sort((a,b)=>a.average-b.average);
  };

  // Normalizar antes de cualquier renderizado o guardado.
  const priorRender=window.render;
  window.render=function(){ qpcNormalizeState(); return priorRender(); };
  const priorSaveData=window.saveData;
  window.saveData=function(){ qpcNormalizeState(); return priorSaveData(); };

  // Menú exacto por rol:
  // - Usuarios y permisos: Gerente de Calidad, Gerente de Proyecto y Presidencia.
  // - Instructivos y mapeos no se muestran a Gerencia de Proyecto ni Presidencia.
  window.navItems=function(user){
    if(user.role==='EJECUCION') return [
      ['home','⌂','Mi dashboard'],['newRequest','＋','Solicitar inspección'],
      ['myInspections','☷','Mis inspecciones'],['documents','▤','Instructivos'],['mappings','▦','Mapeos']
    ];
    if(['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role)){
      const items=[['home','⌂','Inicio'],['qualityQueue','☷','Bandeja de Calidad'],['myInspections','✓','Mis inspecciones'],['ratings','▥','Calificaciones'],['exports','⇩','Exportaciones'],['equipment','⌁','Verificación de equipos'],['documents','▤','Instructivos'],['mappings','▦','Mapeos']];
      if(user.role==='COORDINADOR_CALIDAD') items.push(['users','⚙','Usuarios y permisos']);
      return items;
    }
    if(['GERENCIA','PRESIDENTE'].includes(user.role)) return [
      ['home','⌂','Inicio'],['ratings','▥','Calificaciones'],['exports','⇩','Exportaciones'],['users','⚙','Usuarios y permisos']
    ];
    return [['home','⌂','Inicio']];
  };

  // Permiso de acceso directo, incluso si una URL/vista quedó guardada en el navegador.
  const priorRenderView=window.renderView;
  window.renderView=function(user){
    if(ui.view==='users' && !['COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(user.role)) return noAccess();
    if(['documents','mappings'].includes(ui.view) && ['GERENCIA','PRESIDENTE'].includes(user.role)) return noAccess();
    return priorRenderView(user);
  };

  // El Gerente de Proyecto y Presidencia pueden agregar/editar Ejecución,
  // mientras el Gerente de Calidad conserva la administración de Calidad y Ejecución.
  window.renderUsers=function(user){
    if(!['COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(user.role)) return noAccess();
    const selected=data.users.find(u=>u.id===ui.userSelectedId);
    return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>El Gerente de Calidad administra Calidad y Ejecución. Gerencia de Proyecto y Presidencia administran ingenieros de Ejecución.</p></div></div>${userEditor(selected||{})}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyecto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${data.users.filter(u=>['EJECUCION','CALIDAD'].includes(u.role)).map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(ROLE_LABELS[u.role])}</td><td>${escapeHtml(AREA_LABELS[u.executionArea]||'—')}</td><td>${escapeHtml((u.projectIds||[]).join(', '))}</td><td>${u.isActive===false?'Inactivo':'Activo'}</td><td>${u.role==='EJECUCION'||user.role==='COORDINADOR_CALIDAD'?`<button class="btn btn-outline" data-edit-user="${u.id}">Editar</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`;
  };

  // Restringir el selector de rol del editor según quién administra.
  const priorUserEditor=window.userEditor;
  window.userEditor=function(record={}){
    const html=priorUserEditor(record);
    const user=currentUser();
    if(user?.role==='COORDINADOR_CALIDAD') return html;
    // Gerencia/Presidencia solo crean o editan Ejecución.
    return html.replace(/<option value="CALIDAD"[^>]*>.*?<\/option>/g,'')
               .replace(/<option value="COORDINADOR_CALIDAD"[^>]*>.*?<\/option>/g,'');
  };

  // Aplicar semáforo visual a la fila completa en Verificación de equipos.
  const priorBindView=window.bindView;
  window.bindView=function(user){
    priorBindView(user);
    if(ui.view==='equipment'){
      document.querySelectorAll('.table-wrap tbody tr').forEach(row=>{
        const status=[...row.querySelectorAll('.badge')].map(x=>x.textContent.trim()).find(x=>['VENCIDO','PRÓXIMO','VIGENTE'].includes(x));
        row.classList.toggle('equipment-row-expired',status==='VENCIDO');
        row.classList.toggle('equipment-row-soon',status==='PRÓXIMO');
      });
    }
  };

  // Asegurar que el login no quede bloqueado por una sesión/dato remoto incompleto.
  const priorLoadRemoteData=window.loadRemoteData;
  window.loadRemoteData=async function(){
    await priorLoadRemoteData();
    qpcNormalizeState();
  };

  // Si la vista guardada ya no corresponde al rol, regresar a Inicio.
  const priorRenderShell=window.renderShell;
  window.renderShell=function(user){
    const allowed=new Set(navItems(user).map(x=>x[0]).concat(['detail','evaluate','annotateMap']));
    if(!allowed.has(ui.view)) ui.view='home';
    return priorRenderShell(user);
  };
})();
/* Quality Project Control V6.13 — estabilización de Supabase Auth
   - Arranque único después de cargar todos los módulos
   - Evita carreras entre bootstrap y los parches de versiones
   - Login con manejo de timeout, errores y recuperación del botón
   - Fallback seguro para cuentas demo autenticadas cuyo perfil aún no esté enlazado
*/
(function(){
  const AUTH_TIMEOUT_MS = 20000;
  const LOAD_TIMEOUT_MS = 20000;

  function withTimeout(promise, milliseconds, message){
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject)=>{
        timer=setTimeout(()=>reject(new Error(message)), milliseconds);
      })
    ]).finally(()=>clearTimeout(timer));
  }

  function resetToLogin(message=''){
    authenticatedUser=null;
    data=initialData();
    data.users=USERS.map(u=>({...u}));
    ui.view='home';
    render();
    if(message){
      const errorBox=document.getElementById('loginError');
      if(errorBox) errorBox.innerHTML=`<div class="login-error">${escapeHtml(message)}</div>`;
    }
  }

  function resolveAuthenticatedProfile(authUser){
    if(!authUser) return null;
    const authEmail=String(authUser.email||'').trim().toLowerCase();
    let profile=data.users.find(u=>u.authId===authUser.id);
    if(!profile && authEmail){
      profile=data.users.find(u=>String(u.email||'').trim().toLowerCase()===authEmail);
    }
    // Las cuentas demo deben poder entrar aun si el UUID del perfil quedó desactualizado.
    if(!profile && authEmail){
      const fallback=USERS.find(u=>String(u.email||'').trim().toLowerCase()===authEmail);
      if(fallback){
        profile={...fallback,authId:authUser.id,isActive:true};
        data.users.push(profile);
      }
    }
    if(profile && !profile.authId) profile.authId=authUser.id;
    return profile?.isActive===false?null:profile;
  }

  window.login=async function(){
    const emailInput=document.getElementById('loginEmail');
    const passwordInput=document.getElementById('loginPassword');
    const button=document.getElementById('loginBtn');
    const errorBox=document.getElementById('loginError');
    if(!emailInput||!passwordInput||!button) return;

    const email=emailInput.value.trim().toLowerCase();
    const password=passwordInput.value;
    if(errorBox) errorBox.innerHTML='';
    if(!email||!password){
      if(errorBox) errorBox.innerHTML='<div class="login-error">Introduzca el correo y la contraseña.</div>';
      return;
    }

    button.disabled=true;
    button.textContent='Entrando...';
    try{
      // Elimina cualquier sesión local incompleta antes de un inicio manual.
      const current=await withTimeout(supabaseClient.auth.getSession(),AUTH_TIMEOUT_MS,'Supabase no respondió al consultar la sesión.');
      if(current?.data?.session && String(current.data.session.user?.email||'').toLowerCase()!==email){
        await withTimeout(supabaseClient.auth.signOut({scope:'local'}),AUTH_TIMEOUT_MS,'No se pudo limpiar la sesión anterior.');
      }

      const result=await withTimeout(
        supabaseClient.auth.signInWithPassword({email,password}),
        AUTH_TIMEOUT_MS,
        'Supabase tardó demasiado en responder al inicio de sesión.'
      );
      if(result.error) throw result.error;
      const authUser=result.data?.user;
      if(!authUser) throw new Error('Supabase no devolvió el usuario autenticado.');

      await withTimeout(loadRemoteData(),LOAD_TIMEOUT_MS,'Se inició sesión, pero los datos tardaron demasiado en cargar.');
      if(typeof qpcNormalizeState==='function') qpcNormalizeState();

      const profile=resolveAuthenticatedProfile(authUser);
      if(!profile){
        await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
        throw new Error('El usuario se autenticó, pero no tiene un perfil activo en la aplicación.');
      }

      authenticatedUser=profile;
      ui.view='home';
      render();
    }catch(error){
      console.error('Fallo de inicio de sesión V6.13:',error);
      const detail=error?.message||String(error)||'Error desconocido';
      if(errorBox) errorBox.innerHTML=`<div class="login-error"><strong>No se pudo iniciar sesión.</strong><br><span>${escapeHtml(detail)}</span></div>`;
    }finally{
      const liveButton=document.getElementById('loginBtn');
      if(liveButton){
        liveButton.disabled=false;
        liveButton.textContent='Entrar';
      }
    }
  };

  window.qpcBootstrapV613=async function(){
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="loading-screen">Conectando con Supabase...</div>';
    try{
      const sessionResult=await withTimeout(supabaseClient.auth.getSession(),AUTH_TIMEOUT_MS,'Supabase no respondió al cargar la sesión.');
      if(sessionResult.error) throw sessionResult.error;
      let session=sessionResult.data?.session||null;

      if(session){
        try{
          const refreshed=await withTimeout(supabaseClient.auth.refreshSession(),AUTH_TIMEOUT_MS,'No se pudo renovar la sesión.');
          if(refreshed.error) throw refreshed.error;
          session=refreshed.data?.session||session;
        }catch(refreshError){
          console.warn('Sesión descartada durante el arranque:',refreshError);
          await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
          session=null;
        }
      }

      if(!session?.user){
        resetToLogin();
        return;
      }

      await withTimeout(loadRemoteData(),LOAD_TIMEOUT_MS,'No se pudieron cargar los datos desde Supabase.');
      if(typeof qpcNormalizeState==='function') qpcNormalizeState();
      const profile=resolveAuthenticatedProfile(session.user);
      if(!profile){
        await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
        resetToLogin('La sesión no tiene un perfil activo. Inicie sesión nuevamente.');
        return;
      }
      authenticatedUser=profile;
      render();
    }catch(error){
      console.error('Fallo de arranque V6.13:',error);
      await supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});
      resetToLogin('No se pudo conectar con Supabase: '+(error?.message||String(error)));
    }
  };

  // V7.0 ejecuta el arranque después de cargar v70.js.
  window.qpcBootstrapV613Ready = true;
})();

/* Quality Project Control V7.0
   Refactor incremental: usuarios con contraseñas, directorio de login, perfil, proyectos,
   inspecciones, equipos, instructivos, mapeos, exportaciones con vista previa y mejoras UX. */
(function(){
  const IS_MAIN = Boolean(window.QPC_SUPABASE_URL && (typeof supabaseClient!=='undefined'?supabaseClient:null) !== undefined || window.QPC_SUPABASE_URL);
  const DEMO_PASSWORD = IS_MAIN ? '12345678' : '1234';
  const PROJECT_DEFAULTS = [
    {id:'LCE', name:'Lopesan La Ceiba', shortCode:'LLC', hotelCode:'Lopesan La Ceiba', isActive:true},
    {id:'VC', name:'Villa Corales', shortCode:'VC', hotelCode:'Villa Corales', isActive:true}
  ];
  ROLE_LABELS.COORDINADOR_CALIDAD = 'Gerente de Calidad';

  function arr(v){ return Array.isArray(v)?v:[]; }
  function todayISO(){ return toISODate(new Date()); }
  function normalizeText(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function initialsFromName(name){ const parts=normalizeText(name).trim().split(/\s+/).filter(Boolean); return ((parts[0]?.[0]||'U')+(parts[1]?.[0]||parts[0]?.[1]||'X')).toUpperCase(); }
  function shortProjectCode(name,id){ if(id==='LCE') return 'LLC'; if(id==='VC') return 'VC'; const words=normalizeText(name||id).split(/\s+/).filter(Boolean); return (words.length>1?words.map(w=>w[0]).join(''):String(id||'PRY').slice(0,3)).toUpperCase().slice(0,4); }
  function addDaysISO(date,days){ if(!date || date==='N/A') return 'N/A'; const d=new Date(`${date}T12:00:00`); if(isNaN(d)) return 'N/A'; d.setDate(d.getDate()+Number(days||0)); return toISODate(d); }
  function ensureProjects(){
    if(!data) return PROJECT_DEFAULTS;
    data.projects = arr(data.projects);
    PROJECT_DEFAULTS.forEach(p=>{ if(!data.projects.some(x=>x.id===p.id)) data.projects.push({...p}); });
    data.projects.forEach(p=>{ p.name=p.name||p.id; p.shortCode=p.shortCode||shortProjectCode(p.name,p.id); p.hotelCode=p.name; if(p.isActive===undefined)p.isActive=true; });
    return data.projects;
  }
  function allProjects(){ return data?.projects?.length ? ensureProjects() : PROJECT_DEFAULTS; }
  window.projectInfo = function(){ const id=projectId(); return allProjects().find(p=>p.id===id) || allProjects()[0] || PROJECT_DEFAULTS[0]; };
  window.projectOptions = function(user){
    const allowed = arr(user?.projectIds); const projects = allProjects().filter(p=>p.isActive!==false && (!allowed.length || allowed.includes(p.id) || ['PRESIDENTE','GERENCIA','COORDINADOR_CALIDAD','CALIDAD','IT'].includes(user?.role)));
    return projects.map(p=>`<option value="${escapeHtml(p.id)}" ${projectId()===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
  };
  window.projectDocuments = function(){ return [...INSTRUCTIVOS, ...arr(data?.customDocuments)].filter(d=>!d.projectId||d.projectId===projectId()); };
  window.projectMappings = function(){ const base=(projectId()==='LCE'?MAPEOS:[]).map(m=>({...m,projectId:'LCE'})); return [...base, ...arr(data?.customMappings).filter(m=>(m.projectId||'LCE')===projectId())]; };
  window.mappingById = function(id){ return [...MAPEOS, ...arr(data?.customMappings)].find(m=>m.id===id); };
  window.qpcCanManageUsers = function(user){ return ['COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'].includes(user?.role); };
  window.qpcCanCreateProject = function(user){ return ['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'].includes(user?.role); };

  const priorNormalize = window.qpcNormalizeState;
  window.qpcNormalizeState = function(){
    if(typeof priorNormalize === 'function') priorNormalize();
    if(!data || typeof data!=='object') data=initialData();
    data.users=arr(data.users); data.inspections=arr(data.inspections); data.customDocuments=arr(data.customDocuments); data.customMappings=arr(data.customMappings); data.equipmentRecords=arr(data.equipmentRecords); ensureProjects();
    data.users.forEach(u=>{ u.projectIds=arr(u.projectIds).length?arr(u.projectIds):['LCE']; if(u.isActive===undefined)u.isActive=true; if(!u.displayName)u.displayName=u.name; });
    data.customDocuments.forEach(d=>{ d.projectId=d.projectId||projectId(); d.status=d.file?'Disponible':'Pendiente de cargar'; d.activities=arr(d.activities); });
    data.customMappings.forEach(m=>{ m.projectId=m.projectId||projectId(); m.status=m.file?'Vigente':'Pendiente de cargar'; });
    data.equipmentRecords.forEach(r=>normalizeEquipmentRecord(r));
    data.inspections.forEach(i=>{ i.projectId=i.projectId||'LCE'; i.visitEvaluations=arr(i.visitEvaluations); i.audit=arr(i.audit); i.attachments=arr(i.attachments); if(!i.code && i.requestedDate) i.code=makeInspectionCode(i.projectId,i.requestedDate); });
    return data;
  };

  const baseInitialData = window.initialData;
  window.initialData = function(){
    const d = baseInitialData ? baseInitialData() : {version:7,users:[],inspections:[],customMappings:[],customDocuments:[]};
    d.version=7; d.projects=d.projects||PROJECT_DEFAULTS.map(p=>({...p})); d.equipmentRecords=d.equipmentRecords||[]; d.equipmentFrequency=d.equipmentFrequency||[]; d.customDocuments=d.customDocuments||[]; d.customMappings=d.customMappings||[];
    return d;
  };

  // Login con combobox de correos registrados y sin recuadro largo de usuarios demo.
  window.qpcLoginDirectory = arr(window.qpcLoginDirectory);
  async function loadLoginDirectory(){
    const fallback = (data?.users?.length?data.users:USERS).map(u=>({email:u.email,full_name:u.name||u.full_name,role:u.role}));
    if(!IS_MAIN || !(typeof supabaseClient!=='undefined'?supabaseClient:null)) { window.qpcLoginDirectory=fallback; return fallback; }
    try{
      const {data: rows, error}=await supabaseClient.from('login_directory').select('email,full_name,role,is_active').eq('is_active',true).order('email');
      if(error) throw error;
      window.qpcLoginDirectory = (rows&&rows.length?rows:fallback).map(r=>({email:r.email,full_name:r.full_name||r.email,role:r.role}));
    }catch(e){ window.qpcLoginDirectory=fallback; }
    return window.qpcLoginDirectory;
  }
  window.renderLogin = function(){
    const emails = (window.qpcLoginDirectory?.length ? window.qpcLoginDirectory : (data?.users?.length?data.users:USERS)).filter(u=>u.email);
    return `<div class="login-shell">
      <section class="login-brand"><div><div class="brand-lockup"><img class="brand-logo-main" src="assets/codelpa_logo_white.png" alt="CODELPA"><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#c9d9e8">Gestión de Calidad de Proyectos</div></div></div><h1>Inspecciones, visitas, equipos y reportes con trazabilidad completa.</h1><p>Acceda con su cuenta autorizada para consultar el proyecto, registrar inspecciones y administrar la información de Calidad.</p><div class="feature-grid"><div class="feature">✓ Desglose por criterio y visita</div><div class="feature">✓ Reportes semanales y mensuales</div><div class="feature">✓ Archivos privados en ${IS_MAIN?'Supabase':'demo local'}</div><div class="feature">✓ Visor integrado de documentos</div></div></div><div class="login-note">${IS_MAIN?'Versión principal conectada a Supabase.':'Demo estática para GitHub Pages.'}</div></section>
      <section class="login-panel"><div class="login-card"><img class="form-logo" src="assets/codelpa_logo_red.png" alt="CODELPA"><h2>Iniciar sesión</h2><p>Escriba su correo o selecciónelo desde el listado.</p><div id="loginError"></div><div class="field"><label>Correo electrónico</label><input id="loginEmail" list="loginEmailOptions" type="email" placeholder="usuario@codelpa.demo" autocomplete="username"><datalist id="loginEmailOptions">${emails.map(u=>`<option value="${escapeHtml(u.email)}">${escapeHtml(ROLE_LABELS[u.role]||u.full_name||'Usuario')}</option>`).join('')}</datalist></div><div class="field" style="margin-top:14px"><label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••" autocomplete="current-password"></div><button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button><div class="login-demo-hint">Para las cuentas terminadas en <strong>.demo</strong>, la contraseña es <strong>${DEMO_PASSWORD}</strong>.</div></div></section>
    </div>`;
  };

  const priorBindGlobal = window.bindGlobal;
  window.bindGlobal=function(){
    priorBindGlobal();
    const email=document.getElementById('loginEmail');
    if(email){ email.addEventListener('input',()=>{ if(email.value.endsWith('.demo')){ const p=document.getElementById('loginPassword'); if(p && !p.value) p.value=DEMO_PASSWORD; } }); }
  };

  const priorBoot = window.qpcBootstrapV613;
  window.qpcBootstrapV700 = async function(){
    await loadLoginDirectory();
    if(typeof priorBoot==='function') return priorBoot();
    qpcNormalizeState(); render();
  };

  // Perfil personal.
  function renderAvatar(user, size='72px'){ return user.avatarDataUrl?`<img class="profile-avatar-img" src="${escapeHtml(user.avatarDataUrl)}" alt="${escapeHtml(user.name)}" style="width:${size};height:${size}">`:`<div class="avatar profile-avatar-fallback" style="width:${size};height:${size}">${initials(user.name)}</div>`; }
  function profileNavItem(items){ if(!items.some(x=>x[0]==='profile')) items.push(['profile','◉','Mi perfil']); return items; }
  const priorNavItems=window.navItems;
  window.navItems=function(user){ return profileNavItem(priorNavItems(user)); };
  const priorViewTitle=window.viewTitle;
  window.viewTitle=function(){ return ui.view==='profile'?'Mi perfil':ui.view==='projects'?'Proyectos':priorViewTitle(); };
  const priorRenderView=window.renderView;
  window.renderView=function(user){
    if(ui.view==='profile') return renderProfile(user);
    if(ui.view==='projects') return renderProjects(user);
    return priorRenderView(user);
  };
  function renderProfile(user){
    return `<div class="page-head"><div><h2>Mi perfil</h2><p>Actualice su nombre visible y una imagen ligera de perfil.</p></div></div><div class="card profile-card"><div>${renderAvatar(user)}</div><div class="form-grid"><div class="field"><label>Nombre visible</label><input id="profileName" value="${escapeHtml(user.name||'')}"></div><div class="field"><label>Correo</label><input value="${escapeHtml(user.email||'')}" readonly></div><div class="field"><label>Rol</label><input value="${escapeHtml(ROLE_LABELS[user.role]||user.role)}" readonly></div><div class="field"><label>Imagen de perfil</label><input id="profilePhoto" type="file" accept="image/*"></div></div><div class="button-row" style="margin-top:12px"><button id="saveProfileBtn" class="btn btn-primary">Guardar perfil</button><button id="removeProfilePhotoBtn" class="btn btn-outline">Restaurar imagen</button></div></div><div class="alert alert-info" style="margin-top:16px">El cambio o restablecimiento de contraseñas solo puede realizarlo una cuenta autorizada del Departamento de Calidad desde Usuarios y permisos.</div>`;
  }
  async function compressImage(file, max=192){ return new Promise(resolve=>{ if(!file) return resolve(null); const img=new Image(); const reader=new FileReader(); reader.onload=()=>{ img.onload=()=>{ const c=document.createElement('canvas'); const s=Math.min(1,max/Math.max(img.width,img.height)); c.width=Math.max(1,Math.round(img.width*s)); c.height=Math.max(1,Math.round(img.height*s)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); resolve(c.toDataURL('image/jpeg',0.72)); }; img.src=reader.result; }; reader.onerror=()=>resolve(null); reader.readAsDataURL(file); }); }
  async function saveProfile(){
    const user=currentUser(); if(!user) return; const name=document.getElementById('profileName')?.value.trim(); if(!name){toast('Indique su nombre visible');return;} user.name=name; user.displayName=name;
    const file=document.getElementById('profilePhoto')?.files?.[0]; if(file){ const dataUrl=await compressImage(file); if(dataUrl) user.avatarDataUrl=dataUrl; }
    if(IS_MAIN && (typeof supabaseClient!=='undefined'?supabaseClient:null) && user.authId){
      const {error}=await supabaseClient.from('profiles').update({full_name:name,avatar_data_url:user.avatarDataUrl||null}).eq('id',user.authId);
      if(error) toast('Perfil local actualizado. Ejecute SQL V7 si no guarda en Supabase.');
      await loadLoginDirectory();
    }
    saveData(); toast('Perfil actualizado'); render();
  }

  // Proyectos con nombres completos.
  function projectEditor(p={}){ const editing=Boolean(p.id); return `<div class="card"><h3>${editing?'Editar proyecto':'Crear proyecto'}</h3><div class="form-grid"><div class="field"><label>Nombre completo</label><input id="projectName" value="${escapeHtml(p.name||'')}"></div><div class="field"><label>Abreviatura para códigos</label><input id="projectShort" value="${escapeHtml(p.shortCode||'')}" placeholder="LLC"></div><div class="field"><label>ID interno</label><input id="projectIdField" value="${escapeHtml(p.id||'')}" placeholder="LCE" ${editing?'readonly':''}></div><div class="field"><label class="check-row"><input id="projectActive" type="checkbox" ${p.isActive===false?'':'checked'}><span>Proyecto activo</span></label></div></div><div class="button-row" style="margin-top:12px"><button id="saveProjectBtn" class="btn btn-primary">Guardar proyecto</button>${editing?'<button id="cancelProjectBtn" class="btn btn-secondary">Cancelar</button>':''}</div></div>`; }
  function renderProjects(user){ if(!qpcCanCreateProject(user)) return noAccess(); const selected=allProjects().find(p=>p.id===ui.projectSelectedId); return `<div class="page-head"><div><h2>Proyectos</h2><p>Los códigos internos se conservan para reportes, pero la plataforma muestra el nombre completo.</p></div></div>${projectEditor(selected||{})}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre completo</th><th>Abreviatura</th><th>ID</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${allProjects().map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.shortCode)}</td><td>${escapeHtml(p.id)}</td><td>${p.isActive===false?'Inactivo':'Activo'}</td><td><button class="btn btn-outline" data-edit-project="${escapeHtml(p.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`; }
  function saveProject(){ const name=document.getElementById('projectName')?.value.trim(); const id=(document.getElementById('projectIdField')?.value.trim().toUpperCase() || shortProjectCode(name,name)); if(!name||!id){toast('Complete nombre e ID');return;} let p=data.projects.find(x=>x.id===ui.projectSelectedId||x.id===id); if(!p){p={id}; data.projects.push(p);} p.name=name; p.shortCode=(document.getElementById('projectShort')?.value.trim().toUpperCase()||shortProjectCode(name,id)); p.hotelCode=name; p.isActive=document.getElementById('projectActive')?.checked!==false; ui.projectSelectedId=null; saveData(); toast('Proyecto guardado'); render(); }

  // Usuarios, contraseñas y permisos.
  function roleOptions(currentRole){ const user=currentUser(); const roles = user?.role==='COORDINADOR_CALIDAD' ? ['EJECUCION','CALIDAD'] : ['EJECUCION']; return roles.map(r=>`<option value="${r}" ${currentRole===r?'selected':''}>${escapeHtml(ROLE_LABELS[r])}</option>`).join(''); }
  function projectCheckboxes(selected=[]){ const set=new Set(selected); return allProjects().map(p=>`<label class="check-row"><input type="checkbox" class="usrProject" value="${escapeHtml(p.id)}" ${set.has(p.id)?'checked':''}><span>${escapeHtml(p.name)}</span></label>`).join(''); }
  window.userEditor=function(u={}){ const editing=Boolean(u.id); return `<div class="card"><h3>${editing?'Editar usuario':'Crear usuario'}</h3><div class="form-grid"><div class="field"><label>Nombre</label><input id="usrName" value="${escapeHtml(u.name||'')}"></div><div class="field"><label>Correo</label><input id="usrEmail" type="email" value="${escapeHtml(u.email||'')}" ${editing?'readonly':''}></div><div class="field"><label>Contraseña ${editing?'nueva / restaurar':''}</label><input id="usrPassword" type="password" placeholder="${editing?'Dejar vacío si no cambia':'Contraseña inicial'}"></div><div class="field"><label>Rol</label><select id="usrRole">${roleOptions(u.role||'EJECUCION')}</select></div><div class="field"><label>Área</label><select id="usrArea"><option value="TERMINACION" ${u.executionArea==='TERMINACION'?'selected':''}>Terminación</option><option value="ESTRUCTURA" ${u.executionArea==='ESTRUCTURA'?'selected':''}>Estructura</option></select></div><div class="field full"><label>Proyectos permitidos</label><div class="project-checks">${projectCheckboxes(u.projectIds||[projectId()])}</div></div><div class="field full"><label class="check-row"><input id="usrActive" type="checkbox" ${u.isActive===false?'':'checked'}><span>Usuario activo</span></label></div></div><div class="button-row" style="margin-top:12px"><button id="saveUserBtn" class="btn btn-primary">${editing?'Guardar cambios':'Crear usuario'}</button>${editing?'<button id="cancelUserBtn" class="btn btn-secondary">Cancelar</button>':''}</div><div class="helper">En MAIN, crear o restaurar contraseñas requiere desplegar la Edge Function <code>admin-create-user</code>. En DEMO-GITHUB se guarda localmente.</div></div>`; };
  window.renderUsers=function(user){ if(!qpcCanManageUsers(user))return noAccess(); const selected=data.users.find(u=>u.id===ui.userSelectedId); return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>El Gerente de Calidad administra Calidad y Ejecución. Gerencia y Presidencia administran ingenieros de Ejecución.</p></div><div class="button-row">${qpcCanCreateProject(user)?'<button class="btn btn-outline" data-nav="projects">Gestionar proyectos</button>':''}</div></div>${userEditor(selected||{})}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyectos</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${data.users.filter(u=>['EJECUCION','CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(u.role)).map(u=>`<tr><td>${renderAvatar(u,'34px')} ${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(ROLE_LABELS[u.role])}</td><td>${escapeHtml(AREA_LABELS[u.executionArea]||'—')}</td><td>${escapeHtml(arr(u.projectIds).map(id=>allProjects().find(p=>p.id===id)?.name||id).join(', '))}</td><td>${u.isActive===false?'Inactivo':'Activo'}</td><td>${(u.role==='EJECUCION'||currentUser()?.role==='COORDINADOR_CALIDAD')?`<button class="btn btn-outline" data-edit-user="${escapeHtml(u.id)}">Editar</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`; };
  async function saveUserV70(){
    const role=document.getElementById('usrRole')?.value; const current=currentUser(); if(role==='CALIDAD' && current?.role!=='COORDINADOR_CALIDAD'){toast('Solo el Gerente de Calidad puede crear o modificar Calidad.');return;}
    const email=document.getElementById('usrEmail')?.value.trim().toLowerCase(); const name=document.getElementById('usrName')?.value.trim(); const password=document.getElementById('usrPassword')?.value; const projects=[...document.querySelectorAll('.usrProject:checked')].map(x=>x.value);
    if(!email||!name){toast('Complete nombre y correo');return;} if(!ui.userSelectedId && !password){toast('Indique la contraseña inicial');return;}
    let existing=data.users.find(x=>x.id===ui.userSelectedId);
    const payload={email,password,full_name:name,role,execution_area:document.getElementById('usrArea')?.value||null,project_ids:projects.length?projects:[projectId()],is_active:document.getElementById('usrActive')?.checked!==false,legacy_id:existing?.id||`usr-${Date.now()}`};
    if(IS_MAIN && (typeof supabaseClient!=='undefined'?supabaseClient:null)){
      try{
        const {data: fnData,error}=await supabaseClient.functions.invoke('admin-create-user',{body:{...payload,mode:existing?'update':'create'}});
        if(error) throw error;
        const profile=fnData?.profile||{}; existing=existing||{id:profile.legacy_id||payload.legacy_id}; Object.assign(existing,{id:profile.legacy_id||payload.legacy_id,authId:profile.id,name:profile.full_name||name,email:profile.email||email,role:profile.role||role,executionArea:profile.execution_area||payload.execution_area,projectIds:profile.project_ids||payload.project_ids,isActive:profile.is_active!==false});
        if(!data.users.some(u=>u.id===existing.id)) data.users.push(existing);
        await loadLoginDirectory();
      }catch(e){ toast('No se pudo crear/restaurar en Supabase. Verifique la Edge Function V7.'); console.error(e); return; }
    }else{
      existing=existing||{id:payload.legacy_id}; Object.assign(existing,{name,email,password,role,executionArea:payload.execution_area,projectIds:payload.project_ids,isActive:payload.is_active}); if(!data.users.some(u=>u.id===existing.id)) data.users.push(existing);
    }
    ui.userSelectedId=null; saveData(); toast('Usuario guardado'); render();
  }

  // Código de inspección y código secuencial de cierre.
  window.makeInspectionCode=function(project,date){ const p=allProjects().find(x=>x.id===project)||PROJECT_DEFAULTS[0]; const d=new Date(`${date||todayISO()}T12:00:00`); return `I-${p.shortCode||shortProjectCode(p.name,p.id)}-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
  window.nextCode=function(date){ const base=makeInspectionCode(projectId(),date||ui.requestDraft.date); const same=arr(data.inspections).filter(i=>i.projectId===projectId() && i.code===base).length; return same?`${base}-${String(same+1).padStart(2,'0')}`:base; };
  function nextClosureCode(user,project){ const prefix=initialsFromName(user.name); const max=arr(data.inspections).filter(i=>i.projectId===project && String(i.closureCode||'').startsWith(prefix)).map(i=>Number(String(i.closureCode).replace(prefix,''))||0).reduce((a,b)=>Math.max(a,b),0); return `${prefix}${String(max+1).padStart(4,'0')}`; }
  const priorFinish=window.finishEvaluation;
  window.finishEvaluation=function(user,decision){
    priorFinish(user,decision);
    const i=data.inspections.find(x=>x.id===ui.selectedId);
    if(i && !i.closureCode && Number.isFinite(Number(i.finalScore))){ i.closureCode=nextClosureCode(user,i.projectId||projectId()); i.audit=arr(i.audit); i.audit.push({at:nowISO(),userId:user.id,action:`Código de cierre generado: ${i.closureCode}`}); saveData(); }
  };

  // Solicitudes: Ejecución solo libera; Calidad hace seguimiento/cierre por su cuenta.
  const priorRenderNewRequest=window.renderNewRequest;
  window.renderNewRequest=function(user){
    const html=priorRenderNewRequest(user);
    if(user?.role!=='EJECUCION') return html;
    return html.replace(/<option value="([^"]+)"([^>]*)>(.*?)<\/option>/g,(m,id,attr,label)=>{
      const t=templateById(id); return t && !/General|Liberaci/i.test(t.stage||'') ? '' : m;
    }).replace('Las actividades pueden incluir Liberación, Seguimiento y Terminación / cierre.','Ejecución solo solicita liberación. Seguimiento y cierre son gestionados por Calidad.');
  };
  const priorRenderDetail=window.renderDetail;
  window.renderDetail=function(user){
    let html=priorRenderDetail(user);
    const i=data.inspections.find(x=>x.id===ui.selectedId); if(!i||!canOperateQuality(user)) return html;
    const t=templateById(i.templateId), nextTemplates=templatesForActivity(t?.activity||'').filter(x=>!/General|Liberaci/i.test(x.stage||''));
    if(Number.isFinite(Number(i.finalScore)) && nextTemplates.length){
      const extra=`<div class="card" style="margin-top:16px"><h3>Seguimiento y cierre por Calidad</h3><p class="helper">Ejecución solo solicita liberación. Calidad puede iniciar seguimiento o cierre sin nueva solicitud de Ejecución.</p><div class="form-grid"><div class="field"><label>Etapa</label><select id="qualityStageTemplate">${nextTemplates.map(x=>`<option value="${x.id}">${escapeHtml(stageDisplay(x.stage))} · ${escapeHtml(x.title)}</option>`).join('')}</select></div></div><div class="button-row" style="margin-top:12px"><button class="btn btn-primary" data-quality-stage="${i.id}">＋ Iniciar etapa de Calidad</button></div></div>`;
      html=html.replace('<div class="section-title"><h3>Calificaciones y puntos descontados por visita</h3></div>',extra+'<div class="section-title"><h3>Calificaciones y puntos descontados por visita</h3></div>');
    }
    return html.replace('<div>Estado</div><div>',`<div>Código cierre</div><div>${escapeHtml(i.closureCode||'Pendiente')}</div><div>Estado</div><div>`);
  };

  // Instructivos: actividad como dropdown y estado calculado.
  function activityOptions(selected=''){ const acts=[...new Set(TEMPLATES.map(t=>t.activity).filter(Boolean))].sort(); return acts.map(a=>`<option value="${escapeHtml(a)}" ${a===selected?'selected':''}>${escapeHtml(a)}</option>`).join(''); }
  window.renderDocuments=function(user){ const manage=canOperateQuality(user); const rows=projectDocuments().filter(d=>!ui.docSearch||`${d.code} ${d.version} ${d.title} ${arr(d.activities).join(' ')} ${d.status}`.toLowerCase().includes(ui.docSearch.toLowerCase())); const editing=projectDocuments().find(d=>(d.id||d.code)===ui.documentSelectedId);
    return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Calidad administra instructivos por actividad. El estado se calcula según archivo cargado.</p></div></div>${manage?`<div class="card library-admin"><h3>${editing?'Modificar instructivo':'Agregar instructivo'}</h3><div class="form-grid"><div class="field"><label>Código</label><input id="docCode" value="${escapeHtml(editing?.code||'')}" placeholder="IT-CP-05"></div><div class="field"><label>Versión</label><input id="docVersion" value="${escapeHtml(editing?.version||'')}" placeholder="V03"></div><div class="field full"><label>Título</label><input id="docTitle" value="${escapeHtml(editing?.title||'')}"></div><div class="field"><label>Actividad relacionada</label><select id="docActivity">${activityOptions(arr(editing?.activities)[0]||'')}</select></div><div class="field"><label>Estado calculado</label><input value="${editing?.file?'Disponible':'Pendiente de cargar'}" readonly></div><div class="field full"><label>Archivo PDF o imagen</label><input id="docFile" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></div></div><div class="button-row" style="margin-top:12px"><button id="saveDocumentBtn" class="btn btn-primary">Guardar instructivo</button>${editing?'<button id="cancelDocumentEdit" class="btn btn-secondary">Cancelar</button>':''}</div></div>`:''}<div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch||'')}"></div></div><div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3>${escapeHtml(d.title)}</h3><span class="badge ${d.file?'badge-green':'badge-yellow'}">${d.file?'Disponible':'Pendiente de cargar'}</span><div class="tag-list">${arr(d.activities).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div></div><div class="button-row">${d.file?viewerButton(d.file,d.fileName||d.title,d.fileType||'application/pdf','Visualizar'):'<button class="btn btn-secondary" disabled>Pendiente de cargar</button>'}${manage?`<button class="btn btn-outline" data-edit-document="${escapeHtml(d.id||d.code)}">Modificar</button><button class="btn btn-danger" data-delete-document="${escapeHtml(d.id||d.code)}">Borrar</button>`:''}</div></article>`).join('')||'<div class="card empty">No hay instructivos.</div>'}</div>`;
  };

  // Equipos: edición en la misma fila, status calculado, sin scroll arriba.
  function normalizeEquipmentRecord(r){ r.frequencyDays=Number(r.frequencyDays)||Number(r.frequency)||180; if(r.verificationDate && r.verificationDate!=='N/A') r.nextVerificationDate=addDaysISO(r.verificationDate,r.frequencyDays); if(r.calibrationDate && r.calibrationDate!=='N/A') r.nextCalibrationDate=addDaysISO(r.calibrationDate,r.frequencyDays); return r; }
  window.equipmentStatus=function(r){ normalizeEquipmentRecord(r); const dates=[r.nextCalibrationDate,r.nextVerificationDate].filter(x=>x&&x!=='N/A').sort(); if(!dates.length)return 'SIN FECHA'; const next=dates[0], today=todayISO(), soon=addDaysISO(today,30); return next<today?'VENCIDO':next<=soon?'PRÓXIMO':'VIGENTE'; };
  function equipmentEditRow(r){ const isNew=r.id==='__NEW__'; return `<tr class="equipment-edit-row"><td colspan="10"><div class="inline-editor"><h3>${isNew?'Agregar equipo':'Editar equipo '+escapeHtml(r.id)}</h3><div class="form-grid"><div class="field"><label>ID</label><input id="eqId" value="${isNew?'':escapeHtml(r.id)}" ${isNew?'':'readonly'}></div><div class="field"><label>Tipo</label><input id="eqType" value="${escapeHtml(r.type||'')}"></div><div class="field"><label>Marca / modelo</label><input id="eqBrand" value="${escapeHtml(r.brandModel||'')}"></div><div class="field"><label>Descripción</label><input id="eqDescription" value="${escapeHtml(r.description||'')}"></div><div class="field"><label>Ubicación</label><input id="eqLocation" value="${escapeHtml(r.location||'')}"></div><div class="field"><label>Responsable</label><input id="eqResponsible" value="${escapeHtml(r.responsible||'')}"></div><div class="field"><label>Frecuencia (días)</label><input id="eqFrequency" type="number" value="${escapeHtml(r.frequencyDays||180)}"></div><div class="field"><label>Fecha verificación</label><input id="eqVerification" type="date" value="${r.verificationDate&&r.verificationDate!=='N/A'?r.verificationDate:''}"></div><div class="field"><label>Fecha calibración</label><input id="eqCalibration" type="date" value="${r.calibrationDate&&r.calibrationDate!=='N/A'?r.calibrationDate:''}"></div><div class="field full"><label>Observaciones reales</label><input id="eqObservations" value="${escapeHtml(r.observations||'')}" placeholder="Comentarios opcionales. El estado se calcula automáticamente."></div></div><div class="helper">Próxima verificación/calibración y semáforo se calculan con la frecuencia.</div><div class="button-row" style="margin-top:12px"><button id="saveEquipmentBtn" class="btn btn-primary">Guardar</button>${!isNew?'<button id="deleteEquipmentBtn" class="btn btn-danger">Eliminar</button><button id="verifyTodayBtn" class="btn btn-success">Verificar hoy</button>':''}<button id="closeEquipmentEdit" class="btn btn-secondary">Cerrar</button></div></div></td></tr>`; }
  window.renderEquipment=function(user){ if(!canOperateQuality(user))return noAccess(); const q=(ui.equipmentSearch||'').toLowerCase(), status=ui.equipmentStatus||'TODOS'; const filtered=arr(data.equipmentRecords).filter(r=>(status==='TODOS'||equipmentStatus(r)===status)&&(!q||`${r.id} ${r.type} ${r.brandModel} ${r.location} ${r.responsible}`.toLowerCase().includes(q))); const rows=filtered.slice(0,250), s=equipmentSummary();
    return `<div class="page-head"><div><h2>Verificación de equipos</h2><p>Importe el FO-GC-23, edite en la misma tabla y exporte el seguimiento.</p></div></div><div class="grid grid-4">${metric('Equipos registrados',s.total,'En la base')}${metric('Vigentes',s.current,'Fuera de próximos 30 días','positive')}${metric('Próximos',s.soon,'Vencen en 30 días','warning')}${metric('Vencidos',s.expired,'Requieren seguimiento','critical')}</div><div class="card" style="margin-top:16px"><div class="page-head"><div><h3>Importar Excel FO-GC-23</h3></div><button id="addEquipmentBtn" class="btn btn-primary">＋ Agregar equipo</button></div><div class="form-grid"><div class="field full"><label>Archivo XLSX</label><input id="equipmentFile" type="file" accept=".xlsx,.xls"></div></div><div class="button-row" style="margin-top:12px"><button id="importEquipmentBtn" class="btn btn-primary">Importar y reemplazar lista</button><button id="exportEquipmentCSV" class="btn btn-outline">Exportar CSV</button><button id="exportEquipmentPDF" class="btn btn-outline">Vista previa PDF</button></div></div><div class="filters"><div class="field"><label>Buscar</label><input id="equipmentSearch" value="${escapeHtml(ui.equipmentSearch||'')}"></div><div class="field"><label>Estado</label><select id="equipmentStatus"><option>TODOS</option><option ${status==='VIGENTE'?'selected':''}>VIGENTE</option><option ${status==='PRÓXIMO'?'selected':''}>PRÓXIMO</option><option ${status==='VENCIDO'?'selected':''}>VENCIDO</option><option ${status==='SIN FECHA'?'selected':''}>SIN FECHA</option></select></div></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Equipo</th><th>Marca / modelo</th><th>Ubicación</th><th>Responsable</th><th>Frecuencia</th><th>Próxima calibración</th><th>Próxima verificación</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.equipmentSelectedId==='__NEW__'?equipmentEditRow({id:'__NEW__',frequencyDays:180}):''}${rows.map(r=>{const st=equipmentStatus(r);return `<tr class="${st==='VENCIDO'?'equipment-row-expired':st==='PRÓXIMO'?'equipment-row-soon':''}"><td><strong>${escapeHtml(r.id)}</strong></td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.brandModel)}</td><td>${escapeHtml(r.location)}</td><td>${escapeHtml(r.responsible)}</td><td>${r.frequencyDays||'—'} días</td><td>${escapeHtml(r.nextCalibrationDate||'—')}</td><td>${escapeHtml(r.nextVerificationDate||'—')}</td><td><span class="badge ${st==='VIGENTE'?'badge-green':st==='PRÓXIMO'?'badge-yellow':st==='VENCIDO'?'badge-red':'badge-gray'}">${st}</span></td><td><button class="btn btn-outline" data-edit-equipment="${escapeHtml(r.id)}">Editar</button></td></tr>${ui.equipmentSelectedId===r.id?equipmentEditRow(r):''}`;}).join('')}</tbody></table></div><div class="helper">Mostrando ${rows.length} de ${filtered.length} registros filtrados.</div>`; };
  window.saveEquipmentEdit=function(){ const id=document.getElementById('eqId')?.value.trim(); if(!id){toast('Indique el ID del equipo');return;} let r=arr(data.equipmentRecords).find(x=>x.id===ui.equipmentSelectedId); if(!r){ r={id}; data.equipmentRecords.push(r); } r.id=id; r.type=document.getElementById('eqType')?.value||''; r.brandModel=document.getElementById('eqBrand')?.value||''; r.description=document.getElementById('eqDescription')?.value||''; r.location=document.getElementById('eqLocation')?.value||''; r.responsible=document.getElementById('eqResponsible')?.value||''; r.frequencyDays=Number(document.getElementById('eqFrequency')?.value)||180; r.verificationDate=document.getElementById('eqVerification')?.value||null; r.calibrationDate=document.getElementById('eqCalibration')?.value||null; r.observations=document.getElementById('eqObservations')?.value||''; normalizeEquipmentRecord(r); ui.equipmentSelectedId=null; saveData(); toast('Equipo guardado'); render(); };
  window.verifyEquipmentToday=function(){ const r=arr(data.equipmentRecords).find(x=>x.id===ui.equipmentSelectedId); if(!r)return; r.verificationDate=todayISO(); normalizeEquipmentRecord(r); saveData(); toast('Verificación registrada'); render(); };

  // PDF corporativo + visor antes de descargar.
  function periodLabel(){ return ui.reportMode==='week'?qualityWeekLabel(ui.reportValue):monthName(ui.reportValue||currentMonth()); }
  async function pdfHeader(doc,title,code='FO-CP-10 V07'){ const logo=await imageData('assets/codelpa_logo_red.png'); if(logo)doc.addImage(logo,'PNG',12,8,34,10); doc.setFontSize(9);doc.setTextColor(80);doc.text(`Código: ${code}`,270,13,{align:'right'}); doc.setFontSize(16);doc.setTextColor(10,20,40);doc.text(title,148,22,{align:'center'}); doc.setFontSize(10);doc.text(`${projectInfo().name} · ${periodLabel()}`,148,29,{align:'center'}); doc.setDrawColor(200);doc.line(10,34,287,34); }
  function previewPdf(doc,filename){ const url=doc.output('bloburl'); showFileViewer(url,filename,'application/pdf'); toast('Vista previa generada. Descargue desde el visor si procede.'); }
  async function exportTablePdf(title,filename,headers,rows,code='FO-CP-10 V07'){ const {jsPDF}=window.jspdf; const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}); await pdfHeader(doc,title,code); doc.autoTable({startY:40,head:[headers],body:rows,styles:{fontSize:7,cellPadding:1.8},headStyles:{fillColor:[200,16,46],textColor:255},alternateRowStyles:{fillColor:[248,249,251]},margin:{left:10,right:10}}); previewPdf(doc,filename); }
  window.exportEquipmentPDF=async function(){ const s=equipmentSummary(); const rows=arr(data.equipmentRecords).map(r=>[r.id,r.type,r.brandModel,r.location,r.responsible,`${r.frequencyDays||'—'} días`,r.nextCalibrationDate||'—',r.nextVerificationDate||'—',equipmentStatus(r)]); await exportTablePdf('SEGUIMIENTO, CALIBRACIÓN Y VERIFICACIÓN EQUIPOS',`equipos_${projectInfo().shortCode}.pdf`,['ID','Tipo','Marca / modelo','Ubicación','Responsable','Frecuencia','Próx. calibración','Próx. verificación','Estado'],[[`Total: ${s.total}`,`Vigentes: ${s.current}`,`Próximos: ${s.soon}`,`Vencidos: ${s.expired}`,'','','','',''],...rows],'FO-GC-23 V05'); };
  window.exportInspectionsPDF=async function(){ const rows=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)).map(r=>{const i=r.inspection,v=r.visit,t=r.template,e=userById(i.createdBy),q=userById(v.finishedBy||i.assignedQualityId);return [i.code,i.closureCode||'—',v.number,r.completedDate,t.activity,stageDisplay(t.stage),e?.name||'',q?.name||'',`${round1(v.finalScore)}%`,v.decision||''];}); await exportTablePdf('INSPECCIONES Y VISITAS',`inspecciones_${ui.reportValue}.pdf`,['Código','Cierre','Visita','Fecha','Taller','Etapa','Ejecución','Calidad','Resultado','Decisión'],rows); };
  window.exportMonthlyPDF=async function(){ const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)); const grouped=groupRatings(records,'activityStage'); const rows=grouped.map(r=>[r.activity,stageDisplay(r.stage),r.count,`${round1(r.technical)}%`,`${round1(r.visit)}%`,`${round1(r.average)}%`,`${r.objective}%`,trafficFor(r.average,r.objective)]); await exportTablePdf('RESUMEN DE PLANILLAS Y TALLERES',`talleres_${ui.reportValue}.pdf`,['Actividad','Etapa','Eval.','Técnico','Preparación','Resultado','Objetivo','Semáforo'],rows); };
  window.exportChartsPDF=async function(){ const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)); const grouped=groupRatings(records,'engineer'); const rows=grouped.map(r=>[r.engineer,AREA_LABELS[r.executionArea]||'',r.count,`${round1(r.technical)}%`,`${round1(r.visit)}%`,`${round1(r.average)}%`,`${ENGINEER_TARGET}%`,`${round1(r.firstVisitPct)}%`]); await exportTablePdf('COMPARATIVO POR INGENIEROS',`ingenieros_${ui.reportValue}.pdf`,['Ingeniero','Área','Eval.','Técnico','Preparación','Resultado','Meta','1ra visita'],rows,'FO-CP-11 V10'); };
  window.exportWeakPointsPDF=async function(){ const records=evaluationRecords().filter(r=>periodMatches(r.completedDate,ui.reportMode,ui.reportValue)); const rows=[]; groupRatings(records,'activity').filter(g=>g.average<g.objective).forEach(g=>weaknessStats(records,g.activity).forEach(s=>rows.push([g.activity,stageDisplay(s.stage),s.name,s.failed,s.evaluated,`${round1(s.frequency)}%`,s.pointsLost]))); await exportTablePdf('PUNTOS DÉBILES',`puntos_debiles_${ui.reportValue}.pdf`,['Taller','Etapa','Punto débil','Fallos','Evaluaciones','Frecuencia','Puntos perdidos'],rows); };
  const priorRenderExports=window.renderExports;
  window.renderExports=function(user){ const html=priorRenderExports(user); return html.replace('exportMonthlyPDF','exportMonthlyPDF').replace('exportChartsPDF','exportChartsPDF').replace('Exportar PDF','Vista previa PDF'); };

  // Mapeos: resaltador translúcido que preserva legibilidad.
  window.initAnnotatorCanvas=function(){
    const canvas=document.getElementById('mapCanvas'); if(!canvas)return; const ctx=canvas.getContext('2d'),m=mappingById(ui.requestDraft.mappingId),base=new Image(); const overlay=document.createElement('canvas'); overlay.width=canvas.width; overlay.height=canvas.height; const octx=overlay.getContext('2d'); let baseReady=false;
    function drawBase(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height); const scale=Math.min(canvas.width/base.width,canvas.height/base.height),w=base.width*scale,h=base.height*scale,x=(canvas.width-w)/2,y=(canvas.height-h)/2; ctx.drawImage(base,x,y,w,h); ctx.save(); ctx.globalAlpha=.18; ctx.globalCompositeOperation='multiply'; ctx.drawImage(overlay,0,0); ctx.restore(); }
    base.onload=()=>{baseReady=true; drawBase(); if(ui.requestDraft.annotationData){const ann=new Image();ann.onload=()=>{octx.drawImage(ann,0,0,overlay.width,overlay.height); drawBase();};ann.src=ui.requestDraft.annotationData;}}; base.src=m.file;
    let drawing=false,lastX=0,lastY=0; const point=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];};
    canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);[lastX,lastY]=point(e);});
    canvas.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=point(e);octx.lineCap='round';octx.lineJoin='round';octx.lineWidth=Number(document.getElementById('drawSize').value||12);octx.strokeStyle=document.getElementById('drawColor').value||'#facc15';octx.globalCompositeOperation=ui.annotator.eraser?'destination-out':'source-over';octx.beginPath();octx.moveTo(lastX,lastY);octx.lineTo(x,y);octx.stroke();[lastX,lastY]=[x,y];drawBase();});
    const end=()=>{drawing=false;}; canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    document.getElementById('drawColor').value='#facc15'; document.getElementById('drawSize').value='18'; document.getElementById('eraserBtn').addEventListener('click',()=>{ui.annotator.eraser=!ui.annotator.eraser;document.getElementById('eraserBtn').textContent=ui.annotator.eraser?'Volver a resaltar':'Borrador';}); document.getElementById('clearMapBtn').addEventListener('click',()=>{octx.clearRect(0,0,overlay.width,overlay.height);drawBase();}); document.getElementById('cancelAnnotation').addEventListener('click',()=>{ui.view='newRequest';render();}); document.getElementById('saveAnnotation').addEventListener('click',()=>{const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const outctx=out.getContext('2d');outctx.drawImage(canvas,0,0);ui.requestDraft.annotationData=out.toDataURL('image/png');ui.view='newRequest';toast('Mapeo resaltado guardado');render();});
  };

  // Binder final: evita scroll automático y agrega los nuevos controles.
  const priorBindViewFinal=window.bindView;
  window.bindView=function(user){
    priorBindViewFinal(user);
    document.getElementById('saveProfileBtn')?.addEventListener('click',saveProfile);
    document.getElementById('removeProfilePhotoBtn')?.addEventListener('click',()=>{const u=currentUser(); if(u){delete u.avatarDataUrl; saveData(); render();}});
    document.getElementById('saveProjectBtn')?.addEventListener('click',saveProject);
    document.getElementById('cancelProjectBtn')?.addEventListener('click',()=>{ui.projectSelectedId=null;render();});
    document.querySelectorAll('[data-edit-project]').forEach(b=>b.addEventListener('click',()=>{ui.projectSelectedId=b.dataset.editProject;render();}));
    document.querySelectorAll('[data-edit-user]').forEach(b=>b.addEventListener('click',()=>{ui.userSelectedId=b.dataset.editUser;render();}));
    document.getElementById('saveUserBtn')?.addEventListener('click',saveUserV70);
    document.getElementById('cancelUserBtn')?.addEventListener('click',()=>{ui.userSelectedId=null;render();});
    document.getElementById('cancelDocumentEdit')?.addEventListener('click',()=>{ui.documentSelectedId=null;render();});
    document.querySelectorAll('[data-edit-document]').forEach(b=>b.addEventListener('click',()=>{ui.documentSelectedId=b.dataset.editDocument;render();}));
    document.querySelectorAll('[data-edit-equipment]').forEach(b=>b.addEventListener('click',()=>{ui.equipmentSelectedId=b.dataset.editEquipment;render();}));
    document.getElementById('addEquipmentBtn')?.addEventListener('click',()=>{ui.equipmentSelectedId='__NEW__';render();});
    document.getElementById('saveEquipmentBtn')?.addEventListener('click',saveEquipmentEdit);
    document.getElementById('verifyTodayBtn')?.addEventListener('click',verifyEquipmentToday);
    document.getElementById('closeEquipmentEdit')?.addEventListener('click',()=>{ui.equipmentSelectedId=null;render();});
    document.getElementById('deleteEquipmentBtn')?.addEventListener('click',()=>{if(confirm('¿Eliminar este equipo?')){data.equipmentRecords=arr(data.equipmentRecords).filter(r=>r.id!==ui.equipmentSelectedId);ui.equipmentSelectedId=null;saveData();render();}});
    document.querySelectorAll('[data-quality-stage]').forEach(b=>b.addEventListener('click',()=>{const tmpl=document.getElementById('qualityStageTemplate')?.value;startNewVisit(user,b.dataset.qualityStage,tmpl);}));
    document.getElementById('exportWeakPointsPDF')?.addEventListener('click',exportWeakPointsPDF);
  };

  // Actualizar saveDocument para editar sin saltos y calcular estado.
  const oldSaveDocument=window.saveDocument;
  window.saveDocument=async function(){
    const code=document.getElementById('docCode')?.value.trim(); const version=document.getElementById('docVersion')?.value.trim(); const title=document.getElementById('docTitle')?.value.trim(); const act=document.getElementById('docActivity')?.value; if(!code||!title){toast('Complete código y título');return;}
    const file=document.getElementById('docFile')?.files?.[0]; let dataUrl=null; if(file){ dataUrl= await fileToDataUrl(file, IS_MAIN?20000000:5000000); }
    let d=arr(data.customDocuments).find(x=>(x.id||x.code)===ui.documentSelectedId || x.code===code); if(!d){d={id:`doc-${Date.now()}`}; data.customDocuments.push(d);} Object.assign(d,{projectId:projectId(),code,version,title,activities:[act],status:dataUrl||d.file?'Disponible':'Pendiente de cargar',updatedAt:nowISO()}); if(dataUrl){d.file=dataUrl; d.fileName=file.name; d.fileType=file.type;} ui.documentSelectedId=null; saveData(); toast('Instructivo guardado'); render();
  };

  // Demo login con usuarios nuevos y contraseña propia.
  if(!IS_MAIN){
    window.login=function(){ const email=document.getElementById('loginEmail').value.trim().toLowerCase(),password=document.getElementById('loginPassword').value; const user=data.users.find(u=>String(u.email).toLowerCase()===email&&String(u.password||DEMO_PASSWORD)===password&&u.isActive!==false); if(!user){document.getElementById('loginError').innerHTML='<div class="login-error">Correo o contraseña incorrectos.</div>';return;} localStorage.setItem(SESSION_KEY,JSON.stringify({userId:user.id})); ui.view='home'; render(); };
  }

  // MAIN se inicia al final de v72.js para evitar carreras entre módulos.
  if(!IS_MAIN){ qpcNormalizeState(); loadLoginDirectory(); render(); }
})();
/* Quality Project Control V7.1
   Biblioteca inteligente de instructivos:
   - versiones automáticas (Vigente / Obsoleto)
   - orden alfabético estable
   - eliminación real de registros personalizados y ocultación de referencias base
   - visor por referencia, sin incrustar archivos Base64 completos en el HTML
   - persistencia diferida para evitar bloqueos de interacción
*/
(function(){
  'use strict';

  const MAIN_MODE = Boolean(window.QPC_SUPABASE_URL && typeof supabaseClient !== 'undefined');
  const DOC_BUCKET = typeof ATTACHMENT_BUCKET !== 'undefined' ? ATTACHMENT_BUCKET : 'qpc-attachments';
  let legacyMigrationStarted = false;
  let persistHandle = null;

  function list(value){ return Array.isArray(value) ? value : []; }
  function text(value){ return String(value ?? '').trim(); }
  function normalize(value){
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  }
  function normalizeCode(value){ return normalize(value).replace(/\s+/g,' ').trim(); }
  function versionNumber(value){
    const match = normalize(value).match(/(?:^|\b)V(?:ER(?:SION)?)?\s*0*(\d+)(?:\b|$)/i)
      || normalize(value).match(/(?:^|\b)0*(\d+)(?:\b|$)/);
    return match ? Number(match[1]) : null;
  }
  function documentKey(doc){ return `${normalizeCode(doc.code)}::${normalize(doc.version)}`; }
  function isAvailable(doc){ return Boolean(doc?.storagePath || doc?.file || doc?.publicUrl); }
  function sourceDisplayId(source, rawId){ return `${source}:${rawId}`; }
  function deletedIds(){
    data.deletedDocumentIds = list(data.deletedDocumentIds);
    return new Set(data.deletedDocumentIds.map(String));
  }
  function localeCompare(a,b){
    return text(a).localeCompare(text(b),'es',{sensitivity:'base',numeric:true});
  }

  function buildSmartDocuments(){
    const project = typeof projectId === 'function' ? projectId() : 'LCE';
    const hidden = deletedIds();
    const byKey = new Map();

    list(typeof INSTRUCTIVOS !== 'undefined' ? INSTRUCTIVOS : []).forEach(base=>{
      const rawId = text(base.id || base.code);
      if(hidden.has(rawId)) return;
      const record = {
        ...base,
        projectId: base.projectId || 'LCE',
        _source: 'base',
        _rawId: rawId,
        _displayId: sourceDisplayId('base',rawId)
      };
      if(record.projectId && record.projectId !== project) return;
      byKey.set(documentKey(record),record);
    });

    const customs = list(data?.customDocuments)
      .filter(doc=>!doc.projectId || doc.projectId===project)
      .filter(doc=>!hidden.has(text(doc.id || doc.code)))
      .sort((a,b)=>localeCompare(a.updatedAt,b.updatedAt));

    customs.forEach(custom=>{
      const rawId = text(custom.id || custom.code || `doc-${Date.now()}`);
      byKey.set(documentKey(custom),{
        ...custom,
        _source: 'custom',
        _rawId: rawId,
        _displayId: sourceDisplayId('custom',rawId)
      });
    });

    const rows = [...byKey.values()];
    const groups = new Map();
    rows.forEach(doc=>{
      const code = normalizeCode(doc.code);
      if(!groups.has(code)) groups.set(code,[]);
      groups.get(code).push(doc);
    });

    groups.forEach(group=>{
      const numeric = group.map(doc=>versionNumber(doc.version)).filter(Number.isFinite);
      const newest = numeric.length ? Math.max(...numeric) : null;
      group.forEach(doc=>{
        const number = versionNumber(doc.version);
        let lifecycle;
        if(Number.isFinite(number) && newest!==null){
          lifecycle = number===newest ? 'Vigente' : 'Obsoleto';
        }else if(/PENDIENTE/.test(normalize(doc.version))){
          lifecycle = 'Pendiente de validar';
        }else if(normalize(doc.status)==='OBSOLETO'){
          lifecycle = 'Obsoleto';
        }else{
          lifecycle = 'Vigente';
        }
        doc.lifecycleStatus = lifecycle;
        doc.availabilityStatus = isAvailable(doc) ? 'Disponible' : 'Pendiente de cargar';
        doc.status = lifecycle;
      });
    });

    return rows.sort((a,b)=>{
      const byTitle = localeCompare(a.title,b.title);
      if(byTitle) return byTitle;
      const byCode = localeCompare(a.code,b.code);
      if(byCode) return byCode;
      const av = versionNumber(a.version) ?? -1;
      const bv = versionNumber(b.version) ?? -1;
      if(av!==bv) return bv-av;
      return localeCompare(a.version,b.version);
    });
  }

  window.projectDocuments = buildSmartDocuments;

  function findSmartDocument(displayId){
    return buildSmartDocuments().find(doc=>doc._displayId===displayId) || null;
  }
  function lifecycleBadge(status){
    if(status==='Vigente') return 'badge-green';
    if(status==='Obsoleto') return 'badge-gray';
    return 'badge-yellow';
  }
  function availabilityBadge(status){ return status==='Disponible' ? 'badge-green' : 'badge-yellow'; }
  function activityOptionsV71(selected){
    const activities=[...new Set(list(typeof TEMPLATES!=='undefined'?TEMPLATES:[]).map(t=>t.activity).filter(Boolean))]
      .sort((a,b)=>localeCompare(a,b));
    return `<option value="">Seleccione un taller</option>${activities.map(activity=>`<option value="${escapeHtml(activity)}" ${activity===selected?'selected':''}>${escapeHtml(activity)}</option>`).join('')}`;
  }
  function filteredDocuments(){
    const query = normalize(ui.docSearch || '');
    return buildSmartDocuments().filter(doc=>{
      if(!query) return true;
      return normalize(`${doc.code} ${doc.version} ${doc.title} ${list(doc.activities).join(' ')} ${doc.lifecycleStatus} ${doc.availabilityStatus}`).includes(query);
    });
  }

  window.renderDocuments = function(user){
    const manage = typeof canOperateQuality==='function' && canOperateQuality(user);
    const rows = filteredDocuments();
    const editing = ui.documentSelectedId ? findSmartDocument(ui.documentSelectedId) : null;
    const selectedActivity = list(editing?.activities)[0] || '';

    setTimeout(()=>migrateLegacyDocuments(),0);

    return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Los instructivos se ordenan alfabéticamente y la versión más alta de cada código queda vigente automáticamente.</p></div></div>
      ${manage?`<div class="card library-admin"><h3>${editing?'Modificar instructivo':'Agregar instructivo'}</h3><div class="form-grid">
        <div class="field"><label>Código</label><input id="docCode" value="${escapeHtml(editing?.code||'')}" placeholder="IT-CP-04"></div>
        <div class="field"><label>Versión</label><input id="docVersion" value="${escapeHtml(editing?.version||'')}" placeholder="V09"></div>
        <div class="field full"><label>Título</label><input id="docTitle" value="${escapeHtml(editing?.title||'')}" placeholder="Colocación de Pisos"></div>
        <div class="field"><label>Actividad relacionada</label><select id="docActivity">${activityOptionsV71(selectedActivity)}</select></div>
        <div class="field"><label>Archivo actual</label><input value="${escapeHtml(editing?.availabilityStatus||'Pendiente de cargar')}" readonly></div>
        <div class="field full"><label>Archivo</label><input id="docFile" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"></div>
      </div><div class="button-row" style="margin-top:12px"><button id="saveDocumentBtn" class="btn btn-primary">Guardar instructivo</button>${editing?'<button id="cancelDocumentEditV71" class="btn btn-secondary">Cancelar</button>':''}</div></div>`:''}
      <div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch||'')}" placeholder="Nombre, código, versión o taller..."></div></div>
      <div class="grid grid-3">${rows.map(doc=>`<article class="card doc-card" data-document-card="${escapeHtml(doc._displayId)}"><div>
        <span class="doc-code">${escapeHtml(doc.code)} · ${escapeHtml(doc.version)}</span>
        <h3>${escapeHtml(doc.title)}</h3>
        <div class="document-status-row"><span class="badge ${lifecycleBadge(doc.lifecycleStatus)}">${escapeHtml(doc.lifecycleStatus)}</span><span class="badge ${availabilityBadge(doc.availabilityStatus)}">${escapeHtml(doc.availabilityStatus)}</span></div>
        <div class="tag-list">${list(doc.activities).map(activity=>`<span class="tag">${escapeHtml(activity)}</span>`).join('')}</div>
        ${doc.updatedAt?`<p class="helper">Actualizado: ${formatDateTime(doc.updatedAt)}</p>`:''}
      </div><div class="button-row">
        ${isAvailable(doc)?`<button class="btn btn-primary" data-doc-view="${escapeHtml(doc._displayId)}">Visualizar</button>`:'<button class="btn btn-secondary" disabled>Pendiente de cargar</button>'}
        ${manage?`<button class="btn btn-outline" data-doc-edit="${escapeHtml(doc._displayId)}">Modificar</button><button class="btn btn-danger" data-doc-delete="${escapeHtml(doc._displayId)}">Borrar</button>`:''}
      </div></article>`).join('')||'<div class="card empty">No hay instructivos.</div>'}</div>`;
  };

  function schedulePersist(){
    if(persistHandle){
      if(typeof cancelIdleCallback==='function') cancelIdleCallback(persistHandle);
      else clearTimeout(persistHandle);
    }
    const execute=()=>{ persistHandle=null; try{ saveData(); }catch(error){ console.error(error); toast('No se pudo guardar el cambio'); } };
    persistHandle = typeof requestIdleCallback==='function'
      ? requestIdleCallback(execute,{timeout:1000})
      : setTimeout(execute,80);
  }

  function safeFileName(name){ return text(name||'archivo').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120); }
  function safePathPart(value){ return normalize(value).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'') || 'documento'; }
  async function authUid(){
    const profile = typeof currentUser==='function' ? currentUser() : null;
    if(profile?.authId) return profile.authId;
    if(MAIN_MODE){
      const {data: authData}=await supabaseClient.auth.getUser();
      return authData?.user?.id || null;
    }
    return null;
  }
  async function uploadDocumentBlob(blob,fileName,fileType,code,version){
    if(!MAIN_MODE) return null;
    const uid=await authUid();
    if(!uid) throw new Error('No se pudo identificar al usuario autenticado.');
    const project=typeof projectId==='function'?projectId():'LCE';
    const path=`documents/${uid}/${safePathPart(project)}/${safePathPart(code)}/${safePathPart(version)}/${Date.now()}-${safeFileName(fileName)}`;
    const {error}=await supabaseClient.storage.from(DOC_BUCKET).upload(path,blob,{cacheControl:'3600',upsert:false,contentType:fileType||blob.type||undefined});
    if(error) throw error;
    return {storagePath:path,bucket:DOC_BUCKET,fileName,fileType:fileType||blob.type||'application/octet-stream',fileSize:blob.size};
  }
  function dataUrlToBlob(dataUrl){
    const [meta,payload]=String(dataUrl).split(',');
    const mime=(meta.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';
    const bytes=atob(payload||'');
    const array=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++) array[i]=bytes.charCodeAt(i);
    return new Blob([array],{type:mime});
  }

  async function removeStoredFile(doc){
    if(!MAIN_MODE || !doc?.storagePath) return;
    try{ await supabaseClient.storage.from(doc.bucket||DOC_BUCKET).remove([doc.storagePath]); }
    catch(error){ console.warn('No se pudo eliminar el objeto de Storage:',error); }
  }

  window.saveDocument = async function(){
    const code=text(document.getElementById('docCode')?.value);
    const version=text(document.getElementById('docVersion')?.value)||'V01';
    const title=text(document.getElementById('docTitle')?.value);
    const activity=text(document.getElementById('docActivity')?.value);
    const file=document.getElementById('docFile')?.files?.[0]||null;
    if(!code||!title){ toast('Complete el código y el título'); return; }

    const saveButton=document.getElementById('saveDocumentBtn');
    if(saveButton){saveButton.disabled=true;saveButton.textContent=file?'Cargando archivo...':'Guardando...';}

    try{
      const selected=ui.documentSelectedId?findSmartDocument(ui.documentSelectedId):null;
      let record=null;
      if(selected?._source==='custom') record=list(data.customDocuments).find(doc=>text(doc.id||doc.code)===selected._rawId)||null;
      if(!record && !selected){
        record=list(data.customDocuments).find(doc=>doc.projectId===projectId() && normalizeCode(doc.code)===normalizeCode(code) && normalize(doc.version)===normalize(version))||null;
      }
      if(!record){
        record={id:`DOC-${Date.now()}-${Math.random().toString(36).slice(2,7)}`};
        data.customDocuments.push(record);
      }

      const oldStored={storagePath:record.storagePath,bucket:record.bucket};
      Object.assign(record,{
        projectId:projectId(),code,version,title,activities:activity?[activity]:[],updatedBy:currentUser()?.id||null,updatedAt:nowISO(),note:'Documento administrado desde la plataforma'
      });

      if(file){
        if(MAIN_MODE){
          const uploaded=await uploadDocumentBlob(file,file.name,file.type,code,version);
          Object.assign(record,uploaded);
          delete record.file;
        }else{
          const encoded=await fileToDataUrl(file,5000000);
          if(!encoded) throw new Error('El archivo supera el límite de 5 MB de la versión estática.');
          record.file=encoded;
          record.fileName=file.name; record.fileType=file.type; record.fileSize=file.size;
          delete record.storagePath; delete record.bucket;
        }
      }
      record.status=isAvailable(record)?'Disponible':'Pendiente de cargar';
      ui.documentSelectedId=null;
      render();
      schedulePersist();
      if(file && oldStored.storagePath && oldStored.storagePath!==record.storagePath) setTimeout(()=>removeStoredFile(oldStored),0);
      toast(selected?'Instructivo actualizado':'Instructivo agregado');
    }catch(error){
      console.error(error);
      toast(`No se pudo guardar el instructivo: ${error.message||error}`);
      if(saveButton){saveButton.disabled=false;saveButton.textContent='Guardar instructivo';}
    }
  };

  function confirmation(message){
    return new Promise(resolve=>{
      const existing=document.getElementById('qpcConfirmRoot'); if(existing)existing.remove();
      const root=document.createElement('div'); root.id='qpcConfirmRoot';
      root.innerHTML=`<div class="file-viewer-backdrop"><section class="qpc-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="qpcConfirmTitle"><h3 id="qpcConfirmTitle">Confirmar eliminación</h3><p>${escapeHtml(message)}</p><div class="button-row"><button class="btn btn-secondary" data-confirm-cancel>Cancelar</button><button class="btn btn-danger" data-confirm-accept>Borrar</button></div></section></div>`;
      document.body.appendChild(root);
      const finish=value=>{root.remove();resolve(value);};
      root.querySelector('[data-confirm-cancel]')?.addEventListener('click',()=>finish(false),{once:true});
      root.querySelector('[data-confirm-accept]')?.addEventListener('click',()=>finish(true),{once:true});
      root.querySelector('.file-viewer-backdrop')?.addEventListener('click',event=>{if(event.target.classList.contains('file-viewer-backdrop'))finish(false);},{once:true});
    });
  }

  async function deleteDocument(displayId){
    const doc=findSmartDocument(displayId); if(!doc)return;
    const accepted=await confirmation(`¿Borrar ${doc.code} ${doc.version} · ${doc.title}?`);
    if(!accepted)return;
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));

    if(doc._source==='custom'){
      data.customDocuments=list(data.customDocuments).filter(item=>text(item.id||item.code)!==doc._rawId);
      const matchingBase=list(INSTRUCTIVOS).find(base=>documentKey(base)===documentKey(doc));
      if(matchingBase){
        data.deletedDocumentIds=list(data.deletedDocumentIds);
        if(!data.deletedDocumentIds.includes(text(matchingBase.id||matchingBase.code))) data.deletedDocumentIds.push(text(matchingBase.id||matchingBase.code));
      }
      setTimeout(()=>removeStoredFile(doc),0);
    }else{
      data.deletedDocumentIds=list(data.deletedDocumentIds);
      if(!data.deletedDocumentIds.includes(doc._rawId)) data.deletedDocumentIds.push(doc._rawId);
    }
    if(ui.documentSelectedId===displayId) ui.documentSelectedId=null;
    render();
    schedulePersist();
    toast('Instructivo eliminado');
  }

  async function openDocument(displayId,button){
    const doc=findSmartDocument(displayId); if(!doc)return;
    if(button){button.disabled=true;button.textContent='Cargando...';}
    try{
      let url=doc.file||doc.publicUrl||'';
      if(doc.storagePath && MAIN_MODE){
        const {data:signed,error}=await supabaseClient.storage.from(doc.bucket||DOC_BUCKET).createSignedUrl(doc.storagePath,3600);
        if(error) throw error;
        url=signed?.signedUrl||'';
      }
      if(!url) throw new Error('El archivo no está disponible.');
      showFileViewer(url,doc.fileName||`${doc.code} ${doc.version}`,doc.fileType||'');
    }catch(error){
      console.error(error); toast(`No se pudo visualizar: ${error.message||error}`);
    }finally{
      if(button && button.isConnected){button.disabled=false;button.textContent='Visualizar';}
    }
  }

  async function migrateLegacyDocuments(){
    if(!MAIN_MODE || legacyMigrationStarted || typeof currentUser!=='function' || !currentUser()) return;
    const legacy=list(data.customDocuments).filter(doc=>typeof doc.file==='string' && doc.file.startsWith('data:'));
    if(!legacy.length){legacyMigrationStarted=true;return;}
    legacyMigrationStarted=true;
    let changed=false;
    for(const doc of legacy){
      try{
        const blob=dataUrlToBlob(doc.file);
        const uploaded=await uploadDocumentBlob(blob,doc.fileName||`${safePathPart(doc.code)}-${safePathPart(doc.version)}.bin`,doc.fileType||blob.type,doc.code,doc.version);
        Object.assign(doc,uploaded); delete doc.file; changed=true;
      }catch(error){ console.warn('Migración diferida de instructivo omitida:',doc.code,error); }
    }
    if(changed){ schedulePersist(); if(ui.view==='documents') render(); }
  }

  const priorRenderResources=window.renderResources;
  if(typeof priorRenderResources==='function'){
    window.renderResources=function(inspection,mapping,documents,user){
      const html=priorRenderResources(inspection,mapping,[],user);
      const docHtml=list(documents).map(doc=>`<article class="resource-item"><strong>${escapeHtml(doc.code)} ${escapeHtml(doc.version)}</strong><span>${escapeHtml(doc.title)}</span>${isAvailable(doc)?`<button class="btn btn-primary" data-doc-view="${escapeHtml(doc._displayId)}">Visualizar</button>`:'<button class="btn btn-secondary" disabled>Pendiente de cargar</button>'}</article>`).join('');
      return html.replace(/<\/div>\s*$/,`${docHtml}</div>`);
    };
  }

  const previousBindView=window.bindView;
  window.bindView=function(user){
    previousBindView(user);
    document.getElementById('cancelDocumentEditV71')?.addEventListener('click',()=>{ui.documentSelectedId=null;render();});
    document.querySelectorAll('[data-doc-edit]').forEach(button=>button.addEventListener('click',()=>{
      ui.documentSelectedId=button.dataset.docEdit;
      render();
      requestAnimationFrame(()=>document.querySelector('.library-admin')?.scrollIntoView({block:'nearest',behavior:'smooth'}));
    }));
    document.querySelectorAll('[data-doc-delete]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.docDelete;
      setTimeout(()=>deleteDocument(id),0);
    }));
    document.querySelectorAll('[data-doc-view]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.docView;
      setTimeout(()=>openDocument(id,button),0);
    }));
  };

  setTimeout(()=>{ if(typeof render==='function') render(); },0);
})();
/* Quality Project Control V7.3
   - Edición contextual sin saltos de pantalla
   - Avatar persistente en perfil, cabecera y menú lateral
   - Combobox propio de correos para login
   - Matriz de permisos ampliada + rol Tecnología (IT)
   - Paginación configurable y desplazamiento horizontal superior en todas las tablas
   - CRUD inteligente de mapeos con código automático y almacenamiento privado
   - CRUD de proyectos con bloques, niveles y áreas
*/
(function(){
  'use strict';

  const MAIN_MODE=Boolean(window.QPC_SUPABASE_URL && typeof supabaseClient!=='undefined');
  const STORAGE_BUCKET='qpc-attachments';
  const DEMO_PASSWORD=MAIN_MODE?'12345678':'1234';
  const ALL_ROLES=['EJECUCION','CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'];
  const ROLE_MATRIX={
    EJECUCION:[],
    CALIDAD:['EJECUCION'],
    COORDINADOR_CALIDAD:['EJECUCION','CALIDAD'],
    GERENCIA:['EJECUCION','CALIDAD','COORDINADOR_CALIDAD','GERENCIA'],
    PRESIDENTE:[...ALL_ROLES],
    IT:[...ALL_ROLES]
  };
  ROLE_LABELS.COORDINADOR_CALIDAD='Gerente de Calidad';
  ROLE_LABELS.IT='Tecnología (IT)';

  const list=value=>Array.isArray(value)?value:[];
  const text=value=>String(value??'').trim();
  const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const slug=value=>normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const safeName=value=>text(value||'archivo').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);
  const selectedProject=()=>typeof projectInfo==='function'?projectInfo():{id:'LCE',name:'Lopesan La Ceiba',shortCode:'LLC'};
  const actor=()=>typeof currentUser==='function'?currentUser():null;
  const canManageRole=(user,targetRole)=>Boolean(ROLE_MATRIX[user?.role]?.includes(targetRole));
  const canResetPasswords=user=>['CALIDAD','COORDINADOR_CALIDAD','IT'].includes(user?.role);
  const canManageProjects=user=>['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'].includes(user?.role);
  const canManageMappings=user=>['CALIDAD','COORDINADOR_CALIDAD','IT'].includes(user?.role);
  const htmlAvatar=(user,size=38)=>user?.avatarDataUrl
    ? `<img class="profile-avatar-img qpc-avatar" src="${escapeHtml(user.avatarDataUrl)}" alt="${escapeHtml(user.name||'Usuario')}" style="width:${size}px;height:${size}px">`
    : `<div class="avatar profile-avatar-fallback" style="width:${size}px;height:${size}px">${initials(user?.name||'Usuario')}</div>`;

  function defaultLopesanStructure(){
    const levels=(...names)=>names.map((name,index)=>({id:`LV-${index+1}`,name,areas:[]}));
    return [
      {id:'A',name:'Bloque A',levels:levels('Sótano','Nivel 01','Nivel 02','Nivel 03','Nivel 04')},
      {id:'B',name:'Bloque B',levels:levels('Sótano','Nivel 01','Nivel 02','Nivel 03','Nivel 04','Nivel 05')},
      {id:'C',name:'Bloque C',levels:levels('Nivel 01 · doble altura','Nivel 03','Nivel 04','Nivel 05','Nivel 06')},
      {id:'D',name:'Bloque D',levels:levels('Sótano','Nivel 01','Nivel 02','Nivel 03','Nivel 04','Nivel 05')},
      ...['E','F','G','H','J'].map(id=>({id,name:`Bloque ${id}`,levels:[]}))
    ];
  }

  function ensureProjectStructure(){
    data.projects=list(data.projects);
    data.projects.forEach(project=>{
      project.blocks=list(project.blocks);
      if(project.id==='LCE' && !project.blocks.length) project.blocks=defaultLopesanStructure();
      project.blocks.forEach(block=>{
        block.id=text(block.id||block.name).toUpperCase();
        block.name=block.name||`Bloque ${block.id}`;
        block.levels=list(block.levels);
        block.levels.forEach((level,index)=>{
          level.id=level.id||`LV-${index+1}`;
          level.name=level.name||`Nivel ${String(index+1).padStart(2,'0')}`;
          level.areas=list(level.areas).map(area=>typeof area==='string'?{id:slug(area),name:area}:area);
        });
      });
    });
  }

  const priorNormalize=window.qpcNormalizeState;
  window.qpcNormalizeState=function(){
    if(typeof priorNormalize==='function') priorNormalize();
    ensureProjectStructure();
    data.version='7.3';
    data.deletedMappingIds=list(data.deletedMappingIds);
    data.users=list(data.users);
    data.users.forEach(user=>{
      if(user.avatar_data_url && !user.avatarDataUrl) user.avatarDataUrl=user.avatar_data_url;
    });
    if(!MAIN_MODE && !data.users.some(user=>user.role==='IT')){
      data.users.push({id:'it-1',name:'Tecnología Demo',email:'tecnologia@codelpa.demo',password:'1234',role:'IT',projectIds:list(data.projects).map(project=>project.id),isActive:true});
    }
    return data;
  };

  // Supabase profile mapper: preserve avatar and all role values.
  window.profileToUser=function(profile){
    return {
      id:profile.legacy_id||profile.id,
      authId:profile.id,
      name:profile.full_name||profile.email,
      displayName:profile.full_name||profile.email,
      email:profile.email,
      role:profile.role,
      executionArea:profile.execution_area||null,
      projectIds:list(profile.project_ids).length?profile.project_ids:['LCE'],
      isActive:profile.is_active!==false,
      avatarDataUrl:profile.avatar_data_url||null
    };
  };
  if(MAIN_MODE){
    window.loadProfiles=async function(){
      const {data:profiles,error}=await supabaseClient.from('profiles').select('*').eq('is_active',true);
      if(error)throw error;
      data.users=list(profiles).map(profileToUser);
    };
    window.loadRemoteData=async function(){
      const {data:row,error}=await supabaseClient.from('app_state').select('payload').eq('id',REMOTE_STATE_ID).maybeSingle();
      if(error)throw error;
      const remote=row?.payload;
      data=remote&&typeof remote==='object'?remote:initialData();
      await loadProfiles();
      qpcNormalizeState();
      data.version='7.3';
      if(!row){const {error:insertError}=await supabaseClient.from('app_state').insert({id:REMOTE_STATE_ID,payload:{...data,users:[]}});if(insertError)throw insertError;}
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    };
  }

  // Role permissions and navigation.
  window.qpcCanManageUsers=user=>list(ROLE_MATRIX[user?.role]).length>0;
  window.qpcCanCreateProject=canManageProjects;
  const priorNav=window.navItems;
  window.navItems=function(user){
    let items=priorNav(user);
    if(user.role==='IT') items=[
      ['home','⌂','Inicio'],['qualityQueue','☷','Bandeja de Calidad'],['myInspections','✓','Mis inspecciones'],
      ['ratings','▥','Calificaciones'],['exports','⇩','Exportaciones'],['equipment','⌁','Verificación de equipos'],
      ['documents','▤','Instructivos'],['mappings','▦','Mapeos'],['users','⚙','Usuarios y permisos']
    ];
    if(qpcCanManageUsers(user) && !items.some(item=>item[0]==='users')) items.push(['users','⚙','Usuarios y permisos']);
    return items;
  };
  const priorRenderView=window.renderView;
  window.renderView=function(user){
    if(ui.view==='users' && !qpcCanManageUsers(user)) return noAccess();
    if(ui.view==='projects' && !canManageProjects(user)) return noAccess();
    if(user.role==='IT') return priorRenderView(user);
    return priorRenderView(user);
  };

  // Shell with persistent avatar in sidebar and top bar.
  window.renderShell=function(user){
    const p=selectedProject();
    const inspection=data.inspections?.find(item=>item.id===ui.selectedId);
    const allowed=new Set(navItems(user).map(item=>item[0]).concat(['detail','evaluate','annotateMap','projects','profile']));
    if(!allowed.has(ui.view)) ui.view='home';
    return `<div class="shell"><aside class="sidebar" id="sidebar">
      <div class="brand">${typeof qpcLogo==='function'?qpcLogo('white'):'<img class="brand-logo-img" src="assets/codelpa_logo_white.png" alt="CODELPA">'}<div><strong>QUALITY PROJECT CONTROL</strong><small>CODELPA</small></div></div>
      <div class="user-chip"><div class="user-chip-profile">${htmlAvatar(user,42)}<div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(ROLE_LABELS[user.role]||user.role)}</span></div></div>${user.executionArea?`<span>Área: ${escapeHtml(AREA_LABELS[user.executionArea]||user.executionArea)}</span>`:''}<label class="project-switch-label">Proyecto<select id="activeProjectSelect">${projectOptions(user)}</select></label></div>
      <div class="nav-label">Navegación</div>${navItems(user).map(([id,icon,label])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-nav="${id}"><span>${icon}</span>${label}</button>`).join('')}
      <div class="sidebar-footer">${MAIN_MODE?'':'<button id="resetBtn">Restablecer demo</button>'}<button id="logoutBtn">Cerrar sesión</button></div>
      </aside><main class="main"><header class="topbar"><div class="top-left"><button id="menuBtn" class="mobile-menu">☰</button><div><h1>${viewTitle()}</h1><p>${inspection?escapeHtml(inspection.code):escapeHtml(p.name)}</p></div></div><div class="top-right"><span class="project-pill">${escapeHtml(p.name)}</span><span class="role-pill">${escapeHtml(ROLE_LABELS[user.role]||user.role)}</span>${htmlAvatar(user,42)}</div></header><div class="content">${renderView(user)}</div></main></div><div id="overlay" class="drawer-overlay hidden"></div><div id="qpcViewerRoot"></div>`;
  };

  // Custom login combobox, visually identical across browsers.
  function loginEntries(){
    const source=list(window.qpcLoginDirectory).length?window.qpcLoginDirectory:(data?.users?.length?data.users:USERS);
    return source.filter(item=>item.email && item.isActive!==false && item.is_active!==false)
      .map(item=>({email:text(item.email).toLowerCase(),name:item.full_name||item.name||item.email,role:item.role}))
      .filter((item,index,array)=>array.findIndex(other=>other.email===item.email)===index)
      .sort((a,b)=>a.email.localeCompare(b.email,'es'));
  }
  window.renderLogin=function(){
    return `<div class="login-shell"><section class="login-brand"><div><div class="brand-lockup"><img class="brand-logo-main" src="assets/codelpa_logo_white.png" alt="CODELPA"><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#c9d9e8">Gestión de Calidad de Proyectos</div></div></div><h1>Inspecciones, visitas, equipos y reportes con trazabilidad completa.</h1><p>Acceda con su cuenta autorizada para consultar el proyecto, registrar inspecciones y administrar la información de Calidad.</p><div class="feature-grid"><div class="feature">✓ Desglose por criterio y visita</div><div class="feature">✓ Reportes semanales y mensuales</div><div class="feature">✓ Archivos privados en ${MAIN_MODE?'Supabase':'demo local'}</div><div class="feature">✓ Visor integrado de documentos</div></div></div><div class="login-note">${MAIN_MODE?'Versión principal conectada a Supabase.':'Demo estática para GitHub Pages.'}</div></section>
      <section class="login-panel"><div class="login-card"><img class="form-logo" src="assets/codelpa_logo_red.png" alt="CODELPA"><h2>Iniciar sesión</h2><p>Escriba su correo o selecciónelo desde el listado integrado.</p><div id="loginError"></div>
      <div class="field qpc-combobox"><label for="loginEmail">Correo electrónico</label><div class="qpc-combobox-control"><input id="loginEmail" type="email" name="qpc-login-email" placeholder="usuario@codelpa.demo" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qpcLoginOptions"><button id="loginEmailToggle" type="button" aria-label="Mostrar correos">⌄</button></div><div id="qpcLoginOptions" class="qpc-combobox-menu" role="listbox" hidden></div></div>
      <div class="field" style="margin-top:14px"><label for="loginPassword">Contraseña</label><input id="loginPassword" type="password" name="qpc-login-password" placeholder="••••" autocomplete="off"></div><button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button><div class="login-demo-hint">Para las cuentas terminadas en <strong>.demo</strong>, la contraseña es <strong>${DEMO_PASSWORD}</strong>.</div></div></section></div>`;
  };

  function initLoginCombobox(){
    const input=document.getElementById('loginEmail'),menu=document.getElementById('qpcLoginOptions'),toggle=document.getElementById('loginEmailToggle');
    if(!input||!menu)return;
    let active=-1;
    const draw=(force=false)=>{
      const query=normalize(input.value);
      const matches=loginEntries().filter(item=>!query||normalize(`${item.email} ${item.name} ${ROLE_LABELS[item.role]||item.role}`).includes(query)).slice(0,40);
      menu.innerHTML=matches.map((item,index)=>`<button type="button" class="qpc-combobox-option ${index===active?'active':''}" role="option" data-login-email="${escapeHtml(item.email)}"><strong>${escapeHtml(item.email)}</strong><span>${escapeHtml(ROLE_LABELS[item.role]||item.name||'Usuario')}</span></button>`).join('')||'<div class="qpc-combobox-empty">No hay coincidencias.</div>';
      menu.hidden=!(force||document.activeElement===input||document.activeElement===toggle);
      input.setAttribute('aria-expanded',String(!menu.hidden));
      menu.querySelectorAll('[data-login-email]').forEach(button=>button.addEventListener('mousedown',event=>{
        event.preventDefault(); input.value=button.dataset.loginEmail; menu.hidden=true; input.setAttribute('aria-expanded','false');
        const password=document.getElementById('loginPassword'); if(input.value.endsWith('.demo')&&password&&!password.value)password.value=DEMO_PASSWORD;
        password?.focus();
      }));
    };
    input.addEventListener('focus',()=>draw(true));
    input.addEventListener('input',()=>{active=-1;draw(true);});
    input.addEventListener('keydown',event=>{
      const options=[...menu.querySelectorAll('[data-login-email]')];
      if(event.key==='ArrowDown'){event.preventDefault();active=Math.min(active+1,options.length-1);draw(true);}
      else if(event.key==='ArrowUp'){event.preventDefault();active=Math.max(active-1,0);draw(true);}
      else if(event.key==='Enter'&&active>=0&&options[active]){event.preventDefault();options[active].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));}
      else if(event.key==='Escape'){menu.hidden=true;input.setAttribute('aria-expanded','false');}
    });
    toggle?.addEventListener('click',()=>{input.focus();draw(menu.hidden);});
    if(!window.qpcLoginOutsideBound){
      window.qpcLoginOutsideBound=true;
      document.addEventListener('mousedown',event=>{
        if(event.target.closest('.qpc-combobox'))return;
        const liveMenu=document.getElementById('qpcLoginOptions'),liveInput=document.getElementById('loginEmail');
        if(liveMenu)liveMenu.hidden=true;
        liveInput?.setAttribute('aria-expanded','false');
      });
    }
  }

  // Profile view and persistence.
  function renderProfileV72(user){
    return `<div class="page-head"><div><h2>Mi perfil</h2><p>Actualice su nombre visible y una imagen ligera de perfil.</p></div></div><div class="card profile-card"><div class="profile-preview">${htmlAvatar(user,92)}</div><div class="form-grid"><div class="field"><label>Nombre visible</label><input id="profileName" value="${escapeHtml(user.name||'')}"></div><div class="field"><label>Correo</label><input value="${escapeHtml(user.email||'')}" readonly></div><div class="field"><label>Rol</label><input value="${escapeHtml(ROLE_LABELS[user.role]||user.role)}" readonly></div><div class="field"><label>Imagen de perfil</label><input id="profilePhoto" type="file" accept="image/*"></div></div><div class="button-row profile-actions"><button id="saveProfileBtn" class="btn btn-primary">Guardar perfil</button><button id="removeProfilePhotoBtn" class="btn btn-outline">Restaurar imagen</button></div></div><div class="alert alert-info" style="margin-top:16px">Las imágenes se reducen antes de guardarse. El cambio o restablecimiento de contraseñas se gestiona desde Usuarios y permisos.</div>`;
  }
  const renderViewWithProfile=window.renderView;
  window.renderView=function(user){ if(ui.view==='profile')return renderProfileV72(user); return renderViewWithProfile(user); };
  async function compressAvatar(file,max=192){
    return new Promise(resolve=>{
      if(!file)return resolve(null); const reader=new FileReader(); const image=new Image();
      reader.onload=()=>{image.onload=()=>{const scale=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.72));};image.onerror=()=>resolve(null);image.src=reader.result;};
      reader.onerror=()=>resolve(null);reader.readAsDataURL(file);
    });
  }
  async function saveProfileV72(remove=false){
    const user=actor(); if(!user)return; const y=window.scrollY; const name=text(document.getElementById('profileName')?.value)||user.name;
    let avatar=remove?null:user.avatarDataUrl||null; const file=document.getElementById('profilePhoto')?.files?.[0]; if(file)avatar=await compressAvatar(file);
    user.name=name;user.displayName=name;user.avatarDataUrl=avatar;
    if(MAIN_MODE&&user.authId){
      const {error}=await supabaseClient.from('profiles').update({full_name:name,avatar_data_url:avatar,updated_at:new Date().toISOString()}).eq('id',user.authId);
      if(error){toast(`No se pudo guardar el perfil: ${error.message}`);return;}
      const directory=list(window.qpcLoginDirectory);const entry=directory.find(item=>normalize(item.email)===normalize(user.email));if(entry)entry.full_name=name;
    }
    saveData();toast(remove?'Imagen restaurada':'Perfil actualizado');renderAt(y);
  }

  // User management with role hierarchy and inline editor.
  function rolesFor(user){return list(ROLE_MATRIX[user?.role]);}
  function roleOptionsV72(current){return rolesFor(actor()).map(role=>`<option value="${role}" ${current===role?'selected':''}>${escapeHtml(ROLE_LABELS[role]||role)}</option>`).join('');}
  function projectChecks(selected=[]){const set=new Set(selected);return list(data.projects).filter(project=>project.isActive!==false).map(project=>`<label class="check-row"><input type="checkbox" class="usrProject" value="${escapeHtml(project.id)}" ${set.has(project.id)?'checked':''}><span>${escapeHtml(project.name)}</span></label>`).join('');}
  function userEditorV72(user={}){
    const editing=Boolean(user.id),passwordAllowed=!editing||canResetPasswords(actor());
    return `<div class="inline-editor user-inline-editor"><h3>${editing?`Editar ${escapeHtml(user.name)}`:'Crear usuario'}</h3><div class="form-grid"><div class="field"><label>Nombre</label><input id="usrName" value="${escapeHtml(user.name||'')}"></div><div class="field"><label>Correo</label><input id="usrEmail" type="email" value="${escapeHtml(user.email||'')}" ${editing?'readonly':''}></div><div class="field"><label>${editing?'Contraseña nueva / restaurar':'Contraseña inicial'}</label><input id="usrPassword" type="password" ${passwordAllowed?'': 'disabled'} placeholder="${passwordAllowed?(editing?'Dejar vacío si no cambia':'Contraseña inicial'):'Solo Calidad o IT puede restaurarla'}"></div><div class="field"><label>Rol</label><select id="usrRole">${roleOptionsV72(user.role||rolesFor(actor())[0]||'EJECUCION')}</select></div><div class="field"><label>Área</label><select id="usrArea"><option value="">No aplica</option><option value="TERMINACION" ${user.executionArea==='TERMINACION'?'selected':''}>Terminación</option><option value="ESTRUCTURA" ${user.executionArea==='ESTRUCTURA'?'selected':''}>Estructura</option></select></div><div class="field full"><label>Proyectos permitidos</label><div class="project-checks">${projectChecks(user.projectIds||[projectId()])}</div></div><div class="field full"><label class="check-row"><input id="usrActive" type="checkbox" ${user.isActive===false?'':'checked'}><span>Usuario activo</span></label></div></div><div class="button-row" style="margin-top:12px"><button id="saveUserBtn" class="btn btn-primary">${editing?'Guardar cambios':'Crear usuario'}</button><button id="cancelUserBtn" class="btn btn-secondary">Cancelar</button></div>${editing&&!passwordAllowed?'<div class="helper">Puede modificar el perfil y permisos, pero el restablecimiento de contraseña está reservado a Calidad e IT.</div>':''}</div>`;
  }
  window.renderUsers=function(user){
    if(!qpcCanManageUsers(user))return noAccess();
    const rows=list(data.users).filter(item=>ALL_ROLES.includes(item.role)).sort((a,b)=>a.name.localeCompare(b.name,'es'));
    return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>Los roles disponibles dependen de la cuenta que realiza la gestión.</p></div><div class="button-row"><button id="addUserBtn" class="btn btn-primary">＋ Crear usuario</button>${canManageProjects(user)?'<button class="btn btn-outline" data-nav="projects">Gestionar proyectos</button>':''}</div></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyectos</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.userSelectedId==='__NEW__'?`<tr class="inline-edit-table-row"><td colspan="7">${userEditorV72({})}</td></tr>`:''}${rows.map(record=>`<tr data-user-row="${escapeHtml(record.id)}"><td><div class="table-user-cell">${htmlAvatar(record,34)}<span>${escapeHtml(record.name)}</span></div></td><td>${escapeHtml(record.email)}</td><td>${escapeHtml(ROLE_LABELS[record.role]||record.role)}</td><td>${escapeHtml(AREA_LABELS[record.executionArea]||'—')}</td><td>${escapeHtml(list(record.projectIds).map(id=>data.projects.find(p=>p.id===id)?.name||id).join(', '))}</td><td>${record.isActive===false?'Inactivo':'Activo'}</td><td>${canManageRole(user,record.role)?`<button class="btn btn-outline" data-edit-user="${escapeHtml(record.id)}">Editar</button>`:'—'}</td></tr>${ui.userSelectedId===record.id?`<tr class="inline-edit-table-row"><td colspan="7">${userEditorV72(record)}</td></tr>`:''}`).join('')}</tbody></table></div>`;
  };
  async function saveUserV72(){
    const current=actor(),selected=data.users.find(user=>user.id===ui.userSelectedId);const role=document.getElementById('usrRole')?.value;
    if(!canManageRole(current,role)){toast('Su cuenta no puede administrar ese rol.');return;}
    const name=text(document.getElementById('usrName')?.value),email=text(document.getElementById('usrEmail')?.value).toLowerCase(),password=document.getElementById('usrPassword')?.value||'',projects=[...document.querySelectorAll('.usrProject:checked')].map(input=>input.value);
    if(!name||!email){toast('Complete nombre y correo.');return;}if(!selected&&!password){toast('Indique la contraseña inicial.');return;}if(selected&&password&&!canResetPasswords(current)){toast('Solo Calidad o IT puede restablecer contraseñas.');return;}
    const payload={email,password,full_name:name,role,execution_area:document.getElementById('usrArea')?.value||null,project_ids:projects.length?projects:[projectId()],is_active:document.getElementById('usrActive')?.checked!==false,legacy_id:selected?.id||`usr-${Date.now()}`,auth_id:selected?.authId||null,mode:selected?'update':'create'};
    let record=selected;
    if(MAIN_MODE){
      try{
        const {data:result,error}=await supabaseClient.functions.invoke('admin-create-user',{body:payload});
        if(error){
          let detail=error.message||'La Edge Function devolvió un error.';
          try{
            if(error.context && typeof error.context.clone==='function'){
              const responsePayload=await error.context.clone().json();
              detail=responsePayload?.error||detail;
              if(responsePayload?.stage)detail+=` [${responsePayload.stage}]`;
            }
          }catch(_ignored){}
          throw new Error(detail);
        }
        if(result?.error)throw new Error(`${result.error}${result.stage?` [${result.stage}]`:''}`);
        const profile=result.profile||{};record=record||{id:profile.legacy_id||payload.legacy_id};Object.assign(record,{id:profile.legacy_id||payload.legacy_id,authId:profile.id,name:profile.full_name||name,email:profile.email||email,role:profile.role||role,executionArea:profile.execution_area||payload.execution_area,projectIds:profile.project_ids||payload.project_ids,isActive:profile.is_active!==false,avatarDataUrl:profile.avatar_data_url||record?.avatarDataUrl||null});
      }catch(error){console.error(error);toast(`No se pudo guardar el usuario: ${error.message||error}`);return;}
    }else{
      record=record||{id:payload.legacy_id};Object.assign(record,{name,email,password:password||record.password||DEMO_PASSWORD,role,executionArea:payload.execution_area,projectIds:payload.project_ids,isActive:payload.is_active});
    }
    if(!data.users.some(user=>user.id===record.id))data.users.push(record);
    const directory=list(window.qpcLoginDirectory);const entry=directory.find(item=>normalize(item.email)===normalize(email));const newEntry={email,full_name:name,role,is_active:payload.is_active};if(entry)Object.assign(entry,newEntry);else directory.push(newEntry);window.qpcLoginDirectory=directory;
    const y=window.scrollY;ui.userSelectedId=null;saveData();toast('Usuario guardado');renderAt(y);
  }

  // Projects: full CRUD and structure builder.
  function blankProject(){return {id:'',name:'',shortCode:'',isActive:true,blocks:[]};}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function ensureProjectDraft(project){if(!ui.projectDraft||ui.projectDraftSource!==project?.id){ui.projectDraft=clone(project||blankProject());ui.projectDraftSource=project?.id||'__NEW__';}return ui.projectDraft;}
  function structureEditor(draft){
    return `<div class="project-structure"><div class="section-title"><div><h3>Estructura del proyecto</h3><p class="helper">Defina bloques, niveles y áreas. Las áreas se separan por comas.</p></div><button id="addProjectBlockBtn" class="btn btn-outline" type="button">＋ Agregar bloque</button></div>${list(draft.blocks).map((block,bIndex)=>`<section class="project-block" data-block-index="${bIndex}"><div class="project-block-head"><div class="field"><label>ID / sigla del bloque</label><input data-block-id="${bIndex}" value="${escapeHtml(block.id||'')}"></div><div class="field"><label>Nombre visible</label><input data-block-name="${bIndex}" value="${escapeHtml(block.name||'')}"></div><button class="btn btn-danger" type="button" data-delete-block="${bIndex}">Eliminar bloque</button></div><div class="project-levels">${list(block.levels).map((level,lIndex)=>`<div class="project-level"><div class="field"><label>Nivel</label><input data-level-name="${bIndex}:${lIndex}" value="${escapeHtml(level.name||'')}"></div><div class="field"><label>Áreas de este nivel</label><input data-level-areas="${bIndex}:${lIndex}" value="${escapeHtml(list(level.areas).map(area=>area.name||area).join(', '))}" placeholder="Habitación 2101, Pasillo, Baño"></div><button class="btn btn-danger" type="button" data-delete-level="${bIndex}:${lIndex}">Quitar nivel</button></div>`).join('')}</div><button class="btn btn-outline" type="button" data-add-level="${bIndex}">＋ Agregar nivel</button></section>`).join('')||'<div class="empty">Agregue el primer bloque para comenzar.</div>'}</div>`;
  }
  function projectEditorV72(project){const draft=ensureProjectDraft(project);const editing=Boolean(project?.id);return `<div class="inline-editor project-inline-editor"><h3>${editing?'Editar proyecto':'Crear proyecto'}</h3><div class="form-grid"><div class="field"><label>Nombre completo</label><input id="projectName" value="${escapeHtml(draft.name||'')}"></div><div class="field"><label>Abreviatura para códigos</label><input id="projectShort" value="${escapeHtml(draft.shortCode||'')}" placeholder="LLC"></div><div class="field"><label>ID interno</label><input id="projectIdField" value="${escapeHtml(draft.id||'')}" placeholder="LCE" ${editing?'readonly':''}></div><div class="field"><label class="check-row"><input id="projectActive" type="checkbox" ${draft.isActive===false?'':'checked'}><span>Proyecto activo</span></label></div></div>${structureEditor(draft)}<div class="button-row" style="margin-top:16px"><button id="saveProjectBtn" class="btn btn-primary">Guardar proyecto</button>${editing?'<button id="deleteProjectBtn" class="btn btn-danger">Eliminar proyecto</button>':''}<button id="cancelProjectBtn" class="btn btn-secondary">Cancelar</button></div></div>`;}
  window.renderProjects=function(user){
    if(!canManageProjects(user))return noAccess();const projects=list(data.projects).slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
    return `<div class="page-head"><div><h2>Proyectos</h2><p>Configure desde cero los bloques, niveles y áreas propios de cada proyecto.</p></div><button id="addProjectBtn" class="btn btn-primary">＋ Crear proyecto</button></div><div class="table-wrap"><table><thead><tr><th>Nombre completo</th><th>Abreviatura</th><th>ID</th><th>Bloques</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.projectSelectedId==='__NEW__'?`<tr class="inline-edit-table-row"><td colspan="6">${projectEditorV72(null)}</td></tr>`:''}${projects.map(project=>`<tr><td>${escapeHtml(project.name)}</td><td>${escapeHtml(project.shortCode||'')}</td><td>${escapeHtml(project.id)}</td><td>${list(project.blocks).length}</td><td>${project.isActive===false?'Inactivo':'Activo'}</td><td><button class="btn btn-outline" data-edit-project="${escapeHtml(project.id)}">Editar</button></td></tr>${ui.projectSelectedId===project.id?`<tr class="inline-edit-table-row"><td colspan="6">${projectEditorV72(project)}</td></tr>`:''}`).join('')}</tbody></table></div>`;
  };
  function syncProjectDraftInputs(){
    const draft=ui.projectDraft;if(!draft)return;draft.name=text(document.getElementById('projectName')?.value);draft.shortCode=text(document.getElementById('projectShort')?.value).toUpperCase();draft.id=text(document.getElementById('projectIdField')?.value).toUpperCase();draft.isActive=document.getElementById('projectActive')?.checked!==false;
    document.querySelectorAll('[data-block-id]').forEach(input=>{const index=Number(input.dataset.blockId);if(draft.blocks[index])draft.blocks[index].id=text(input.value).toUpperCase();});
    document.querySelectorAll('[data-block-name]').forEach(input=>{const index=Number(input.dataset.blockName);if(draft.blocks[index])draft.blocks[index].name=text(input.value);});
    document.querySelectorAll('[data-level-name]').forEach(input=>{const [b,l]=input.dataset.levelName.split(':').map(Number);if(draft.blocks[b]?.levels[l])draft.blocks[b].levels[l].name=text(input.value);});
    document.querySelectorAll('[data-level-areas]').forEach(input=>{const [b,l]=input.dataset.levelAreas.split(':').map(Number);if(draft.blocks[b]?.levels[l])draft.blocks[b].levels[l].areas=text(input.value).split(',').map(name=>text(name)).filter(Boolean).map(name=>({id:slug(name),name}));});
  }
  function mutateProjectDraft(mutator){syncProjectDraftInputs();mutator(ui.projectDraft);renderAt(window.scrollY);}
  function saveProjectV72(){syncProjectDraftInputs();const draft=ui.projectDraft;if(!draft?.name||!draft?.id){toast('Complete nombre e ID del proyecto.');return;}let project=data.projects.find(item=>item.id===ui.projectSelectedId||item.id===draft.id);if(!project){project={};data.projects.push(project);}Object.assign(project,clone(draft));project.shortCode=project.shortCode||project.id;const y=window.scrollY;ui.projectSelectedId=null;ui.projectDraft=null;ui.projectDraftSource=null;saveData();toast('Proyecto guardado');renderAt(y);}
  function deleteProjectV72(){const id=ui.projectSelectedId;if(!id)return;if(data.projects.length<=1){toast('Debe conservar al menos un proyecto.');return;}data.projects=data.projects.filter(project=>project.id!==id);data.users.forEach(user=>{user.projectIds=list(user.projectIds).filter(projectId=>projectId!==id);});if(projectId()===id)ui.activeProjectId=data.projects[0]?.id;const y=window.scrollY;ui.projectSelectedId=null;ui.projectDraft=null;saveData();toast('Proyecto eliminado');renderAt(y);}

  // Equipment page size and safe overwrite by ID.
  ui.equipmentPageSize=ui.equipmentPageSize||250;
  function equipmentEditorRow(record){
    const isNew=record.id==='__NEW__';return `<tr class="equipment-edit-row"><td colspan="10"><div class="inline-editor"><h3>${isNew?'Agregar equipo':`Editar equipo ${escapeHtml(record.id)}`}</h3><div class="form-grid"><div class="field"><label>ID</label><input id="eqId" value="${isNew?'':escapeHtml(record.id)}"></div><div class="field"><label>Tipo</label><input id="eqType" value="${escapeHtml(record.type||'')}"></div><div class="field"><label>Marca / modelo</label><input id="eqBrand" value="${escapeHtml(record.brandModel||'')}"></div><div class="field"><label>Descripción</label><input id="eqDescription" value="${escapeHtml(record.description||'')}"></div><div class="field"><label>Ubicación</label><input id="eqLocation" value="${escapeHtml(record.location||'')}"></div><div class="field"><label>Responsable</label><input id="eqResponsible" value="${escapeHtml(record.responsible||'')}"></div><div class="field"><label>Frecuencia (días)</label><input id="eqFrequency" type="number" min="1" value="${escapeHtml(record.frequencyDays||180)}"></div><div class="field"><label>Fecha verificación</label><input id="eqVerification" type="date" value="${record.verificationDate&&record.verificationDate!=='N/A'?record.verificationDate:''}"></div><div class="field"><label>Fecha calibración</label><input id="eqCalibration" type="date" value="${record.calibrationDate&&record.calibrationDate!=='N/A'?record.calibrationDate:''}"></div><div class="field full"><label>Observaciones reales</label><input id="eqObservations" value="${escapeHtml(record.observations||'')}" placeholder="El estado se calcula automáticamente."></div></div><div class="button-row" style="margin-top:12px"><button id="saveEquipmentBtn" class="btn btn-primary">Guardar</button>${!isNew?'<button id="deleteEquipmentBtn" class="btn btn-danger">Eliminar</button><button id="verifyTodayBtn" class="btn btn-success">Verificar hoy</button>':''}<button id="closeEquipmentEdit" class="btn btn-secondary">Cerrar</button></div></div></td></tr>`;
  }
  window.renderEquipment=function(user){
    if(!canOperateQuality(user)&&user.role!=='IT')return noAccess();const q=normalize(ui.equipmentSearch),status=ui.equipmentStatus||'TODOS',filtered=list(data.equipmentRecords).filter(record=>(status==='TODOS'||equipmentStatus(record)===status)&&(!q||normalize(`${record.id} ${record.type} ${record.brandModel} ${record.location} ${record.responsible}`).includes(q)));const pageSize=ui.equipmentPageSize==='ALL'?filtered.length:Number(ui.equipmentPageSize)||250,rows=filtered.slice(0,pageSize),summary=equipmentSummary();
    return `<div class="page-head"><div><h2>Verificación de equipos</h2><p>Importe el FO-GC-23, edite en la misma fila y controle la cantidad visible.</p></div></div><div class="grid grid-4">${metric('Equipos registrados',summary.total,'En la base')}${metric('Vigentes',summary.current,'Fuera de próximos 30 días','positive')}${metric('Próximos',summary.soon,'Vencen en 30 días','warning')}${metric('Vencidos',summary.expired,'Requieren seguimiento','critical')}</div><div class="card" style="margin-top:16px"><div class="page-head"><div><h3>Importar Excel FO-GC-23</h3></div><button id="addEquipmentBtn" class="btn btn-primary">＋ Agregar equipo</button></div><div class="form-grid"><div class="field full"><label>Archivo XLSX</label><input id="equipmentFile" type="file" accept=".xlsx,.xls"></div></div><div class="button-row" style="margin-top:12px"><button id="importEquipmentBtn" class="btn btn-primary">Importar y reemplazar lista</button><button id="exportEquipmentCSV" class="btn btn-outline">Exportar CSV</button><button id="exportEquipmentPDF" class="btn btn-outline">Vista previa PDF</button></div></div><div class="filters"><div class="field"><label>Buscar</label><input id="equipmentSearch" value="${escapeHtml(ui.equipmentSearch||'')}"></div><div class="field"><label>Estado</label><select id="equipmentStatus"><option>TODOS</option>${['VIGENTE','PRÓXIMO','VENCIDO','SIN FECHA'].map(item=>`<option ${status===item?'selected':''}>${item}</option>`).join('')}</select></div><div class="field"><label>Registros visibles</label><select id="equipmentPageSize">${[50,100,250,500].map(size=>`<option value="${size}" ${String(ui.equipmentPageSize)===String(size)?'selected':''}>${size}</option>`).join('')}<option value="ALL" ${ui.equipmentPageSize==='ALL'?'selected':''}>Todos (${filtered.length})</option></select></div></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Equipo</th><th>Marca / modelo</th><th>Ubicación</th><th>Responsable</th><th>Frecuencia</th><th>Próxima calibración</th><th>Próxima verificación</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.equipmentSelectedId==='__NEW__'?equipmentEditorRow({id:'__NEW__',frequencyDays:180}):''}${rows.map(record=>{const state=equipmentStatus(record);return `<tr class="${state==='VENCIDO'?'equipment-row-expired':state==='PRÓXIMO'?'equipment-row-soon':''}"><td><strong>${escapeHtml(record.id)}</strong></td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.brandModel)}</td><td>${escapeHtml(record.location)}</td><td>${escapeHtml(record.responsible)}</td><td>${record.frequencyDays||'—'} días</td><td>${escapeHtml(record.nextCalibrationDate||'—')}</td><td>${escapeHtml(record.nextVerificationDate||'—')}</td><td><span class="badge ${state==='VIGENTE'?'badge-green':state==='PRÓXIMO'?'badge-yellow':state==='VENCIDO'?'badge-red':'badge-gray'}">${state}</span></td><td><button class="btn btn-outline" data-edit-equipment="${escapeHtml(record.id)}">Editar</button></td></tr>${ui.equipmentSelectedId===record.id?equipmentEditorRow(record):''}`;}).join('')}</tbody></table></div><div class="helper">Mostrando ${rows.length} de ${filtered.length} registros filtrados.</div>`;
  };
  function saveEquipmentV72(){
    const id=text(document.getElementById('eqId')?.value);if(!id){toast('Indique el ID del equipo.');return;}let record=data.equipmentRecords.find(item=>item.id===ui.equipmentSelectedId);const sameId=data.equipmentRecords.find(item=>normalize(item.id)===normalize(id));if(!record)record=sameId;if(!record){record={id};data.equipmentRecords.push(record);}else if(sameId&&sameId!==record){Object.assign(sameId,record);data.equipmentRecords=data.equipmentRecords.filter(item=>item===sameId||item!==record);record=sameId;}
    Object.assign(record,{id,type:text(document.getElementById('eqType')?.value),brandModel:text(document.getElementById('eqBrand')?.value),description:text(document.getElementById('eqDescription')?.value),location:text(document.getElementById('eqLocation')?.value),responsible:text(document.getElementById('eqResponsible')?.value),frequencyDays:Number(document.getElementById('eqFrequency')?.value)||180,verificationDate:document.getElementById('eqVerification')?.value||null,calibrationDate:document.getElementById('eqCalibration')?.value||null,observations:text(document.getElementById('eqObservations')?.value)});equipmentStatus(record);const y=window.scrollY;ui.equipmentSelectedId=null;saveData();toast(sameId?'Equipo actualizado':'Equipo guardado');renderAt(y);
  }

  // Mapping CRUD with automatic code/version and project selectors.
  function currentProject(){ensureProjectStructure();return data.projects.find(project=>project.id===projectId())||data.projects[0];}
  function levelCode(name){const clean=normalize(name);if(clean.includes('sotano')){const n=(clean.match(/\d+/)||['1'])[0];return `S${String(n).padStart(2,'0')}`;}const n=(clean.match(/\d+/)||['1'])[0];return `N${String(n).padStart(2,'0')}`;}
  function mappingCode(block,level){const project=currentProject();return `MAP-${text(project.shortCode||project.id).toUpperCase()}-${text(block).toUpperCase().replace(/\s+/g,'')}-${levelCode(level)}`;}
  function versionNumber(version){return Number((text(version).match(/\d+/)||['0'])[0]);}
  function mappingIdentity(mapping){return [mapping.projectId||'LCE',normalize(mapping.block),normalize(mapping.level),normalize(mapping.area)].join('|');}
  function allMappingsSmart(){
    const deleted=new Set(list(data.deletedMappingIds));const base=(projectId()==='LCE'?list(MAPEOS):[]).filter(map=>!deleted.has(text(map.id))).map(map=>({...map,projectId:'LCE',_source:'base'}));const custom=list(data.customMappings).filter(map=>(map.projectId||'LCE')===projectId()).map(map=>({...map,_source:'custom'}));const winners=new Map();[...base,...custom].forEach(map=>{const key=mappingIdentity(map),prior=winners.get(key);if(!prior||versionNumber(map.version)>versionNumber(prior.version)||map._source==='custom')winners.set(key,map);});return [...winners.values()].sort((a,b)=>`${a.title||a.area} ${a.code}`.localeCompare(`${b.title||b.area} ${b.code}`,'es'));
  }
  window.projectMappings=allMappingsSmart;
  window.mappingById=function(id){return [...list(MAPEOS),...list(data.customMappings)].find(map=>text(map.id)===text(id));};
  function options(items,valueFn,labelFn,selected){return items.map(item=>`<option value="${escapeHtml(valueFn(item))}" ${valueFn(item)===selected?'selected':''}>${escapeHtml(labelFn(item))}</option>`).join('');}
  function mapEditor(mapping={}){
    const project=currentProject(),blocks=list(project.blocks),blockValue=mapping.block||blocks[0]?.id||'',block=blocks.find(item=>item.id===blockValue||item.name===blockValue)||blocks[0],levels=list(block?.levels),levelValue=mapping.level||levels[0]?.name||'',level=levels.find(item=>item.name===levelValue)||levels[0],areas=list(level?.areas),areaValue=mapping.area||areas[0]?.name||'';const code=mappingCode(block?.id||blockValue,level?.name||levelValue),version=mapping.version||`V${String(Math.max(0,...allMappingsSmart().filter(item=>mappingIdentity(item)===mappingIdentity({projectId:project.id,block:block?.id,level:level?.name,area:areaValue})).map(item=>versionNumber(item.version)))+1).padStart(2,'0')}`;
    return `<div class="inline-editor mapping-inline-editor"><h3>${mapping.id?'Modificar mapeo':'Agregar mapeo'}</h3><div class="form-grid"><div class="field"><label>Bloque</label><select id="mapBlock">${options(blocks,item=>item.id,item=>item.name,block?.id)}</select></div><div class="field"><label>Nivel</label><select id="mapLevel">${options(levels,item=>item.name,item=>item.name,level?.name)}</select></div><div class="field"><label>Área</label>${areas.length?`<select id="mapArea">${options(areas,item=>item.name||item,item=>item.name||item,areaValue)}</select>`:`<input id="mapArea" value="${escapeHtml(areaValue)}" placeholder="Habitación 2101">`}</div><div class="field"><label>Versión</label><input id="mapVersion" value="${escapeHtml(version)}" placeholder="V01"></div><div class="field full"><label>Código generado</label><input id="mapCode" value="${escapeHtml(code)}" readonly></div><div class="field full"><label>Imagen o PDF del mapeo</label><input id="mapFile" type="file" accept="image/*,.svg,.pdf"></div></div><div class="button-row" style="margin-top:12px"><button id="saveMappingBtn" class="btn btn-primary">Guardar mapeo</button>${mapping.id?'<button id="deleteMappingBtn" class="btn btn-danger">Borrar mapeo</button>':''}<button id="cancelMappingBtn" class="btn btn-secondary">Cancelar</button></div></div>`;
  }
  window.renderMappings=function(user){
    const manage=canManageMappings(user),rows=allMappingsSmart().filter(map=>!ui.mapSearch||normalize(`${map.code} ${map.block} ${map.level} ${map.area} ${map.title}`).includes(normalize(ui.mapSearch))),selected=mappingById(ui.mappingSelectedId);
    return `<div class="page-head"><div><h2>Biblioteca de mapeos</h2><p>Los códigos se generan con proyecto, bloque y nivel. Modificar actualiza el mapeo correspondiente.</p></div>${manage?'<button id="addMappingBtn" class="btn btn-primary">＋ Agregar mapeo</button>':''}</div>${ui.mappingSelectedId==='__NEW__'?mapEditor(ui.mappingDraft||{}):''}<div class="filters"><div class="field full"><label>Buscar mapeo</label><input id="mapSearch" value="${escapeHtml(ui.mapSearch||'')}" placeholder="Bloque, nivel, habitación, código..."></div></div><div class="grid grid-3">${rows.map(map=>`<article class="card map-card">${(map.file||map.thumbnailDataUrl)?`<img src="${escapeHtml(map.file||map.thumbnailDataUrl)}" alt="${escapeHtml(map.title||map.area)}">`:`<div class="map-file-placeholder">${escapeHtml((map.fileType||'ARCHIVO').includes('pdf')?'PDF':'MAPEO')}</div>`}<div class="body"><h3>${escapeHtml(map.title||`Mapeo ${map.area}`)}</h3><div class="helper">${escapeHtml(map.code)} · ${escapeHtml(map.version||'V01')}</div><div class="tag-list"><span class="tag">${escapeHtml(map.block)}</span><span class="tag">${escapeHtml(map.level)}</span><span class="tag">${escapeHtml(map.area)}</span></div><div class="button-row" style="margin-top:12px"><button class="btn btn-outline" data-view-mapping="${escapeHtml(map.id)}">Ver</button>${user.role==='EJECUCION'?`<button class="btn btn-primary" data-use-mapping="${escapeHtml(map.id)}">Usar y resaltar</button>`:''}${manage?`<button class="btn btn-outline" data-edit-mapping="${escapeHtml(map.id)}">Modificar</button><button class="btn btn-danger" data-delete-mapping="${escapeHtml(map.id)}">Borrar</button>`:''}</div></div></article>${ui.mappingSelectedId===map.id?`<div class="mapping-editor-grid-span">${mapEditor(map)}</div>`:''}`).join('')||'<div class="card empty">No hay mapeos para este proyecto.</div>'}</div>`;
  };
  async function mappingPreview(file){if(!file)return null;if(file.type==='application/pdf')return null;return compressAvatar(file,900);}
  async function uploadMapping(file,record){
    if(!MAIN_MODE)return null;const user=actor();if(!user?.authId)throw new Error('No se identificó al usuario autenticado.');const path=`mappings/${user.authId}/${slug(projectId())}/${slug(record.code)}/${slug(record.version)}/${Date.now()}-${safeName(file.name)}`;const {error}=await supabaseClient.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type||undefined,cacheControl:'3600',upsert:false});if(error)throw error;return {storagePath:path,bucket:STORAGE_BUCKET,fileName:file.name,fileType:file.type,fileSize:file.size};
  }
  async function signedMappingUrl(map){if(map.storagePath&&MAIN_MODE){const {data:signed,error}=await supabaseClient.storage.from(map.bucket||STORAGE_BUCKET).createSignedUrl(map.storagePath,3600);if(error)throw error;return signed.signedUrl;}return map.file||map.thumbnailDataUrl||'';}
  async function saveMappingV72(){
    const block=text(document.getElementById('mapBlock')?.value),level=text(document.getElementById('mapLevel')?.value),area=text(document.getElementById('mapArea')?.value),version=text(document.getElementById('mapVersion')?.value)||'V01',code=mappingCode(block,level),file=document.getElementById('mapFile')?.files?.[0];if(!block||!level||!area){toast('Seleccione bloque, nivel y área.');return;}
    let record=data.customMappings.find(map=>map.id===ui.mappingSelectedId);const selectedBase=list(MAPEOS).find(map=>map.id===ui.mappingSelectedId);if(!record){record=data.customMappings.find(map=>mappingIdentity(map)===mappingIdentity({projectId:projectId(),block,level,area}));}if(!record){record={id:`MAP-${Date.now()}-${Math.random().toString(36).slice(2,6)}`};data.customMappings.push(record);}const oldPath=record.storagePath;Object.assign(record,{projectId:projectId(),code,version,block,level,area,title:`Mapeo ${area}`,status:'Vigente',updatedAt:new Date().toISOString(),uploadedBy:actor()?.id});if(selectedBase){data.deletedMappingIds=list(data.deletedMappingIds);if(!data.deletedMappingIds.includes(selectedBase.id))data.deletedMappingIds.push(selectedBase.id);}
    if(file){const preview=await mappingPreview(file);if(preview){record.file=preview;record.thumbnailDataUrl=preview;}if(MAIN_MODE)Object.assign(record,await uploadMapping(file,record));else{const local=await fileToDataUrl(file,5000000);if(!local){toast('El archivo supera 5 MB en la versión estática.');return;}record.file=local;record.fileName=file.name;record.fileType=file.type;}}
    if(oldPath&&oldPath!==record.storagePath&&MAIN_MODE)setTimeout(()=>supabaseClient.storage.from(record.bucket||STORAGE_BUCKET).remove([oldPath]),0);const y=window.scrollY;ui.mappingSelectedId=null;ui.mappingDraft=null;saveData();toast('Mapeo guardado');renderAt(y);
  }
  async function deleteMappingV72(id){const map=mappingById(id);if(!map)return;const custom=data.customMappings.find(item=>item.id===id);if(custom){data.customMappings=data.customMappings.filter(item=>item.id!==id);if(custom.storagePath&&MAIN_MODE)setTimeout(()=>supabaseClient.storage.from(custom.bucket||STORAGE_BUCKET).remove([custom.storagePath]),0);}else{data.deletedMappingIds=list(data.deletedMappingIds);if(!data.deletedMappingIds.includes(id))data.deletedMappingIds.push(id);}const y=window.scrollY;if(ui.mappingSelectedId===id)ui.mappingSelectedId=null;saveData();toast('Mapeo eliminado');renderAt(y);}

  // Preserve viewport after contextual edits.
  function renderAt(y=window.scrollY){const x=window.scrollX;render();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:x,behavior:'auto'})));}

  // Generic top/sticky horizontal scrollbar for every overflowing table.
  function enhanceTables(){
    document.querySelectorAll('.table-wrap').forEach((wrap,index)=>{
      if(wrap.closest('.qpc-table-shell'))return;const table=wrap.querySelector('table');if(!table)return;const shell=document.createElement('div');shell.className='qpc-table-shell';wrap.parentNode.insertBefore(shell,wrap);const top=document.createElement('div');top.className='qpc-table-top-scroll';top.setAttribute('aria-label','Desplazamiento horizontal de la tabla');const spacer=document.createElement('div');top.appendChild(spacer);shell.appendChild(top);shell.appendChild(wrap);
      const syncSize=()=>{spacer.style.width=`${table.scrollWidth}px`;top.hidden=table.scrollWidth<=wrap.clientWidth+2;};syncSize();
      let lock=false;top.addEventListener('scroll',()=>{if(lock)return;lock=true;wrap.scrollLeft=top.scrollLeft;lock=false;});wrap.addEventListener('scroll',()=>{if(lock)return;lock=true;top.scrollLeft=wrap.scrollLeft;lock=false;});if(window.ResizeObserver)new ResizeObserver(syncSize).observe(table);
    });
  }

  const priorRender=window.render;
  window.render=function(){const result=priorRender();requestAnimationFrame(()=>{enhanceTables();if(!actor())initLoginCombobox();});return result;};

  // Capture phase removes legacy handlers that scrolled to the top.
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const stop=()=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
    if(button.matches('[data-edit-equipment]')){stop();ui.equipmentSelectedId=button.dataset.editEquipment;renderAt(window.scrollY);return;}
    if(button.id==='addEquipmentBtn'){stop();ui.equipmentSelectedId='__NEW__';renderAt(window.scrollY);return;}
    if(button.id==='saveEquipmentBtn'){stop();saveEquipmentV72();return;}
    if(button.id==='closeEquipmentEdit'){stop();const y=window.scrollY;ui.equipmentSelectedId=null;renderAt(y);return;}
    if(button.matches('[data-edit-user]')){stop();ui.userSelectedId=button.dataset.editUser;renderAt(window.scrollY);return;}
    if(button.id==='addUserBtn'){stop();ui.userSelectedId='__NEW__';renderAt(window.scrollY);return;}
    if(button.id==='saveUserBtn'){stop();await saveUserV72();return;}
    if(button.id==='cancelUserBtn'){stop();const y=window.scrollY;ui.userSelectedId=null;renderAt(y);return;}
    if(button.matches('[data-edit-project]')){stop();ui.projectSelectedId=button.dataset.editProject;ui.projectDraft=null;renderAt(window.scrollY);return;}
    if(button.id==='addProjectBtn'){stop();ui.projectSelectedId='__NEW__';ui.projectDraft=null;renderAt(window.scrollY);return;}
    if(button.id==='saveProjectBtn'){stop();saveProjectV72();return;}
    if(button.id==='cancelProjectBtn'){stop();const y=window.scrollY;ui.projectSelectedId=null;ui.projectDraft=null;renderAt(y);return;}
    if(button.id==='deleteProjectBtn'){stop();deleteProjectV72();return;}
    if(button.id==='addProjectBlockBtn'){stop();mutateProjectDraft(draft=>draft.blocks.push({id:'',name:'',levels:[]}));return;}
    if(button.matches('[data-delete-block]')){stop();mutateProjectDraft(draft=>draft.blocks.splice(Number(button.dataset.deleteBlock),1));return;}
    if(button.matches('[data-add-level]')){stop();mutateProjectDraft(draft=>draft.blocks[Number(button.dataset.addLevel)].levels.push({id:`LV-${Date.now()}`,name:'Nivel nuevo',areas:[]}));return;}
    if(button.matches('[data-delete-level]')){stop();const [b,l]=button.dataset.deleteLevel.split(':').map(Number);mutateProjectDraft(draft=>draft.blocks[b].levels.splice(l,1));return;}
    if(button.matches('[data-edit-mapping]')){stop();ui.mappingSelectedId=button.dataset.editMapping;ui.mappingDraft=null;renderAt(window.scrollY);return;}
    if(button.id==='addMappingBtn'){stop();ui.mappingSelectedId='__NEW__';ui.mappingDraft=null;renderAt(window.scrollY);return;}
    if(button.id==='saveMappingBtn'){stop();await saveMappingV72();return;}
    if(button.id==='cancelMappingBtn'){stop();const y=window.scrollY;ui.mappingSelectedId=null;ui.mappingDraft=null;renderAt(y);return;}
    if(button.id==='deleteMappingBtn'||button.matches('[data-delete-mapping]')){stop();await deleteMappingV72(button.dataset.deleteMapping||ui.mappingSelectedId);return;}
    if(button.matches('[data-view-mapping]')){stop();const map=mappingById(button.dataset.viewMapping);try{showFileViewer(await signedMappingUrl(map),map.fileName||map.title,map.fileType||'image/*');}catch(error){toast(`No se pudo visualizar: ${error.message}`);}return;}
    if(button.id==='saveProfileBtn'){stop();await saveProfileV72(false);return;}
    if(button.id==='removeProfilePhotoBtn'){stop();await saveProfileV72(true);return;}
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id==='equipmentPageSize'){ui.equipmentPageSize=event.target.value==='ALL'?'ALL':Number(event.target.value);renderAt(window.scrollY);}
  },true);

  // Let mapping editor use temporary selections after block changes.
  const mappingByIdOriginal=window.mappingById;
  window.mappingById=function(id){if(id==='__NEW__'&&ui.mappingDraft)return ui.mappingDraft;return mappingByIdOriginal(id);};

  // Ensure initial pass after every module is loaded.
  qpcNormalizeState();
  if(MAIN_MODE) setTimeout(()=>{if(typeof window.qpcBootstrapV700==='function')window.qpcBootstrapV700();},0);
  else setTimeout(()=>{if(typeof render==='function')render();},0);
})();

/* V7.2 final compatibility layer */
(function(){
  'use strict';
  const list=v=>Array.isArray(v)?v:[];
  const text=v=>String(v??'').trim();
  const MAIN_MODE=Boolean(window.QPC_SUPABASE_URL && typeof supabaseClient!=='undefined');

  window.canOperateQuality=function(user){return ['CALIDAD','COORDINADOR_CALIDAD','IT'].includes(user?.role);};
  window.canReadProject=function(user){return ['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'].includes(user?.role);};
  window.canConfigure=function(user){return ['COORDINADOR_CALIDAD','IT'].includes(user?.role);};
  window.canOpenInspectionResources=function(user,inspection){if(user?.role==='IT')return true;if(user?.role==='EJECUCION')return inspection?.createdBy===user.id;if(['CALIDAD','COORDINADOR_CALIDAD'].includes(user?.role))return true;return ['GERENCIA','PRESIDENTE'].includes(user?.role);};
  window.qpcPerm=function(user,key){
    const matrix={
      EJECUCION:{export:false,addExecution:false,manageQuality:false,manageDocuments:false},
      CALIDAD:{export:true,addExecution:true,manageQuality:false,manageDocuments:true},
      COORDINADOR_CALIDAD:{export:true,addExecution:true,manageQuality:true,manageDocuments:true},
      GERENCIA:{export:true,addExecution:true,manageQuality:true,manageDocuments:false},
      PRESIDENTE:{export:true,addExecution:true,manageQuality:true,manageDocuments:false},
      IT:{export:true,addExecution:true,manageQuality:true,manageDocuments:true}
    };
    return Boolean(matrix[user?.role]?.[key]);
  };

  // Inline document editor, matching equipment/users/mappings.
  function activityOptions(selected=''){
    const activities=[...new Set(list(TEMPLATES).map(template=>template.activity).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    return `<option value="">Seleccione un taller</option>${activities.map(activity=>`<option value="${escapeHtml(activity)}" ${activity===selected?'selected':''}>${escapeHtml(activity)}</option>`).join('')}`;
  }
  function docEditor(doc){
    const selectedActivity=list(doc?.activities)[0]||'';
    return `<div class="inline-editor document-inline-editor"><h3>${doc?'Modificar instructivo':'Agregar instructivo'}</h3><div class="form-grid"><div class="field"><label>Código</label><input id="docCode" value="${escapeHtml(doc?.code||'')}" placeholder="IT-CP-04"></div><div class="field"><label>Versión</label><input id="docVersion" value="${escapeHtml(doc?.version||'')}" placeholder="V09"></div><div class="field full"><label>Título</label><input id="docTitle" value="${escapeHtml(doc?.title||'')}" placeholder="Colocación de Pisos"></div><div class="field"><label>Actividad relacionada</label><select id="docActivity">${activityOptions(selectedActivity)}</select></div><div class="field"><label>Archivo actual</label><input value="${escapeHtml(doc?.availabilityStatus||(doc?.storagePath||doc?.file?'Disponible':'Pendiente de cargar'))}" readonly></div><div class="field full"><label>Archivo</label><input id="docFile" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"></div></div><div class="button-row" style="margin-top:12px"><button id="saveDocumentBtn" class="btn btn-primary">Guardar instructivo</button><button id="cancelDocumentEditV71" class="btn btn-secondary">Cancelar</button></div></div>`;
  }
  window.renderDocuments=function(user){
    const manage=canOperateQuality(user),query=String(ui.docSearch||'').toLowerCase();
    const rows=projectDocuments().filter(doc=>!query||`${doc.code} ${doc.version} ${doc.title} ${list(doc.activities).join(' ')} ${doc.lifecycleStatus||doc.status}`.toLowerCase().includes(query));
    const selected=ui.documentSelectedId&&ui.documentSelectedId!=='__NEW__'?rows.find(doc=>doc._displayId===ui.documentSelectedId):null;
    return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Las versiones se ordenan automáticamente y la edición permanece junto a la tarjeta seleccionada.</p></div>${manage?'<button id="addDocumentBtn" class="btn btn-primary">＋ Agregar instructivo</button>':''}</div>${ui.documentSelectedId==='__NEW__'?docEditor(null):''}<div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch||'')}" placeholder="Nombre, código, versión o taller..."></div></div><div class="grid grid-3">${rows.map(doc=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(doc.code)} · ${escapeHtml(doc.version)}</span><h3>${escapeHtml(doc.title)}</h3><div class="document-status-row"><span class="badge ${doc.lifecycleStatus==='Vigente'?'badge-green':doc.lifecycleStatus==='Obsoleto'?'badge-gray':'badge-yellow'}">${escapeHtml(doc.lifecycleStatus||doc.status||'Vigente')}</span><span class="badge ${(doc.storagePath||doc.file||doc.publicUrl)?'badge-green':'badge-yellow'}">${(doc.storagePath||doc.file||doc.publicUrl)?'Disponible':'Pendiente de cargar'}</span></div><div class="tag-list">${list(doc.activities).map(activity=>`<span class="tag">${escapeHtml(activity)}</span>`).join('')}</div></div><div class="button-row">${(doc.storagePath||doc.file||doc.publicUrl)?`<button class="btn btn-primary" data-doc-view="${escapeHtml(doc._displayId)}">Visualizar</button>`:'<button class="btn btn-secondary" disabled>Pendiente de cargar</button>'}${manage?`<button class="btn btn-outline" data-doc-edit="${escapeHtml(doc._displayId)}">Modificar</button><button class="btn btn-danger" data-doc-delete="${escapeHtml(doc._displayId)}">Borrar</button>`:''}</div></article>${ui.documentSelectedId===doc._displayId?`<div class="document-editor-grid-span">${docEditor(selected||doc)}</div>`:''}`).join('')||'<div class="card empty">No hay instructivos.</div>'}</div>`;
  };

  // Complete mapping draft behavior for cascading block/level/area selectors.
  const priorRenderMappings=window.renderMappings;
  window.renderMappings=function(user){
    if(ui.mappingSelectedId && ui.mappingDraft){
      const original=window.mappingById;
      window.mappingById=id=>id===ui.mappingSelectedId?ui.mappingDraft:original(id);
      const html=priorRenderMappings(user);
      window.mappingById=original;
      return html;
    }
    return priorRenderMappings(user);
  };

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const stop=()=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
    if(button.id==='addDocumentBtn'){stop();ui.documentSelectedId='__NEW__';const y=window.scrollY;render();requestAnimationFrame(()=>scrollTo(0,y));}
    else if(button.matches('[data-doc-edit]')){stop();ui.documentSelectedId=button.dataset.docEdit;const y=window.scrollY;render();requestAnimationFrame(()=>scrollTo(0,y));}
    else if(button.id==='cancelDocumentEditV71'){stop();ui.documentSelectedId=null;const y=window.scrollY;render();requestAnimationFrame(()=>scrollTo(0,y));}
    else if(button.id==='saveDocumentBtn'){
      stop();const y=window.scrollY;await window.saveDocument();requestAnimationFrame(()=>requestAnimationFrame(()=>scrollTo(0,y)));
    }
  },true);

  document.addEventListener('change',event=>{
    if(!['mapBlock','mapLevel'].includes(event.target.id))return;
    const project=data.projects.find(item=>item.id===projectId())||data.projects[0];
    const current=ui.mappingDraft||JSON.parse(JSON.stringify(window.mappingById(ui.mappingSelectedId)||{}));
    if(event.target.id==='mapBlock'){
      const block=project.blocks.find(item=>item.id===event.target.value);current.block=block?.id||'';current.level=block?.levels?.[0]?.name||'';current.area=block?.levels?.[0]?.areas?.[0]?.name||'';
    }else{
      const block=project.blocks.find(item=>item.id===document.getElementById('mapBlock')?.value);const level=block?.levels?.find(item=>item.name===event.target.value);current.level=level?.name||'';current.area=level?.areas?.[0]?.name||'';
    }
    ui.mappingDraft=current;const y=window.scrollY;render();requestAnimationFrame(()=>scrollTo(0,y));
  },true);
})();
/* Quality Project Control MAIN V8.0 · Fase 1
   Permisos granulares, membresías por proyecto y administración segura de usuarios.
   Esta capa reemplaza únicamente el módulo de Usuarios y permisos mientras se migra
   el resto de pantallas a módulos sin funciones globales duplicadas.
*/
(function(){
  'use strict';
  const MAIN_MODE=Boolean(window.QPC_SUPABASE_URL && typeof supabaseClient!=='undefined');
  if(!MAIN_MODE)return;

  const state={catalog:[],roleDefaults:new Map(),overrides:new Map(),memberships:new Map(),loaded:false,loading:null};
  const list=v=>Array.isArray(v)?v:[];
  const key=(userId,code)=>`${userId}::${code}`;
  const roleKey=(role,code)=>`${role}::${code}`;
  const groupLabels={GENERAL:'General',PROYECTOS:'Proyectos',USUARIOS:'Usuarios',INSPECCIONES:'Inspecciones',CALIFICACIONES:'Calificaciones',EXPORTACIONES:'Exportaciones',EQUIPOS:'Equipos',INSTRUCTIVOS:'Instructivos',MAPEOS:'Mapeos',PERFIL:'Perfil'};
  const roleCreateCode={EJECUCION:'users.create.execution',CALIDAD:'users.create.quality',COORDINADOR_CALIDAD:'users.create.quality_manager',GERENCIA:'users.create.project_manager',PRESIDENTE:'users.create.president',IT:'users.create.it'};
  const roleEditCode={EJECUCION:'users.edit.execution',CALIDAD:'users.edit.quality',COORDINADOR_CALIDAD:'users.edit.quality_manager',GERENCIA:'users.edit.project_manager',PRESIDENTE:'users.edit.president',IT:'users.edit.it'};

  async function loadPermissionState(force=false){
    if(state.loaded&&!force)return state;
    if(state.loading&&!force)return state.loading;
    state.loading=(async()=>{
      const [permissionsResult,rolesResult,overridesResult,membersResult]=await Promise.all([
        supabaseClient.from('permissions').select('id,code,name,description,category,sort_order').order('category').order('sort_order'),
        supabaseClient.from('role_permissions').select('role,allowed,permissions(code)'),
        supabaseClient.from('user_permission_overrides').select('user_id,allowed,permissions(code)'),
        supabaseClient.from('project_members').select('project_id,user_id,is_active').eq('is_active',true),
      ]);
      const firstError=[permissionsResult.error,rolesResult.error,overridesResult.error,membersResult.error].find(Boolean);
      if(firstError)throw firstError;
      state.catalog=list(permissionsResult.data);
      state.roleDefaults.clear();
      list(rolesResult.data).forEach(row=>{const code=row.permissions?.code;if(code)state.roleDefaults.set(roleKey(row.role,code),row.allowed===true);});
      state.overrides.clear();
      list(overridesResult.data).forEach(row=>{const code=row.permissions?.code;if(code)state.overrides.set(key(row.user_id,code),row.allowed===true);});
      state.memberships.clear();
      list(membersResult.data).forEach(row=>{if(!state.memberships.has(row.user_id))state.memberships.set(row.user_id,[]);state.memberships.get(row.user_id).push(row.project_id);});
      list(data?.users).forEach(user=>{if(user.authId&&state.memberships.has(user.authId))user.projectIds=state.memberships.get(user.authId);});
      state.loaded=true;state.loading=null;return state;
    })().catch(error=>{state.loading=null;console.error('No se pudieron cargar los permisos',error);throw error;});
    return state.loading;
  }

  function authId(user){return user?.authId||user?.id||'';}
  function inherited(role,code){return role==='IT'||state.roleDefaults.get(roleKey(role,code))===true;}
  function effective(user,code){
    if(!user)return false;
    if(user.role==='IT')return true;
    const id=authId(user),override=state.overrides.get(key(id,code));
    return override===undefined?inherited(user.role,code):override;
  }
  window.qpcHasPermission=effective;
  window.qpcPermissionState=state;

  const legacyQpcPerm=window.qpcPerm;
  window.qpcPerm=function(user,legacyKey){
    const map={export:'exports.pdf',addExecution:'users.create.execution',manageQuality:'users.edit.quality',manageDocuments:'instructives.edit'};
    return map[legacyKey]?effective(user,map[legacyKey]):(typeof legacyQpcPerm==='function'?legacyQpcPerm(user,legacyKey):false);
  };
  window.qpcCanManageUsers=user=>effective(user,'users.view');
  window.qpcCanCreateProject=user=>effective(user,'projects.create');

  const oldLoadRemoteData=window.loadRemoteData;
  window.loadRemoteData=async function(){
    await oldLoadRemoteData();
    try{await loadPermissionState(true);}catch(error){toast(`No se cargaron los permisos granulares: ${error.message}`);}
  };

  function editablePermission(actor,code){return actor?.role==='IT'||effective(actor,code);}
  function targetOverride(user,code){return state.overrides.get(key(authId(user),code));}
  function permissionPanel(target){
    if(!state.loaded)return '<div class="permission-loading">Cargando catálogo de permisos…</div>';
    const actor=currentUser();
    const groups=new Map();state.catalog.forEach(permission=>{if(!groups.has(permission.category))groups.set(permission.category,[]);groups.get(permission.category).push(permission);});
    return `<section class="permission-panel"><div class="permission-panel-head"><div><h4>Permisos efectivos</h4><p>Marque o desmarque permisos. Los cambios diferentes al rol se guardan como excepciones individuales.</p></div><div class="button-row"><button type="button" id="restoreRolePermissionsV80" class="btn btn-secondary">Restaurar rol</button><button type="button" id="selectAllPermissionsV80" class="btn btn-outline">Seleccionar permitidos</button></div></div>${target.role==='IT'?'<div class="callout permission-it-callout">Tecnología (IT) posee todos los permisos y no admite restricciones.</div>':''}<div class="permission-groups">${[...groups.entries()].map(([category,permissions])=>`<fieldset class="permission-group"><legend>${escapeHtml(groupLabels[category]||category)}</legend>${permissions.map(permission=>{const base=inherited(target.role,permission.code),override=targetOverride(target,permission.code),checked=effective(target,permission.code),canEdit=target.role!=='IT'&&editablePermission(actor,permission.code);return `<label class="permission-item ${canEdit?'':'permission-readonly'}"><input type="checkbox" class="usrPermissionV80" value="${escapeHtml(permission.code)}" data-role-default="${base?'1':'0'}" ${checked?'checked':''} ${canEdit?'':'disabled'}><span><strong>${escapeHtml(permission.name)}</strong><small>${escapeHtml(permission.description||permission.code)}</small></span><em class="permission-origin ${override===undefined?'origin-role':'origin-override'}">${override===undefined?'Rol':override?'Concedido':'Denegado'}</em></label>`;}).join('')}</fieldset>`).join('')}</div></section>`;
  }

  function rolesActorCanManage(actor,editingRole){
    const roles=['EJECUCION','CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT'];
    return roles.filter(role=>effective(actor,editingRole===role?roleEditCode[role]:roleCreateCode[role]));
  }
  function projectChecksV80(selected=[]){const selectedSet=new Set(selected);return list(data.projects).filter(p=>p.isActive!==false).map(p=>`<label class="check-row"><input type="checkbox" class="usrProjectV80" value="${escapeHtml(p.id)}" ${selectedSet.has(p.id)?'checked':''}><span>${escapeHtml(p.name)}</span></label>`).join('');}
  function userEditorV80(user={}){
    const actor=currentUser(),editing=Boolean(user.id),roles=rolesActorCanManage(actor,editing?user.role:null),target={...user,role:user.role||roles[0]||'EJECUCION',authId:user.authId||user.id};
    const canReset=!editing||effective(actor,'users.password.reset');
    return `<div class="inline-editor user-inline-editor v80-user-editor"><h3>${editing?`Editar ${escapeHtml(user.name)}`:'Crear usuario'}</h3><div class="form-grid"><div class="field"><label>Nombre</label><input id="usrNameV80" value="${escapeHtml(user.name||'')}"></div><div class="field"><label>Correo</label><input id="usrEmailV80" type="email" value="${escapeHtml(user.email||'')}" ${editing?'readonly':''}></div><div class="field"><label>${editing?'Contraseña nueva / restaurar':'Contraseña inicial'}</label><input id="usrPasswordV80" type="password" ${canReset?'':'disabled'} placeholder="${canReset?(editing?'Dejar vacío si no cambia':'Contraseña inicial'):'Requiere users.password.reset'}"></div><div class="field"><label>Rol</label><select id="usrRoleV80">${roles.map(role=>`<option value="${role}" ${target.role===role?'selected':''}>${escapeHtml(ROLE_LABELS[role]||role)}</option>`).join('')}</select></div><div class="field"><label>Área</label><select id="usrAreaV80"><option value="">No aplica</option><option value="TERMINACION" ${user.executionArea==='TERMINACION'?'selected':''}>Terminación</option><option value="ESTRUCTURA" ${user.executionArea==='ESTRUCTURA'?'selected':''}>Estructura</option></select></div><div class="field full"><label>Proyectos permitidos</label><div class="project-checks">${projectChecksV80(user.projectIds||[projectId()])}</div></div><div class="field full"><label class="check-row"><input id="usrActiveV80" type="checkbox" ${user.isActive===false?'':'checked'}><span>Usuario activo</span></label></div></div>${permissionPanel(target)}<div class="button-row v80-save-row"><button id="saveUserV80" class="btn btn-primary">${editing?'Guardar cambios':'Crear usuario'}</button><button id="cancelUserV80" class="btn btn-secondary">Cancelar</button></div></div>`;
  }

  window.renderUsers=function(actor){
    if(!effective(actor,'users.view'))return noAccess();
    if(!state.loaded&&!state.loading)loadPermissionState().then(()=>render()).catch(error=>toast(error.message));
    const rows=list(data.users).slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
    return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>Los permisos efectivos combinan los valores del rol y las excepciones individuales.</p></div><div class="button-row">${rolesActorCanManage(actor,null).length?'<button id="addUserV80" class="btn btn-primary">＋ Crear usuario</button>':''}${effective(actor,'projects.create')?'<button class="btn btn-outline" data-nav="projects">Gestionar proyectos</button>':''}</div></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Área</th><th>Proyectos</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.userSelectedId==='__NEW__'?`<tr class="inline-edit-table-row"><td colspan="7">${userEditorV80({})}</td></tr>`:''}${rows.map(record=>{const canEdit=effective(actor,roleEditCode[record.role]||'users.view');return `<tr data-user-row="${escapeHtml(record.id)}"><td><div class="table-user-cell">${typeof htmlAvatar==='function'?htmlAvatar(record,34):`<span class="avatar">${initials(record.name)}</span>`}<span>${escapeHtml(record.name)}</span></div></td><td>${escapeHtml(record.email)}</td><td>${escapeHtml(ROLE_LABELS[record.role]||record.role)}</td><td>${escapeHtml(AREA_LABELS[record.executionArea]||'—')}</td><td>${escapeHtml(list(record.projectIds).map(id=>data.projects.find(p=>p.id===id)?.name||id).join(', '))}</td><td>${record.isActive===false?'Inactivo':'Activo'}</td><td>${canEdit?`<button class="btn btn-outline" data-edit-user-v80="${escapeHtml(record.id)}">Editar permisos</button>`:'—'}</td></tr>${ui.userSelectedId===record.id?`<tr class="inline-edit-table-row"><td colspan="7">${userEditorV80(record)}</td></tr>`:''}`;}).join('')}</tbody></table></div>`;
  };

  function collectOverrides(targetRole,targetUser){
    if(targetRole==='IT')return [];
    const result=[];
    document.querySelectorAll('.usrPermissionV80').forEach(input=>{
      if(input.disabled)return;
      const code=input.value,base=input.dataset.roleDefault==='1',allowed=input.checked;
      if(allowed!==base)result.push({code,allowed});
      else if(targetUser){
        const existing=targetOverride(targetUser,code);
        if(existing!==undefined){/* same as role means remove override; omission handles it */}
      }
    });
    // Preserve overrides the actor cannot edit.
    if(targetUser){
      state.catalog.forEach(permission=>{
        if(editablePermission(currentUser(),permission.code))return;
        const existing=targetOverride(targetUser,permission.code);
        if(existing!==undefined)result.push({code:permission.code,allowed:existing});
      });
    }
    return result;
  }

  async function invokeAdmin(payload){
    const {data:result,error}=await supabaseClient.functions.invoke('admin-user-management',{body:payload});
    if(error){
      let detail=error.message||'La Edge Function devolvió un error.';
      try{const response=error.context?.clone?error.context.clone():null;if(response){const json=await response.json();detail=`${json.error||detail}${json.stage?` [${json.stage}]`:''}`;}}catch(_ignored){}
      throw new Error(detail);
    }
    if(result?.error)throw new Error(`${result.error}${result.stage?` [${result.stage}]`:''}`);
    return result;
  }

  async function saveUserV80(){
    const button=document.getElementById('saveUserV80');if(button?.disabled)return;
    const actor=currentUser(),selected=data.users.find(user=>user.id===ui.userSelectedId);
    const fullName=String(document.getElementById('usrNameV80')?.value||'').trim();
    const email=String(document.getElementById('usrEmailV80')?.value||'').trim().toLowerCase();
    const password=document.getElementById('usrPasswordV80')?.value||'';
    const role=document.getElementById('usrRoleV80')?.value;
    const projectIds=[...document.querySelectorAll('.usrProjectV80:checked')].map(input=>input.value);
    if(!fullName||!email||!role){toast('Complete nombre, correo y rol.');return;}
    if(!selected&&!password){toast('Indique la contraseña inicial.');return;}
    const target={...(selected||{}),role,authId:selected?.authId};
    const payload={action:'upsert_user',profile:{auth_id:selected?.authId||null,legacy_id:selected?.id||`usr-${Date.now()}`,full_name:fullName,email,password,role,execution_area:document.getElementById('usrAreaV80')?.value||null,is_active:document.getElementById('usrActiveV80')?.checked!==false},project_ids:projectIds,replace_projects:true,permission_overrides:collectOverrides(role,target),replace_permission_overrides:true};
    try{
      if(button){button.disabled=true;button.textContent='Guardando…';}
      const result=await invokeAdmin(payload);const p=result.profile;let record=selected;
      if(!record){record={id:p.legacy_id||payload.profile.legacy_id};data.users.push(record);}
      Object.assign(record,{id:p.legacy_id||record.id,authId:p.id,name:p.full_name,email:p.email,role:p.role,executionArea:p.execution_area,projectIds:result.project_ids||projectIds,isActive:p.is_active!==false,avatarDataUrl:p.avatar_data_url||record.avatarDataUrl||null});
      await loadPermissionState(true);ui.userSelectedId=null;saveData();toast(selected?'Usuario y permisos actualizados':'Usuario creado');render();
    }catch(error){console.error(error);toast(`No se pudo guardar: ${error.message}`);}finally{if(button){button.disabled=false;button.textContent=selected?'Guardar cambios':'Crear usuario';}}
  }

  function restoreRole(){document.querySelectorAll('.usrPermissionV80').forEach(input=>{if(!input.disabled)input.checked=input.dataset.roleDefault==='1';});document.querySelectorAll('.permission-origin').forEach(label=>{label.textContent='Rol';label.className='permission-origin origin-role';});}
  function selectAllAllowed(){document.querySelectorAll('.usrPermissionV80').forEach(input=>{if(!input.disabled)input.checked=true;});}

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const stop=()=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
    if(button.id==='addUserV80'){stop();ui.userSelectedId='__NEW__';render();return;}
    if(button.matches('[data-edit-user-v80]')){stop();ui.userSelectedId=button.dataset.editUserV80;render();return;}
    if(button.id==='cancelUserV80'){stop();ui.userSelectedId=null;render();return;}
    if(button.id==='saveUserV80'){stop();await saveUserV80();return;}
    if(button.id==='restoreRolePermissionsV80'){stop();restoreRole();return;}
    if(button.id==='selectAllPermissionsV80'){stop();selectAllAllowed();return;}
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id==='usrRoleV80'){
      const selected=data.users.find(user=>user.id===ui.userSelectedId)||{};selected.role=event.target.value;
      const y=window.scrollY;render();requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'auto'}));
    }
    if(event.target.classList?.contains('usrPermissionV80')){
      const item=event.target.closest('.permission-item');const origin=item?.querySelector('.permission-origin');
      if(origin){const same=event.target.checked===(event.target.dataset.roleDefault==='1');origin.textContent=same?'Rol':event.target.checked?'Concedido':'Denegado';origin.className=`permission-origin ${same?'origin-role':'origin-override'}`;}
    }
  },true);
})();

/* Quality Project Control MAIN V8.1 · Fase 2
   Proyectos relacionales, bloques/niveles/áreas, auditoría y corrección definitiva
   del acceso de Tecnología (IT) a Usuarios y permisos.
*/
(function(){
  'use strict';
  const MAIN_MODE=Boolean(window.QPC_SUPABASE_URL && typeof supabaseClient!=='undefined');
  if(!MAIN_MODE)return;

  const phase2={loaded:false,loading:null,audit:[],auditLoaded:false,auditLoading:null};
  const list=value=>Array.isArray(value)?value:[];
  const text=value=>String(value??'').trim();
  const deepClone=value=>JSON.parse(JSON.stringify(value));
  const has=(user,permission)=>Boolean(user&&(user.role==='IT'||window.qpcHasPermission?.(user,permission)));
  const projectPermission=user=>Boolean(user&&(user.role==='IT'||has(user,'projects.view_all')||has(user,'projects.view_assigned')||has(user,'projects.create')||has(user,'projects.edit')||has(user,'projects.structure.manage')));
  const currentActor=()=>typeof currentUser==='function'?currentUser():null;
  window.qpcPhase2=phase2;

  function normalizeNestedProject(project){
    return {
      id:text(project.id).toUpperCase(),
      name:text(project.name)||text(project.id),
      shortCode:text(project.shortCode||project.short_code||project.id).toUpperCase(),
      description:text(project.description),
      timezone:text(project.timezone)||'America/Santo_Domingo',
      isActive:project.isActive!==false&&project.is_active!==false,
      blocks:list(project.blocks).map((block,blockIndex)=>({
        dbId:block.dbId||block.db_id||null,
        id:text(block.id||block.code||`B${blockIndex+1}`).toUpperCase(),
        code:text(block.code||block.id||`B${blockIndex+1}`).toUpperCase(),
        name:text(block.name)||`Bloque ${text(block.code||block.id||blockIndex+1)}`,
        sortOrder:Number(block.sortOrder??block.sort_order??((blockIndex+1)*10)),
        isActive:block.isActive!==false&&block.is_active!==false,
        levels:list(block.levels).map((level,levelIndex)=>({
          dbId:level.dbId||level.db_id||null,
          id:text(level.id||level.code||`N${String(levelIndex+1).padStart(2,'0')}`).toUpperCase(),
          code:text(level.code||level.id||`N${String(levelIndex+1).padStart(2,'0')}`).toUpperCase(),
          name:text(level.name)||`Nivel ${String(levelIndex+1).padStart(2,'0')}`,
          sortOrder:Number(level.sortOrder??level.sort_order??((levelIndex+1)*10)),
          isActive:level.isActive!==false&&level.is_active!==false,
          areas:list(level.areas).map((area,areaIndex)=>({
            dbId:area.dbId||area.db_id||null,
            id:text(area.id||area.code||`A${areaIndex+1}`).toUpperCase(),
            code:text(area.code||area.id||`A${areaIndex+1}`).toUpperCase(),
            name:text(area.name)||`Área ${areaIndex+1}`,
            areaType:text(area.areaType||area.area_type),
            sortOrder:Number(area.sortOrder??area.sort_order??((areaIndex+1)*10)),
            isActive:area.isActive!==false&&area.is_active!==false,
          }))
        }))
      }))
    };
  }

  async function loadProjectsV81(force=false){
    if(phase2.loaded&&!force)return data.projects;
    if(phase2.loading&&!force)return phase2.loading;
    phase2.loading=(async()=>{
      const {data:projectRows,error:projectError}=await supabaseClient.rpc('qpc_projects_for_current_user');
      if(projectError)throw projectError;
      const projects=list(projectRows).map(normalizeNestedProject);
      if(projects.length)data.projects=projects;
      data.version='8.1';

      const actor=currentActor();
      const {data:memberRows,error:memberError}=await supabaseClient.from('project_members').select('project_id,user_id,is_active').eq('is_active',true);
      if(memberError)throw memberError;
      const memberMap=new Map();
      list(memberRows).forEach(row=>{
        if(!memberMap.has(row.user_id))memberMap.set(row.user_id,[]);
        memberMap.get(row.user_id).push(row.project_id);
      });
      list(data.users).forEach(user=>{
        const ids=memberMap.get(user.authId||user.id);
        if(ids)user.projectIds=ids;
        if(user.role==='IT')user.projectIds=list(data.projects).map(project=>project.id);
      });
      if(actor?.role==='IT')actor.projectIds=list(data.projects).map(project=>project.id);

      const available=list(data.projects).filter(project=>project.isActive!==false);
      const allowedIds=new Set(actor?.role==='IT'?available.map(project=>project.id):list(actor?.projectIds));
      const selected=typeof projectId==='function'?projectId():null;
      if(!selected||(!allowedIds.has(selected)&&actor?.role!=='IT')){
        const first=available.find(project=>actor?.role==='IT'||allowedIds.has(project.id))||available[0];
        if(first)ui.projectId=first.id;
      }
      phase2.loaded=true;
      phase2.loading=null;
      return data.projects;
    })().catch(error=>{phase2.loading=null;console.error('No se cargaron los proyectos relacionales',error);throw error;});
    return phase2.loading;
  }
  window.qpcLoadProjects=loadProjectsV81;
  window.qpcGetProjectStructure=id=>list(data.projects).find(project=>project.id===id)||null;
  window.qpcGetLocationPath=(projectIdValue,blockCode,levelCode,areaCode)=>{
    const project=window.qpcGetProjectStructure(projectIdValue);
    const block=list(project?.blocks).find(item=>item.id===blockCode||item.code===blockCode);
    const level=list(block?.levels).find(item=>item.id===levelCode||item.code===levelCode||item.name===levelCode);
    const area=list(level?.areas).find(item=>item.id===areaCode||item.code===areaCode||item.name===areaCode);
    return {project,block,level,area,label:[block?.name,level?.name,area?.name].filter(Boolean).join(' · ')};
  };

  const previousLoadRemoteData=window.loadRemoteData;
  window.loadRemoteData=async function(){
    await previousLoadRemoteData();
    try{await loadProjectsV81(true);}catch(error){toast(`No se cargó la estructura de proyectos: ${error.message}`);}
  };

  // Acceso: IT se evalúa antes de cualquier guardia heredada. Esto evita que una
  // envoltura antigua vuelva a bloquear Usuarios y permisos.
  window.qpcCanManageUsers=user=>Boolean(user&&(user.role==='IT'||has(user,'users.view')));
  window.qpcCanCreateProject=user=>Boolean(user&&(user.role==='IT'||has(user,'projects.create')));

  const previousRenderView=window.renderView;
  window.renderView=function(user){
    if(ui.view==='users')return window.qpcCanManageUsers(user)?window.renderUsers(user):noAccess();
    if(ui.view==='projects')return projectPermission(user)?window.renderProjects(user):noAccess();
    if(ui.view==='audit')return has(user,'audit.view')?renderAuditV81(user):noAccess();
    return previousRenderView(user);
  };

  const previousNavItems=window.navItems;
  window.navItems=function(user){
    let items=list(previousNavItems(user)).filter((item,index,array)=>array.findIndex(other=>other[0]===item[0])===index);
    const ensure=(item)=>{if(!items.some(existing=>existing[0]===item[0]))items.push(item);};
    if(user?.role==='IT'){
      ensure(['users','⚙','Usuarios y permisos']);
      ensure(['projects','▣','Proyectos']);
      ensure(['audit','◉','Auditoría']);
    }else{
      if(has(user,'users.view'))ensure(['users','⚙','Usuarios y permisos']);
      if(projectPermission(user))ensure(['projects','▣','Proyectos']);
      if(has(user,'audit.view'))ensure(['audit','◉','Auditoría']);
    }
    return items;
  };

  const previousViewTitle=window.viewTitle;
  window.viewTitle=function(){
    if(ui.view==='audit')return 'Auditoría';
    if(ui.view==='projects')return 'Proyectos';
    return previousViewTitle();
  };

  function defaultProjectDraft(){
    return {id:'',name:'',shortCode:'',description:'',timezone:'America/Santo_Domingo',isActive:true,blocks:[]};
  }
  function selectedProjectRecord(){return list(data.projects).find(project=>project.id===ui.projectSelectedId)||null;}
  function ensureProjectDraft(){
    const source=ui.projectSelectedId==='__NEW__'?null:selectedProjectRecord();
    if(!ui.projectDraft||ui.projectDraftSource!==ui.projectSelectedId){
      ui.projectDraft=source?deepClone(source):defaultProjectDraft();
      ui.projectDraftSource=ui.projectSelectedId;
    }
    return ui.projectDraft;
  }
  function cleanCode(value,fallback=''){
    return text(value||fallback).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,20);
  }
  function newBlock(index){return {id:`B${index+1}`,code:`B${index+1}`,name:`Bloque ${index+1}`,sortOrder:(index+1)*10,isActive:true,levels:[]};}
  function newLevel(index){return {id:`N${String(index+1).padStart(2,'0')}`,code:`N${String(index+1).padStart(2,'0')}`,name:`Nivel ${String(index+1).padStart(2,'0')}`,sortOrder:(index+1)*10,isActive:true,areas:[]};}
  function newArea(index){return {id:`A${index+1}`,code:`A${index+1}`,name:`Área ${index+1}`,areaType:'',sortOrder:(index+1)*10,isActive:true};}

  function syncProjectDraftFromDom(){
    if(!ui.projectDraft)return;
    const draft=ui.projectDraft;
    const value=id=>document.getElementById(id)?.value;
    draft.id=cleanCode(value('p2ProjectId'),draft.id);
    draft.name=text(value('p2ProjectName'));
    draft.shortCode=cleanCode(value('p2ProjectShort'),draft.shortCode||draft.id);
    draft.description=text(value('p2ProjectDescription'));
    draft.timezone=text(value('p2ProjectTimezone'))||'America/Santo_Domingo';
    draft.isActive=document.getElementById('p2ProjectActive')?.checked!==false;
    draft.blocks=[...document.querySelectorAll('[data-p2-block-index]')].map((blockNode,blockIndex)=>{
      const codeInput=blockNode.querySelector('[data-p2-block-code]');
      const nameInput=blockNode.querySelector('[data-p2-block-name]');
      return {
        ...(draft.blocks[blockIndex]||newBlock(blockIndex)),
        id:cleanCode(codeInput?.value,`B${blockIndex+1}`),
        code:cleanCode(codeInput?.value,`B${blockIndex+1}`),
        name:text(nameInput?.value)||`Bloque ${blockIndex+1}`,
        sortOrder:(blockIndex+1)*10,
        isActive:true,
        levels:[...blockNode.querySelectorAll('[data-p2-level-index]')].map((levelNode,levelIndex)=>{
          const previous=draft.blocks[blockIndex]?.levels?.[levelIndex]||newLevel(levelIndex);
          const levelCode=levelNode.querySelector('[data-p2-level-code]')?.value;
          const levelName=levelNode.querySelector('[data-p2-level-name]')?.value;
          return {
            ...previous,
            id:cleanCode(levelCode,`N${String(levelIndex+1).padStart(2,'0')}`),
            code:cleanCode(levelCode,`N${String(levelIndex+1).padStart(2,'0')}`),
            name:text(levelName)||`Nivel ${String(levelIndex+1).padStart(2,'0')}`,
            sortOrder:(levelIndex+1)*10,
            isActive:true,
            areas:[...levelNode.querySelectorAll('[data-p2-area-index]')].map((areaNode,areaIndex)=>{
              const prior=previous.areas?.[areaIndex]||newArea(areaIndex);
              const areaCode=areaNode.querySelector('[data-p2-area-code]')?.value;
              return {
                ...prior,
                id:cleanCode(areaCode,`A${areaIndex+1}`),
                code:cleanCode(areaCode,`A${areaIndex+1}`),
                name:text(areaNode.querySelector('[data-p2-area-name]')?.value)||`Área ${areaIndex+1}`,
                areaType:text(areaNode.querySelector('[data-p2-area-type]')?.value),
                sortOrder:(areaIndex+1)*10,
                isActive:true,
              };
            })
          };
        })
      };
    });
  }

  function structureEditorV81(draft,canStructure){
    if(!canStructure)return `<div class="callout">No tiene permiso para modificar bloques, niveles y áreas.</div>`;
    return `<section class="p2-structure-editor"><div class="p2-section-head"><div><h4>Estructura del proyecto</h4><p>Configure bloques, niveles y áreas. Los códigos alimentarán los dropdowns y reportes.</p></div><button type="button" id="p2AddBlock" class="btn btn-outline">＋ Bloque</button></div><div class="p2-block-list">${list(draft.blocks).map((block,blockIndex)=>`<article class="p2-block" data-p2-block-index="${blockIndex}"><div class="p2-row-head"><strong>Bloque ${blockIndex+1}</strong><button type="button" class="btn btn-danger btn-compact" data-p2-remove-block="${blockIndex}">Quitar</button></div><div class="form-grid p2-compact-grid"><div class="field"><label>Código</label><input data-p2-block-code value="${escapeHtml(block.code||block.id||'')}"></div><div class="field"><label>Nombre</label><input data-p2-block-name value="${escapeHtml(block.name||'')}"></div></div><div class="p2-level-list">${list(block.levels).map((level,levelIndex)=>`<section class="p2-level" data-p2-level-index="${levelIndex}"><div class="p2-row-head"><span>Nivel ${levelIndex+1}</span><button type="button" class="btn btn-danger btn-compact" data-p2-remove-level="${blockIndex}:${levelIndex}">Quitar</button></div><div class="form-grid p2-compact-grid"><div class="field"><label>Código</label><input data-p2-level-code value="${escapeHtml(level.code||level.id||'')}"></div><div class="field"><label>Nombre</label><input data-p2-level-name value="${escapeHtml(level.name||'')}"></div></div><div class="p2-area-list">${list(level.areas).map((area,areaIndex)=>`<div class="p2-area" data-p2-area-index="${areaIndex}"><input data-p2-area-code aria-label="Código de área" value="${escapeHtml(area.code||area.id||'')}"><input data-p2-area-name aria-label="Nombre de área" value="${escapeHtml(area.name||'')}"><input data-p2-area-type aria-label="Tipo de área" placeholder="Tipo opcional" value="${escapeHtml(area.areaType||'')}"><button type="button" class="btn btn-danger btn-compact" data-p2-remove-area="${blockIndex}:${levelIndex}:${areaIndex}">Quitar</button></div>`).join('')}</div><button type="button" class="btn btn-outline btn-compact" data-p2-add-area="${blockIndex}:${levelIndex}">＋ Área</button></section>`).join('')}</div><button type="button" class="btn btn-outline btn-compact" data-p2-add-level="${blockIndex}">＋ Nivel</button></article>`).join('')}</div>${!draft.blocks.length?'<div class="empty">Todavía no hay bloques configurados.</div>':''}</section>`;
  }

  function projectEditorV81(project){
    const actor=currentActor();
    const draft=ensureProjectDraft();
    const editing=Boolean(project);
    const canEdit=actor?.role==='IT'||has(actor,editing?'projects.edit':'projects.create');
    const canStructure=actor?.role==='IT'||has(actor,'projects.structure.manage');
    const canArchive=actor?.role==='IT'||has(actor,'projects.archive');
    return `<div class="inline-editor p2-project-editor"><h3>${editing?`Editar ${escapeHtml(project.name)}`:'Crear proyecto'}</h3><div class="form-grid"><div class="field"><label>ID interno</label><input id="p2ProjectId" value="${escapeHtml(draft.id||'')}" placeholder="LCE" ${editing?'readonly':''}></div><div class="field"><label>Nombre completo</label><input id="p2ProjectName" value="${escapeHtml(draft.name||'')}" placeholder="Lopesan La Ceiba"></div><div class="field"><label>Abreviatura para códigos</label><input id="p2ProjectShort" value="${escapeHtml(draft.shortCode||'')}" placeholder="LLC"></div><div class="field"><label>Zona horaria</label><input id="p2ProjectTimezone" value="${escapeHtml(draft.timezone||'America/Santo_Domingo')}"></div><div class="field full"><label>Descripción</label><textarea id="p2ProjectDescription" rows="2">${escapeHtml(draft.description||'')}</textarea></div><div class="field full"><label class="check-row"><input id="p2ProjectActive" type="checkbox" ${draft.isActive===false?'':'checked'} ${canArchive?'':'disabled'}><span>Proyecto activo</span></label></div></div>${structureEditorV81(draft,canStructure)}<div class="button-row p2-save-row"><button type="button" id="p2SaveProject" class="btn btn-primary" ${canEdit?'':'disabled'}>${editing?'Guardar cambios':'Crear proyecto'}</button>${editing&&canArchive?`<button type="button" id="p2ToggleProject" class="btn ${project.isActive===false?'btn-success':'btn-danger'}">${project.isActive===false?'Restaurar':'Archivar'}</button>`:''}<button type="button" id="p2CancelProject" class="btn btn-secondary">Cancelar</button></div></div>`;
  }

  window.renderProjects=function(user){
    if(!projectPermission(user))return noAccess();
    if(!phase2.loaded&&!phase2.loading)loadProjectsV81().then(()=>render()).catch(error=>toast(error.message));
    const projects=list(data.projects).slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
    const canCreate=user.role==='IT'||has(user,'projects.create');
    return `<div class="page-head"><div><h2>Proyectos y ubicaciones</h2><p>La estructura relacional alimenta bloques, niveles y áreas en toda la plataforma.</p></div>${canCreate?'<button type="button" id="p2AddProject" class="btn btn-primary">＋ Crear proyecto</button>':''}</div><div class="table-wrap"><table><thead><tr><th>Proyecto</th><th>Abreviatura</th><th>ID</th><th>Bloques</th><th>Niveles</th><th>Áreas</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${ui.projectSelectedId==='__NEW__'?`<tr class="inline-edit-table-row"><td colspan="8">${projectEditorV81(null)}</td></tr>`:''}${projects.map(project=>{const levels=list(project.blocks).reduce((sum,block)=>sum+list(block.levels).length,0);const areas=list(project.blocks).reduce((sum,block)=>sum+list(block.levels).reduce((inner,level)=>inner+list(level.areas).length,0),0);const canEdit=user.role==='IT'||has(user,'projects.edit')||has(user,'projects.structure.manage');return `<tr><td><strong>${escapeHtml(project.name)}</strong><br><span class="helper">${escapeHtml(project.description||'')}</span></td><td>${escapeHtml(project.shortCode)}</td><td>${escapeHtml(project.id)}</td><td>${list(project.blocks).length}</td><td>${levels}</td><td>${areas}</td><td><span class="badge ${project.isActive===false?'badge-gray':'badge-green'}">${project.isActive===false?'Archivado':'Activo'}</span></td><td>${canEdit?`<button type="button" class="btn btn-outline" data-p2-edit-project="${escapeHtml(project.id)}">Editar</button>`:'—'}</td></tr>${ui.projectSelectedId===project.id?`<tr class="inline-edit-table-row"><td colspan="8">${projectEditorV81(project)}</td></tr>`:''}`;}).join('')}</tbody></table></div>`;
  };

  async function invokeProjectAdmin(payload){
    const {data:result,error}=await supabaseClient.functions.invoke('admin-project-management',{body:payload});
    if(error){
      let detail=error.message||'La Edge Function devolvió un error.';
      try{const response=error.context?.clone?error.context.clone():null;if(response){const json=await response.json();detail=`${json.error||detail}${json.stage?` [${json.stage}]`:''}`;}}catch(_ignored){}
      throw new Error(detail);
    }
    if(result?.error)throw new Error(`${result.error}${result.stage?` [${result.stage}]`:''}`);
    return result;
  }

  async function saveProjectV81(){
    syncProjectDraftFromDom();
    const draft=ui.projectDraft;
    if(!draft?.id||!draft?.name||!draft?.shortCode){toast('Complete ID, nombre y abreviatura.');return;}
    const button=document.getElementById('p2SaveProject');
    try{
      if(button){button.disabled=true;button.textContent='Guardando…';}
      await invokeProjectAdmin({action:'upsert_project',project:{id:draft.id,name:draft.name,short_code:draft.shortCode,description:draft.description,timezone:draft.timezone,is_active:draft.isActive},blocks:draft.blocks,replace_structure:true});
      await loadProjectsV81(true);
      ui.projectSelectedId=null;ui.projectDraft=null;ui.projectDraftSource=null;
      toast('Proyecto y estructura guardados');render();
    }catch(error){console.error(error);toast(`No se pudo guardar el proyecto: ${error.message}`);}finally{if(button){button.disabled=false;button.textContent='Guardar proyecto';}}
  }

  async function toggleProjectV81(){
    const project=selectedProjectRecord();if(!project)return;
    try{
      await invokeProjectAdmin({action:project.isActive===false?'restore_project':'archive_project',project_id:project.id});
      await loadProjectsV81(true);ui.projectSelectedId=null;ui.projectDraft=null;ui.projectDraftSource=null;toast(project.isActive===false?'Proyecto restaurado':'Proyecto archivado');render();
    }catch(error){console.error(error);toast(`No se pudo cambiar el estado: ${error.message}`);}
  }

  function rerenderProjectAtCurrentPosition(){const y=window.scrollY;render();requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'auto'}));}
  function mutateDraft(mutator){syncProjectDraftFromDom();mutator(ensureProjectDraft());rerenderProjectAtCurrentPosition();}

  async function loadAuditV81(force=false){
    if(phase2.auditLoaded&&!force)return phase2.audit;
    if(phase2.auditLoading&&!force)return phase2.auditLoading;
    phase2.auditLoading=(async()=>{
      const {data:rows,error}=await supabaseClient.from('audit_logs').select('id,project_id,actor_id,action,entity_type,entity_id,previous_data,new_data,created_at').order('created_at',{ascending:false}).limit(250);
      if(error)throw error;
      phase2.audit=list(rows);phase2.auditLoaded=true;phase2.auditLoading=null;return phase2.audit;
    })().catch(error=>{phase2.auditLoading=null;throw error;});
    return phase2.auditLoading;
  }

  function renderAuditV81(user){
    if(!has(user,'audit.view'))return noAccess();
    if(!phase2.auditLoaded&&!phase2.auditLoading)loadAuditV81().then(()=>render()).catch(error=>toast(`No se cargó la auditoría: ${error.message}`));
    const activeProject=typeof projectId==='function'?projectId():null;
    const rows=list(phase2.audit).filter(row=>!activeProject||!row.project_id||row.project_id===activeProject);
    return `<div class="page-head"><div><h2>Auditoría</h2><p>Últimas 250 acciones visibles para el proyecto seleccionado.</p></div><button type="button" id="p2RefreshAudit" class="btn btn-outline">Actualizar</button></div>${phase2.auditLoading?'<div class="card">Cargando auditoría…</div>':`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th><th>Proyecto</th></tr></thead><tbody>${rows.map(row=>{const actor=list(data.users).find(item=>(item.authId||item.id)===row.actor_id);return `<tr><td>${escapeHtml(new Date(row.created_at).toLocaleString('es-DO'))}</td><td>${escapeHtml(actor?.name||actor?.email||row.actor_id||'Sistema')}</td><td><strong>${escapeHtml(row.action)}</strong></td><td>${escapeHtml(row.entity_type)}</td><td>${escapeHtml(row.entity_id||'—')}</td><td>${escapeHtml(list(data.projects).find(project=>project.id===row.project_id)?.name||row.project_id||'Global')}</td></tr>`;}).join('')}</tbody></table></div><div class="helper">${rows.length} registros visibles.</div>`}`;
  }

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const stop=()=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
    if(button.id==='p2AddProject'){stop();ui.projectSelectedId='__NEW__';ui.projectDraft=null;ui.projectDraftSource=null;rerenderProjectAtCurrentPosition();return;}
    if(button.matches('[data-p2-edit-project]')){stop();ui.projectSelectedId=button.dataset.p2EditProject;ui.projectDraft=null;ui.projectDraftSource=null;rerenderProjectAtCurrentPosition();return;}
    if(button.id==='p2CancelProject'){stop();ui.projectSelectedId=null;ui.projectDraft=null;ui.projectDraftSource=null;rerenderProjectAtCurrentPosition();return;}
    if(button.id==='p2SaveProject'){stop();await saveProjectV81();return;}
    if(button.id==='p2ToggleProject'){stop();await toggleProjectV81();return;}
    if(button.id==='p2AddBlock'){stop();mutateDraft(draft=>draft.blocks.push(newBlock(draft.blocks.length)));return;}
    if(button.matches('[data-p2-remove-block]')){stop();const index=Number(button.dataset.p2RemoveBlock);mutateDraft(draft=>draft.blocks.splice(index,1));return;}
    if(button.matches('[data-p2-add-level]')){stop();const blockIndex=Number(button.dataset.p2AddLevel);mutateDraft(draft=>draft.blocks[blockIndex]?.levels.push(newLevel(draft.blocks[blockIndex].levels.length)));return;}
    if(button.matches('[data-p2-remove-level]')){stop();const [blockIndex,levelIndex]=button.dataset.p2RemoveLevel.split(':').map(Number);mutateDraft(draft=>draft.blocks[blockIndex]?.levels.splice(levelIndex,1));return;}
    if(button.matches('[data-p2-add-area]')){stop();const [blockIndex,levelIndex]=button.dataset.p2AddArea.split(':').map(Number);mutateDraft(draft=>{const areas=draft.blocks[blockIndex]?.levels[levelIndex]?.areas;if(areas)areas.push(newArea(areas.length));});return;}
    if(button.matches('[data-p2-remove-area]')){stop();const [blockIndex,levelIndex,areaIndex]=button.dataset.p2RemoveArea.split(':').map(Number);mutateDraft(draft=>draft.blocks[blockIndex]?.levels[levelIndex]?.areas.splice(areaIndex,1));return;}
    if(button.id==='p2RefreshAudit'){stop();phase2.auditLoaded=false;await loadAuditV81(true);render();return;}
  },true);
})();
