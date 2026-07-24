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
