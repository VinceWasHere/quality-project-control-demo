/* Quality Project Control V6.11 - objetivo asignado por taller */
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
})();
