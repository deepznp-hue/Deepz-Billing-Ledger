import React, { useState } from 'react';
import { Lock, ArrowRight, Delete } from 'lucide-react';
import { CompanyInfo } from '../data/initialDb';

interface PasswordLockScreenProps {
  company: CompanyInfo;
  onUnlock: () => void;
}

const REQUIRED_PIN = '3210';

export const PasswordLockScreen: React.FC<PasswordLockScreenProps> = ({
  company,
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleVerify = (inputPin: string) => {
    if (inputPin === REQUIRED_PIN) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setPin('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleVerify(pin);
  };

  const handleDigitClick = (digit: string) => {
    setError(false);
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        if (next === REQUIRED_PIN) {
          onUnlock();
        } else {
          setTimeout(() => {
            setError(true);
            setPin('');
          }, 150);
        }
      }
    }
  };

  const handleBackspace = () => {
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f6f5f1] dark:bg-[#151614] text-[#1d1d1b] dark:text-[#ecebe5] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/15 flex items-center justify-center text-[#0f5c4d] dark:text-[#4fb59f] mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#0f5c4d] dark:text-[#4fb59f]">
            {company.n}
          </h1>
          <p className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1">
            Protected Billing & Ledger Vault · Enter PIN to Access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="pin-input" className="sr-only">
              Enter Password
            </label>
            <input
              id="pin-input"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={8}
              placeholder="Enter 4-digit password"
              value={pin}
              onChange={(e) => {
                setError(false);
                const val = e.target.value;
                setPin(val);
                if (val === REQUIRED_PIN) {
                  onUnlock();
                }
              }}
              className={`w-full px-4 py-3 text-center text-lg font-mono tracking-[0.35em] rounded-xl border ${
                error
                  ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20'
                  : 'border-[#e3e1d9] dark:border-[#33352f] bg-[#f6f5f1] dark:bg-[#151614]'
              } focus:outline-none focus:border-[#0f5c4d]`}
            />
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2 font-medium">
                Incorrect password. Please enter the valid 4-digit access PIN.
              </p>
            )}
          </div>

          {/* Quick Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitClick(digit)}
                className="py-2.5 text-base font-mono font-semibold rounded-xl border border-[#e3e1d9] dark:border-[#33352f] bg-[#f6f5f1]/60 dark:bg-[#151614] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] active:scale-[0.98] transition-all cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setError(false);
                setPin('');
              }}
              className="py-2.5 text-xs font-medium rounded-xl border border-[#e3e1d9] dark:border-[#33352f] text-[#6b6a64] dark:text-[#9a988f] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigitClick('0')}
              className="py-2.5 text-base font-mono font-semibold rounded-xl border border-[#e3e1d9] dark:border-[#33352f] bg-[#f6f5f1]/60 dark:bg-[#151614] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] active:scale-[0.98] transition-all cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-2.5 flex items-center justify-center rounded-xl border border-[#e3e1d9] dark:border-[#33352f] text-[#6b6a64] dark:text-[#9a988f] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
              title="Backspace"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-xl bg-[#0f5c4d] text-white hover:bg-[#0b463b] transition-colors cursor-pointer"
          >
            <span>Unlock Application</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#e3e1d9] dark:border-[#33352f] text-center text-[11px] text-[#6b6a64] dark:text-[#9a988f]">
          GSTIN {company.g} · Data stored locally & encrypted in session
        </div>
      </div>
    </div>
  );
};
