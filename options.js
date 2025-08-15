const foldersWrap = document.getElementById('foldersWrap');
const folderName = document.getElementById('folderName');
const addFolderBtn = document.getElementById('addFolderBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

function loadAll () {
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
        h2.innerHTML = `<span>${name}</span><span class="pill">${items.length} itens</span>`;

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
                const a = document.createElement('a');
                a.href = item.url;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = item.url;
                links.appendChild(a);
            });
        }
        
        const actions = document.createElement('div');
        actions.className = 'row';
        const renameBtn = document.createElement('button');
        renameBtn.textContent = 'Renomear Pasta';
        renameBtn.addEventListener('click', () =>
        renameFolder(name));
    
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
        if (folders[n]) return alert('Essa Pasta Já Existe.');
        folders[n] = [];
        chrome.storage.local.set({ folders }, loadAll);
    });
}

function renameFolder(oldName) {
    const n = prompt('Novo nome de pasta:', oldName);
    if (!n || m === oldName) return;
    chrome.storage.local.get(['folders'], (data) => {
        const folders = data.folders || {};
        if (!folders[oldName]) return;
        if (folders[n]) return alert('Já existe uma pasta com esse nome.');
        folders[n] = folders[oldName];
        delete folders[oldName];
        chrome.storage.local.set({ folders }, loadAll);
    });
}
