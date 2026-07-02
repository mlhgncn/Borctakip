import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Calendar, Wallet, CalendarClock, Plus, CreditCard, Landmark,
  ShoppingBag, X, Trash2, Home, ListChecks, PieChart, User, Target, Flame, PartyPopper, TrendingDown,
  Check, RotateCcw, Bell, Info, Sparkles, CalendarCheck,
} from "lucide-react";
import { initAdMob, showBanner, removeBanner, prepareRewarded, showRewarded, setAdPersonalization, showInterstitialWithFrequency } from "./admob";
import { requestPermission as requestNotifPerm, scheduleNotificationForDebt, cancelNotificationForDebt } from "./notifications";

const COLORS = {
  bg: "#0B0C18",
  card: "#171829",
  cardAlt: "#1D1F36",
  stroke: "#2A2C45",
  textPrimary: "#F5F6FA",
  textSecondary: "#8C8FA8",
  purple: "#7C5CFC",
  blue: "#4FACFE",
  green: "#34D399",
  red: "#F87171",
  amber: "#FBBF24",
  greenBg: "#132A22",
};

const ICONS = { card: CreditCard, bank: Landmark, shopping: ShoppingBag };
const ICON_COLORS = ["#6C5CE7", "#2E86F5", "#1FBF8F", "#C97B3D"];
const SLICE_COLORS = ["#7C5CFC", "#4FACFE", "#34D399", "#FBBF24", "#F87171", "#C97B3D"];
const DEFAULT_REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

const SEED_DEBTS = [
  { id: "1", title: "Kredi Kartı", subtitle: "Garanti BBVA", balance: 23450, originalBalance: 28000, rate: 4.25, icon: "card", colorIndex: 0 },
  { id: "2", title: "İhtiyaç Kredisi", subtitle: "İş Bankası", balance: 45000, originalBalance: 50000, rate: 2.89, icon: "bank", colorIndex: 1 },
  { id: "3", title: "Alışveriş Kredisi", subtitle: "Hepsiburada", balance: 15300, originalBalance: 18000, rate: 3.59, icon: "card", colorIndex: 2 },
  { id: "4", title: "Kredi Kartı", subtitle: "Akbank", balance: 20000, originalBalance: 20000, rate: 4.0, icon: "card", colorIndex: 3 },
];

const tl = (v: number) => `${Math.round(v).toLocaleString("tr-TR")} ₺`;
const MONTH_NAMES_FULL = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

interface Debt {
  id: string;
  title: string;
  subtitle: string;
  balance: number;
  originalBalance: number;
  rate: number;
  icon: string;
  colorIndex: number;
  dueDate?: string;
  termMonths?: number;
}

interface PaymentRecord {
  date: string;
  amount: number;
  remainingAfter: number;
  debtTitle?: string;
  description?: string;
}

interface SimulationResult {
  months: number;
  totalInterest: number;
  payoffDate: Date;
  monthlyPayments: number[];
  perDebtPayoffMonth: Record<string, number>;
  remainingByMonth: number[];
  stuck?: boolean;
}

interface Celebration {
  type: "debt-cleared" | "all-clear" | "payment-success";
  debt?: Debt;
}

interface PageProps {
  hasDebts: boolean;
  debts: Debt[];
  totalBalance: number;
  plan: SimulationResult;
  progressRatio: number;
  capacity: number;
  alreadyPaidThisMonth: boolean;
  onConfirm: () => void;
  onPartial: () => void;
  onAdd: () => void;
  streak: number;
  strategy: string;
  setStrategy: (s: string) => void;
  highestRateDebt: Debt | null;
  lowestBalanceDebt: Debt | null;
  interestDelta: number;
  lowestBalanceId?: string;
  paymentHistory: PaymentRecord[];
  setSheet: (s: any) => void;
  deleteDebt: (id: string) => void;
  income: number;
  expense: number;
  hasOutstandingDebts: boolean;
}

interface PlanPageProps {
  debts: Debt[];
  plan: SimulationResult;
  strategy: string;
  capacity: number;
  hasDebts: boolean;
}

function sortForStrategy(list: any[], strategy: string): any[] {
  return strategy === "snowball"
    ? [...list].sort((a, b) => a.balance - b.balance)
    : [...list].sort((a, b) => b.rate - a.rate);
}

function getMinimumPayment(debt: Debt): number {
  if (debt.icon === "bank" && debt.termMonths && debt.termMonths > 0) {
    const installment = (debt.originalBalance || debt.balance) / debt.termMonths;
    return Math.min(Math.max(0, +installment.toFixed(2)), debt.balance);
  }
  return Math.min(debt.balance * 0.05, debt.balance);
}

function suggestDebtForStrategy(debts: Debt[], strategy: string): Debt | null {
  if (!debts.length) return null;
  if (strategy === "snowball") {
    return debts.reduce((best, debt) => (debt.balance < best.balance ? debt : best), debts[0]);
  }
  return debts.reduce((best, debt) => (debt.rate > best.rate ? debt : best), debts[0]);
}

// Full simulation that also tracks the month each individual debt reaches zero.
function simulateDetailed(debts: Debt[], monthlyCapacity: number, strategy: string): SimulationResult {
  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, payoffDate: new Date(), monthlyPayments: [], perDebtPayoffMonth: {}, remainingByMonth: [] };
  }
  let working = debts.map((d) => ({
    id: d.id,
    balance: d.balance,
    rate: d.rate / 100,
    icon: d.icon,
    termMonths: d.termMonths,
    originalBalance: d.originalBalance,
  }));
  let totalInterest = 0;
  const monthlyPayments: number[] = [];
  const remainingByMonth: number[] = [];
  const perDebtPayoffMonth: Record<string, number> = {};
  let months = 0;
  let stuck = false;

  while (working.some((d) => d.balance > 0.01) && months < 600 && !stuck) {
    let capacity = monthlyCapacity;
    let paid = 0;

    for (let i = 0; i < working.length; i++) {
      const d = working[i];
      if (d.balance > 0) {
        const interest = d.balance * d.rate;
        totalInterest += interest;
        d.balance += interest;
      }
    }

    for (let i = 0; i < working.length; i++) {
      const d = working[i];
      if (d.balance <= 0) continue;
      const targetDebt = debts.find((debt) => debt.id === d.id);
      const minPay = targetDebt ? getMinimumPayment(targetDebt) : Math.min(d.balance * 0.05, d.balance);
      const pay = Math.min(minPay, capacity);
      d.balance -= pay;
      capacity -= pay;
      paid += pay;
    }

    const ordered = sortForStrategy(working, strategy);
    for (const d of ordered) {
      if (capacity <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, capacity);
      d.balance -= pay;
      capacity -= pay;
      paid += pay;
    }

    months++;
    for (let i = 0; i < working.length; i++) {
      const d = working[i];
      if (d.balance <= 0.01 && perDebtPayoffMonth[d.id] === undefined) {
        perDebtPayoffMonth[d.id] = months;
      }
    }

    if (paid === 0) stuck = true;
    monthlyPayments.push(paid);
    remainingByMonth.push(working.reduce((s, d) => s + Math.max(0, d.balance), 0));
  }

  const payoffDate = new Date();
  payoffDate.setDate(payoffDate.getDate() + months * 30);

  return { months: stuck ? Infinity : months, totalInterest, payoffDate, monthlyPayments, perDebtPayoffMonth, remainingByMonth, stuck };
}

function applyOneMonth(debts: Debt[], monthlyCapacity: number, strategy: string) {
  let capacity = monthlyCapacity;
  const next = debts.map((d) => ({ ...d }));

  const remainingBefore = next.reduce((s, d) => s + Math.max(0, d.balance), 0);
  if (remainingBefore <= 0) {
    return { next: next.map((d) => ({ ...d, balance: 0 })), clearedIds: [], paid: 0 };
  }

  for (let i = 0; i < next.length; i++) {
    const d = next[i];
    if (d.balance > 0) {
      const interest = d.balance * (d.rate / 100);
      d.balance = +(d.balance + interest).toFixed(2);
    }
  }

  for (let i = 0; i < next.length; i++) {
    const d = next[i];
    if (d.balance <= 0) continue;
    const minPay = getMinimumPayment(d);
    const pay = Math.min(minPay, capacity);
    d.balance = Math.max(0, +(d.balance - pay).toFixed(2));
    capacity -= pay;
  }

  const ordered = sortForStrategy(next, strategy);
  for (const d of ordered) {
    if (capacity <= 0) break;
    if (d.balance <= 0) continue;
    const pay = Math.min(d.balance, capacity);
    const target = next.find((x) => x.id === d.id);
    if (target) {
      target.balance = Math.max(0, +(target.balance - pay).toFixed(2));
    }
    capacity -= pay;
  }

  const paid = monthlyCapacity - capacity;
  const clearedIds = next.filter((d, i) => d.balance <= 0.5 && debts[i].balance > 0.5).map((d) => d.id);
  return { next: next.map((d) => ({ ...d, balance: Math.max(0, d.balance) })), clearedIds, paid };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [debts, setDebts] = useState<Debt[]>(() => loadFromStorage("bp_debts", SEED_DEBTS));
  const [income, setIncome] = useState<number>(() => loadFromStorage("bp_income", 30000));
  const [expense, setExpense] = useState<number>(() => loadFromStorage("bp_expense", 18250));
  const [strategy, setStrategy] = useState<string>(() => loadFromStorage("bp_strategy", "avalanche"));
  const [streak, setStreak] = useState<number>(() => loadFromStorage("bp_streak", 0));
  const [maxDebtLimit, setMaxDebtLimit] = useState<number>(() => loadFromStorage("bp_maxDebtLimit", 2));
  const [lastConfirmedPaymentDate, setLastConfirmedPaymentDate] = useState<string | null>(() => loadFromStorage("bp_lastConfirmedPaymentDate", loadFromStorage("bp_lastPaidMonth", null)));
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>(() => loadFromStorage("bp_history", []));
  const [adsEnabled, setAdsEnabled] = useState<boolean>(() => loadFromStorage("bp_ads_enabled", true));
  const [adPersonalization, setAdPersonalizationState] = useState<boolean>(() => loadFromStorage("bp_ad_personalization", true));
  const [consentOpen] = useState<boolean>(() => !loadFromStorage("bp_consent_seen", false));
  const [sheet, setSheet] = useState<any>(null);
  const [paymentBeingProcessed, setPaymentBeingProcessed] = useState(false);
  const [navIndex, setNavIndex] = useState<number>(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const actionCountRef = useRef(0);
  const interstitialAdUnitId = process.env.REACT_APP_ADMOB_INTERSTITIAL_ID || "";

  // Initialize AdMob on app start (native platforms only)
  useEffect(() => {
    (async () => {
      try {
        await initAdMob();
        // apply stored personalization preference
        try { await setAdPersonalization(loadFromStorage("bp_ad_personalization", true)); } catch (e) {}
        const bannerId = process.env.REACT_APP_ADMOB_BANNER_ID || "";
        const storedAdsEnabled = loadFromStorage("bp_ads_enabled", true);
        if (bannerId && storedAdsEnabled) await showBanner(bannerId);
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      // remove banner on unmount
      removeBanner();
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("bp_ads_enabled", JSON.stringify(adsEnabled)); } catch {}
    (async () => {
      try {
        const bannerId = process.env.REACT_APP_ADMOB_BANNER_ID || "";
        if (adsEnabled && bannerId) await showBanner(bannerId);
        if (!adsEnabled) await removeBanner();
      } catch (e) {}
    })();
  }, [adsEnabled]);

  useEffect(() => {
    try { window.localStorage.setItem('bp_ad_personalization', JSON.stringify(adPersonalization)); } catch {}
    // apply to native SDK where possible
    (async () => { try { await setAdPersonalization(adPersonalization); } catch (e) {} })();
  }, [adPersonalization]);

  useEffect(() => {
    try { window.localStorage.setItem('bp_consent_seen', JSON.stringify(true)); } catch {};
  }, [consentOpen]);

  useEffect(() => { try { window.localStorage.setItem("bp_debts", JSON.stringify(debts)); } catch {} }, [debts]);
  useEffect(() => { try { window.localStorage.setItem("bp_income", JSON.stringify(income)); } catch {} }, [income]);
  useEffect(() => { try { window.localStorage.setItem("bp_expense", JSON.stringify(expense)); } catch {} }, [expense]);
  useEffect(() => { try { window.localStorage.setItem("bp_strategy", JSON.stringify(strategy)); } catch {} }, [strategy]);
  useEffect(() => { try { window.localStorage.setItem("bp_streak", JSON.stringify(streak)); } catch {} }, [streak]);
  useEffect(() => { try { window.localStorage.setItem("bp_lastConfirmedPaymentDate", JSON.stringify(lastConfirmedPaymentDate)); } catch {} }, [lastConfirmedPaymentDate]);
  useEffect(() => { try { window.localStorage.setItem("bp_history", JSON.stringify(paymentHistory)); } catch {} }, [paymentHistory]);
  useEffect(() => { try { window.localStorage.setItem("bp_maxDebtLimit", JSON.stringify(maxDebtLimit)); } catch {} }, [maxDebtLimit]);
  useEffect(() => {
    // request notification permission on app start (best-effort)
    (async () => { try { await requestNotifPerm(); } catch (e) {} })();
  }, []);

  // expose helper for PaymentCTA buttons to open sheets without prop drilling
  useEffect(() => {
    // expose setter globally for simple buttons
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.appSetSheet = (s: any) => setSheet(s);
    return () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete window.appSetSheet;
    };
  }, []);

  const totalBalance = useMemo(() => debts.reduce((s, d) => s + d.balance, 0), [debts]);
  const totalOriginal = useMemo(() => debts.reduce((s, d) => s + (d.originalBalance || d.balance), 0), [debts]);
  const progressRatio = totalOriginal > 0 ? Math.max(0, Math.min(1, 1 - totalBalance / totalOriginal)) : 0;
  const capacity = Math.max(0, income - expense);

  const showPostPaymentInterstitial = useCallback(async (): Promise<boolean> => {
    if (!adsEnabled || !interstitialAdUnitId) return false;
    return await showInterstitialWithFrequency(interstitialAdUnitId, "post_payment", 180, 1);
  }, [adsEnabled, interstitialAdUnitId]);

  const showTimedInterstitial = useCallback(async (): Promise<boolean> => {
    if (!adsEnabled || !interstitialAdUnitId) return false;
    return await showInterstitialWithFrequency(interstitialAdUnitId, "timed", 300, 2);
  }, [adsEnabled, interstitialAdUnitId]);

  const handleInteractionForAd = useCallback(() => {
    actionCountRef.current += 1;
    if (actionCountRef.current >= 5) {
      actionCountRef.current = 0;
      showTimedInterstitial().catch(() => {});
    }
  }, [showTimedInterstitial]);

  useEffect(() => {
    if (!adsEnabled || !interstitialAdUnitId) return;
    const interval = window.setInterval(() => {
      if (sheet || celebration || document.hidden) return;
      showTimedInterstitial().catch(() => {});
    }, 4 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [adsEnabled, interstitialAdUnitId, sheet, celebration, showTimedInterstitial]);

  const handleNavTap = (i: number) => {
    if (i === 2) {
      handleAddDebt();
      return;
    }
    setNavIndex(i);
    handleInteractionForAd();
  };

  const handleCelebrationClose = async () => {
    const isPaymentSuccess = celebration?.type === "payment-success";
    setCelebration(null);
    if (!isPaymentSuccess) return;
    await showPostPaymentInterstitial();
    setNavIndex(0);
  };

  const planAvalanche = useMemo(() => simulateDetailed(debts, capacity, "avalanche"), [debts, capacity]);
  const planSnowball = useMemo(() => simulateDetailed(debts, capacity, "snowball"), [debts, capacity]);
  const plan = strategy === "snowball" ? planSnowball : planAvalanche;
  const interestDelta = planSnowball.totalInterest - planAvalanche.totalInterest;

  const highestRateDebt = useMemo(() => (debts.length ? [...debts].sort((a, b) => b.rate - a.rate)[0] : null), [debts]);
  const lowestBalanceDebt = useMemo(() => (debts.length ? [...debts].sort((a, b) => a.balance - b.balance)[0] : null), [debts]);

  const alreadyPaidThisMonth = (() => {
    if (!lastConfirmedPaymentDate) return false;
    const paidAt = new Date(lastConfirmedPaymentDate);
    const expiry = new Date(paidAt);
    const day = expiry.getDate();
    expiry.setMonth(expiry.getMonth() + 1);
    if (expiry.getDate() !== day) {
      expiry.setDate(0);
    }
    return new Date() < expiry;
  })();
  const hasDebts = debts.length > 0;

  const deleteDebt = (id: string) => {
    try { cancelNotificationForDebt(id); } catch (e) {}
    setDebts((prev) => prev.filter((d) => d.id !== id));
  };
  const upsertDebt = (debt: Debt) =>
    setDebts((prev) => {
      const idx = prev.findIndex((d) => d.id === debt.id);
      if (idx === -1) return [...prev, debt];
      const copy = [...prev];
      copy[idx] = { ...debt, originalBalance: copy[idx].originalBalance ?? debt.balance };
      return copy;
    });

  // Wrap upsert to also schedule notification when dueDate provided
  const handleWatchRewardAd = async () => {
    try {
      const rewardedId = process.env.REACT_APP_ADMOB_REWARDED_ID || DEFAULT_REWARDED_AD_UNIT_ID;
      await prepareRewarded(rewardedId);
      const shown = await showRewarded(rewardedId);
      if (!shown) {
        alert('Reklam oynatılamadı veya tamamlanmadı. Limit artırılmadı.');
        return;
      }
      setMaxDebtLimit((prev) => prev + 1);
      alert('Tebrikler! Borç ekleme limitin 1 arttı.');
    } catch (e) {
      alert('Reklam yüklenirken bir sorun oluştu. Limit artırılmadı.');
    }
  };

  const performPayment = async (amount?: number, opts?: { skip?: boolean; perDebtId?: string }): Promise<boolean> => {
    if (paymentBeingProcessed) return false;
    setPaymentBeingProcessed(true);
    try {
      if (opts?.skip) {
        setSheet(null);
        return true;
      }

      if (debts.every((d) => d.balance <= 0)) {
        setSheet(null);
        return true;
      }

      const payAmount = typeof amount === "number" ? amount : capacity;

      if (opts?.perDebtId) {
        const next = debts.map((d) => ({ ...d }));
        const targetIdx = next.findIndex((d) => d.id === opts.perDebtId);
        let actualPaid = 0;
        if (targetIdx !== -1) {
          const payment = Math.min(payAmount, next[targetIdx].balance);
          next[targetIdx].balance = +(next[targetIdx].balance - payment).toFixed(2);
          actualPaid = payment;
        }
        const clearedIds = next.filter((d, i) => d.balance <= 0.5 && debts[i].balance > 0.5).map((d) => d.id);
        setDebts(next.map((d) => ({ ...d, balance: Math.max(0, d.balance) })));
        setPaymentHistory((h) => [...h, { date: new Date().toISOString(), amount: actualPaid, remainingAfter: next.reduce((s, d) => s + d.balance, 0), debtTitle: next[targetIdx]?.title || undefined, description: 'Ödeme yapıldı' }]);
        setStreak((s) => s + 1);
        if (clearedIds.length > 0) {
          const cleared = debts.find((d) => d.id === clearedIds[0]);
          const stillRemaining = next.some((d) => d.balance > 0.5);
          setCelebration(stillRemaining ? { type: "debt-cleared", debt: cleared } : { type: "all-clear" });
        }
        setSheet(null);
        return true;
      }

      const { next, clearedIds, paid } = applyOneMonth(debts, payAmount, strategy);
      setDebts(next);
      setPaymentHistory((h) => [...h, { date: new Date().toISOString(), amount: paid, remainingAfter: next.reduce((s, d) => s + d.balance, 0), description: 'Aylık ödeme' }]);
      setStreak((s) => s + 1);
      if (clearedIds.length > 0) {
        const cleared = debts.find((d) => d.id === clearedIds[0]);
        const stillRemaining = next.some((d) => d.balance > 0.5);
        setCelebration(stillRemaining ? { type: "debt-cleared", debt: cleared } : { type: "all-clear" });
      }
      setSheet(null);
      return true;
    } catch (e) {
      // ignore
      return false;
    } finally {
      setPaymentBeingProcessed(false);
    }
  };

  const resetAllData = () => {
    try { debts.forEach(d => { if (d.id) cancelNotificationForDebt(d.id); }); } catch (e) {}
    setDebts([]);
    setStreak(0);
    setLastConfirmedPaymentDate(null);
    setPaymentHistory([]);
  };

  const handleAddDebt = () => {
    if (debts.length >= maxDebtLimit) {
      setSheet({ type: 'limit-info' });
      return;
    }
    setSheet({ type: 'add' });
  };

  const pages = [
    <HomePage key="home" {...{ hasDebts, debts, totalBalance, plan, progressRatio, capacity, alreadyPaidThisMonth, onConfirm: () => setSheet({ type: 'monthlyPayment', selectedDebtId: suggestDebtForStrategy(debts, strategy)?.id, customAmount: '' }), onPartial: () => { if (totalBalance <= 0) return; setSheet({ type: 'pay', mode: 'partial', debtId: suggestDebtForStrategy(debts, strategy)?.id }); }, onAdd: handleAddDebt, streak, strategy, setStrategy, highestRateDebt, lowestBalanceDebt, interestDelta, lowestBalanceId: lowestBalanceDebt?.id, paymentHistory, setSheet, deleteDebt, income, expense, hasOutstandingDebts: totalBalance > 0 }} />,
    <PlanPage key="plan" {...{ debts, plan, strategy, capacity, hasDebts }} />,
    null,
    <AnalizPage key="analiz" {...{ debts, totalBalance, totalOriginal, progressRatio, plan, paymentHistory, streak, hasDebts }} />,
    <AyarlarPage key="ayarlar" {...{ income, expense, setIncome, setExpense, strategy, setStrategy, resetAllData, streak, debts, adsEnabled, setAdsEnabled, adPersonalization, setAdPersonalizationState, handleWatchRewardAd, maxDebtLimit }} />,
  ];
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.04); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(220px) rotate(360deg); opacity: 0; } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulseRing { 0%, 100% { box-shadow: 0 0 0 0 ${COLORS.purple}55; } 50% { box-shadow: 0 0 0 8px ${COLORS.purple}00; } }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        input[type=range] { -webkit-appearance: none; }
        /* Hide native scrollbars for scrollable containers */
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>
      <div style={{ width: "100%", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", boxSizing: "border-box", paddingTop: "0px", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}>
    <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', padding: `0px calc(12px + env(safe-area-inset-right, 0px)) calc(64px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))`, overscrollBehavior: "none", overscrollBehaviorY: 'none', animation: "fadeIn 0.25s ease" }} key={navIndex}>
          {pages[navIndex]}
        </div>

        <BottomNav index={navIndex} onTap={handleNavTap} />

        {(sheet?.type === "add" || sheet?.type === "edit") && (
          <AddEditSheet existing={sheet.debt} onClose={() => setSheet(null)} onSave={(d: Debt) => { upsertDebt(d); if (d.dueDate) { try { scheduleNotificationForDebt(d.id, `Ödeme hatırlatıcısı: ${d.title}`, `Son ödeme tarihi: ${d.dueDate}`, new Date(d.dueDate)); } catch (e) {} } setSheet(null); }} />
        )}
        {sheet?.type === 'limit-info' && (
          <SheetWrapper onClose={() => setSheet(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 16, background: `${COLORS.purple}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={24} color={COLORS.purple} />
                </div>
                <div>
                  <div style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: 800 }}>Yeni borç eklemek için bir adım kaldı!</div>
                  <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>Şu anda maksimum borç limitindesiniz. Ayarlar sekmesine gidip kısa bir reklam izleyerek ek borç ekleme hakkınızı açabilirsiniz.</div>
                </div>
              </div>
              <div style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 14, color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                Bu seçeneği kullanmak için Ayarlar sekmesine gidin ve ilgili reklam izleme fırsatını açın.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => { setNavIndex(4); setSheet(null); }} style={{ flex: 1, minWidth: 130, padding: '14px', borderRadius: 16, border: 'none', background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Ayarlar'a Git
                </button>
                <button onClick={() => setSheet(null)} style={{ flex: 1, minWidth: 130, padding: '14px', borderRadius: 16, border: `1px solid ${COLORS.stroke}`, background: 'transparent', color: COLORS.textPrimary, fontWeight: 700, cursor: 'pointer' }}>
                  Sonra Bak
                </button>
              </div>
            </div>
          </SheetWrapper>
        )}
        {sheet?.type === "pay" && (
          <SheetWrapper onClose={() => setSheet(null)}>
            <h3 style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: 800, margin: 0 }}>{sheet.mode === 'partial' ? 'Kısmi Ödeme' : 'Ödeme'}</h3>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sheet.mode === 'partial' && (
                <div>
                  <FieldLabel>Hangi borçtan öde</FieldLabel>
                  <select
                    style={{ ...inputStyle as React.CSSProperties, padding: '12px', borderRadius: 14 }}
                    value={sheet.debtId || debts[0]?.id || ''}
                    onChange={(e) => setSheet({ ...sheet, debtId: e.target.value })}
                  >
                    {debts.map((d) => (
                      <option key={d.id} value={d.id}>{`${d.title} — ${d.subtitle} (${tl(d.balance)})`}</option>
                    ))}
                  </select>
                </div>
              )}
              {sheet.mode !== 'skip' && (
                <div>
                  <FieldLabel>Miktar (₺)</FieldLabel>
                  <input style={inputStyle as React.CSSProperties} type="number" placeholder="Ödenecek tutarı girin" id="_payment_amount" />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setSheet(null); }} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${COLORS.stroke}`, background: 'transparent', color: COLORS.textSecondary }}>Vazgeç</button>
                <button onClick={() => {
                  try {
                    if (sheet.mode === 'skip') { performPayment(undefined, { skip: true }); return; }
                    const el = document.getElementById('_payment_amount') as HTMLInputElement | null;
                    const raw = el?.value || '';
                    const num = parseFloat(raw.replace(',', '.')) || 0;

                    if (sheet.mode === 'partial') {
                      if (!sheet.debtId) {
                        alert('Lütfen bir borç seçin.');
                        return;
                      }
                      if (num <= 0) {
                        alert('Lütfen kısmi ödeme tutarını girin.');
                        return;
                      }
                      performPayment(num, { perDebtId: sheet.debtId });
                    }
                  } catch (e) {}
                }} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, color: '#fff' }}>Onayla</button>
              </div>
            </div>
          </SheetWrapper>
        )}
        {sheet?.type === 'monthlyPayment' && (
          <SheetWrapper onClose={() => setSheet(null)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: 800, margin: 0 }}>Ödemeyi Yapılandır</h3>
                <p style={{ color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.6, maxWidth: 320 }}>
                  Seçili stratejiye göre önerdiğimiz borç otomatik seçildi. Manuel olarak başka bir borcu da tercih edebilirsin.
                </p>
              </div>
              <button onClick={() => setSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}><X size={22} color={COLORS.textSecondary} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {debts.map((d) => {
                const selected = d.id === sheet.selectedDebtId;
                const badge = d.icon === 'bank' ? 'Kredi Borcu' : d.icon === 'card' ? 'Kredi Kartı' : 'Borç';
                return (
                  <button key={d.id} onClick={() => setSheet({ ...sheet, selectedDebtId: d.id, customAmount: selected ? sheet.customAmount : '' })} style={{
                    width: '100%', textAlign: 'left', padding: 18, borderRadius: 20, border: selected ? `1px solid ${COLORS.blue}` : `1px solid ${COLORS.stroke}`,
                    background: selected ? COLORS.cardAlt : COLORS.card, color: COLORS.textPrimary, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12,
                    boxShadow: selected ? '0 18px 35px rgba(79, 172, 254, 0.1)' : 'none', transition: 'all 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{d.title}</div>
                        <div style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subtitle}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <span style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: 700 }}>{badge}</span>
                        <span style={{ color: selected ? COLORS.blue : COLORS.textPrimary, fontWeight: 700, fontSize: 15 }}>{tl(d.balance)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: selected ? COLORS.blue : COLORS.textSecondary, fontSize: 12, fontWeight: 700 }}>{selected ? 'Seçili' : 'Seçmek için dokun'}</span>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? COLORS.blue : COLORS.stroke}`, background: selected ? COLORS.blue : 'transparent' }} />
                    </div>
                  </button>
                );
              })}

              {sheet.selectedDebtId && (() => {
                const selectedDebt = debts.find((d) => d.id === sheet.selectedDebtId);
                if (!selectedDebt) return null;

                const installment = selectedDebt.icon === 'bank' ? getMinimumPayment(selectedDebt) : 0;
                return (
                  <div style={{ background: COLORS.cardAlt, borderRadius: 24, padding: 18, border: `1px solid ${COLORS.stroke}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>Seçili Borç</div>
                        <div style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 800, marginTop: 6 }}>{selectedDebt.title}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>Kalan</div>
                        <div style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: 800, marginTop: 6 }}>{tl(selectedDebt.balance)}</div>
                      </div>
                    </div>
                    {selectedDebt.icon === 'bank' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>Bu kredi borcu için 1 taksit</span>
                        <span style={{ color: COLORS.green, fontSize: 20, fontWeight: 800 }}>{tl(installment)}</span>
                        <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>Tutar kredi borcundan otomatik olarak düşülecek.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <FieldLabel>Ödemek istediğiniz tutarı girin</FieldLabel>
                        <input style={{ ...inputStyle as React.CSSProperties, transition: 'all 0.3s ease' }} value={sheet.customAmount ?? ''} onChange={(e) => setSheet({ ...sheet, customAmount: e.target.value })} inputMode="decimal" placeholder="Ödemek istediğiniz tutarı girin" />
                        <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>Kredi kartı borcun için dilediğin tutarı seçebilirsin.</div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <button onClick={async () => {
                const selectedDebt = debts.find((d) => d.id === sheet.selectedDebtId);
                if (!selectedDebt) {
                  alert('Önce bir borç seçin.');
                  return;
                }

                if (selectedDebt.icon === 'bank') {
                  const installment = getMinimumPayment(selectedDebt);
                  if (installment <= 0) {
                    alert('Bu borç için ödenecek tutar hesaplanamadı.');
                    return;
                  }
                  const ok = await performPayment(installment, { perDebtId: selectedDebt.id });
                  if (ok) setCelebration({ type: 'payment-success', debt: selectedDebt });
                  setSheet(null);
                  return;
                }

                const raw = (sheet.customAmount || '').toString();
                const amount = parseFloat(raw.replace(',', '.')) || 0;
                if (amount <= 0) {
                  alert('Lütfen geçerli bir ödeme tutarı girin.');
                  return;
                }
                const ok = await performPayment(amount, { perDebtId: selectedDebt.id });
                if (ok) setCelebration({ type: 'payment-success', debt: selectedDebt });
                setSheet(null);
              }} style={{ width: '100%', padding: '16px', borderRadius: 18, border: 'none', background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 18px 36px rgba(124,92,252,0.18)' }}>
                Ödemeyi Tamamla
              </button>
            </div>
          </SheetWrapper>
        )}
        {celebration && <CelebrationModal data={celebration} onClose={handleCelebrationClose} />}
      </div>
    </div>
  );
}

// =============================================================================
// HOME PAGE
// =============================================================================
function HomePage(props: PageProps) {
  const { hasDebts, debts, totalBalance, plan, progressRatio, capacity, alreadyPaidThisMonth, onConfirm, onPartial, onAdd, streak, strategy, setStrategy, highestRateDebt, lowestBalanceDebt, interestDelta, lowestBalanceId, paymentHistory, setSheet, deleteDebt, income, expense } = props;

  return (
    <>
      <Header streak={streak} />
      {!hasDebts ? (
        <EmptyState onAdd={() => setSheet({ type: "add" })} />
      ) : (
        <>
          <SummaryCard totalBalance={totalBalance} plan={plan} progressRatio={progressRatio} />
          <PaymentCTA capacity={capacity} alreadyPaid={alreadyPaidThisMonth} onConfirm={onConfirm} onPartial={onPartial} streak={streak} hasOutstandingDebts={totalBalance > 0} />
          <StrategyCard strategy={strategy} setStrategy={setStrategy} highestRateDebt={highestRateDebt} lowestBalanceDebt={lowestBalanceDebt} interestDelta={interestDelta} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 10px" }}>
            <h2 style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: 800, margin: 0 }}>Borçlarım</h2>
            <button onClick={onAdd} style={{ background: "none", border: "none", color: COLORS.purple, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Plus size={16} /> Borç Ekle
            </button>
          </div>

          <DebtList debts={debts} priorityId={strategy === "snowball" ? lowestBalanceId : highestRateDebt?.id} strategy={strategy} onEdit={(d: Debt) => setSheet({ type: "edit", debt: d })} onDelete={deleteDebt} />

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
            <RecentPaymentsCard payments={paymentHistory} />
            <CapacityCard capacity={capacity} income={income} expense={expense} />
          </div>
        </>
      )}
    </>
  );
}

function Header({ streak }: { streak: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 0 }}>
      <div>
        <h1 style={{ color: COLORS.textPrimary, fontSize: 24, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Borç Kapatma Planlayıcısı</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>Finansal özgürlüğe giden yol haritan</p>
          {streak > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, background: `${COLORS.amber}1F`, color: COLORS.amber, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
              <Flame size={11} /> {streak}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ marginTop: 40, textAlign: "center", animation: "slideUp 0.4s ease" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${COLORS.purple}1F`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Wallet size={30} color={COLORS.purple} />
      </div>
      <h3 style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Henüz borç eklemedin</h3>
      <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.5, maxWidth: 280, margin: "0 auto 20px" }}>
        Kredi kartların ve kredilerini ekle, sana özel borçtan kurtulma planını birlikte çıkaralım.
      </p>
      <button onClick={onAdd} style={{ background: COLORS.purple, color: "#fff", border: "none", borderRadius: 14, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Plus size={16} /> İlk Borcunu Ekle
      </button>
    </div>
  );
}

function SummaryCard({ totalBalance, plan, progressRatio }: { totalBalance: number; plan: SimulationResult; progressRatio: number }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const dateStr = Number.isFinite(plan.months) && plan.months
    ? plan.payoffDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    : plan.stuck ? "Kapasite yetersiz" : "—";

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 24, padding: 20, marginTop: 20, display: "flex", gap: 16, alignItems: "center", animation: "slideUp 0.4s ease" }}>
      <div style={{ position: "relative", width: 150, height: 150, flexShrink: 0 }}>
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={r} fill="none" stroke={COLORS.stroke} strokeWidth="12" />
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={COLORS.purple} />
              <stop offset="100%" stopColor={COLORS.blue} />
            </linearGradient>
          </defs>
          <circle cx="75" cy="75" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${c * Math.max(0.02, progressRatio)} ${c}`} transform="rotate(-90 75 75)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>Toplam Borç</span>
          <span style={{ color: COLORS.textPrimary, fontSize: 19, fontWeight: 800, margin: "4px 0 2px" }}>{tl(totalBalance)}</span>
          <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 600 }}>%{Math.round(progressRatio * 100)} ödendi</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        <InfoRow icon={Calendar} label="Borçsuz Kalma Tarihi" value={dateStr} color={COLORS.purple} />
        <div style={{ height: 1, background: COLORS.stroke }} />
        <InfoRow icon={Wallet} label="Toplam Faiz Ödemesi" value={tl(plan.totalInterest)} color={COLORS.red} />
        <div style={{ height: 1, background: COLORS.stroke }} />
        <InfoRow icon={CalendarClock} label="Tahmini Ay" value={Number.isFinite(plan.months) ? `${plan.months} Ay` : "—"} color={COLORS.blue} />
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, color }: { icon: React.FC<any>; label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.cardAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={COLORS.textSecondary} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: COLORS.textSecondary, fontSize: 11 }}>{label}</div>
        <div style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function PaymentCTA({ capacity, alreadyPaid, onConfirm, onPartial, streak, hasOutstandingDebts }: { capacity: number; alreadyPaid: boolean; onConfirm: () => void; onPartial: () => void; streak: number; hasOutstandingDebts: boolean }) {
  if (!hasOutstandingDebts) {
    return (
      <div style={{ marginTop: 14, background: `${COLORS.green}14`, border: `1px solid ${COLORS.green}33`, borderRadius: 20, padding: 18, fontSize: 13, color: COLORS.textSecondary }}>
        Tüm borçlar kapatıldı. Yeni bir borç ekleyerek ödemeye devam edebilirsin.
      </div>
    );
  }

  if (capacity <= 0) {
    return (
      <div style={{ marginTop: 14, background: `${COLORS.red}14`, border: `1px solid ${COLORS.red}33`, borderRadius: 20, padding: 18, fontSize: 13, color: COLORS.textSecondary }}>
        Ödeme kapasiten 0 ₺. Ayarlar'dan gelir/gider bilgini güncelleyerek aylık ödeme planını aktif et.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
      <button onClick={onConfirm} disabled={alreadyPaid} style={{
        width: "100%", padding: "18px", borderRadius: 22, border: "none", cursor: alreadyPaid ? "default" : "pointer",
        background: alreadyPaid ? COLORS.cardAlt : `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`,
        color: "#fff", fontWeight: 800, fontSize: 16, boxShadow: alreadyPaid ? "none" : "0 18px 40px rgba(124, 92, 252, 0.2)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}>
        {alreadyPaid ? "Bu ayın ödemesi onaylandı" : "Ödeme Yap"}
      </button>
      {!alreadyPaid && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: COLORS.textSecondary, fontSize: 13, padding: "0 6px" }}>
          <span>Mevcut ödeme kapasitesi</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 700 }}>{tl(capacity)}</span>
        </div>
      )}
      {!alreadyPaid && (
        <button onClick={onPartial} style={{ width: "100%", padding: "12px", borderRadius: 16, border: `1px solid ${COLORS.stroke}`, background: "transparent", color: COLORS.textSecondary, cursor: "pointer" }}>
          Kısmi Öde
        </button>
      )}
    </div>
  );
}

function StrategyCard({ strategy, setStrategy, highestRateDebt, lowestBalanceDebt, interestDelta }: { strategy: string; setStrategy: (s: string) => void; highestRateDebt: Debt | null; lowestBalanceDebt: Debt | null; interestDelta: number }) {
  return (
    <div style={{ background: COLORS.greenBg, border: `1px solid ${COLORS.green}40`, borderRadius: 20, padding: 16, marginTop: 16, animation: "slideUp 0.4s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${COLORS.green}26`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Target color={COLORS.green} size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14 }}>
            <span style={{ color: COLORS.textPrimary, fontWeight: 700 }}>Aktif Strateji: </span>
            <span style={{ color: COLORS.green, fontWeight: 700 }}>{strategy === "snowball" ? "Kartopu Yöntemi" : "Çığ Yöntemi"}</span>
          </div>
          <div style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 1.3 }}>
            {strategy === "snowball"
              ? lowestBalanceDebt ? `Önce en küçük bakiyeyi (${lowestBalanceDebt.title}) kapatıp motivasyonunu yüksek tutuyorsun.` : "En küçük bakiyeli borcu önce kapatarak hızlı zaferler kazanırsın."
              : highestRateDebt ? `En yüksek faizli borcu (${highestRateDebt.title}) önce kapatarak en az faizi ödüyorsun.` : "En yüksek faizli borcu önce kapatarak faiz tasarrufu sağlarsın."}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <StrategyToggleButton active={strategy === "avalanche"} onClick={() => setStrategy("avalanche")} label="Çığ Yöntemi" sub="En az faiz" />
        <StrategyToggleButton active={strategy === "snowball"} onClick={() => setStrategy("snowball")} label="Kartopu Yöntemi" sub="Hızlı zafer" />
      </div>
      {interestDelta > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: COLORS.textSecondary }}>
          <TrendingDown size={13} color={COLORS.green} />
          Çığ Yöntemi, Kartopu'na göre toplamda <span style={{ color: COLORS.green, fontWeight: 700, whiteSpace: 'nowrap' }}>{tl(interestDelta)}</span> daha az faiz öder.
        </div>
      )}
    </div>
  );
}

function StrategyToggleButton({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center",
      border: `1px solid ${active ? COLORS.green : COLORS.stroke}`, background: active ? `${COLORS.green}1F` : "transparent", transition: "all 0.2s ease",
    }}>
      <div style={{ color: active ? COLORS.green : COLORS.textPrimary, fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function DebtList({ debts, priorityId, strategy, onEdit, onDelete }: { debts: Debt[]; priorityId?: string; strategy: string; onEdit: (d: Debt) => void; onDelete: (id: string) => void }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, overflow: "hidden" }}>
      {debts.map((d, i) => {
        const Icon = (ICONS as Record<string, any>)[d.icon] || CreditCard;
        const iconColor = ICON_COLORS[d.colorIndex % ICON_COLORS.length];
        const isPriority = d.id === priorityId;
        const original = d.originalBalance || d.balance;
        const paidRatio = original > 0 ? Math.min(1, 1 - d.balance / original) : 0;
        return (
          <div key={d.id} onClick={() => onEdit(d)} style={{ padding: "14px 16px", cursor: "pointer", borderBottom: i === debts.length - 1 ? "none" : `1px solid ${COLORS.stroke}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${iconColor}2E`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={20} color={iconColor} />
              </div>

              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subtitle}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0, marginLeft: 12, minWidth: 84 }}>
                <div style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 15 }}>{tl(d.balance)}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 12 }}>%{d.rate.toFixed(2)}</div>
                {isPriority && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                    <span style={{ background: `${COLORS.red}2E`, color: COLORS.red, fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                      {strategy === "snowball" ? "Sırada" : "En Yüksek Faiz"}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={(e) => { e.stopPropagation(); onDelete(d.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: COLORS.textSecondary }} aria-label="Sil">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10, height: 5, borderRadius: 4, background: COLORS.cardAlt, overflow: "hidden" }}>
              <div style={{ width: `${paidRatio * 100}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CapacityCard({ capacity, income, expense }: { capacity: number; income: number; expense: number }) {
  const ratio = income === 0 ? 0 : Math.min(1, Math.max(0, capacity / income));
  const r = 60;
  const c = Math.PI * r;
  return (
    <div style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 16, display: "flex", flexDirection: "column" }}>
      <span style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 13 }}>Ödeme Kapasitem</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16, alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 }}>Kullanılabilir</div>
          <div style={{ color: COLORS.textPrimary, fontSize: 24, fontWeight: 800 }}>{tl(capacity)}</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 6 }}>Aylık</div>
        </div>
        <div style={{ width: "100%", maxWidth: 260 }}>
          <svg width="100%" height="90" viewBox="0 0 150 90" style={{ display: "block", margin: "0 auto" }}>
            <defs>
              <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={COLORS.purple} />
                <stop offset="100%" stopColor={COLORS.blue} />
              </linearGradient>
            </defs>
            <path d={`M 15 85 A ${r} ${r} 0 0 1 135 85`} fill="none" stroke={COLORS.stroke} strokeWidth="14" strokeLinecap="round" />
            <path d={`M 15 85 A ${r} ${r} 0 0 1 135 85`} fill="none" stroke="url(#arcGrad)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 11, flexWrap: "wrap", marginTop: 18 }}>
        <span style={{ color: COLORS.green, fontWeight: 600 }}>Gelir: {tl(income)}</span>
        <span style={{ color: COLORS.textSecondary }}>•</span>
        <span style={{ color: COLORS.red, fontWeight: 600 }}>Gider: {tl(expense)}</span>
      </div>
    </div>
  );
}

// =============================================================================
// PLAN PAGE
// =============================================================================
function PlanPage({ debts, plan, strategy, capacity, hasDebts }: PlanPageProps) {
  const ordered = sortForStrategy(debts, strategy).map((d) => debts.find((x) => x.id === d.id));

  if (!hasDebts) {
    return <PageHeader title="Ödeme Planı" subtitle="Borç ekleyince sıralı ödeme planın burada oluşacak." />;
  }

  return (
    <>
      <PageHeader title="Ödeme Planı" subtitle={`${strategy === "snowball" ? "Kartopu" : "Çığ"} Yöntemi'ne göre sıralandı`} />

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 16, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Stat label="Tahmini Süre" value={Number.isFinite(plan.months) ? `${plan.months} ay` : "—"} color={COLORS.blue} />
          <Stat label="Aylık Ödeme" value={tl(capacity)} color={COLORS.purple} />
          <Stat label="Toplam Faiz" value={tl(plan.totalInterest)} color={COLORS.red} />
        </div>
      </div>

      <h3 style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 800, margin: "24px 0 10px" }}>Ödeme Sırası</h3>
      <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: "0 0 12px", lineHeight: 1.4 }}>
        {strategy === "snowball"
          ? "Önce en küçük bakiyeden başlayarak sırayla kapatacaksın. Her kapanan borç bir sonrakine ekstra ödeme gücü katar."
          : "Önce en yüksek faizli borçtan başlayarak sırayla kapatacaksın. Bu sıralama toplam faiz ödemeni en aza indirir."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ordered.filter((d): d is Debt => d !== null && d !== undefined).map((d, i) => {
          const Icon = (ICONS as Record<string, any>)[d.icon] || CreditCard;
          const iconColor = ICON_COLORS[d.colorIndex % ICON_COLORS.length];
          const payoffMonth = plan.perDebtPayoffMonth[d.id];
          const payoffDate = new Date();
          if (payoffMonth) payoffDate.setDate(payoffDate.getDate() + payoffMonth * 30);

          return (
            <div key={d.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", background: i === 0 ? COLORS.purple : COLORS.cardAlt,
                color: i === 0 ? "#fff" : COLORS.textSecondary, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800, flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${iconColor}2E`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} color={iconColor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>{d.title}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <CalendarCheck size={11} />
                  {payoffMonth ? `${payoffMonth}. ayda kapanır · ${payoffDate.toLocaleDateString("tr-TR", { month: "short", year: "numeric" })}` : "Süresi belirsiz"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>{tl(d.balance)}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 11 }}>%{d.rate.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 800, margin: "24px 0 10px" }}>Aylık Takvim</h3>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, overflow: "hidden" }}>
        {plan.monthlyPayments.slice(0, 12).map((amt, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() + i);
          const remaining = plan.remainingByMonth[i];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i === Math.min(11, plan.monthlyPayments.length - 1) ? "none" : `1px solid ${COLORS.stroke}` }}>
              <span style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: 600 }}>{MONTH_NAMES_FULL[d.getMonth()]} {d.getFullYear()}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: COLORS.purple, fontSize: 13, fontWeight: 700 }}>{tl(amt)}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 10 }}>kalan: {tl(remaining)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ color: COLORS.textSecondary, fontSize: 11 }}>{label}</div>
      <div style={{ color, fontSize: 15, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginTop: 0 }}>
      <h1 style={{ color: COLORS.textPrimary, fontSize: 24, fontWeight: 800, margin: 0 }}>{title}</h1>
      <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: "2px 0 0" }}>{subtitle}</p>
    </div>
  );
}

// =============================================================================
// ANALİZ PAGE
// =============================================================================
interface AnalizPageProps {
  debts: Debt[];
  totalBalance: number;
  totalOriginal: number;
  progressRatio: number;
  plan: SimulationResult;
  paymentHistory: PaymentRecord[];
  streak: number;
  hasDebts: boolean;
}

function AnalizPage({ debts, totalBalance, totalOriginal, progressRatio, plan, paymentHistory, streak, hasDebts }: AnalizPageProps) {
  if (!hasDebts) {
    return <PageHeader title="Analiz" subtitle="Borç ekleyince dağılım ve ilerleme grafiklerin burada görünecek." />;
  }

  const totalPaid = totalOriginal - totalBalance;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const donutSegments = useMemo(() => {
    let cumulative = 0;
    return debts.map((d, i) => {
      const ratio = totalBalance > 0 ? d.balance / totalBalance : 0;
      const seg = { ratio, offset: cumulative, color: SLICE_COLORS[i % SLICE_COLORS.length], debt: d };
      cumulative += ratio;
      return seg;
    });
  }, [debts, totalBalance]);

  const principalRemaining = totalBalance;
  const interestRemaining = plan.totalInterest;
  const interestRatio = principalRemaining + interestRemaining > 0 ? interestRemaining / (principalRemaining + interestRemaining) : 0;

  return (
    <>
      <PageHeader title="Analiz" subtitle="Borç dağılımın ve ilerleme durumun" />

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <SmallStatCard icon={Sparkles} label="Ödenen" value={tl(totalPaid)} color={COLORS.green} />
        <SmallStatCard icon={Flame} label="Seri" value={`${streak} ay`} color={COLORS.amber} />
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 20, marginTop: 16 }}>
        <span style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>Borç Dağılımı</span>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            {donutSegments.map((seg, i) => {
              const r = 50, c = 2 * Math.PI * r;
              return (
                <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={seg.color} strokeWidth="16"
                  strokeDasharray={`${seg.ratio * c} ${c}`} strokeDashoffset={-seg.offset * c} transform="rotate(-90 60 60)" />
              );
            })}
          </svg>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {donutSegments.map((seg, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                <span style={{ color: COLORS.textSecondary, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.debt.title}</span>
                <span style={{ color: COLORS.textPrimary, fontSize: 12, fontWeight: 700 }}>%{Math.round(seg.ratio * 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 20, marginTop: 16 }}>
        <span style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>Anapara / Faiz Oranı</span>
        <p style={{ color: COLORS.textSecondary, fontSize: 12, margin: "4px 0 14px" }}>Kalan borcunun ne kadarı faiz olarak ödenecek</p>
        <div style={{ height: 14, borderRadius: 8, background: COLORS.cardAlt, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${(1 - interestRatio) * 100}%`, background: COLORS.purple }} />
          <div style={{ width: `${interestRatio * 100}%`, background: COLORS.red }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
          <span style={{ color: COLORS.purple, fontWeight: 600 }}>● Anapara {tl(principalRemaining)}</span>
          <span style={{ color: COLORS.red, fontWeight: 600 }}>● Faiz {tl(interestRemaining)}</span>
        </div>
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 20, marginTop: 16 }}>
        <span style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>Genel İlerleme</span>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: COLORS.textSecondary }}>%{Math.round(progressRatio * 100)} tamamlandı</span>
            <span style={{ color: COLORS.textSecondary }}>{tl(totalBalance)} kaldı</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: COLORS.cardAlt, overflow: "hidden" }}>
            <div style={{ width: `${progressRatio * 100}%`, height: "100%", background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, transition: "width 0.6s ease" }} />
          </div>
        </div>
      </div>

      {paymentHistory.length > 0 && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 20, marginTop: 16 }}>
          <span style={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: 14 }}>Ödeme Geçmişi</span>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {[...paymentHistory].reverse().slice(0, 6).map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: COLORS.textSecondary }}>{new Date(p.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</span>
                <span style={{ color: COLORS.green, fontWeight: 700 }}>+{tl(p.amount)} ödendi</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SmallStatCard({ icon: Icon, label, value, color }: { icon: React.FC<any>; label: string; value: string | number; color: string }) {
  return (
    <div style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 16, padding: 14 }}>
      <Icon size={16} color={color} />
      <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 8 }}>{label}</div>
      <div style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function RecentPaymentsCard({ payments }: { payments: PaymentRecord[] }) {
  const recent = [...payments].reverse().slice(0, 5);
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 24, padding: 18, animation: "slideUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: 800 }}>Son Yapılan Ödemeler</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>En yeni hareketler burada görünür.</div>
        </div>
        <span style={{ color: COLORS.purple, fontSize: 12, fontWeight: 700 }}>Hızlı bakış</span>
      </div>
      {recent.length === 0 ? (
        <div style={{ borderRadius: 18, background: COLORS.cardAlt, padding: 18, textAlign: "center", color: COLORS.textSecondary, fontSize: 13 }}>
          Henüz ödeme yapılmadı. İlk ödemeyi kaydederek finansal ilerlemeni takip etmeye başlayabilirsin.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recent.map((payment, index) => (
            <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: 18, background: COLORS.cardAlt }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 14, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Wallet size={18} color={COLORS.blue} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{payment.debtTitle || payment.description || "Ödeme"}</div>
                  <div style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{new Date(payment.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 88 }}>
                <div style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: 800 }}>{tl(payment.amount)}</div>
                <div style={{ color: COLORS.green, fontSize: 12, marginTop: 2 }}>{payment.description || "Ödeme kaydedildi"}</div>
              </div>
            </div>
          ))}
          {payments.length > 5 && (
            <button onClick={() => { alert('Tüm ödeme geçmişi bölümü yakında eklenecek.'); }} style={{ width: "100%", border: "none", background: "transparent", color: COLORS.purple, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              Tümünü Gör
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AYARLAR PAGE
// =============================================================================
interface AyarlarPageProps {
  income: number;
  expense: number;
  setIncome: (val: number) => void;
  setExpense: (val: number) => void;
  strategy: string;
  setStrategy: (s: string) => void;
  resetAllData: () => void;
  streak: number;
  debts: Debt[];
  adsEnabled: boolean;
  setAdsEnabled: (v: boolean) => void;
  adPersonalization?: boolean;
  setAdPersonalizationState?: (b: boolean) => void;
  handleWatchRewardAd?: () => void;
  maxDebtLimit: number;
}

function AyarlarPage({ income, expense, setIncome, setExpense, strategy, setStrategy, resetAllData, streak, debts, adsEnabled, setAdsEnabled, adPersonalization, setAdPersonalizationState, handleWatchRewardAd, maxDebtLimit }: AyarlarPageProps) {
  const [i, setI] = useState(income.toString());
  const [e, setE] = useState(expense.toString());
  const [notif, setNotif] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = parseFloat(i) !== income || parseFloat(e) !== expense;

  const save = () => {
    setIncome(parseFloat(i) || income);
    setExpense(parseFloat(e) || expense);
  };

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="Gelir, gider ve uygulama tercihlerin" />

      <SectionLabel>Gelir & Gider</SectionLabel>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FieldLabel>Aylık Gelir (₺)</FieldLabel>
          <input style={inputStyle as React.CSSProperties} value={i} onChange={(ev) => setI(ev.target.value)} inputMode="decimal" />
        </div>
        <div>
          <FieldLabel>Aylık Sabit Gider (₺)</FieldLabel>
          <input style={inputStyle as React.CSSProperties} value={e} onChange={(ev) => setE(ev.target.value)} inputMode="decimal" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textSecondary, paddingTop: 4 }}>
          <span>Aylık ödeme kapasiten</span>
          <span style={{ color: COLORS.purple, fontWeight: 700 }}>{tl(Math.max(0, (parseFloat(i) || 0) - (parseFloat(e) || 0)))}</span>
        </div>
        {dirty && (
          <button onClick={save} style={{ marginTop: 4, padding: "12px", borderRadius: 12, border: "none", background: COLORS.purple, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Değişiklikleri Kaydet
          </button>
        )}
      </div>

      <SectionLabel>Varsayılan Strateji</SectionLabel>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 8, display: "flex", gap: 8 }}>
        <StrategyToggleButton active={strategy === "avalanche"} onClick={() => setStrategy("avalanche")} label="Çığ Yöntemi" sub="En az faiz" />
        <StrategyToggleButton active={strategy === "snowball"} onClick={() => setStrategy("snowball")} label="Kartopu Yöntemi" sub="Hızlı zafer" />
      </div>

      <SectionLabel>Tercihler</SectionLabel>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, overflow: "hidden" }}>
        <ToggleRow icon={Bell} label="Ödeme hatırlatmaları" sub="Her ay ödeme zamanı geldiğinde bildirim al" value={notif} onChange={setNotif} />
        <ToggleRow icon={User} label="Reklam Kişiselleştirme" sub="Kişiselleştirilmiş reklamlar gösterilsin mi" value={!!adPersonalization} onChange={(v: boolean) => setAdPersonalizationState && setAdPersonalizationState(v)} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            Mevcut borç ekleme limitin: {maxDebtLimit} borç. Her reklam izlediğinde limitin 1 artar.
          </div>
          <button
            onClick={() => handleWatchRewardAd && handleWatchRewardAd()}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 14,
              border: 'none',
              background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`,
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reklam İzle, Borç Limitini +1 Artır
          </button>
        </div>
      </div>

      <SectionLabel>Veri</SectionLabel>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
          <span>{debts.length} borç · {streak} aylık ödeme serisi</span>
        </div>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${COLORS.stroke}`, background: "transparent", color: COLORS.red, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <RotateCcw size={14} /> Tüm Verileri Sıfırla
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmReset(false)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${COLORS.stroke}`, background: "transparent", color: COLORS.textSecondary, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Vazgeç
            </button>
            <button onClick={() => { resetAllData(); setConfirmReset(false); }} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: COLORS.red, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Eminim, Sıfırla
            </button>
          </div>
        )}
      </div>

      <SectionLabel>Hakkında</SectionLabel>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 20, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Info size={18} color={COLORS.textSecondary} />
        <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
          Borç Kapatma Planlayıcısı v1.0 — Tüm verilerin yalnızca bu cihazda saklanır, hiçbir sunucuya gönderilmez.
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "20px 0 8px" }}>{children}</div>;
}

function ToggleRow({ icon: Icon, label, sub, value, onChange }: { icon: React.FC<any>; label: string; sub: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.cardAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={COLORS.textSecondary} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>{sub}</div>
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative",
        background: value ? COLORS.purple : COLORS.stroke, transition: "background 0.2s ease", flexShrink: 0,
      }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: value ? 21 : 3, transition: "left 0.2s ease" }} />
      </button>
    </div>
  );
}

// =============================================================================
// BOTTOM NAV
// =============================================================================
function BottomNav({ index, onTap }: { index: number; onTap: (i: number) => void }) {
  const items = [
    { icon: Home, label: "Ana Sayfa" },
    { icon: ListChecks, label: "Plan" },
    { icon: Plus, label: "" },
    { icon: PieChart, label: "Analiz" },
    { icon: User, label: "Ayarlar" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, width: "100%", zIndex: 30, background: COLORS.card, borderTop: `1px solid ${COLORS.stroke}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px env(safe-area-inset-left, 0px) calc(10px + env(safe-area-inset-bottom, 0px)) env(safe-area-inset-right, 0px)" }}>
      {items.map((item, i) => {
        if (i === 2) {
          return (
            <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <button onClick={() => onTap(i)} style={{ width: 52, height: 52, borderRadius: "50%", background: COLORS.purple, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Plus color="#fff" size={22} />
              </button>
            </div>
          );
        }
        const selected = index === i;
        const color = selected ? COLORS.purple : COLORS.textSecondary;
        const Icon = item.icon;
        return (
          <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <button onClick={() => onTap(i)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0", minWidth: 0, color }}>
              <Icon size={22} color={color} />
              <span style={{ color, fontSize: 10, lineHeight: 1 }}>{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// SHEETS & MODALS
// =============================================================================
function SheetWrapper({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div style={{ width: "100%", maxWidth: 430, alignSelf: "flex-end", position: "relative", zIndex: 1 }}>
        <div style={{ background: COLORS.card, borderRadius: "24px 24px 0 0", padding: "14px 20px 24px", maxHeight: "85vh", overflowY: "auto", animation: "slideUp 0.25s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: COLORS.stroke }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", color: COLORS.textSecondary, fontSize: 12, marginBottom: 6 }}>{children}</label>;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: COLORS.cardAlt, border: `1px solid ${COLORS.stroke}`,
  borderRadius: 12, padding: "12px 14px", color: COLORS.textPrimary, fontSize: 16, outline: "none",
};

function AddEditSheet({ existing, onClose, onSave }: { existing?: Debt; onClose: () => void; onSave: (d: Debt) => void }) {
  const [title, setTitle] = useState(existing?.title || "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle || "");
  const [balance, setBalance] = useState(existing?.balance?.toString() || "");
  const [rate, setRate] = useState(existing?.rate?.toString() || "");
  const [icon, setIcon] = useState(existing?.icon || "card");
  const [termMonths, setTermMonths] = useState(existing?.termMonths?.toString() || "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ? (existing.dueDate.slice(0,10)) : "");
  // debug test notification removed

  const save = () => {
    const balNum = parseFloat(balance.replace(",", "."));
    const rateNum = parseFloat(rate.replace(",", ".")) || 0;
    const termNum = parseInt(termMonths, 10);
    if (!title.trim()) { alert('Lütfen borç adı girin.'); return; }
    if (!subtitle.trim()) { alert('Lütfen kurum/başlık girin.'); return; }
    if (!balNum || balNum <= 0) { alert('Lütfen geçerli bir bakiye girin.'); return; }
    if (isNaN(rateNum)) { alert('Lütfen geçerli bir faiz oranı girin.'); return; }
    if (!dueDate) { alert('Lütfen ödeme tarihini seçin.'); return; }
    if (!icon) { alert('Lütfen borç türünü seçin.'); return; }
    if (icon === 'bank') {
      const termNum = parseInt(termMonths, 10);
      if (!termNum || termNum <= 0) { alert('Lütfen vade ay sayısını girin.'); return; }
    }
    const debtToSave = {
      id: existing?.id || crypto.randomUUID(),
      title: title.trim(),
      subtitle: subtitle.trim() || "—",
      balance: balNum,
      originalBalance: existing?.originalBalance ?? balNum,
      rate: rateNum,
      icon,
      termMonths: icon === "bank" && termNum > 0 ? termNum : undefined,
      dueDate: dueDate ? `${dueDate}` : undefined,
      colorIndex: existing?.colorIndex ?? Math.floor(Math.random() * 4),
    };
    onSave(debtToSave);
    // no debug/test notifications here — production scheduling handled by parent
    return;
  };

  return (
    <SheetWrapper onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: 800, margin: 0 }}>{existing ? "Borcu Düzenle" : "Yeni Borç Ekle"}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={COLORS.textSecondary} /></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FieldLabel>Borç Adı (ör. Kredi Kartı)</FieldLabel>
          <input style={inputStyle as React.CSSProperties} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kredi Kartı" />
        </div>
        <div>
          <FieldLabel>Kurum (ör. Garanti BBVA)</FieldLabel>
          <input style={inputStyle as React.CSSProperties} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Garanti BBVA" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Bakiye (₺)</FieldLabel>
            <input style={inputStyle as React.CSSProperties} value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="20000" />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Aylık Faiz (%)</FieldLabel>
            <input style={inputStyle as React.CSSProperties} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="3.50" />
          </div>
        </div>
        <div>
          <FieldLabel>Tür</FieldLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: 'wrap' }}>
            {[["card", CreditCard, "Kart"], ["bank", Landmark, "Kredi"], ["shopping", ShoppingBag, "Alışveriş"]].map(([key, Icon, label]) => {
              const selected = icon === key;
              return (
                <button key={key as string} onClick={() => setIcon(key as string)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 20,
                  border: `1px solid ${COLORS.stroke}`, background: selected ? COLORS.purple : COLORS.cardAlt,
                  color: selected ? "#fff" : COLORS.textSecondary, fontSize: 12, cursor: "pointer",
                }}>
                  {(Icon as React.FC<any>) && <Icon size={14} />} {`${label}`}
                </button>
              );
            })}
          </div>
        </div>
        {icon === 'bank' && (
          <div>
            <FieldLabel>Vade (ay)</FieldLabel>
            <input style={inputStyle as React.CSSProperties} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} inputMode="numeric" placeholder="12" />
          </div>
        )}
        <div>
          <FieldLabel>Ödeme Tarihi</FieldLabel>
          <input style={inputStyle as React.CSSProperties} value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
        </div>
        {/* debug/test notification UI removed */}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        {existing && (
          <button onClick={onClose} style={{ flex: 1, padding: "14px", borderRadius: 14, border: `1px solid ${COLORS.stroke}`, background: "transparent", color: COLORS.textSecondary, fontWeight: 600, cursor: "pointer" }}>
            Vazgeç
          </button>
        )}
        <button onClick={save} style={{ flex: 2, padding: "14px", borderRadius: 14, border: "none", background: COLORS.purple, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {existing ? "Kaydet" : "Borcu Ekle"}
        </button>
      </div>
    </SheetWrapper>
  );
}

function CelebrationModal({ data, onClose }: { data: Celebration; onClose: () => void }) {
  const confettiPieces = useRef(
    Array.from({ length: 18 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.4, color: [COLORS.purple, COLORS.blue, COLORS.green, COLORS.amber][i % 4] }))
  ).current;
  const isPaymentSuccess = data.type === "payment-success";
  const isAllClear = data.type === "all-clear";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      {!isPaymentSuccess && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {confettiPieces.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: `${p.left}%`, top: -20, width: 8, height: 8, borderRadius: 2, background: p.color, animation: `confettiFall 1.6s ease-in ${p.delay}s forwards` }} />
          ))}
        </div>
      )}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.stroke}`, borderRadius: 24, padding: 28, width: "85%", maxWidth: 360, textAlign: "center", animation: "pop 0.4s ease", position: "relative", zIndex: 1 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: isPaymentSuccess ? `${COLORS.blue}26` : `${COLORS.green}26`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          {isPaymentSuccess ? <Check size={32} color={COLORS.blue} /> : <PartyPopper size={28} color={COLORS.green} />}
        </div>
        <h3 style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: 800, margin: "0 0 10px" }}>{isPaymentSuccess ? "Tebrikler! Ödemeniz alındı." : isAllClear ? "Tebrikler, borçsuzsun! 🎉" : "Bir borcu daha kapattın!"}</h3>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
          {isPaymentSuccess
            ? "Ödeme başarıyla tamamlandı. Finansal hedeflerine bir adım daha yaklaştın."
            : isAllClear
              ? "Tüm borçlarını kapattın. Bu büyük bir başarı — finansal özgürlüğe ulaştın."
              : `${data.debt?.title} (${data.debt?.subtitle}) bakiyesini sıfırladın. Bir sonraki hedefe geçebilirsin!`}
        </p>
        <button onClick={onClose} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", cursor: "pointer", background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.blue})`, color: "#fff", fontWeight: 700, fontSize: 14 }}>
          Tamam
        </button>
      </div>
    </div>
  );
}
