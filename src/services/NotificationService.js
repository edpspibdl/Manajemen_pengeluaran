import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { diffDays, toDateString } from '../utils/date.js';

/**
 * Schedule upcoming local bill reminders on native Android (no-op safely on web).
 * @param {Array<{ id: string, name: string, amount: number, next_due_date: string }>} unpaidBills
 */
export async function syncBillNotifications(unpaidBills = []) {
  if (typeof Capacitor?.isNativePlatform !== 'function' || !Capacitor.isNativePlatform()) {
    return;
  }
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    const todayStr = toDateString();
    const notifications = [];
    unpaidBills.forEach((bill, idx) => {
      const daysUntil = diffDays(todayStr, bill.next_due_date);
      if (daysUntil >= 0 && daysUntil <= 3) {
        const triggerAt = new Date(Date.now() + 5000 + idx * 1000);
        notifications.push({
          id: 1000 + idx,
          title: `Pengingat Tagihan: ${bill.name}`,
          body:
            daysUntil === 0
              ? `Jatuh tempo hari ini! Jangan lupa tandai lunas di KosMate.`
              : `Jatuh tempo ${daysUntil} hari lagi.`,
          schedule: { at: triggerAt }
        });
      }
    });

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch {
    // Graceful non-fatal notification failure
  }
}
