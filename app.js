pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// ESTADO GLOBAL
// ============================================================
let currentTool     = 'cursor';
let markers         = [];
let textAnnotations = [];
let zoom            = 1;
let counters        = { rede: 0, telefone: 0, camera: 0, switch: 0 };
let editingMarkerId = null;

// renderScale: quantos pixels do canvas real correspondem a 1 pixel CSS na tela
// Ex: canvas.width=2480, canvas style width=800px → renderScale=3.1
let renderScale = 1;

const COLORS = { rede: '#4af0b8', telefone: '#f0a84a', camera: '#f04a7a', switch: '#60a5fa' };
const LABELS = { rede: 'Rede',    telefone: 'Telefone', camera: 'Câmera',  switch: 'Switch' };

// ============================================================
// SELEÇÃO DE FERRAMENTA
// ============================================================
function setTool(t) {
  currentTool = t;
  closeEditPopup();
  ['cursor','rede','telefone','camera','switch','texto'].forEach(x => {
    const b = document.getElementById('btn-' + x);
    if (b) b.className = 'tool-btn' + (x === t ? ' active-' + x : '');
  });
  const ml = document.getElementById('markers-layer');
  if      (t === 'texto')  ml.style.cssText = 'position:absolute;inset:0;pointer-events:all;cursor:text;';
  else if (t !== 'cursor') ml.style.cssText = 'position:absolute;inset:0;pointer-events:all;cursor:crosshair;';
  else                     ml.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
}

// ============================================================
// ZOOM
// ============================================================
function changeZoom(d) { zoom = Math.min(3, Math.max(0.3, zoom + d)); applyZoom(); }
function resetZoom()   { zoom = 1; applyZoom(); }
function applyZoom() {
  document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
  const w = document.getElementById('canvas-wrapper');
  w.style.transform = `scale(${zoom})`;
  w.style.transformOrigin = 'top left';
}

// ============================================================
// CARREGAMENTO DE ARQUIVO
// ============================================================
const dropZone   = document.getElementById('drop-zone');
const canvasArea = document.getElementById('canvas-area');

canvasArea.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
canvasArea.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
canvasArea.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
document.getElementById('pdf-input').addEventListener('change', e => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});

async function loadFile(file) {
  const canvas = document.getElementById('pdf-canvas');
  const ctx    = canvas.getContext('2d');

  if (file.type === 'application/pdf') {
    const ab          = await file.arrayBuffer();
    const pdf         = await pdfjsLib.getDocument({ data: ab }).promise;
    const page        = await pdf.getPage(1);
    const baseVP      = page.getViewport({ scale: 1 });
    // Renderiza em alta res para exportação (scale=4)
    const pdfScale    = 5;
    const viewport    = page.getViewport({ scale: pdfScale });
    canvas.width      = viewport.width;
    canvas.height     = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // CSS: exibe o canvas em tamanho "natural" (scale=1 do PDF)
    canvas.style.width  = baseVP.width  + 'px';
    canvas.style.height = baseVP.height + 'px';

    // renderScale = quantos pixels reais por pixel CSS
    renderScale = pdfScale;

  } else {
    const url = URL.createObjectURL(file);
    await new Promise(resolve => {
      const img  = new Image();
      img.onload = () => {
        canvas.width  = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        // Imagem: exibe no tamanho original, sem escala extra
        canvas.style.width  = img.width  + 'px';
        canvas.style.height = img.height + 'px';
        renderScale = 1;
        resolve();
      };
      img.src = url;
    });
  }

  document.getElementById('drop-zone').style.display      = 'none';
  document.getElementById('canvas-wrapper').style.display = 'block';

  // Se já existem marcadores, pergunta se quer preservar
  if (markers.length > 0) {
    const manter = confirm(`Você já tem ${markers.length} ponto(s) marcado(s).\n\nOK = mantém os pontos na nova planta.\nCancelar = apaga tudo e começa do zero.`);
    if (!manter) {
      document.getElementById('markers-layer').innerHTML = '';
      markers = []; textAnnotations = [];
      counters = { rede: 0, telefone: 0, camera: 0, switch: 0 };
    } else {
      // Re-renderiza os marcadores existentes sobre a nova planta
      document.getElementById('markers-layer').innerHTML = '';
      markers.forEach(m => renderMarker(m));
      textAnnotations.forEach(a => restoreTextAnnotation(a));
    }
  } else {
    document.getElementById('markers-layer').innerHTML = '';
    markers = []; textAnnotations = [];
    counters = { rede: 0, telefone: 0, camera: 0, switch: 0 };
  }

  renderSidebar();
  showToast('Planta carregada!');
}

// Restaura anotação de texto (sem foco automático)
function restoreTextAnnotation(a) {
  const wrapper = document.createElement('div');
  wrapper.className  = 'text-annotation';
  wrapper.id         = a.id;
  wrapper.style.left = a.x + 'px';
  wrapper.style.top  = a.y + 'px';

  const box = document.createElement('div');
  box.className       = 'text-box';
  box.contentEditable = 'true';
  box.spellcheck      = false;
  box.innerText       = a.text;

  const delBtn = document.createElement('button');
  delBtn.className = 'del-text-btn';
  delBtn.innerHTML = '\u2715';
  delBtn.addEventListener('click', e => { e.stopPropagation(); removeTextAnnotation(a.id); });

  box.addEventListener('input', () => {
    const found = textAnnotations.find(t => t.id === a.id);
    if (found) found.text = box.innerText;
  });
  box.addEventListener('mousedown', e => e.stopPropagation());
  box.addEventListener('click',     e => e.stopPropagation());

  wrapper.addEventListener('mousedown', e => {
    if (e.target === box || e.target === delBtn) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(wrapper.style.left), oy = parseFloat(wrapper.style.top);
    const mv = mv => { wrapper.style.left=(ox+(mv.clientX-sx)/zoom)+'px'; wrapper.style.top=(oy+(mv.clientY-sy)/zoom)+'px'; };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      const found = textAnnotations.find(t => t.id === a.id);
      if (found) { found.x = parseFloat(wrapper.style.left); found.y = parseFloat(wrapper.style.top); }
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });

  wrapper.appendChild(box);
  wrapper.appendChild(delBtn);
  document.getElementById('markers-layer').appendChild(wrapper);
}

// ============================================================
// CLIQUE NA PLANTA
// As coordenadas salvas em m.x / m.y são PIXELS CSS (tela),
// NÃO pixels do canvas real.
// Na exportação multiplicamos por renderScale para obter
// a posição correta no canvas de alta resolução.
// ============================================================
document.getElementById('markers-layer').addEventListener('click', function(e) {
  if (e.target.closest('.text-annotation')) return;
  if (e.target.closest('.marker'))          return;
  closeEditPopup();

  const rect = this.getBoundingClientRect();
  // Posição em CSS pixels (independente do zoom)
  const x = (e.clientX - rect.left) / zoom;
  const y = (e.clientY - rect.top)  / zoom;

  if      (currentTool === 'texto')  addTextAnnotation(x, y);
  else if (currentTool !== 'cursor') addMarker(currentTool, x, y);
});

// ============================================================
// MARCADORES
// ============================================================
function addMarker(type, x, y) {
  counters[type]++;
  const id    = Date.now();
  const num   = counters[type];
  const label = LABELS[type] + ' ' + num;
  markers.push({ id, type, x, y, num, label });
  renderMarker(markers[markers.length - 1]);
  renderSidebar();
}

function renderMarker(m) {
  const color = COLORS[m.type];
  const old   = document.getElementById('marker-' + m.id);
  if (old) old.remove();

  const el          = document.createElement('div');
  el.className      = 'marker';
  el.id             = 'marker-' + m.id;
  el.style.left     = m.x + 'px';
  el.style.top      = m.y + 'px';

  const shape = m.type === 'switch'
    ? `<rect x="4" y="4" width="20" height="20" rx="4" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="1.5"/>
       <rect x="8" y="8" width="12" height="12" rx="2" fill="${color}"/>
       <text x="14" y="18" text-anchor="middle" font-size="8" font-weight="bold" fill="#0f1117" font-family="monospace">${m.num}</text>`
    : `<circle cx="14" cy="14" r="12" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="1.5"/>
       <circle cx="14" cy="14" r="7" fill="${color}"/>
       <text x="14" y="18" text-anchor="middle" font-size="9" font-weight="bold" fill="#0f1117" font-family="monospace">${m.num}</text>`;

  el.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28">${shape}</svg>
    <div class="label" style="background:${color}22;color:${color};border:1px solid ${color}44">${m.label}</div>
  `;

  el.addEventListener('click', e => {
    e.stopPropagation();
    if (currentTool === 'cursor') openEditPopup(m.id);
  });

  document.getElementById('markers-layer').appendChild(el);
}

function removeMarker(id) {
  markers = markers.filter(m => m.id !== id);
  const el = document.getElementById('marker-' + id);
  if (el) el.remove();
  closeEditPopup();
  renderSidebar();
}

// ============================================================
// POPUP DE EDIÇÃO
// ============================================================
function openEditPopup(id) {
  closeEditPopup();
  editingMarkerId = id;
  const m = markers.find(m => m.id === id);
  if (!m) return;
  const color = COLORS[m.type];

  const popup         = document.createElement('div');
  popup.id            = 'edit-popup';
  popup.style.cssText = `
    position:absolute; left:${m.x+20}px; top:${m.y-10}px;
    background:#1e2235; border:1.5px solid ${color}; border-radius:8px;
    padding:10px 12px; z-index:100; min-width:180px;
    box-shadow:0 8px 24px rgba(0,0,0,0.6);
  `;
  popup.innerHTML = `
    <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color};margin-bottom:6px;">Editar ponto</div>
    <input id="edit-label-input" type="text" value="${m.label}"
      style="width:100%;background:#0f1117;border:1px solid #252a3a;border-radius:4px;
             padding:5px 8px;color:#e8eaf0;font-family:'Syne',sans-serif;font-size:12px;outline:none;margin-bottom:8px;"/>
    <div style="display:flex;gap:6px;">
      <button onclick="saveMarkerLabel(${id})"
        style="flex:1;padding:5px;border-radius:4px;border:none;background:${color};
               color:#0f1117;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;cursor:pointer;">Salvar</button>
      <button onclick="removeMarker(${id})"
        style="flex:1;padding:5px;border-radius:4px;border:1px solid #f04a7a;background:transparent;
               color:#f04a7a;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;cursor:pointer;">Remover</button>
    </div>
  `;

  document.getElementById('markers-layer').appendChild(popup);
  const input = document.getElementById('edit-label-input');
  input.focus(); input.select();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  saveMarkerLabel(id);
    if (e.key === 'Escape') closeEditPopup();
    e.stopPropagation();
  });
  input.addEventListener('mousedown', e => e.stopPropagation());
  input.addEventListener('click',     e => e.stopPropagation());
  popup.addEventListener('mousedown', e => e.stopPropagation());
  popup.addEventListener('click',     e => e.stopPropagation());
}

function saveMarkerLabel(id) {
  const input = document.getElementById('edit-label-input');
  if (!input) return;
  const m = markers.find(m => m.id === id);
  if (m) { m.label = input.value.trim() || m.label; renderMarker(m); renderSidebar(); }
  closeEditPopup();
}

function closeEditPopup() {
  const p = document.getElementById('edit-popup');
  if (p) p.remove();
  editingMarkerId = null;
}

// ============================================================
// ANOTAÇÕES DE TEXTO
// ============================================================
function addTextAnnotation(x, y) {
  const id = 'txt-' + Date.now();
  textAnnotations.push({ id, x, y, text: '' });

  const wrapper = document.createElement('div');
  wrapper.className = 'text-annotation';
  wrapper.id        = id;
  wrapper.style.left = x + 'px';
  wrapper.style.top  = y + 'px';

  const box = document.createElement('div');
  box.className       = 'text-box';
  box.contentEditable = 'true';
  box.spellcheck      = false;

  const delBtn = document.createElement('button');
  delBtn.className = 'del-text-btn';
  delBtn.innerHTML = '✕';
  delBtn.addEventListener('click', e => { e.stopPropagation(); removeTextAnnotation(id); });

  box.addEventListener('input', () => {
    const a = textAnnotations.find(a => a.id === id);
    if (a) a.text = box.innerText;
  });
  box.addEventListener('mousedown', e => e.stopPropagation());
  box.addEventListener('click',     e => e.stopPropagation());

  wrapper.addEventListener('mousedown', e => {
    if (e.target === box || e.target === delBtn) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(wrapper.style.left), oy = parseFloat(wrapper.style.top);
    const mv = m => { wrapper.style.left = (ox + (m.clientX-sx)/zoom)+'px'; wrapper.style.top = (oy+(m.clientY-sy)/zoom)+'px'; };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      const a = textAnnotations.find(a => a.id === id);
      if (a) { a.x = parseFloat(wrapper.style.left); a.y = parseFloat(wrapper.style.top); }
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });

  wrapper.appendChild(box);
  wrapper.appendChild(delBtn);
  document.getElementById('markers-layer').appendChild(wrapper);
  setTimeout(() => box.focus(), 50);
}

function removeTextAnnotation(id) {
  textAnnotations = textAnnotations.filter(a => a.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
  document.getElementById('cnt-rede').textContent   = markers.filter(m=>m.type==='rede').length;
  document.getElementById('cnt-tel').textContent    = markers.filter(m=>m.type==='telefone').length;
  document.getElementById('cnt-cam').textContent    = markers.filter(m=>m.type==='camera').length;
  document.getElementById('cnt-switch').textContent = markers.filter(m=>m.type==='switch').length;

  const list = document.getElementById('markers-list');
  if (markers.length === 0) {
    list.innerHTML = '<div class="empty-list">Nenhum ponto marcado.<br>Selecione uma ferramenta e clique na planta.</div>';
    return;
  }
  list.innerHTML = markers.map(m => `
    <div class="marker-item" ondblclick="openEditPopup(${m.id})">
      <div class="marker-dot" style="background:${COLORS[m.type]}"></div>
      <div class="marker-info">
        <div class="m-type" style="color:${COLORS[m.type]}">${m.label}</div>
        <div class="m-num">${LABELS[m.type]} · ${Math.round(m.x)}, ${Math.round(m.y)}</div>
      </div>
      <button class="del-btn" onclick="removeMarker(${m.id})">✕</button>
    </div>
  `).join('');
}

// ============================================================
// CANVAS FINAL PARA EXPORTAÇÃO
// Aqui multiplicamos x/y por renderScale para converter
// coordenadas CSS → pixels reais do canvas de alta resolução.
// O tamanho do marcador também escala junto (28px na tela → 28*renderScale no canvas).
// ============================================================
function buildFlatCanvas() {
  const pdfCanvas = document.getElementById('pdf-canvas');
  const out = document.createElement('canvas');
  out.width  = pdfCanvas.width;
  out.height = pdfCanvas.height;
  const ctx  = out.getContext('2d');

  ctx.drawImage(pdfCanvas, 0, 0);

  // Tamanho do marcador na tela = 14px raio
  // No canvas exportado = 14 * renderScale
  const R  =  7 * renderScale;  // raio externo
  const Ri =  4 * renderScale;  // raio interno
  const lw =  1 * renderScale;
  const fN = Math.round(5  * renderScale);
  const fL = Math.round(5  * renderScale);
  const sq = Math.round(10 * renderScale); // lado do quadrado (switch)

  markers.forEach(m => {
    const color = COLORS[m.type];
    // Converte coordenadas CSS → canvas real
    const cx = m.x * renderScale;
    const cy = m.y * renderScale;

    ctx.save();

    if (m.type === 'switch') {
      const half = sq / 2;
      ctx.beginPath();
      roundRect(ctx, cx-half-4*renderScale, cy-half-4*renderScale, sq+8*renderScale, sq+8*renderScale, 4*renderScale);
      ctx.fillStyle = color+'33'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();

      ctx.beginPath();
      roundRect(ctx, cx-half, cy-half, sq, sq, 3*renderScale);
      ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI*2);
      ctx.fillStyle = color+'33'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, Ri, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
    }

    // Número
    ctx.fillStyle = '#0f1117';
    ctx.font = `bold ${fN}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.num, cx, cy);

    // Label
    const lblY = cy + (m.type==='switch' ? sq/2 : R) + 4*renderScale;
    ctx.font = `bold ${fL}px monospace`;
    const tw = ctx.measureText(m.label).width;
    const ph = 3*renderScale, pv = 2*renderScale;
    ctx.fillStyle = color+'44';
    roundRect(ctx, cx-tw/2-ph, lblY, tw+ph*2, fL+pv*2, 2*renderScale);
    ctx.fill();
    ctx.fillStyle = color; ctx.textBaseline = 'top';
    ctx.fillText(m.label, cx, lblY+pv);

    ctx.restore();
  });

  // Anotações de texto
  textAnnotations.forEach(a => {
    const el  = document.getElementById(a.id);
    const box = el ? el.querySelector('.text-box') : null;
    const txt = (box ? box.innerText : a.text).trim();
    if (!txt) return;

    const fs   = Math.round(13 * renderScale);
    const lh   = Math.round(18 * renderScale);
    const pad  = Math.round(6  * renderScale);
    const ax   = a.x * renderScale;
    const ay   = a.y * renderScale;

    ctx.save();
    ctx.font = `${fs}px monospace`;
    const lines = txt.split('\n');
    const maxW  = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bw = maxW + pad*2, bh = lines.length*lh + pad*2;

    ctx.fillStyle = 'rgba(167,139,250,0.15)';
    ctx.strokeStyle = 'rgba(167,139,250,0.7)';
    ctx.lineWidth = Math.max(1, 1.5*renderScale);
    roundRect(ctx, ax, ay, bw, bh, 4*renderScale);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#e8eaf0'; ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, ax+pad, ay+pad+i*lh));
    ctx.restore();
  });

  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);   ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);   ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y+r);     ctx.arcTo(x,   y,   x+r, y,     r);
  ctx.closePath();
}

// ============================================================
// EXPORTAR PDF
// ============================================================
function exportPDF() {
  const canvas = document.getElementById('pdf-canvas');
  if (!canvas.width) { showToast('Carregue uma planta primeiro'); return; }
  showToast('Gerando PDF...');
  setTimeout(() => {
    try {
      const flat    = buildFlatCanvas();
      const imgData = flat.toDataURL('image/jpeg', 0.97);
      const cw = flat.width, ch = flat.height;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: cw >= ch ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [cw * 0.75, ch * 0.75],
        compress: false
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, cw * 0.75, ch * 0.75);
      pdf.save('planta-mapeada.pdf');
      showToast('PDF exportado!');
    } catch(err) { console.error(err); showToast('Erro ao gerar PDF'); }
  }, 100);
}

// ============================================================
// SALVAR / CARREGAR SESSÃO (localStorage)
// ============================================================
function saveSession() {
  if (markers.length === 0) { showToast('Nenhum ponto para salvar'); return; }
  const session = {
    markers,
    textAnnotations: textAnnotations.map(a => {
      const el = document.getElementById(a.id);
      const box = el ? el.querySelector('.text-box') : null;
      return { ...a, text: box ? box.innerText : a.text };
    }),
    counters
  };
  localStorage.setItem('planta-session', JSON.stringify(session));
  showToast('Sessão salva! (' + markers.length + ' pontos)');
}

function loadSession() {
  const raw = localStorage.getItem('planta-session');
  if (!raw) { showToast('Nenhuma sessão salva encontrada'); return; }
  const canvas = document.getElementById('pdf-canvas');
  if (!canvas.width) { showToast('Carregue a planta primeiro'); return; }

  const session = JSON.parse(raw);
  document.getElementById('markers-layer').innerHTML = '';
  markers         = session.markers         || [];
  textAnnotations = session.textAnnotations || [];
  counters        = session.counters        || { rede: 0, telefone: 0, camera: 0, switch: 0 };

  markers.forEach(m => renderMarker(m));
  textAnnotations.forEach(a => restoreTextAnnotation(a));
  renderSidebar();
  showToast('Sessão restaurada! (' + markers.length + ' pontos)');
}

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportCSV() {
  if (markers.length === 0) { showToast('Nenhum ponto para exportar'); return; }
  const header = 'Tipo,Nome,Número,X,Y\n';
  const rows   = markers.map(m => `${LABELS[m.type]},${m.label},${m.num},${Math.round(m.x)},${Math.round(m.y)}`).join('\n');
  const blob   = new Blob([header+rows], { type: 'text/csv;charset=utf-8' });
  const link   = document.createElement('a');
  link.download = 'pontos-planta.csv';
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast('CSV exportado!');
}

// ============================================================
// LIMPAR TUDO
// ============================================================
function clearAll() {
  if (!confirm('Remover todos os pontos e textos?')) return;
  markers = []; textAnnotations = [];
  document.getElementById('markers-layer').innerHTML = '';
  counters = { rede: 0, telefone: 0, camera: 0, switch: 0 };
  renderSidebar();
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ============================================================
// ATALHOS
// ============================================================
document.addEventListener('keydown', e => {
  if (document.activeElement?.isContentEditable) return;
  if (document.getElementById('edit-popup')) { if (e.key==='Escape') closeEditPopup(); return; }
  const k = e.key.toLowerCase();
  if (k==='r') setTool('rede');
  if (k==='t') setTool('telefone');
  if (k==='c') setTool('camera');
  if (k==='s') setTool('switch');
  if (k==='x') setTool('texto');
  if (e.key==='Escape') setTool('cursor');
  if (e.key==='+' || e.key==='=') changeZoom(0.2);
  if (e.key==='-') changeZoom(-0.2);
});
