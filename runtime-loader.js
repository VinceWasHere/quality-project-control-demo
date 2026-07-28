/* Quality Project Control MAIN V10.5 — carga diferida de librerías pesadas */
(()=>{
  'use strict';
  const cache=new Map();
  const sources={
    chart:'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js',
    xlsx:'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    jspdf:'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    autotable:'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
    pptx:'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
    pdfjs:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  };
  function present(name){
    return name==='chart'?typeof window.Chart!=='undefined':
      name==='xlsx'?typeof window.XLSX!=='undefined':
      name==='jspdf'?Boolean(window.jspdf?.jsPDF):
      name==='autotable'?Boolean(window.jspdf?.jsPDF?.API?.autoTable||window.jspdf?.jsPDF&&window.jspdf.jsPDF.API.autoTable):
      name==='pptx'?Boolean(window.PptxGenJS||window.pptxgen):
      name==='pdfjs'?Boolean(window.pdfjsLib):false;
  }
  function load(name){
    if(present(name))return Promise.resolve();
    if(cache.has(name))return cache.get(name);
    const src=sources[name];
    if(!src)return Promise.reject(new Error(`Librería desconocida: ${name}`));
    const task=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.async=true;
      script.crossOrigin='anonymous';
      script.referrerPolicy='no-referrer';
      script.dataset.qpcLibrary=name;
      script.onload=()=>present(name)?resolve():reject(new Error(`La librería ${name} cargó sin exponer su API.`));
      script.onerror=()=>reject(new Error(`No se pudo cargar ${name}.`));
      document.head.appendChild(script);
    }).catch(error=>{cache.delete(name);throw error;});
    cache.set(name,task);
    return task;
  }
  async function ensure(names){
    const requested=Array.isArray(names)?names:[names];
    for(const name of requested){
      if(name==='pdf'){await load('jspdf');await load('autotable');}
      else await load(name);
    }
  }
  window.qpcEnsureLibraries=ensure;
  window.qpcLoadLibrary=load;
})();
