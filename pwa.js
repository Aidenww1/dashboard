(function () {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').catch(() => {});

  // Notification permission helper — called from pages that want push alerts
  window.requestNotifPermission = async function () {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  };

  // Schedule a local reminder (fires once via setTimeout — lost on page close)
  window.scheduleLocalNotif = function (title, body, delayMs) {
    if (Notification.permission !== 'granted') return;
    setTimeout(() => {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, { body, icon: '/favicon.ico', tag: title });
      }).catch(() => new Notification(title, { body }));
    }, delayMs);
  };
})();
