import { Capacitor } from "@capacitor/core";
let AdMobPlugin: any = null;

try {
  // runtime require so web builds don't fail
  // plugin package: @capacitor-community/admob
  // on native platforms this will resolve to the plugin
  // otherwise we'll keep it null and expose no-op functions
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("@capacitor-community/admob");
  AdMobPlugin = pkg?.AdMob ?? null;
} catch (e) {
  AdMobPlugin = null;
}

const isNative = () => Capacitor.isNativePlatform();

export const initAdMob = async (): Promise<void> => {
  if (!AdMobPlugin || !isNative()) return;
  try {
    await AdMobPlugin.initialize();
  } catch (e) {
    // ignore initialization errors
  }
};

export const showBanner = async (adUnitId: string): Promise<void> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return;
  try {
    await AdMobPlugin.showBanner({
      adId: adUnitId,
      adSize: "SMART_BANNER",
      position: "BOTTOM_CENTER",
      margin: 0,
    });
  } catch (e) {}
};

export const hideBanner = async (): Promise<void> => {
  if (!AdMobPlugin || !isNative()) return;
  try {
    await AdMobPlugin.hideBanner();
  } catch (e) {}
};

export const removeBanner = async (): Promise<void> => {
  if (!AdMobPlugin || !isNative()) return;
  try {
    await AdMobPlugin.removeBanner();
  } catch (e) {}
};

export const showInterstitial = async (adUnitId: string): Promise<void> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return;
  try {
    await AdMobPlugin.prepareInterstitial({ adId: adUnitId });
    await AdMobPlugin.showInterstitial();
  } catch (e) {}
};

function _todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function _metaKey(key: string) {
  return `ad_meta_${key}`;
}

function canShowAd(key: string, minIntervalSeconds: number, dailyMax: number): boolean {
  try {
    const raw = window.localStorage.getItem(_metaKey(key));
    const now = Date.now();
    let meta = raw ? JSON.parse(raw) : { lastShown: 0, date: _todayKey(), count: 0 };
    if (meta.date !== _todayKey()) {
      meta.date = _todayKey();
      meta.count = 0;
    }
    if (now - (meta.lastShown || 0) < minIntervalSeconds * 1000) return false;
    if (meta.count >= dailyMax) return false;
    return true;
  } catch (e) {
    return true;
  }
}

function recordAdShown(key: string) {
  try {
    const raw = window.localStorage.getItem(_metaKey(key));
    const now = Date.now();
    let meta = raw ? JSON.parse(raw) : { lastShown: 0, date: _todayKey(), count: 0 };
    if (meta.date !== _todayKey()) {
      meta.date = _todayKey();
      meta.count = 0;
    }
    meta.lastShown = now;
    meta.count = (meta.count || 0) + 1;
    window.localStorage.setItem(_metaKey(key), JSON.stringify(meta));
  } catch (e) {}
}

export const showInterstitialWithFrequency = async (adUnitId: string, key = "default", minIntervalSeconds = 300, dailyMax = 2): Promise<boolean> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return false;
  try {
    if (!canShowAd(key, minIntervalSeconds, dailyMax)) return false;
    await AdMobPlugin.prepareInterstitial({ adId: adUnitId });
    await AdMobPlugin.showInterstitial();
    recordAdShown(key);
    return true;
  } catch (e) {
    return false;
  }
};

export const prepareInterstitial = async (adUnitId: string): Promise<void> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return;
  try {
    await AdMobPlugin.prepareInterstitial({ adId: adUnitId });
  } catch (e) {}
};

export const prepareRewarded = async (adUnitId: string): Promise<void> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return;
  try {
    if (AdMobPlugin.prepareRewardVideoAd) await AdMobPlugin.prepareRewardVideoAd({ adId: adUnitId });
  } catch (e) {}
};

export const showRewarded = async (adUnitId: string): Promise<boolean> => {
  if (!AdMobPlugin || !isNative() || !adUnitId) return false;
  try {
    if (AdMobPlugin.showRewardVideoAd) {
      await AdMobPlugin.showRewardVideoAd();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const setAdPersonalization = async (enabled: boolean): Promise<void> => {
  try {
    window.localStorage.setItem("bp_ad_personalization", JSON.stringify(enabled));
  } catch (e) {}
  if (!AdMobPlugin || !isNative()) return;
  try {
    // try best-effort to set request configuration on native SDKs if plugin exposes it
    if (AdMobPlugin.setRequestConfiguration) {
      // some plugin versions accept an object like { npa: 1 } or similar — we try a safe shape
      await AdMobPlugin.setRequestConfiguration({ npa: enabled ? 0 : 1 });
    }
  } catch (e) {}
};

export default {
  initAdMob,
  showBanner,
  hideBanner,
  removeBanner,
  showInterstitial,
};
