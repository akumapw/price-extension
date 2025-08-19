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