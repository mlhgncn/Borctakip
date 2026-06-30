import React, { useState, useEffect } from 'react';
import './App.css';

interface Debt {
  id: string;
  name: string;
  amount: number;
  interestRate: number;
  minimumPayment: number;
  creditor?: string;
  dueDate?: string;
}

interface PaymentHistory {
  month: number;
  totalPaid: number;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
const SLICE_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

const SEED_DEBTS: Debt[] = [
  { id: '1', name: 'Credit Card', amount: 5000, interestRate: 18, minimumPayment: 150, creditor: 'Bank A' },
  { id: '2', name: 'Personal Loan', amount: 10000, interestRate: 8, minimumPayment: 250, creditor: 'Bank B' },
  { id: '3', name: 'Student Loan', amount: 15000, interestRate: 5, minimumPayment: 200, creditor: 'Government' }
];

const HomePage: React.FC<{ debts: Debt[]; income: number; expense: number }> = ({ debts, income, expense }) => {
  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  const totalMinimum = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
  const availableFunds = income - expense;
  const canPayDebt = availableFunds > 0;

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="card">
          <div className="card-label">Total Debt</div>
          <div className="card-value">${totalDebt.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-label">Monthly Income</div>
          <div className="card-value">${income.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-label">Monthly Expense</div>
          <div className="card-value">${expense.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-label">Available Funds</div>
          <div className={`card-value ${canPayDebt ? 'positive' : 'negative'}`}>${availableFunds.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="card-label">Minimum Payment</div>
          <div className="card-value">${totalMinimum.toFixed(2)}</div>
        </div>
      </div>

      <h3>Your Debts</h3>
      <div className="debt-list">
        {debts.map((debt, idx) => (
          <div key={debt.id} className="debt-item" style={{ borderColor: COLORS[idx % COLORS.length] }}>
            <div className="debt-info">
              <div className="debt-name">{debt.name}</div>
              <div className="debt-creditor">{debt.creditor}</div>
            </div>
            <div className="debt-amount">${debt.amount.toFixed(2)}</div>
            <div className="debt-rate">{debt.interestRate}%</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PlanPage: React.FC<{ debts: Debt[]; income: number; expense: number; strategy: string; paymentHistory: PaymentHistory[] }> = ({ debts, income, expense, strategy, paymentHistory }) => {
  const nextPayment = paymentHistory.length > 0 ? paymentHistory[paymentHistory.length - 1] : null;

  return (
    <div className="page">
      <h2>Payment Plan</h2>
      <div className="strategy-info">
        <p>Strategy: <strong>{strategy === 'snowball' ? 'Debt Snowball (Pay smallest first)' : 'Debt Avalanche (Pay highest rate first)'}</strong></p>
        <p>Available Monthly: <strong>${(income - expense).toFixed(2)}</strong></p>
      </div>

      {nextPayment && (
        <div className="next-payment-card">
          <h3>Next Month Projection</h3>
          <div className="projection-grid">
            <div className="projection-item">
              <span>Total Payment</span>
              <strong>${nextPayment.totalPaid.toFixed(2)}</strong>
            </div>
            <div className="projection-item">
              <span>Principal</span>
              <strong>${nextPayment.principalPaid.toFixed(2)}</strong>
            </div>
            <div className="projection-item">
              <span>Interest</span>
              <strong>${nextPayment.interestPaid.toFixed(2)}</strong>
            </div>
            <div className="projection-item">
              <span>Remaining</span>
              <strong>${nextPayment.remainingBalance.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      )}

      <h3>Payment Schedule</h3>
      <div className="schedule-list">
        {paymentHistory.slice(0, 6).map((payment, idx) => (
          <div key={idx} className="schedule-item">
            <div className="schedule-month">Month {payment.month}</div>
            <div className="schedule-payment">${payment.totalPaid.toFixed(2)}</div>
            <div className="schedule-remaining">${payment.remainingBalance.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AnalizPage: React.FC<{ debts: Debt[]; paymentHistory: PaymentHistory[] }> = ({ debts, paymentHistory }) => {
  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  const totalInterest = paymentHistory.reduce((sum, p) => sum + p.interestPaid, 0);
  const monthsToPayoff = paymentHistory.length;

  return (
    <div className="page">
      <h2>Analysis</h2>
      <div className="analysis-cards">
        <div className="analysis-card">
          <div className="analysis-label">Total Debt</div>
          <div className="analysis-value">${totalDebt.toFixed(2)}</div>
        </div>
        <div className="analysis-card">
          <div className="analysis-label">Total Interest (Est.)</div>
          <div className="analysis-value">${totalInterest.toFixed(2)}</div>
        </div>
        <div className="analysis-card">
          <div className="analysis-label">Payoff Timeline</div>
          <div className="analysis-value">{monthsToPayoff} months</div>
        </div>
      </div>

      <h3>Debt Breakdown</h3>
      <div className="debt-breakdown">
        {debts.map((debt, idx) => (
          <div key={debt.id} className="breakdown-item">
            <div className="breakdown-label">
              <span className="dot" style={{ backgroundColor: SLICE_COLORS[idx % SLICE_COLORS.length] }}></span>
              {debt.name}
            </div>
            <div className="breakdown-value">${debt.amount.toFixed(2)} ({((debt.amount / totalDebt) * 100).toFixed(1)}%)</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AyarlarPage: React.FC<{ 
  income: number; 
  setIncome: (val: number) => void;
  expense: number;
  setExpense: (val: number) => void;
  strategy: string;
  setStrategy: (val: string) => void;
  onReset: () => void;
}> = ({ income, setIncome, expense, setExpense, strategy, setStrategy, onReset }) => {
  return (
    <div className="page">
      <h2>Settings</h2>
      
      <div className="settings-group">
        <label>Monthly Income: ${income.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="10000" 
          step="100"
          value={income}
          onChange={(e) => setIncome(parseFloat(e.target.value))}
        />
        <input 
          type="number" 
          value={income}
          onChange={(e) => setIncome(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="settings-group">
        <label>Monthly Expense: ${expense.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="10000" 
          step="100"
          value={expense}
          onChange={(e) => setExpense(parseFloat(e.target.value))}
        />
        <input 
          type="number" 
          value={expense}
          onChange={(e) => setExpense(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="settings-group">
        <label>Payment Strategy</label>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          <option value="snowball">Snowball (Pay smallest first)</option>
          <option value="avalanche">Avalanche (Pay highest rate first)</option>
        </select>
      </div>

      <button className="reset-btn" onClick={onReset}>Reset All Data</button>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'plan' | 'analiz' | 'ayarlar'>('home');
  const [debts, setDebts] = useState<Debt[]>(SEED_DEBTS);
  const [income, setIncome] = useState(5000);
  const [expense, setExpense] = useState(2000);
  const [strategy, setStrategy] = useState('snowball');
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    saveToStorage();
    simulateDetailed();
  }, [debts, income, expense, strategy]);

  const loadFromStorage = () => {
    const saved = localStorage.getItem('debtTrackerState');
    if (saved) {
      const data = JSON.parse(saved);
      setDebts(data.debts || SEED_DEBTS);
      setIncome(data.income || 5000);
      setExpense(data.expense || 2000);
      setStrategy(data.strategy || 'snowball');
    }
  };

  const saveToStorage = () => {
    localStorage.setItem('debtTrackerState', JSON.stringify({ debts, income, expense, strategy }));
  };

  const simulateDetailed = () => {
    let workingDebts = debts.map(d => ({ ...d }));
    const history: PaymentHistory[] = [];
    const available = income - expense;

    if (available <= 0) return;

    let month = 0;
    while (workingDebts.some(d => d.amount > 0) && month < 360) {
      month++;

      // Apply interest
      workingDebts = workingDebts.map(d => ({
        ...d,
        amount: Math.max(0, d.amount + (d.amount * d.interestRate / 100 / 12))
      }));

      let totalInterest = 0;
      let totalPrincipal = 0;

      // Minimum payments
      workingDebts = workingDebts.map(d => {
        const interest = d.amount * d.interestRate / 100 / 12;
        const principal = Math.min(d.amount - interest, d.minimumPayment - interest);
        totalInterest += interest;
        totalPrincipal += principal;
        return { ...d, amount: Math.max(0, d.amount - principal - interest) };
      });

      let remaining = available - (totalInterest + totalPrincipal);

      // Sort by strategy
      if (strategy === 'snowball') {
        workingDebts.sort((a, b) => a.amount - b.amount);
      } else {
        workingDebts.sort((a, b) => b.interestRate - a.interestRate);
      }

      // Extra payments
      for (let i = 0; i < workingDebts.length && remaining > 0; i++) {
        const payment = Math.min(workingDebts[i].amount, remaining);
        workingDebts[i].amount -= payment;
        totalPrincipal += payment;
        remaining -= payment;
      }

      const totalRemaining = workingDebts.reduce((sum, d) => sum + d.amount, 0);
      history.push({
        month,
        totalPaid: totalInterest + totalPrincipal,
        principalPaid: totalPrincipal,
        interestPaid: totalInterest,
        remainingBalance: totalRemaining
      });
    }

    setPaymentHistory(history);
  };

  const handleReset = () => {
    setDebts(SEED_DEBTS);
    setIncome(5000);
    setExpense(2000);
    setStrategy('snowball');
    localStorage.removeItem('debtTrackerState');
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Borç Takip</h1>
        <p>Debt Payoff Planner</p>
      </header>

      <div className="container">
        {activeTab === 'home' && <HomePage debts={debts} income={income} expense={expense} />}
        {activeTab === 'plan' && <PlanPage debts={debts} income={income} expense={expense} strategy={strategy} paymentHistory={paymentHistory} />}
        {activeTab === 'analiz' && <AnalizPage debts={debts} paymentHistory={paymentHistory} />}
        {activeTab === 'ayarlar' && (
          <AyarlarPage
            income={income}
            setIncome={setIncome}
            expense={expense}
            setExpense={setExpense}
            strategy={strategy}
            setStrategy={setStrategy}
            onReset={handleReset}
          />
        )}
      </div>

      <nav className="nav">
        <button 
          className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          📊 Home
        </button>
        <button 
          className={`nav-btn ${activeTab === 'plan' ? 'active' : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          📋 Plan
        </button>
        <button 
          className={`nav-btn ${activeTab === 'analiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('analiz')}
        >
          📈 Analysis
        </button>
        <button 
          className={`nav-btn ${activeTab === 'ayarlar' ? 'active' : ''}`}
          onClick={() => setActiveTab('ayarlar')}
        >
          ⚙️ Settings
        </button>
      </nav>
    </div>
  );
};

export default App;
