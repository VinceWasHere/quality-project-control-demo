const TEMPLATES = window.QPC_TEMPLATES || [];
const INSTRUCTIVOS = window.QPC_INSTRUCTIVOS || [];
const MAPEOS = window.QPC_MAPEOS || [];

const STORAGE_KEY = 'qpc_github_v3_data';
const SESSION_KEY = 'qpc_github_v3_session';

const ROLE_LABELS = {
  EJECUCION: 'Ingeniero de Ejecución',
  CALIDAD: 'Ingeniero de Calidad',
  COORDINADOR_CALIDAD: 'Coordinador de Calidad',
  GERENCIA: 'Gerente de Proyecto',
  PRESIDENTE: 'Presidente'
};

const USERS = [
  {id:'exec-1',name:'Ing. Ejecución Demo A',email:'ejecucion1@codelpa.demo',password:'1234',role:'EJECUCION',projectIds:['LCE']},
  {id:'exec-2',name:'Ing. Ejecución Demo B',email:'ejecucion2@codelpa.demo',password:'1234',role:'EJECUCION',projectIds:['LCE']},
  {id:'exec-3',name:'Ing. Ejecución Demo C',email:'ejecucion3@codelpa.demo',password:'1234',role:'EJECUCION',projectIds:['LCE']},
  {id:'quality-1',name:'Ing. Calidad Demo 1',email:'calidad1@codelpa.demo',password:'1234',role:'CALIDAD',projectIds:['LCE']},
  {id:'quality-2',name:'Ing. Calidad Demo 2',email:'calidad2@codelpa.demo',password:'1234',role:'CALIDAD',projectIds:['LCE']},
  {id:'coord-1',name:'Coordinador Calidad Demo',email:'coordinador@codelpa.demo',password:'1234',role:'COORDINADOR_CALIDAD',projectIds:['LCE']},
  {id:'manager-1',name:'Gerente de Proyecto Demo',email:'gerencia@codelpa.demo',password:'1234',role:'GERENCIA',projectIds:['LCE']},
  {id:'president-1',name:'Presidente Demo',email:'presidente@codelpa.demo',password:'1234',role:'PRESIDENTE',projectIds:['LCE','CN','RC']}
];

function templateById(id){ return TEMPLATES.find(t=>t.id===id); }
function mappingById(id){ return MAPEOS.find(m=>m.id===id); }
function userById(id){ return data.users.find(u=>u.id===id); }
function currentUser(){ const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); return s?userById(s.userId):null; }
function canOperateQuality(user){ return ['CALIDAD','COORDINADOR_CALIDAD'].includes(user.role); }
function canReadProject(user){ return ['CALIDAD','COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE'].includes(user.role); }
function canConfigure(user){ return user.role==='COORDINADOR_CALIDAD'; }
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
function isoWeekKey(dateString){
  const d=new Date(dateString+'T12:00:00');
  const utc=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=utc.getUTCDay()||7;
  utc.setUTCDate(utc.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(utc.getUTCFullYear(),0,1));
  const week=Math.ceil((((utc-yearStart)/86400000)+1)/7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
function periodMatches(date,mode,value){ return mode==='week'?isoWeekKey(date)===value:monthKey(date)===value; }
function nextCode(){ return `INSP-LCE-2026-${String(data.inspections.length+1).padStart(4,'0')}`; }
function nextPackage(template,mapping){
  const activity=(template?.activity||'ACT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'').slice(0,5).toUpperCase();
  return `PL-${mapping?.block||'LCE'}-${(mapping?.level||'N00').replace(/\s/g,'')}-${activity}-${String(data.inspections.length+1).padStart(3,'0')}`;
}
function toast(message){
  const el=document.createElement('div'); el.className='toast'; el.textContent=message; document.body.appendChild(el); setTimeout(()=>el.remove(),2800);
}
function downloadFile(filename,content,type='text/csv;charset=utf-8;'){
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function findTemplate(activity,stage='General'){
  return TEMPLATES.find(t=>t.activity===activity&&t.stage===stage)||TEMPLATES.find(t=>t.activity===activity)||TEMPLATES[0];
}

function seedCompleted(id,createdBy,activity,stage,date,score,technical,visit,visits,qualityId,mappingId,weakCriteria=[]){
  const t=findTemplate(activity,stage); const objective=t.objective;
  const decision=score>=objective?'Liberada':score>=objective-5?'Con observaciones':'No liberada';
  const map=mappingById(mappingId)||MAPEOS[0];
  return {
    id,code:`INSP-LCE-2026-${id.replace(/\D/g,'').padStart(4,'0')}`,projectId:'LCE',createdBy,templateId:t.id,mappingId:map.id,
    contractor:createdBy==='exec-2'?'Contratista Demo B':'Contratista Demo A',location:`${map.block} · ${map.level} · ${map.area}`,
    packageCode:`PL-${map.code}-${id.toUpperCase()}`,scope:`Inspección de ${t.activity} - ${t.stage}`,
    requestedDate:date,requestedTime:'08:00',ready:true,status:statusFromDecision(decision),assignedQualityId:qualityId,
    createdAt:`${date}T07:30:00`,startedAt:`${date}T08:10:00`,completedAt:`${date}T09:05:00`,closedBy:qualityId,
    answers:{},notes:{},technicalScore:technical,visitScore:visit,finalScore:score,objective,traffic:trafficFor(score,objective),decision,
    visitsCount:visits,firstVisit:visits===1,weakCriteria,attachments:['Evidencia fotográfica registrada'],
    audit:[
      {at:`${date}T07:30:00`,userId:createdBy,action:'Solicitud enviada a Calidad'},
      {at:`${date}T07:35:00`,userId:createdBy,action:'Área confirmada como lista'},
      {at:`${date}T08:05:00`,userId:qualityId,action:'Inspección tomada'},
      {at:`${date}T08:10:00`,userId:qualityId,action:'Evaluación iniciada'},
      {at:`${date}T09:05:00`,userId:qualityId,action:`Decisión: ${decision}`}
    ]
  };
}

function initialData(){
  const completed=[
    seedCompleted('s01','exec-1','Mampostería','General','2026-06-18',89.5,93,81,2,'quality-1','MAP-LCE-D1-N02-H2101',['Espesor y llenado de Juntas']),
    seedCompleted('s02','exec-1','Pañete','Liberación','2026-06-25',94.0,96,89,1,'quality-2','MAP-LCE-D1-N02-PASILLO',['Protección de elementos']),
    seedCompleted('s03','exec-1','Mampostería','General','2026-07-02',91.2,94,87,1,'quality-1','MAP-LCE-D1-N02-H2101',['Refuerzo horizontal (Serpentinas)']),
    seedCompleted('s04','exec-1','Pañete','Liberación','2026-07-08',94.0,96,89,1,'quality-2','MAP-LCE-D1-N02-PASILLO',['Limpieza del área']),
    seedCompleted('s05','exec-1','Pintura','Liberación','2026-07-15',88.5,92,80,2,'quality-1','MAP-LCE-D1-N02-H2102',['Recortes completados','Protección de accesorios y recortes']),
    seedCompleted('s06','exec-1','Colocación de Pisos','Seguimiento','2026-07-21',95.5,96,94,1,'quality-2','MAP-LCE-D2-N03-H3204',['Limpieza durante la colocación']),
    seedCompleted('s07','exec-2','Mampostería','General','2026-07-03',87.0,91,77,2,'quality-1','MAP-LCE-D1-N02-H2102',['Verticalidad y linealidad de Muros','Espesor y llenado de Juntas']),
    seedCompleted('s08','exec-2','Pañete','Terminación','2026-07-09',96.0,97,94,1,'quality-2','MAP-LCE-D1-N02-PASILLO',[]),
    seedCompleted('s09','exec-2','Drywall - Muros','Liberación','2026-07-16',93.0,95,88,1,'quality-1','MAP-LCE-D2-N03-H3204',['Separación de parales']),
    seedCompleted('s10','exec-2','Derretido','Terminación','2026-07-22',89.0,92,82,2,'quality-2','MAP-LCE-D1-N02-H2102',['Limpieza final']),
    seedCompleted('s11','exec-3','Hormigonado','General','2026-07-04',96.0,97,94,1,'quality-1','MAP-LCE-EST-LOSA-A',[]),
    seedCompleted('s12','exec-3','Acero - Losas Estructurales','General','2026-07-10',94.0,96,89,1,'quality-2','MAP-LCE-EST-LOSA-A',['Recubrimiento']),
    seedCompleted('s13','exec-3','Revestimiento Vertical','Terminación','2026-07-17',92.0,94,87,1,'quality-1','MAP-LCE-D2-N03-H3204',['Alineación de juntas']),
    seedCompleted('s14','exec-3','Pintura','Terminación','2026-07-23',97.0,98,95,1,'quality-2','MAP-LCE-D1-N02-H2101',[])
  ];
  const pending=[
    {id:'p01',code:'INSP-LCE-2026-0101',projectId:'LCE',createdBy:'exec-1',templateId:findTemplate('Mampostería','General').id,mappingId:'MAP-LCE-D1-N02-H2101',contractor:'Contratista Demo A',location:'D1 · Nivel 02 · Habitación 2101',packageCode:'PL-D1-N02-MAMP-H2101-101',scope:'Muro interior pendiente de liberación',requestedDate:'2026-07-24',requestedTime:'08:00',ready:true,status:'SOLICITADA',assignedQualityId:null,createdAt:'2026-07-23T15:30:00',answers:{},notes:{},technicalScore:null,visitScore:null,finalScore:null,objective:90,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],attachments:[],audit:[{at:'2026-07-23T15:30:00',userId:'exec-1',action:'Solicitud enviada a Calidad'}]},
    {id:'p02',code:'INSP-LCE-2026-0102',projectId:'LCE',createdBy:'exec-2',templateId:findTemplate('Pintura','Liberación').id,mappingId:'MAP-LCE-D1-N02-H2102',contractor:'Contratista Demo B',location:'D1 · Nivel 02 · Habitación 2102',packageCode:'PL-D1-N02-PINT-H2102-102',scope:'Liberación de superficie y primer',requestedDate:'2026-07-24',requestedTime:'08:00',ready:true,status:'SOLICITADA',assignedQualityId:null,createdAt:'2026-07-23T15:35:00',answers:{},notes:{},technicalScore:null,visitScore:null,finalScore:null,objective:95,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],attachments:[],audit:[{at:'2026-07-23T15:35:00',userId:'exec-2',action:'Solicitud enviada a Calidad'}]},
    {id:'p03',code:'INSP-LCE-2026-0103',projectId:'LCE',createdBy:'exec-3',templateId:findTemplate('Colocación de Pisos','Liberación').id,mappingId:'MAP-LCE-D2-N03-H3204',contractor:'Contratista Demo A',location:'D2 · Nivel 03 · Habitación 3204',packageCode:'PL-D2-N03-PISO-H3204-103',scope:'Preparación y replanteo de piso',requestedDate:'2026-07-24',requestedTime:'08:20',ready:false,status:'BORRADOR',assignedQualityId:null,createdAt:'2026-07-23T15:40:00',answers:{},notes:{},technicalScore:null,visitScore:null,finalScore:null,objective:95,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],attachments:[],audit:[{at:'2026-07-23T15:40:00',userId:'exec-3',action:'Borrador creado'}]}
  ];
  return {version:3,users:USERS,inspections:[...pending,...completed],customMappings:[],customDocuments:[]};
}

function loadData(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw){const d=initialData();localStorage.setItem(STORAGE_KEY,JSON.stringify(d));return d;}
    const d=JSON.parse(raw); if(d.version!==3){const fresh=initialData();localStorage.setItem(STORAGE_KEY,JSON.stringify(fresh));return fresh;} return d;
  }catch{const d=initialData();localStorage.setItem(STORAGE_KEY,JSON.stringify(d));return d;}
}
function saveData(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }
let data=loadData();
let ui={view:'home',selectedId:null,queueTab:'DISPONIBLES',reportMode:'month',reportValue:'2026-07',docSearch:'',mapSearch:'',templateFilter:''};

function render(){
  const user=currentUser();
  document.getElementById('app').innerHTML=user?renderShell(user):renderLogin();
  bindGlobal();
  if(user)bindView(user);
}

function renderLogin(){
  return `<div class="login-shell">
    <section class="login-brand">
      <div>
        <div class="brand-lockup"><div class="logo">C</div><div><strong>QUALITY PROJECT CONTROL</strong><div style="font-size:13px;color:#c9d9e8">CODELPA</div></div></div>
        <h1>Inspecciones, planillas, trazabilidad y calificaciones en un solo lugar.</h1>
        <p>Este proyecto incluye las 40 planillas extraídas del Excel SAP V01, dashboards por rol, biblioteca de instructivos, selección de mapeos y exportaciones para Calidad.</p>
        <div class="feature-grid">
          <div class="feature">✓ Dashboard mensual para Ejecución</div>
          <div class="feature">✓ 40 planillas y 414 criterios</div>
          <div class="feature">✓ Reportes semanales y mensuales</div>
          <div class="feature">✓ Exportaciones CSV compatibles con Excel</div>
        </div>
      </div>
      <div class="login-note">Demo funcional para GitHub Pages. Los datos se guardan únicamente en el navegador.</div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <h2>Iniciar sesión</h2>
        <p>El sistema identifica automáticamente si el usuario pertenece a Ejecución, Calidad o un rol gerencial.</p>
        <div id="loginError"></div>
        <div class="field"><label>Correo electrónico</label><input id="loginEmail" type="email" placeholder="usuario@codelpa.demo" autocomplete="username"></div>
        <div class="field" style="margin-top:14px"><label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••" autocomplete="current-password"></div>
        <button id="loginBtn" class="btn btn-primary btn-lg" style="width:100%;margin-top:18px">Entrar</button>
        <div class="demo-users">
          <h3>Usuarios de demostración</h3>
          ${USERS.filter(u=>['exec-1','quality-1','coord-1','manager-1','president-1'].includes(u.id)).map(u=>`<div class="demo-user"><div><strong>${escapeHtml(ROLE_LABELS[u.role])}</strong><br>${escapeHtml(u.email)}</div><button data-demo-email="${escapeHtml(u.email)}">Usar</button></div>`).join('')}
          <div class="helper">Contraseña para todos: <strong>1234</strong></div>
        </div>
      </div>
    </section>
  </div>`;
}

function navItems(user){
  if(user.role==='EJECUCION')return [
    ['home','⌂','Mi dashboard'],['newRequest','＋','Solicitar inspección'],['myInspections','☷','Mis inspecciones'],['documents','▤','Instructivos'],['mappings','▦','Mapeos']
  ];
  if(canOperateQuality(user))return [
    ['home','⌂','Inicio'],['qualityQueue','☷','Bandeja de Calidad'],['myInspections','✓','Mis inspecciones'],['ratings','▥','Calificaciones'],['exports','⇩','Exportaciones'],['documents','▤','Instructivos'],['mappings','▦','Mapeos'],...(canConfigure(user)?[['users','⚙','Usuarios y permisos']]:[])
  ];
  return [['home','⌂','Dashboard'],['ratings','▥','Calificaciones'],['documents','▤','Instructivos']];
}

function viewTitle(){
  return {home:'Inicio',newRequest:'Solicitar inspección',myInspections:'Inspecciones',qualityQueue:'Bandeja de Calidad',detail:'Detalle de inspección',evaluate:'Planilla digital',documents:'Instructivos',mappings:'Mapeos',ratings:'Calificaciones',exports:'Exportaciones',users:'Usuarios y permisos'}[ui.view]||'Quality Project Control';
}

function renderShell(user){
  const selected=ui.selectedId?data.inspections.find(i=>i.id===ui.selectedId):null;
  return `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="logo">C</div><div><strong>QUALITY PROJECT CONTROL</strong><small>CODELPA</small></div></div>
      <div class="user-chip"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(ROLE_LABELS[user.role])}</span><span>Proyecto: Lopesan La Ceiba</span></div>
      <div class="nav-label">Navegación</div>
      ${navItems(user).map(([id,icon,label])=>`<button class="nav-btn ${ui.view===id?'active':''}" data-nav="${id}"><span>${icon}</span>${label}</button>`).join('')}
      <div class="sidebar-footer"><button id="resetBtn">Restablecer demo</button><button id="logoutBtn">Cerrar sesión</button></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="top-left"><button id="menuBtn" class="mobile-menu">☰</button><div><h1>${viewTitle()}</h1><p>${selected?escapeHtml(selected.code):'Proyecto Lopesan La Ceiba'}</p></div></div>
        <div class="top-right"><span class="role-pill">${escapeHtml(ROLE_LABELS[user.role])}</span><div class="avatar">${initials(user.name)}</div></div>
      </header>
      <div class="content">${renderView(user)}</div>
    </main>
  </div><div id="overlay" class="drawer-overlay hidden"></div>`;
}

function renderView(user){
  switch(ui.view){
    case 'newRequest':return renderNewRequest(user);
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
function badge(status){
  const map={BORRADOR:['Borrador','badge-gray'],SOLICITADA:['Solicitada','badge-blue'],TOMADA:['Tomada','badge-blue'],EN_EVALUACION:['En evaluación','badge-yellow'],CON_OBSERVACIONES:['Con observaciones','badge-yellow'],LIBERADA:['Liberada','badge-green'],NO_LIBERADA:['No liberada','badge-red'],IMPROCEDENTE:['Improcedente','badge-red'],EN_REINSPECCION:['En reinspección','badge-yellow'],CERRADA:['Cerrada','badge-green']};
  const [label,cls]=map[status]||[status,'badge-gray']; return `<span class="badge ${cls}">${label}</span>`;
}
function trafficBadge(t){const cls=t==='Verde'?'badge-green':t==='Amarillo'?'badge-yellow':'badge-red';return t?`<span class="badge ${cls}">${t}</span>`:'—';}
function noAccess(){return `<div class="alert alert-danger">No tiene permisos para acceder a esta vista.</div>`;}

function completedInspections(){return data.inspections.filter(i=>Number.isFinite(i.finalScore)&&i.completedAt);}
function inspectionsForExecution(user){return data.inspections.filter(i=>i.createdBy===user.id);}
function monthlyForUser(user,month='2026-07'){return inspectionsForExecution(user).filter(i=>i.completedAt&&monthKey(i.completedAt)===month);}

function renderHome(user){
  if(user.role==='EJECUCION')return renderExecutionDashboard(user);
  return renderOperationalDashboard(user);
}

function renderExecutionDashboard(user){
  const month='2026-07';
  const own=inspectionsForExecution(user);
  const current=monthlyForUser(user,month);
  const avg=mean(current.map(i=>i.finalScore));
  const first=current.filter(i=>i.firstVisit).length;
  const released=current.filter(i=>i.status==='LIBERADA').length;
  const byActivity=groupRatings(current,'activity');
  return `<div class="page-head"><div><h2>Mi dashboard de Ejecución</h2><p>Calificación mensual, evolución por taller e historial de inspecciones.</p></div><div class="button-row"><button class="btn btn-primary btn-lg" data-nav="newRequest">＋ Solicitar inspección</button></div></div>
    <div class="grid grid-4">
      ${metric('Calificación de julio',`${round1(avg)}%`,'Promedio de inspecciones cerradas',avg>=90?'positive':avg>=85?'warning':'critical')}
      ${metric('Inspecciones del mes',current.length,'Incluidas en la calificación')}
      ${metric('Liberadas',released,`${current.length?round1(released/current.length*100):0}% del periodo`,'positive')}
      ${metric('Liberadas en 1ra visita',first,`${current.length?round1(first/current.length*100):0}% del periodo`)}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Calificación por taller · Julio 2026</h3>${byActivity.length?byActivity.map(r=>bar(`${r.activity}${r.stage!=='General'?` · ${r.stage}`:''}`,r.average,r.objective)).join(''):'<div class="empty">Sin inspecciones cerradas.</div>'}</div>
      <div class="card"><h3>Resumen de gestión</h3><div class="kv">
        <div>Con observaciones</div><div>${current.filter(i=>i.status==='CON_OBSERVACIONES').length}</div>
        <div>No liberadas</div><div>${current.filter(i=>i.status==='NO_LIBERADA').length}</div>
        <div>Promedio técnico</div><div>${round1(mean(current.map(i=>i.technicalScore)))}%</div>
        <div>Promedio preparación/visitas</div><div>${round1(mean(current.map(i=>i.visitScore)))}%</div>
        <div>Promedio de visitas</div><div>${round1(mean(current.map(i=>i.visitsCount)))}</div>
      </div></div>
    </div>
    <div class="section-title"><h3>Todas mis inspecciones</h3><button class="btn btn-outline" data-nav="myInspections">Ver historial completo</button></div>
    ${inspectionsTable(own,user)}
  `;
}

function renderOperationalDashboard(user){
  const current=completedInspections().filter(i=>monthKey(i.completedAt)==='2026-07');
  const avg=mean(current.map(i=>i.finalScore));
  const available=data.inspections.filter(i=>i.status==='SOLICITADA'&&i.ready);
  const assigned=canOperateQuality(user)?data.inspections.filter(i=>i.assignedQualityId===user.id&&['TOMADA','EN_EVALUACION'].includes(i.status)):[];
  const title=user.role==='PRESIDENTE'?'Dashboard ejecutivo global':user.role==='GERENCIA'?'Dashboard del proyecto':'Dashboard de Calidad';
  const byActivity=groupRatings(current,'activity').slice(0,8);
  return `<div class="page-head"><div><h2>${title}</h2><p>${user.role==='PRESIDENTE'?'Resumen consolidado simulado':'Resultados de julio 2026 · Lopesan La Ceiba'}</p></div>${canOperateQuality(user)?'<div class="button-row"><button class="btn btn-primary" data-nav="qualityQueue">Abrir bandeja</button></div>':''}</div>
    <div class="grid grid-4">
      ${metric('Resultado promedio',`${round1(avg)}%`,'Calificación mensual','positive')}
      ${metric('Inspecciones cerradas',current.length,'Periodo actual')}
      ${metric('Disponibles para tomar',available.length,'Áreas confirmadas como listas')}
      ${metric(canOperateQuality(user)?'Asignadas a mí':'Actividades críticas',canOperateQuality(user)?assigned.length:current.filter(i=>i.traffic==='Rojo').length,canOperateQuality(user)?'Inspecciones activas':'Semáforo rojo')}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Resultado por taller</h3>${byActivity.map(r=>bar(`${r.activity}${r.stage!=='General'?` · ${r.stage}`:''}`,r.average,r.objective)).join('')}</div>
      <div class="card"><h3>Puntos de atención</h3>${renderWeaknesses(current)}</div>
    </div>
    <div class="section-title"><h3>Inspecciones recientes</h3></div>${inspectionsTable([...data.inspections].sort((a,b)=>(b.completedAt||b.createdAt).localeCompare(a.completedAt||a.createdAt)).slice(0,10),user)}
  `;
}

function bar(label,value,objective=95){
  const width=Math.max(0,Math.min(100,value)); const tone=value>=objective?'#15803d':value>=objective-5?'#b7791f':'#b42318';
  return `<div class="bar-row"><strong>${escapeHtml(label)}</strong><div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${tone}"></div></div><strong>${round1(value)}%</strong></div>`;
}

function renderWeaknesses(rows){
  const counts={};
  rows.forEach(i=>(i.weakCriteria||[]).forEach(c=>counts[c]=(counts[c]||0)+1));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!top.length)return '<div class="empty">No hay criterios recurrentes registrados.</div>';
  return `<div class="timeline">${top.map(([name,count])=>`<div class="timeline-item"><span class="timeline-dot"></span><strong>${escapeHtml(name)}</strong><p>${count} incumplimiento${count===1?'':'s'} registrado${count===1?'':'s'}</p></div>`).join('')}</div>`;
}

function inspectionsTable(rows,user){
  if(!rows.length)return '<div class="card empty">No hay inspecciones para mostrar.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Fecha</th><th>Taller / etapa</th><th>Ubicación</th><th>Ingeniero de ejecución</th><th>Calidad</th><th>Resultado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows.map(i=>{
    const t=templateById(i.templateId); const exec=userById(i.createdBy); const quality=userById(i.assignedQualityId);
    return `<tr><td><strong>${escapeHtml(i.code)}</strong></td><td>${formatDate(i.completedAt?i.completedAt.slice(0,10):i.requestedDate)}<br><span class="helper">${escapeHtml(i.requestedTime||'')}</span></td><td>${escapeHtml(t?.activity||'—')}<br><span class="helper">${escapeHtml(t?.stage||'General')}</span></td><td>${escapeHtml(i.location)}</td><td>${escapeHtml(exec?.name||'—')}</td><td>${escapeHtml(quality?.name||'Sin asignar')}</td><td>${Number.isFinite(i.finalScore)?`${round1(i.finalScore)}% ${trafficBadge(i.traffic)}`:'—'}</td><td>${badge(i.status)}</td><td><div class="actions"><button class="btn btn-outline" data-open="${i.id}">Ver</button>${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar</button>`:''}${canOperateQuality(user)&&i.assignedQualityId===user.id&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Evaluar</button>`:''}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderMyInspections(user){
  const rows=user.role==='EJECUCION'?data.inspections.filter(i=>i.createdBy===user.id):canOperateQuality(user)?data.inspections.filter(i=>i.assignedQualityId===user.id):data.inspections;
  return `<div class="page-head"><div><h2>${user.role==='EJECUCION'?'Mi historial de inspecciones':'Mis inspecciones de Calidad'}</h2><p>${user.role==='EJECUCION'?'Consulte todas las solicitudes colocadas previamente.':'Inspecciones tomadas o asignadas a su usuario.'}</p></div>${user.role==='EJECUCION'?'<div class="button-row"><button class="btn btn-primary" data-nav="newRequest">＋ Nueva solicitud</button></div>':''}</div>${inspectionsTable(rows,user)}`;
}

function templateOptions(selectedId){
  const groups={}; TEMPLATES.forEach(t=>{(groups[t.activity]??=[]).push(t)});
  return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([activity,items])=>`<optgroup label="${escapeHtml(activity)}">${items.map(t=>`<option value="${t.id}" ${t.id===selectedId?'selected':''}>${escapeHtml(t.stage)} · ${escapeHtml(t.title)}</option>`).join('')}</optgroup>`).join('');
}

function renderNewRequest(user){
  if(user.role!=='EJECUCION')return noAccess();
  const defaultTemplate=templateById(ui.templateFilter)||findTemplate('Mampostería','General');
  const docs=INSTRUCTIVOS.filter(d=>d.activities.includes(defaultTemplate.activity));
  return `<div class="page-head"><div><h2>Solicitar inspección</h2><p>Seleccione la planilla, el mapeo vigente y confirme que el área está lista.</p></div></div>
    <div class="grid grid-2" style="grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)">
      <div class="card">
        <div class="form-grid">
          <div class="field full"><label>Planilla / taller / etapa</label><select id="reqTemplate">${templateOptions(defaultTemplate.id)}</select><div class="helper">Catálogo extraído del Excel Rev. Planillas SAP V01.</div></div>
          <div class="field"><label>Objetivo</label><input id="reqObjective" type="number" value="${defaultTemplate.objective}" readonly></div>
          <div class="field"><label>Contratista</label><input id="reqContractor" value="Contratista Demo A"></div>
          <div class="field full"><label>Mapeo existente</label><select id="reqMapping">${MAPEOS.map(m=>`<option value="${m.id}">${escapeHtml(m.code)} · ${escapeHtml(m.area)} · ${escapeHtml(m.version)}</option>`).join('')}</select><div class="helper">El ingeniero selecciona el mapeo desde la biblioteca; no tiene que subirlo nuevamente.</div></div>
          <div class="field"><label>Fecha propuesta</label><input id="reqDate" type="date" value="2026-07-24"></div>
          <div class="field"><label>Hora propuesta</label><input id="reqTime" type="time" value="08:00"></div>
          <div class="field full"><label>Alcance a inspeccionar</label><textarea id="reqScope">Área completa según el mapeo seleccionado.</textarea></div>
          <div class="field full"><label class="check-row"><input id="reqReady" type="checkbox" checked><span>Confirmo que el trabajo está terminado, el área está limpia y accesible, y el responsable estará disponible.</span></label></div>
          <div class="field full"><label>Fotografías previas</label><input id="reqPhotos" type="file" multiple accept="image/*"><div class="helper">En GitHub Pages se guardan los nombres de archivo en el navegador. En producción se conectará a almacenamiento real.</div></div>
        </div>
        <div class="form-actions"><button class="btn btn-secondary" data-nav="home">Cancelar</button><div class="button-row"><button id="saveDraft" class="btn btn-outline">Guardar borrador</button><button id="submitRequest" class="btn btn-primary">Enviar a Calidad</button></div></div>
      </div>
      <aside>
        <div class="card" id="templateSummary"><h3>Planilla seleccionada</h3><div class="kv"><div>Actividad</div><div>${escapeHtml(defaultTemplate.activity)}</div><div>Etapa</div><div>${escapeHtml(defaultTemplate.stage)}</div><div>Criterios</div><div>${defaultTemplate.criteria.length}</div><div>Peso total</div><div>${defaultTemplate.totalWeight}</div><div>Objetivo</div><div>${defaultTemplate.objective}%</div></div></div>
        <div class="card" style="margin-top:16px" id="linkedDocs"><h3>Instructivos relacionados</h3>${docs.length?docs.map(d=>`<div style="margin-bottom:10px"><span class="doc-code">${escapeHtml(d.code)} ${escapeHtml(d.version)}</span><br><strong>${escapeHtml(d.title)}</strong></div>`).join(''):'<div class="helper">No hay instructivo vinculado todavía.</div>'}</div>
      </aside>
    </div>`;
}

function sortQueue(rows){
  return [...rows].sort((a,b)=>{if(a.ready!==b.ready)return a.ready?-1:1;return `${a.requestedDate}T${a.requestedTime}`.localeCompare(`${b.requestedDate}T${b.requestedTime}`)||a.createdAt.localeCompare(b.createdAt);});
}

function renderQueue(user){
  if(!canOperateQuality(user))return noAccess();
  let rows=data.inspections;
  if(ui.queueTab==='DISPONIBLES')rows=rows.filter(i=>i.status==='SOLICITADA'&&i.ready);
  if(ui.queueTab==='NO_LISTAS')rows=rows.filter(i=>!i.ready&&['BORRADOR','SOLICITADA'].includes(i.status));
  if(ui.queueTab==='TODAS')rows=rows;
  return `<div class="page-head"><div><h2>Bandeja de Calidad</h2><p>Ordenada por disponibilidad real, fecha y hora solicitada.</p></div></div>
    <div class="tabs"><button class="tab ${ui.queueTab==='DISPONIBLES'?'active':''}" data-queue="DISPONIBLES">Disponibles para tomar</button><button class="tab ${ui.queueTab==='NO_LISTAS'?'active':''}" data-queue="NO_LISTAS">Áreas no listas</button><button class="tab ${ui.queueTab==='TODAS'?'active':''}" data-queue="TODAS">Todas las del proyecto</button></div>
    ${inspectionsTable(sortQueue(rows),user)}`;
}

function renderDetail(user){
  const i=data.inspections.find(x=>x.id===ui.selectedId); if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';
  if(user.role==='EJECUCION'&&i.createdBy!==user.id)return noAccess();
  const t=templateById(i.templateId),m=mappingById(i.mappingId),exec=userById(i.createdBy),quality=userById(i.assignedQualityId);
  const docs=INSTRUCTIVOS.filter(d=>d.activities.includes(t?.activity));
  return `<div class="page-head"><div><h2>${escapeHtml(i.code)}</h2><p>${escapeHtml(t?.activity||'—')} · ${escapeHtml(t?.stage||'General')} · ${escapeHtml(i.location)}</p></div><div class="button-row">${canOperateQuality(user)&&i.status==='SOLICITADA'&&i.ready?`<button class="btn btn-primary" data-take="${i.id}">Tomar inspección</button>`:''}${canOperateQuality(user)&&i.assignedQualityId===user.id&&['TOMADA','EN_EVALUACION'].includes(i.status)?`<button class="btn btn-success" data-evaluate="${i.id}">Abrir planilla</button>`:''}${canOperateQuality(user)&&['SOLICITADA','TOMADA'].includes(i.status)?`<button class="btn btn-danger" data-improper="${i.id}">Marcar improcedente</button>`:''}</div></div>
    <div class="grid grid-2">
      <div class="card"><h3>Datos de la inspección</h3><div class="kv">
        <div>Solicitante</div><div>${escapeHtml(exec?.name||'—')}</div><div>Contratista</div><div>${escapeHtml(i.contractor)}</div><div>Planilla</div><div>${escapeHtml(t?.title||'—')}</div><div>Versión</div><div>${escapeHtml(t?.version||'—')}</div><div>Paquete</div><div>${escapeHtml(i.packageCode)}</div><div>Fecha / hora</div><div>${formatDate(i.requestedDate)} · ${escapeHtml(i.requestedTime)}</div><div>Área lista</div><div>${i.ready?'Sí':'No'}</div><div>Responsable Calidad</div><div>${escapeHtml(quality?.name||'Sin asignar')}</div><div>Estado</div><div>${badge(i.status)}</div>
      </div><p style="margin-bottom:0"><strong>Alcance:</strong> ${escapeHtml(i.scope)}</p></div>
      <div class="card map-card">${m?`<img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)} · ${escapeHtml(m.status)}</div></div>`:'<div class="empty">Sin mapeo asociado.</div>'}</div>
    </div>
    ${Number.isFinite(i.finalScore)?`<div class="grid grid-4" style="margin-top:16px">${metric('Resultado técnico',`${round1(i.technicalScore)}%`,'Criterios técnicos')}${metric('Preparación / visitas',`${round1(i.visitScore)}%`,'Criterios de visita')}${metric('Calificación final',`${round1(i.finalScore)}%`,'Método original de planilla',i.finalScore>=i.objective?'positive':i.finalScore>=i.objective-5?'warning':'critical')}${metric('Semáforo',i.traffic,`Objetivo ${i.objective}%`)}</div>`:''}
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Instructivos relacionados</h3>${docs.length?docs.map(d=>`<div style="margin-bottom:12px"><span class="doc-code">${escapeHtml(d.code)} ${escapeHtml(d.version)}</span><br><strong>${escapeHtml(d.title)}</strong><div class="helper">${escapeHtml(d.status)}</div></div>`).join(''):'<div class="empty">No hay documentos vinculados.</div>'}</div>
      <div class="card"><h3>Archivos y evidencias</h3><ul>${(i.attachments||[]).map(a=>`<li>${escapeHtml(a)}</li>`).join('')||'<li>Sin evidencias registradas.</li>'}</ul></div>
    </div>
    <div class="section-title"><h3>Trazabilidad</h3></div><div class="card"><div class="timeline">${renderAudit(i.audit)}</div></div>`;
}

function renderAudit(audit){return audit?.length?audit.map(a=>{const u=userById(a.userId);return `<div class="timeline-item"><span class="timeline-dot"></span><strong>${escapeHtml(a.action)}</strong><p>${escapeHtml(u?.name||'Sistema')} · ${formatDateTime(a.at)}</p></div>`;}).join(''):'<div class="empty">Sin eventos.</div>';}

function answerFactor(criterion,label){const option=criterion.options.find(o=>o.label===label);return option?option.factor:null;}
function calculateInspection(i){
  const t=templateById(i.templateId); let techNum=0,techDen=0,visitNum=0,visitDen=0,totalNum=0,totalDen=0;
  t.criteria.forEach(c=>{const label=i.answers[c.id];if(!label)return;const factor=answerFactor(c,label);if(factor===null)return;totalNum+=c.weight*factor;totalDen+=c.weight;if(c.isVisitCriterion){visitNum+=c.weight*factor;visitDen+=c.weight}else{techNum+=c.weight*factor;techDen+=c.weight;}});
  const technical=techDen?techNum/techDen*100:0,visit=visitDen?visitNum/visitDen*100:100,final=totalDen?totalNum/totalDen*100:0;
  return {technical,visit,final,traffic:trafficFor(final,i.objective),answered:t.criteria.filter(c=>i.answers[c.id]).length,total:t.criteria.length};
}

function renderEvaluation(user){
  if(!canOperateQuality(user))return noAccess(); const i=data.inspections.find(x=>x.id===ui.selectedId); if(!i)return '<div class="alert alert-danger">Inspección no encontrada.</div>';
  if(i.assignedQualityId!==user.id&&user.role!=='COORDINADOR_CALIDAD')return noAccess(); const t=templateById(i.templateId),score=calculateInspection(i);
  return `<div class="page-head"><div><h2>Planilla digital</h2><p>${escapeHtml(i.code)} · ${escapeHtml(t.activity)} · ${escapeHtml(t.stage)}</p></div><div class="button-row"><button id="markCompliant" class="btn btn-outline">Marcar todo conforme</button></div></div>
    <div class="alert alert-info">Planilla extraída de la hoja <strong>${escapeHtml(t.sheet)}</strong> del Excel Rev. Planillas SAP V01. Los criterios deben validarse antes de uso corporativo definitivo.</div>
    <div class="grid grid-2" style="grid-template-columns:minmax(0,2fr) minmax(285px,1fr)">
      <div>
        <div class="card" style="margin-bottom:16px"><div class="grid grid-4"><div><div class="metric-label">Criterios</div><strong>${t.criteria.length}</strong></div><div><div class="metric-label">Peso total</div><strong>${t.totalWeight}</strong></div><div><div class="metric-label">Objetivo</div><strong>${t.objective}%</strong></div><div><div class="metric-label">Visitas reales</div><select id="visitsCount"><option value="1" ${i.visitsCount===1?'selected':''}>1 visita</option><option value="2" ${i.visitsCount===2?'selected':''}>2 visitas</option><option value="3" ${i.visitsCount>=3?'selected':''}>3 o más</option></select></div></div></div>
        <div class="criteria">${t.criteria.map(c=>renderCriterion(i,c)).join('')}</div>
        <div class="card" style="margin-top:16px"><div class="field"><label>Observación general</label><textarea id="generalObservation">${escapeHtml(i.generalObservation||'')}</textarea></div><div class="form-actions"><button class="btn btn-secondary" data-open="${i.id}">Volver</button><div class="button-row"><button class="btn btn-success" data-finish="Liberada">Guardar y liberar</button><button class="btn btn-warning" data-finish="Con observaciones">Guardar con observaciones</button><button class="btn btn-danger" data-finish="No liberada">Guardar y no liberar</button></div></div></div>
      </div>
      <aside class="card score-box"><div class="metric-label">Resultado preliminar</div><div class="score-number">${round1(score.final)}%</div><div class="progress"><span style="width:${Math.min(100,score.final)}%"></span></div><div style="margin-top:17px" class="traffic">${trafficHtml(score.final,i.objective)}</div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="kv"><div>Técnico</div><div>${round1(score.technical)}%</div><div>Visitas / preparación</div><div>${round1(score.visit)}%</div><div>Completados</div><div>${score.answered} de ${score.total}</div><div>Objetivo</div><div>${i.objective}%</div></div></aside>
    </div>`;
}

function renderCriterion(i,c){
  return `<article class="criterion"><span class="badge ${c.isVisitCriterion?'badge-yellow':'badge-blue'}">${c.isVisitCriterion?'Visitas / preparación':'Criterio técnico'}</span><h4>${escapeHtml(c.id)} · ${escapeHtml(c.name)}</h4><div class="meta">Peso: ${c.weight} · Respuesta: ${escapeHtml(c.responseType)} · Fila fuente: ${c.sourceRow}</div>${c.description?`<div class="description">${escapeHtml(c.description)}</div>`:''}<div class="criteria-grid"><div class="field"><label>Evaluación</label><select data-answer="${c.id}"><option value="">Seleccione…</option>${c.options.map(o=>`<option value="${escapeHtml(o.label)}" ${i.answers[c.id]===o.label?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div><div class="field"><label>Observación</label><input data-note="${c.id}" value="${escapeHtml(i.notes[c.id]||'')}" placeholder="Opcional"></div></div></article>`;
}

function trafficHtml(score,objective){const t=trafficFor(score,objective),cls=t==='Verde'?'green':t==='Amarillo'?'yellow':'red';return `<span class="light ${cls}"></span>${t} · ${round1(score)}%`;}

function renderDocuments(user){
  const search=ui.docSearch.toLowerCase();
  const all=[...INSTRUCTIVOS,...(data.customDocuments||[])];
  const rows=all.filter(d=>!search||`${d.code} ${d.version} ${d.title} ${(d.activities||[]).join(' ')} ${d.status}`.toLowerCase().includes(search));
  return `<div class="page-head"><div><h2>Biblioteca de instructivos</h2><p>Consulta por código, actividad, versión y vigencia.</p></div></div>
    <div class="filters"><div class="field full"><label>Buscar instructivo</label><input id="docSearch" value="${escapeHtml(ui.docSearch)}" placeholder="Ej.: Mampostería, IT-CP-05, Pintura..."></div></div>
    <div class="grid grid-3">${rows.map(d=>`<article class="card doc-card"><div><span class="doc-code">${escapeHtml(d.code)} · ${escapeHtml(d.version)}</span><h3 style="margin-top:8px">${escapeHtml(d.title)}</h3><span class="badge ${d.status==='Vigente'?'badge-green':'badge-yellow'}">${escapeHtml(d.status)}</span><div class="tag-list">${(d.activities||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join('')}</div><p class="helper">${escapeHtml(d.note||'')}</p></div><div class="button-row">${d.file?`<a class="btn btn-primary" href="${escapeHtml(d.file)}" target="_blank">Abrir documento</a>`:'<button class="btn btn-secondary" disabled>Archivo pendiente</button>'}</div></article>`).join('')||'<div class="card empty">No se encontraron documentos.</div>'}</div>`;
}

function renderMappings(user){
  const search=ui.mapSearch.toLowerCase();
  const all=[...MAPEOS,...(data.customMappings||[])];
  const rows=all.filter(m=>!search||`${m.code} ${m.block} ${m.level} ${m.area} ${m.title}`.toLowerCase().includes(search));
  return `<div class="page-head"><div><h2>Biblioteca de mapeos</h2><p>Los mapeos se seleccionan desde la solicitud y permanecen versionados.</p></div></div>
    <div class="filters"><div class="field full"><label>Buscar mapeo</label><input id="mapSearch" value="${escapeHtml(ui.mapSearch)}" placeholder="Bloque, nivel, habitación, código..."></div></div>
    <div class="grid grid-3">${rows.map(m=>`<article class="card map-card"><img src="${escapeHtml(m.file)}" alt="${escapeHtml(m.title)}"><div class="body"><h3>${escapeHtml(m.title)}</h3><div class="helper">${escapeHtml(m.code)} · ${escapeHtml(m.version)}</div><div class="tag-list"><span class="tag">${escapeHtml(m.block)}</span><span class="tag">${escapeHtml(m.level)}</span><span class="tag">${escapeHtml(m.area)}</span></div><div class="button-row" style="margin-top:12px"><a class="btn btn-outline" href="${escapeHtml(m.file)}" target="_blank">Ver mapeo</a>${user.role==='EJECUCION'?'<button class="btn btn-primary" data-nav="newRequest">Usar en solicitud</button>':''}</div></div></article>`).join('')}</div>`;
}

function groupRatings(rows,type){
  const groups={};
  rows.forEach(i=>{
    const t=templateById(i.templateId),exec=userById(i.createdBy);
    const key=type==='engineer'?i.createdBy:`${t.activity}|||${t.stage}`;
    if(!groups[key])groups[key]={activity:t.activity,stage:t.stage,engineerId:i.createdBy,engineer:exec?.name||'—',rows:[],objective:t.objective};
    groups[key].rows.push(i);
  });
  return Object.values(groups).map(g=>({...g,count:g.rows.length,average:mean(g.rows.map(i=>i.finalScore)),technical:mean(g.rows.map(i=>i.technicalScore)),visit:mean(g.rows.map(i=>i.visitScore)),firstVisitPct:g.rows.length?g.rows.filter(i=>i.firstVisit).length/g.rows.length*100:0,improper:g.rows.filter(i=>i.status==='IMPROCEDENTE').length})).sort((a,b)=>a.average-b.average);
}

function renderRatings(user){
  if(!canReadProject(user))return noAccess();
  const rows=completedInspections().filter(i=>periodMatches(i.completedAt.slice(0,10),ui.reportMode,ui.reportValue));
  const workshops=groupRatings(rows,'activity'); const engineers=groupRatings(rows,'engineer');
  return `<div class="page-head"><div><h2>Calificaciones semanales y mensuales</h2><p>Promedios por taller y por ingeniero de ejecución, listos para informes de Calidad.</p></div></div>
    <div class="card" style="margin-bottom:16px"><div class="filters"><div class="field"><label>Tipo de periodo</label><select id="reportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal</option></select></div><div class="field"><label>Periodo</label><input id="reportValue" type="${ui.reportMode==='week'?'week':'month'}" value="${escapeHtml(ui.reportValue)}"></div><div class="field"><label>Inspecciones incluidas</label><input value="${rows.length}" readonly></div><div class="field"><label>Promedio general</label><input value="${round1(mean(rows.map(i=>i.finalScore)))}%" readonly></div></div></div>
    <div class="section-title"><h3>Calificación por taller</h3></div>${ratingWorkshopTable(workshops)}
    <div class="section-title"><h3>Calificación por ingeniero de ejecución</h3></div>${ratingEngineerTable(engineers)}
    <div class="section-title"><h3>Puntos débiles del periodo</h3></div><div class="card">${renderWeaknesses(rows)}</div>`;
}

function ratingWorkshopTable(rows){
  if(!rows.length)return '<div class="card empty">No hay inspecciones cerradas en el periodo.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Taller</th><th>Etapa</th><th>Inspecciones</th><th>Técnico</th><th>Visitas / preparación</th><th>Resultado</th><th>Objetivo</th><th>Diferencia</th><th>Semáforo</th></tr></thead><tbody>${rows.map(r=>{const diff=r.average-r.objective;return `<tr><td><strong>${escapeHtml(r.activity)}</strong></td><td>${escapeHtml(r.stage)}</td><td>${r.count}</td><td>${round1(r.technical)}%</td><td>${round1(r.visit)}%</td><td><strong>${round1(r.average)}%</strong></td><td>${r.objective}%</td><td>${diff>=0?'+':''}${round1(diff)}</td><td>${trafficBadge(trafficFor(r.average,r.objective))}</td></tr>`;}).join('')}</tbody></table></div>`;
}

function ratingEngineerTable(rows){
  if(!rows.length)return '<div class="card empty">No hay inspecciones cerradas en el periodo.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Ingeniero de ejecución</th><th>Inspecciones</th><th>Técnico</th><th>Visitas / preparación</th><th>Resultado final</th><th>Liberadas en 1ra visita</th><th>Improcedentes</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${escapeHtml(r.engineer)}</strong></td><td>${r.count}</td><td>${round1(r.technical)}%</td><td>${round1(r.visit)}%</td><td><strong>${round1(r.average)}%</strong></td><td>${round1(r.firstVisitPct)}%</td><td>${r.improper}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderExports(user){
  if(!canOperateQuality(user))return noAccess();
  return `<div class="page-head"><div><h2>Exportaciones para Calidad</h2><p>Archivos CSV compatibles con Excel para consolidar la base de datos de CODELPA.</p></div></div>
    <div class="alert alert-info">La estructura actual es una propuesta basada en el RFP. Cuando compartas el formato exacto de la base de datos corporativa, se puede igualar el nombre y orden de las columnas.</div>
    <div class="grid grid-2">
      ${exportCard('Inspecciones realizadas','Una fila por inspección con proyecto, responsables, taller, ubicación, resultados, visitas, semáforo y decisión.','exportInspections','Exportar CSV')}
      ${exportCard('Detalle de criterios','Una fila por criterio evaluado, ideal para análisis de puntos débiles y auditoría.','exportCriteria','Exportar CSV')}
      ${exportCard('Calificación por taller','Promedios semanales o mensuales por taller, etapa, objetivo y semáforo.','exportWorkshops','Exportar periodo')}
      ${exportCard('Calificación por ingeniero','Promedios por ingeniero de ejecución, técnico, visitas, final e inspecciones en primera visita.','exportEngineers','Exportar periodo')}
      ${exportCard('Respaldo completo','Descarga todos los datos del demo en JSON para pruebas y migración futura.','exportBackup','Descargar JSON')}
    </div>
    <div class="card" style="margin-top:16px"><h3>Periodo para reportes</h3><div class="filters"><div class="field"><label>Tipo</label><select id="exportMode"><option value="month" ${ui.reportMode==='month'?'selected':''}>Mensual</option><option value="week" ${ui.reportMode==='week'?'selected':''}>Semanal</option></select></div><div class="field"><label>Periodo</label><input id="exportValue" type="${ui.reportMode==='week'?'week':'month'}" value="${escapeHtml(ui.reportValue)}"></div></div></div>`;
}
function exportCard(title,desc,id,label){return `<div class="card export-card"><div><h3>${title}</h3><p>${desc}</p></div><div class="button-row"><button id="${id}" class="btn btn-primary">${label}</button></div></div>`;}

function renderUsers(user){
  if(!canConfigure(user))return noAccess();
  return `<div class="page-head"><div><h2>Usuarios y permisos</h2><p>Clasificación por rol y proyecto.</p></div></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Proyecto</th><th>Permisos principales</th></tr></thead><tbody>${data.users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge ${u.role==='EJECUCION'?'badge-blue':u.role.includes('CALIDAD')?'badge-green':'badge-gray'}">${escapeHtml(ROLE_LABELS[u.role])}</span></td><td>${escapeHtml(u.projectIds.join(', '))}</td><td>${escapeHtml(permissionSummary(u.role))}</td></tr>`).join('')}</tbody></table></div>`;
}
function permissionSummary(role){return {EJECUCION:'Solicitar inspecciones, consultar historial, instructivos y mapeos',CALIDAD:'Tomar y evaluar inspecciones, exportar y consultar calificaciones',COORDINADOR_CALIDAD:'Permisos de Calidad, monitoreo y configuración',GERENCIA:'Consulta del proyecto y calificaciones',PRESIDENTE:'Consulta ejecutiva global'}[role]||'Consulta';}

function bindGlobal(){
  document.querySelectorAll('[data-demo-email]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('loginEmail').value=b.dataset.demoEmail;document.getElementById('loginPassword').value='1234';}));
  document.getElementById('loginBtn')?.addEventListener('click',login);
  ['loginEmail','loginPassword'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')login();}));
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  document.getElementById('logoutBtn')?.addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY);ui={view:'home',selectedId:null,queueTab:'DISPONIBLES',reportMode:'month',reportValue:'2026-07',docSearch:'',mapSearch:'',templateFilter:''};render();});
  document.getElementById('resetBtn')?.addEventListener('click',()=>{if(confirm('¿Restablecer todos los datos del demo?')){data=initialData();saveData();toast('Demo restablecido');navigate('home');}});
  document.getElementById('menuBtn')?.addEventListener('click',()=>{document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.remove('hidden');});
  document.getElementById('overlay')?.addEventListener('click',closeDrawer);
}

function bindView(user){
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{ui.selectedId=b.dataset.open;ui.view='detail';render();}));
  document.querySelectorAll('[data-take]').forEach(b=>b.addEventListener('click',()=>takeInspection(user,b.dataset.take)));
  document.querySelectorAll('[data-evaluate]').forEach(b=>b.addEventListener('click',()=>openEvaluation(user,b.dataset.evaluate)));
  document.querySelectorAll('[data-improper]').forEach(b=>b.addEventListener('click',()=>markImproper(user,b.dataset.improper)));
  document.querySelectorAll('[data-queue]').forEach(b=>b.addEventListener('click',()=>{ui.queueTab=b.dataset.queue;render();}));

  document.getElementById('reqTemplate')?.addEventListener('change',e=>{ui.templateFilter=e.target.value;render();setTimeout(()=>{document.getElementById('reqTemplate').value=ui.templateFilter;},0);});
  document.getElementById('saveDraft')?.addEventListener('click',()=>createInspection(user,false));
  document.getElementById('submitRequest')?.addEventListener('click',()=>createInspection(user,true));

  document.querySelectorAll('[data-answer]').forEach(s=>s.addEventListener('change',()=>{const i=data.inspections.find(x=>x.id===ui.selectedId);i.answers[s.dataset.answer]=s.value;saveData();render();}));
  document.querySelectorAll('[data-note]').forEach(x=>x.addEventListener('change',()=>{const i=data.inspections.find(v=>v.id===ui.selectedId);i.notes[x.dataset.note]=x.value;saveData();}));
  document.getElementById('visitsCount')?.addEventListener('change',e=>{const i=data.inspections.find(x=>x.id===ui.selectedId);i.visitsCount=Number(e.target.value);i.firstVisit=i.visitsCount===1;saveData();render();});
  document.getElementById('generalObservation')?.addEventListener('change',e=>{const i=data.inspections.find(x=>x.id===ui.selectedId);i.generalObservation=e.target.value;saveData();});
  document.getElementById('markCompliant')?.addEventListener('click',()=>markAllCompliant());
  document.querySelectorAll('[data-finish]').forEach(b=>b.addEventListener('click',()=>finishEvaluation(user,b.dataset.finish)));

  document.getElementById('docSearch')?.addEventListener('input',e=>{ui.docSearch=e.target.value;render();document.getElementById('docSearch')?.focus();});
  document.getElementById('mapSearch')?.addEventListener('input',e=>{ui.mapSearch=e.target.value;render();document.getElementById('mapSearch')?.focus();});
  document.getElementById('reportMode')?.addEventListener('change',e=>{ui.reportMode=e.target.value;ui.reportValue=e.target.value==='week'?'2026-W29':'2026-07';render();});
  document.getElementById('reportValue')?.addEventListener('change',e=>{ui.reportValue=e.target.value;render();});
  document.getElementById('exportMode')?.addEventListener('change',e=>{ui.reportMode=e.target.value;ui.reportValue=e.target.value==='week'?'2026-W29':'2026-07';render();});
  document.getElementById('exportValue')?.addEventListener('change',e=>{ui.reportValue=e.target.value;render();});
  document.getElementById('exportInspections')?.addEventListener('click',exportInspections);
  document.getElementById('exportCriteria')?.addEventListener('click',exportCriteria);
  document.getElementById('exportWorkshops')?.addEventListener('click',exportWorkshops);
  document.getElementById('exportEngineers')?.addEventListener('click',exportEngineers);
  document.getElementById('exportBackup')?.addEventListener('click',()=>downloadFile('quality_project_control_respaldo.json',JSON.stringify(data,null,2),'application/json'));
}

function login(){
  const email=document.getElementById('loginEmail').value.trim().toLowerCase(),password=document.getElementById('loginPassword').value;
  const user=data.users.find(u=>u.email.toLowerCase()===email&&u.password===password);
  if(!user){document.getElementById('loginError').innerHTML='<div class="login-error">Correo o contraseña incorrectos.</div>';return;}
  localStorage.setItem(SESSION_KEY,JSON.stringify({userId:user.id}));ui.view='home';render();
}
function navigate(view){ui.view=view;if(!['detail','evaluate'].includes(view))ui.selectedId=null;render();closeDrawer();window.scrollTo({top:0});}
function closeDrawer(){document.getElementById('sidebar')?.classList.remove('open');document.getElementById('overlay')?.classList.add('hidden');}

function createInspection(user,submit){
  const t=templateById(document.getElementById('reqTemplate').value),m=mappingById(document.getElementById('reqMapping').value),ready=document.getElementById('reqReady').checked;
  const attachments=[...document.getElementById('reqPhotos').files].map(f=>f.name);
  const i={id:'i-'+Date.now(),code:nextCode(),projectId:'LCE',createdBy:user.id,templateId:t.id,mappingId:m.id,contractor:document.getElementById('reqContractor').value.trim(),location:`${m.block} · ${m.level} · ${m.area}`,packageCode:nextPackage(t,m),scope:document.getElementById('reqScope').value.trim(),requestedDate:document.getElementById('reqDate').value,requestedTime:document.getElementById('reqTime').value,ready,status:submit?'SOLICITADA':'BORRADOR',assignedQualityId:null,createdAt:nowISO(),answers:{},notes:{},technicalScore:null,visitScore:null,finalScore:null,objective:t.objective,traffic:null,decision:null,visitsCount:0,firstVisit:false,weakCriteria:[],attachments,audit:[{at:nowISO(),userId:user.id,action:submit?'Solicitud enviada a Calidad':'Borrador creado'}]};
  data.inspections.unshift(i);saveData();toast(submit?'Solicitud enviada a Calidad':'Borrador guardado');ui.view='myInspections';render();
}

function takeInspection(user,id){
  const i=data.inspections.find(x=>x.id===id);if(!i||i.status!=='SOLICITADA')return;i.assignedQualityId=user.id;i.status='TOMADA';i.audit.push({at:nowISO(),userId:user.id,action:'Inspección tomada por Calidad'});saveData();toast('Inspección asignada a su usuario');ui.selectedId=id;ui.view='detail';render();
}
function openEvaluation(user,id){
  const i=data.inspections.find(x=>x.id===id);if(!i)return;if(i.status==='TOMADA'){i.status='EN_EVALUACION';i.startedAt=nowISO();i.visitsCount=i.visitsCount||1;i.audit.push({at:nowISO(),userId:user.id,action:'Evaluación iniciada'});saveData();}ui.selectedId=id;ui.view='evaluate';render();
}
function markImproper(user,id){
  const i=data.inspections.find(x=>x.id===id);if(!i)return;if(!confirm('¿Marcar esta inspección como improcedente por área no lista u otra causa?'))return;i.status='IMPROCEDENTE';i.decision='Improcedente';i.completedAt=nowISO();i.closedBy=user.id;i.audit.push({at:nowISO(),userId:user.id,action:'Inspección marcada como improcedente'});saveData();toast('Inspección improcedente registrada');ui.selectedId=id;ui.view='detail';render();
}
function markAllCompliant(){
  const i=data.inspections.find(x=>x.id===ui.selectedId),t=templateById(i.templateId);t.criteria.forEach(c=>{const best=[...c.options].filter(o=>o.factor!==null).sort((a,b)=>b.factor-a.factor)[0];i.answers[c.id]=best?.label||'';});saveData();render();
}
function finishEvaluation(user,decision){
  const i=data.inspections.find(x=>x.id===ui.selectedId),t=templateById(i.templateId);const unanswered=t.criteria.filter(c=>!i.answers[c.id]);if(unanswered.length){toast(`Faltan ${unanswered.length} criterios por evaluar`);return;}
  const s=calculateInspection(i);i.technicalScore=round1(s.technical);i.visitScore=round1(s.visit);i.finalScore=round1(s.final);i.traffic=s.traffic;i.decision=decision;i.status=statusFromDecision(decision);i.completedAt=nowISO();i.closedBy=user.id;i.visitsCount=i.visitsCount||1;i.firstVisit=i.visitsCount===1;i.weakCriteria=t.criteria.filter(c=>{const f=answerFactor(c,i.answers[c.id]);return f!==null&&f<.75;}).map(c=>c.name);i.audit.push({at:nowISO(),userId:user.id,action:`Evaluación cerrada: ${decision}`});saveData();toast('Evaluación guardada');ui.view='detail';render();
}

function exportInspections(){
  const headers=['Código','Fecha solicitud','Fecha cierre','Proyecto','Taller','Etapa','Planilla','Versión','Ingeniero de ejecución','Ingeniero de Calidad','Contratista','Ubicación','Mapeo','Paquete de liberación','Resultado técnico','Resultado visitas/preparación','Resultado final','Objetivo','Diferencia','Semáforo','Visitas','Estado','Decisión','Observación general'];
  const rows=data.inspections.map(i=>{const t=templateById(i.templateId),e=userById(i.createdBy),q=userById(i.assignedQualityId),m=mappingById(i.mappingId);return [i.code,i.requestedDate,i.completedAt?i.completedAt.slice(0,10):'', 'Lopesan La Ceiba',t?.activity,t?.stage,t?.title,t?.version,e?.name,q?.name||'',i.contractor,i.location,m?.code||'',i.packageCode,i.technicalScore??'',i.visitScore??'',i.finalScore??'',i.objective,Number.isFinite(i.finalScore)?round1(i.finalScore-i.objective):'',i.traffic||'',i.visitsCount,i.status,i.decision||'',i.generalObservation||''];});
  downloadCSV('inspecciones_quality_project_control.csv',headers,rows);
}
function exportCriteria(){
  const headers=['Código inspección','Fecha cierre','Taller','Etapa','Ingeniero de ejecución','Criterio','Descripción','Peso','Tipo de respuesta','Respuesta','Factor','Observación','Es criterio de visita','Hoja Excel','Fila fuente'];const rows=[];
  data.inspections.forEach(i=>{const t=templateById(i.templateId),e=userById(i.createdBy);t.criteria.forEach(c=>rows.push([i.code,i.completedAt?i.completedAt.slice(0,10):'',t.activity,t.stage,e?.name,c.name,c.description,c.weight,c.responseType,i.answers[c.id]||'',answerFactor(c,i.answers[c.id]),i.notes[c.id]||'',c.isVisitCriterion?'Sí':'No',t.sheet,c.sourceRow]));});
  downloadCSV('detalle_criterios_quality_project_control.csv',headers,rows);
}
function exportWorkshops(){
  const rows=completedInspections().filter(i=>periodMatches(i.completedAt.slice(0,10),ui.reportMode,ui.reportValue));const grouped=groupRatings(rows,'activity');
  downloadCSV(`calificacion_talleres_${ui.reportValue}.csv`,['Periodo','Taller','Etapa','Inspecciones','Promedio técnico','Promedio visitas/preparación','Resultado final','Objetivo','Diferencia','Semáforo'],grouped.map(r=>[ui.reportValue,r.activity,r.stage,r.count,round1(r.technical),round1(r.visit),round1(r.average),r.objective,round1(r.average-r.objective),trafficFor(r.average,r.objective)]));
}
function exportEngineers(){
  const rows=completedInspections().filter(i=>periodMatches(i.completedAt.slice(0,10),ui.reportMode,ui.reportValue));const grouped=groupRatings(rows,'engineer');
  downloadCSV(`calificacion_ingenieros_${ui.reportValue}.csv`,['Periodo','Ingeniero de ejecución','Inspecciones','Promedio técnico','Promedio visitas/preparación','Resultado final','Liberadas en primera visita (%)','Improcedentes'],grouped.map(r=>[ui.reportValue,r.engineer,r.count,round1(r.technical),round1(r.visit),round1(r.average),round1(r.firstVisitPct),r.improper]));
}
function downloadCSV(filename,headers,rows){const csv='\ufeff'+[headers,...rows].map(r=>r.map(csvEscape).join(',')).join('\n');downloadFile(filename,csv);toast('Archivo generado');}

render();
