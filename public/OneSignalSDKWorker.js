try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {}

// 앱 아이콘 뱃지 카운트 증가
self.addEventListener('push', function(event) {
  try {
    if (navigator.setAppBadge) {
      navigator.setAppBadge().catch(() => {});
    }
  } catch (e) {}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/Large-Waste-Estimate/') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TO_SHARE' });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/Large-Waste-Estimate/?tab=share');
      }
    })
  );
});
