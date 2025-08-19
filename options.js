const foldersWrap = document.getElementById('foldersWrap');
const folderName = document.getElementById('folderName');
const addFolderBtn = document.getElementById('addFolderBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

function loadAll() {
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    render(folders);
  });
}

function render(folders) {
  foldersWrap.innerHTML = '';
  const keys = Object.keys(folders).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  keys.forEach(name => {
    const items = folders[name] || [];
    const card = document.createElement('div');
    card.className = 'card';

    const h2 = document.createElement('h2');
    const saleCount = items.filter(i => i.isOnSale).length;
    const pillText = `${items.length} itens${saleCount ? ` • ${saleCount} em promoção` : ''}`;
    h2.innerHTML = `<span>${name}</span><span class="pill">${pillText}</span>`;

    const links = document.createElement('div');
    links.className = 'links';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Vazio';
      links.appendChild(empty);
    } else {
      items
        .slice()
        .sort((a,b)=> (b.addedAt||0)-(a.addedAt||0))
        .forEach(item => {
          const row = document.createElement('div');
          row.className = 'item-row';
          const a = document.createElement('a');
          a.href = item.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = item.url;
          
          const priceWrap = document.createElem('span');
          priceWrap.className = 'price-wrap';

          if (Number.isFinite(item.lastPrice)) {
            const p = document.createElement('span');
            p.className = 'price';
            p.textContent = formatBRL(item.lastPrice);
            priceWrap.appendChild(p);
          }
          if (Number.isFinite(item.baselinePrice) && item.isOnSale) {
            const base = document.createElement('span');
            base.className = 'baseline';
            base.textContent = formatBRL(item.baselinePrice);
            priceWrap.appendChild(base);

            const badge = document.createElement('span');
            badge.className = 'badge-sale';
            const pct = item.discountPct != null ? `${item.discountPct}%` : '';
            badge.textContent = `Promo ${pct}`;
            row.appendChild(badge);
          }

          row.appendChild(a);
          if (priceWrap.childNodes.length) row.appendChild(priceWrap);
          
          links.appendChild(a);
        });
    }

    const actions = document.createElement('div');
    actions.className = 'row';
    const renameBtn = document.createElement('button');
    renameBtn.textContent = 'Renomear pasta';
    renameBtn.addEventListener('click', () => renameFolder(name));

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Excluir pasta';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => deleteFolder(name));

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);

    card.appendChild(h2);
    card.appendChild(links);
    card.appendChild(actions);
    foldersWrap.appendChild(card);
  });
}

function addFolder(name) {
  const n = (name || '').trim();
  if (!n) return;
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    if (folders[n]) return alert('Essa pasta já existe.');
    folders[n] = [];
    chrome.storage.local.set({ folders }, loadAll);
  });
}

function renameFolder(oldName) {
  const n = prompt('Novo nome da pasta:', oldName);
  if (!n || n === oldName) return;
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    if (!folders[oldName]) return;
    if (folders[n]) return alert('Já existe uma pasta com esse nome.');
    folders[n] = folders[oldName];
    delete folders[oldName];
    chrome.storage.local.set({ folders }, loadAll);
  });
}

function deleteFolder(name) {
  if (!confirm(`Excluir a pasta "${name}"?`)) return;
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    delete folders[name];
    chrome.storage.local.set({ folders }, loadAll);
  });
}

addFolderBtn.addEventListener('click', () => addFolder(folderName.value));
folderName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addFolder(folderName.value);
});

exportBtn.addEventListener('click', () => {
  chrome.storage.local.get(['folders'], (data) => {
    const json = JSON.stringify(data.folders || {}, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'pastas_price_organizer.json';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  });
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Formato inválido');
    }
    chrome.storage.local.set({ folders: parsed }, loadAll);
  } catch (err) {
    alert('JSON inválido.');
  } finally {
    importFile.value = '';
  }
});

document.addEventListener('DOMContentLoaded', loadAll);
