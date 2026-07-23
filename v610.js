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
