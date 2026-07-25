import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(app,/max:100/,'La escala porcentual debe terminar en 100.');
assert.match(app,/qpcPhase9ReferenceLines/,'Debe existir el plugin de líneas de referencia.');
assert.match(app,/phase9RenderMyInspections/,'Debe existir el filtro de Mis inspecciones.');
assert.match(app,/assignedQualityId\?\?inspection\?\.assigned_quality_id/,'Debe filtrar por asignación relacional o legado.');
assert.match(app,/viewBox="0 0 24 24"/,'El combobox debe usar un chevrón SVG.');
assert.match(styles,/#loginEmailToggle\[aria-expanded="true"\] svg/,'El chevrón debe girar al abrir el combobox.');
assert.match(html,/app\.bundle\.js\?v=8\.8\.0/,'El bundle debe invalidar caché con V8.8.0.');
assert.match(html,/styles\.css\?v=8\.8\.0/,'Los estilos deben invalidar caché con V8.8.0.');

console.log('V8.8 static checks: OK');
