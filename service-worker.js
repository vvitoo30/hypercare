self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const { delay, options } = event.data;
        setTimeout(() => {
            self.registration.showNotification('Reminder', options);
        }, delay);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Close the notification

    const urlToOpen = event.notification.data.url || '/'; // Get URL from notification data

    event.waitUntil(
        clients.openWindow(urlToOpen) // Open the specified URL
    );
});
