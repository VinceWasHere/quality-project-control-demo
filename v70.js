
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
