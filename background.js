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

// ---------- Fetch + parsing de preços ----------

async function fetchPrice(url) {
  const res = await fetch(url, { cache: "no-store", credentials: "omit", mode: "cors" });
  const html = await res.text();
  const { price } = extractPrice(html) || {};
  if (price == null || !Number.isFinite(price)) throw new Error("no-price");
  return price;
}

// Tenta JSON-LD (schema.org), meta tags e padrões comuns
function extractPrice(html) {
  // 1) JSON-LD
  const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    const block = m[1]?.trim();
    if (!block) continue;
    try {
      const json = JSON.parse(sanitizeJson(block));
      const objects = Array.isArray(json) ? json : [json];
      for (const obj of objects) {
        const p = pickPriceFromObject(obj);
        if (p != null) return { price: p };
      }
    } catch { /* ignore */ }
  }

  // 2) OpenGraph product:price:amount
  const og = html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) {
    const p = parsePriceNum(og[1]);
    if (p != null) return { price: p };
  }

  // 3) itemprop="price"
  const mi = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i);
  if (mi?.[1]) {
    const p = parsePriceNum(mi[1]);
    if (p != null) return { price: p };
  }

  // 4) heurística: procura R$ 123,45 / 123.45 em texto
  const textOnly = html.replace(/\s+/g, " ");
  const br = textOnly.match(/R\$\s*([\d\.]{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})/i);
  if (br?.[1]) {
    const p = parsePriceNum(br[1]);
    if (p != null) return { price: p };
  }
  const intl = textOnly.match(/(?:^|[^\d])(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))(?:[^\d]|$)/);
  if (intl?.[1]) {
    const p = parsePriceNum(intl[1]);
    if (p != null) return { price: p };
  }

  return null;
}

function pickPriceFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  // Product/offers
  const offers = obj.offers || obj.offer;
  if (offers) {
    const arr = Array.isArray(offers) ? offers : [offers];
    for (const o of arr) {
      const cand = o.price ?? o.lowPrice ?? o.highPrice;
      const p = parsePriceNum(cand);
      if (p != null) return p;
    }
  }
  // price direto
  const direct = obj.price ?? obj.priceAmount ?? obj.currentPrice;
  const p2 = parsePriceNum(direct);
  if (p2 != null) return p2;

  // nested
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const nested = pickPriceFromObject(v);
      if (nested != null) return nested;
    }
  }
  return null;
}

function parsePriceNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Normaliza vírgula/ponto
  const norm = s
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // remove separador de milhar com ponto
    .replace(",", ".");                // vírgula decimal -> ponto
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function sanitizeJson(str) {
  // remove comentários e vírgulas finais comuns em JSON-LD malformatado
  return str
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function formatBRL(n) {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}