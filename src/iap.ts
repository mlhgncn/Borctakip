// IAP helper with support for cordova-plugin-purchase (Fovea) if available.
// Falls back to the previous web-confirm flow when plugin isn't present.
type StoreWindow = Window & { store?: any };

export const isAdsRemoved = (): boolean => {
  try { const v = window.localStorage.getItem('bp_ads_removed'); return v === '1' || v === 'true'; } catch { return false; }
};

export const startRemoveAdsPurchase = async (productId = 'remove_ads'): Promise<boolean> => {
  const w = window as StoreWindow;
  try {
    const store = w.store;
    if (store && store.register) {
      // register product and refresh
      store.register({ id: productId, type: store.NON_CONSUMABLE });
      return new Promise<boolean>((resolve) => {
        let done = false;
        const onReady = () => {
          try {
            store.order(productId);
          } catch (e) {
            if (!done) { done = true; resolve(false); }
          }
        };
        const onApproved = (p: any) => {
          try { store.finish && store.finish(p); } catch (e) {}
          try { window.localStorage.setItem('bp_ads_removed', '1'); } catch (e) {}
          if (!done) { done = true; resolve(true); }
        };
        const onError = () => { if (!done) { done = true; resolve(false); } };

        try {
          store.ready(() => onReady());
          store.when(productId).approved(onApproved);
          store.error(onError);
          store.refresh();
        } catch (e) {
          if (!done) { done = true; resolve(false); }
        }
        // fallback timeout
        setTimeout(() => { if (!done) { done = true; resolve(false); } }, 30000);
      });
    }
  } catch (e) {}

  // web fallback: confirm
  // eslint-disable-next-line no-alert
  const ok = window.confirm('Test: Uygulamadan reklamları kaldırmak istiyor musunuz? (Simule satın alma)');
  if (ok) {
    try { window.localStorage.setItem('bp_ads_removed', '1'); } catch (e) {}
    return true;
  }
  return false;
};

export const restorePurchases = async (): Promise<boolean> => {
  // If native store available, attempt to refresh and check ownership
  const w = window as StoreWindow;
  try {
    const store = w.store;
    if (store && store.register) {
      // try refresh and resolve after short delay
      store.register({ id: 'remove_ads', type: store.NON_CONSUMABLE });
      store.refresh();
      // read local flag after delay
      await new Promise((r) => setTimeout(r, 1500));
      return isAdsRemoved() || false;
    }
  } catch (e) {}
  return isAdsRemoved();
};

const IAP = { isAdsRemoved, startRemoveAdsPurchase, restorePurchases };

export default IAP;
