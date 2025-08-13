const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const folderSelect = document.getElementById('folderSelect');
const newFolderBtn = document.getElementById('newFolderBtn');
const newFolderWrap = document.getElementByI('newFolderWrap');
const newFolderInput = document.getElementById('newFolderInput');
const createFolderConfirm = document.getElementById('createFolderConfirm');
const saveBtn = document.getElementById('saveBtn');
const openOptionsBtn = document.getElementById('openOptionsBtn');

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
    keys.sort((a,b) => a.localCompare(b, 'pt-BR'));
    keys.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        folderSelect.appendChild(opt);
    });
}

