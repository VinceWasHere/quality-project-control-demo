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
