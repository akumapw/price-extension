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
        
    
    })
}