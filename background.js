// background.js (MV3 service worker)

const CHECK_INTERVAL_MIN = 60;          // verificação a cada 60 min
const DISCOUNT_THRESHOLD = 0.01;        // 1% pra considerar "promo" (evita ruído)
const NOTIF_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAJ0lEQVR4Ae3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAwJcB6MsAAfOaL9sAAAAASUVORK5CYII=";

  // Instala alarme periódico
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("priceCheck", { periodInMinutes: CHECK_INTERVAL_MIN });
  // primeira rodada em 30s pra já popular preços
  chrome.alarms.create("priceCheckFirst", { when: Date.now() + 30_000 });
});

// Ouve alarmes
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "priceCheck" || alarm.name === "priceCheckFirst") {
    await scanAllFolders();
  }
});

// Menssagem com popup/options
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "CHECK_NOW") {
      await scanAllFolders();
      sendResponse({ ok: true });
    } else if (msg?.type === "GET_SALES_SUMMARY") {
      const items = await getAllItems();
      const onSale = items.filter(i => i.isOnSale && Number.isFinite(i.discountPct));
      sendResponse({ onSale });
    } else if (msg?.type === "TRACK_URLS") {
      // Força precificação inicial dessas URLs (após salvar)
      await ensureBaselineForUrls(msg.urls || []);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  })();
  return true; // async
});

async function scanAllFolders() {
  const data = await chrome.storage.local.get(["folders"]);
  const folders = data.folders || {};

  let updated = false;
  let saleCount = 0;

  for (const [folderName, list] of Object.entries(folders)) {
    for (const item of list) {
      // Garante baseline em itens novos
      if (item.baselinePrice == null) {
        const price = await fetchPrice(item.url).catch(() => null);
        if (price != null) {
          item.baselinePrice = price;
          item.lastPrice = price;
          item.currency = item.currency || "auto";
          item.lastCheckedAt = Date.now();
          item.isOnSale = false;
          item.discountPct = 0;
          updated = true;
        }
        continue;
      }

      // Já tem baseline → verificar desconto
      const currentPrice = await fetchPrice(item.url).catch(() => null);
      if (currentPrice == null) continue;

      item.lastCheckedAt = Date.now();
      const old = item.lastPrice ?? item.baselinePrice;
      item.lastPrice = currentPrice;

      const baseline = item.baselinePrice;
      if (Number.isFinite(baseline) && currentPrice < baseline * (1 - DISCOUNT_THRESHOLD)) {
        const pct = ((baseline - currentPrice) / baseline) * 100;
        const wasOnSale = !!item.isOnSale;
        item.isOnSale = true;
        item.discountPct = Math.max(0, Math.round(pct * 10) / 10); // 1 casa
        updated = true;

        if (!wasOnSale) {
          saleCount++;
          notifySale(folderName, item, baseline, currentPrice);
        }
      } else {
        // Sem desconto relevante
        item.isOnSale = false;
        item.discountPct = 0;
        updated = true;
      }
    }
  }

  if (updated) {
    await chrome.storage.local.set({ folders });
  }

  // Badge no ícone da extensão com total de itens em promoção
  const all = await getAllItems();
  const totalOnSale = all.filter(i => i.isOnSale).length;
  await chrome.action.setBadgeText({ text: totalOnSale ? String(totalOnSale) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
}

async function ensureBaselineForUrls(urls) {
  if (!urls.length) return;
  const data = await chrome.storage.local.get(["folders"]);
  const folders = data.folders || {};
  let updated = false;

  for (const list of Object.values(folders)) {
    for (const item of list) {
      if (urls.includes(item.url) && item.baselinePrice == null) {
        const p = await fetchPrice(item.url).catch(() => null);
        if (p != null) {
          item.baselinePrice = p;
          item.lastPrice = p;
          item.isOnSale = false;
          item.discountPct = 0;
          item.lastCheckedAt = Date.now();
          updated = true;
        }
      }
    }
  }
  if (updated) await chrome.storage.local.set({ folders });
}

async function getAllItems() {
  const { folders } = await chrome.storage.local.get(["folders"]);
  const lists = Object.values(folders || {});
  return lists.flat();
}

function notifySale(folderName, item, baseline, current) {
  const diff = (baseline - current);
  const pct = Math.max(0, Math.round(((baseline - current) / baseline) * 1000) / 10);

  chrome.notifications.create({
    type: "basic",
    iconUrl: NOTIF_ICON,
    title: "Promoção detectada!",
    message: `Na pasta “${folderName}”: preço caiu ${pct}%.\nAgora: ${formatBRL(current)} (antes: ${formatBRL(baseline)})`,
    priority: 1
  }, (id) => {
    // Clique abre o produto
    chrome.notifications.onClicked.addListener((clickedId) => {
      if (clickedId === id) chrome.tabs.create({ url: item.url });
    });
  });
}