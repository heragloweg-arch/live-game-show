/**
 * Economy & Wallet domain types
 */

export type CurrencyCode = 'coins' | 'gems';

export type TransactionType =
  | 'match_reward'
  | 'daily_bonus'
  | 'ad_reward'
  | 'purchase'
  | 'spend_hint'
  | 'spend_continue'
  | 'admin_grant'
  | 'refund';

export interface Wallet {
  userId: string;
  coins: number;
  gems: number;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  type: TransactionType;
  currency: CurrencyCode;
  amount: number; // positive = credit, negative = debit
  balanceAfter: number;
  referenceId?: string; // matchId, productId, etc.
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface RewardTable {
  winCoins: number;
  lossCoins: number;
  perfectBonus: number; // all rounds correct
  dailyBonusCoins: number;
}

export const DEFAULT_REWARDS: RewardTable = {
  winCoins: 50,
  lossCoins: 15,
  perfectBonus: 30,
  dailyBonusCoins: 25,
};
