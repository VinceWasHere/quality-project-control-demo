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
