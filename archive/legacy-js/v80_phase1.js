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
