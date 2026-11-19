'use strict';

const endpoint = 'https://jrafismybtvtbuotyxna.supabase.co';
const publicKey = 'sb_publishable_6uorT4dql4ZUZsJXf8uoxQ_v1o4RUik';
const byId = id => document.getElementById(id);
const panel = byId('panel');
const history = byId('history');
const punch = byId('punch');
const message = byId('message');
const stamp = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid'
});
const fields = 'id,tipo,momento,recibido_servidor_en,registrado_sin_conexion,trabajadores(nombre,apellidos)';
let session;
let busy = false;

async function request(path, body) {
  const headers = { apikey: publicKey };
  if (session) headers.Authorization = 'Bearer ' + session.access_token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(endpoint + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const result = response.status === 204 ? null : await response.json();
  if (response.status === 401 && session) {
    resetSession();
    throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
  }
  if (!response.ok) throw new Error(result?.message || result?.msg || 'Supabase no ha podido completar la operación.');
  return result;
}

function resetSession() {
  session = undefined;
  panel.hidden = true;
  punch.hidden = true;
  history.replaceChildren();
  byId('access').hidden = false;
  byId('password').value = '';
}

async function run(action) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  message.textContent = '';
  try {
    await action();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

function records(params) {
  return request('/rest/v1/fichajes?' + new URLSearchParams({ select: fields, ...params }));
}

function nameOf(entry) {
  const worker = entry.trabajadores;
  return worker ? [worker.nombre, worker.apellidos].filter(Boolean).join(' ') : '';
}

async function loadHistory() {
  const rows = await records({ order: 'momento.desc,id.desc', limit: '50' });
  history.replaceChildren();
  for (const row of rows) {
    const item = document.createElement('li');
    item.textContent = [nameOf(row), row.tipo, stamp.format(new Date(row.momento))].filter(Boolean).join(' · ');
    history.append(item);
  }
  if (!rows.length) {
    const item = document.createElement('li');
    item.textContent = 'Todavía no hay fichajes en Supabase.';
    history.append(item);
  }
}

byId('login').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    try {
      session = await request('/auth/v1/token?grant_type=password', {
        email: byId('email').value.trim(),
        password: byId('password').value
      });
      const uid = session.user.id;
      const [admins, workers] = await Promise.all([
        request('/rest/v1/administradores?select=usuario_id&usuario_id=eq.' + encodeURIComponent(uid)),
        request('/rest/v1/trabajadores?select=nombre,activo&usuario_id=eq.' + encodeURIComponent(uid))
      ]);
      const admin = admins.length > 0;
      const worker = workers.find(item => item.activo);
      if (!admin && !worker) throw new Error('Esta cuenta todavía no tiene un trabajador activo asignado.');
      byId('identity').textContent = admin ? 'Administrador' : worker.nombre;
      punch.hidden = admin;
      await loadHistory();
      byId('access').hidden = true;
      panel.hidden = false;
    } catch (error) {
      resetSession();
      throw error;
    }
  });
});

punch.addEventListener('click', () => run(async () => {
  let entry;
  try {
    entry = await request('/rest/v1/rpc/fichar_mi_jornada', {});
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('La conexión se interrumpió. Actualiza el historial para comprobar si se guardó antes de volver a fichar.');
    }
    throw error;
  }
  message.textContent = 'Guardado en Supabase · ' + entry.tipo + ' · ' + stamp.format(new Date(entry.momento));
  try {
    await loadHistory();
  } catch {
    message.textContent += '. No se pudo actualizar el historial.';
  }
}));

byId('refresh').addEventListener('click', () => run(loadHistory));
byId('logout').addEventListener('click', () => run(async () => {
  try {
    await request('/auth/v1/logout?scope=local', {});
  } finally {
    resetSession();
  }
}));

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\t\r\n]|^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

byId('export').addEventListener('click', () => run(async () => {
  const latest = await records({ order: 'id.desc', limit: '1' });
  const lines = [['ID', 'Trabajador', 'Movimiento', 'Fecha y hora de Madrid', 'Fecha y hora ISO', 'Recibido en Supabase (ISO)', 'Sin conexión'].map(csvCell).join(';')];
  if (latest.length) {
    let after = 0;
    while (after < latest[0].id) {
      const page = await records({ and: '(id.gt.' + after + ',id.lte.' + latest[0].id + ')', order: 'id.asc', limit: '500' });
      if (!page.length) break;
      for (const row of page) {
        lines.push([row.id, nameOf(row), row.tipo, stamp.format(new Date(row.momento)), row.momento,
          row.recibido_servidor_en, row.registrado_sin_conexion ? 'Sí' : 'No'].map(csvCell).join(';'));
      }
      after = page.at(-1).id;
    }
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'servilucar-fichajes-supabase-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
