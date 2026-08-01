importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyDZOTF9pL9Gsqjdjz-MHT7XNnSp3Uh2Xj0",
  authDomain: "aura-27aa5.firebaseapp.com",
  projectId: "aura-27aa5",
  storageBucket: "aura-27aa5.firebasestorage.app",
  messagingSenderId: "467500304444",
  appId: "1:467500304444:web:0822bb73924596fc30db39",
  measurementId: "G-K6RD370CD2"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/waste_app_icon_192.png',
    badge: payload.notification.badge || '/waste_app_icon_192.png'
  };

  if (navigator.setAppBadge) {
    navigator.setAppBadge(1).catch(err => console.error(err));
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});
