try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {}

const DB_NAME = 'WasteBadgeDB';
const STORE_NAME = 'badgeStore';

function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getBadgeCount() {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('count');
      req.onsuccess = () => resolve(Number(req.result) || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    return 0;
  }
}

async function setBadgeCount(count) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(count, 'count');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {}
}

// 🔔 백그라운드 푸시 알림 도착 시 뱃지 숫자 1씩 누적 증가 (1 -> 2 -> 3...)
self.addEventListener('push', function(event) {
  event.waitUntil(
    (async () => {
      try {
        const current = await getBadgeCount();
        const next = current + 1;
        await setBadgeCount(next);
        if (navigator.setAppBadge) {
          await navigator.setAppBadge(next);
        }
      } catch (e) {
        console.warn('App badge increment error', e);
      }
    })()
  );
});

// 알림 클릭 시 뱃지 초기화 및 앱 포커스
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    (async () => {
      await setBadgeCount(0);
      if (navigator.clearAppBadge) {
        await navigator.clearAppBadge().catch(() => {});
      }

      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes('/Large-Waste-Estimate/') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TO_SHARE' });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/Large-Waste-Estimate/?tab=share');
      }
    })()
  );
});

// 앱 내부에서 뱃지 리셋 요청 메시지를 보낼 때
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    setBadgeCount(0);
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
});
