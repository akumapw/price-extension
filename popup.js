const urlInput = document.getElementById('urlInput');
const folderSelect = document.getElementById('folderSelect');
const pasteBtn = document.getElementById('pasteBtn');
const saveBtn = document.getElementById('saveBtn');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const newFolderWrap = document.getElementById('newFolderWrap');
const newFolderInput = document.getElementById('newFolderInput');
const createFolderConfirm = document.getElementById('createFolderConfirm');
const feedback = document.getElementById('feedback');
const salesWrap = document.getElementById('salesWrap');

function setMessage(msg, type = 'success') {
  feedback.className = type === 'error' ? 'error' : 'success';
  feedback.textContent = msg;
  setTimeout(() => { feedback.textContent = ''; }, 2000);
}

function loadFolders() {
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    folderSelect.innerHTML = '';
    const keys = Object.keys(folders);
    if (keys.length === 0) {
      // cria uma pasta padrão
      folders['geral'] = [];
      chrome.storage.local.set({ folders }, () => {
        addOptionsToSelect(['geral']);
      });
    } else {
      addOptionsToSelect(keys);
    }
  });
}

function addOptionsToSelect(keys) {
  keys.sort((a,b) => a.localeCompare(b, 'pt-BR'));
  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    folderSelect.appendChild(opt);
  });
}

function createFolder(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return setMessage('Nome de pasta inválido.', 'error');

  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    if (folders[trimmed]) {
      setMessage('Essa pasta já existe.', 'error');
      return;
    }
    folders[trimmed] = [];
    chrome.storage.local.set({ folders }, () => {
      // recarrega select
      loadFolders();
      folderSelect.value = trimmed;
      newFolderInput.value = '';
      newFolderWrap.style.display = 'none';
      setMessage('Pasta criada!');
    });
  });
}

function saveLinkToFolder(url, folder) {
  if (!url || !/^https?:\/\//i.test(url)) {
    setMessage('Link inválido.', 'error');
    return;
  }
  chrome.storage.local.get(['folders'], (data) => {
    const folders = data.folders || {};
    const list = folders[folder] || [];

    // Evitar duplicado
    if (list.some(item => item.url === url)) {
      setMessage('Esse link já está nessa pasta.', 'error');
      return;
    }

    const item = {
      url,
      title: '',       
      addedAt: Date.now()
      // baseline/lastPrice preenchidos pelo background
    };
    list.push(item);
    folders[folder] = list;
    chrome.storage.local.set({ folders }, async () => {
      urlInput.value = '';
      setMessage('Link salvo!');
      // dispara precificação inicial ASAP
      chrome.runtime.sendMessage({ type: 'TRACK_URLS', urls: [url] });
      // e já atualiza lista de promoções
      await loadSales();
    });
  });
}

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return setMessage('Clipboard vazio.', 'error');
    urlInput.value = text;
  } catch (e) {
    setMessage('Não consegui ler o clipboard.', 'error');
  }
});

saveBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  const folder = folderSelect.value;
  saveLinkToFolder(url, folder);
});

// Enter para salvar
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const url = urlInput.value.trim();
    const folder = folderSelect.value;
    saveLinkToFolder(url, folder);
  }
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

newFolderBtn.addEventListener('click', () => {
  newFolderWrap.style.display = newFolderWrap.style.display === 'none' ? 'block' : 'none';
  if (newFolderWrap.style.display === 'block') newFolderInput.focus();
});

createFolderConfirm.addEventListener('click', () => {
  createFolder(newFolderInput.value);
});

document.addEventListener('DOMContentLoaded', async () => {
  loadFolders();
  await loadSales();
});

async function loadSales() {
  salesWrap.innerHTML = '';
  const { onSale } = await chrome.runtime.sendMessage({ type: 'GET_SALES_SUMMARY' }).catch(() => ({ onSale: [] }));
  if (!onSale || onSale.length === 0) {
    const none = document.createElement('div');
    none.className = 'sale-item';
    none.textContent = 'Sem promoções no momento.';
    salesWrap.appendChild(none);
    return;
  }
  onSale
    .sort((a,b) => (b.discountPct||0) - (a.discountPct||0))
    .slice(0, 10)
    .forEach(it => {
      const div = document.createElement('div');
      div.className = 'sale-item';
      div.innerHTML = `
        <a href="${it.url}" target="_blank" rel="noopener">${it.url}</a>
        <div class="sale-meta">
          <span class="sale-pct">-${it.discountPct || 0}%</span>
          <span>${fmt(it.lastPrice)} <span style="text-decoration:line-through; color:#888; margin-left:4px">${fmt(it.baselinePrice)}</span></span>
        </div>
      `;
      salesWrap.appendChild(div);
    });
}

function fmt(n) {
  try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  catch { return `R$ ${Number(n).toFixed(2)}`; }
}
