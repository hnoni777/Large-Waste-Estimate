self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there is already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url.includes('/Large-Waste-Estimate/') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TO_SHARE' });
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/Large-Waste-Estimate/?tab=share');
      }
    })
  );
});
