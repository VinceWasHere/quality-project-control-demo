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
