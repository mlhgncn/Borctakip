let LocalNotifications: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('@capacitor/local-notifications');
  LocalNotifications = pkg?.LocalNotifications ?? null;
} catch (e) {
  LocalNotifications = null;
}

const MAP_KEY = 'bp_notif_map';
const COUNTER_KEY = 'bp_notif_counter';

function _getMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function _saveMap(m: Record<string, number>) {
  try { window.localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch (e) {}
}
function _nextId(): number {
  try {
    const raw = window.localStorage.getItem(COUNTER_KEY) || '1';
    let v = parseInt(raw, 10) || 1;
    const out = v;
    v++;
    window.localStorage.setItem(COUNTER_KEY, String(v));
    return out;
  } catch (e) { return Math.floor(Math.random() * 1000000); }
}

export async function requestPermission(): Promise<boolean> {
  if (!LocalNotifications) return false;
  try {
    const res = await LocalNotifications.requestPermissions();
    return (res && (res.display === 'granted' || res.granted));
  } catch (e) {
    return false;
  }
}

export async function scheduleNotificationForDebt(debtId: string, title: string, body: string, at: Date): Promise<number | null> {
  if (!LocalNotifications) return null;
  try {
    const m = _getMap();
    if (m[debtId]) {
      // cancel existing
      try { await LocalNotifications.cancel({ notifications: [{ id: m[debtId] }] }); } catch (e) {}
    }
    const id = _nextId();
    await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at } }] });
    m[debtId] = id;
    _saveMap(m);
    return id;
  } catch (e) {
    return null;
  }
}

export async function cancelNotificationForDebt(debtId: string): Promise<void> {
  if (!LocalNotifications) return;
  try {
    const m = _getMap();
    const id = m[debtId];
    if (id) {
      try { await LocalNotifications.cancel({ notifications: [{ id }] }); } catch (e) {}
      delete m[debtId];
      _saveMap(m);
    }
  } catch (e) {}
}

export default {
  requestPermission,
  scheduleNotificationForDebt,
  cancelNotificationForDebt,
};
