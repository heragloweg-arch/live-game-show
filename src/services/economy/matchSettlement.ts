/**
 * Apply server match rewards to local auth + wallet stores.
 */

import type { MatchReward } from '../api/matchApi';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

export function applyMatchRewards(rewards: MatchReward[] | undefined) {
  if (!rewards?.length) return;

  const auth = useAuthStore.getState();
  const me = auth.user;
  if (!me) return;

  const mine = rewards.find((r) => r.userId === me.id);
  if (!mine) return;

  if (mine.profile) {
    auth.setUser({
      ...me,
      wins: mine.profile.wins ?? me.wins,
      losses: mine.profile.losses ?? me.losses,
      totalMatches: mine.profile.total_matches ?? me.totalMatches,
      xp: mine.profile.xp ?? me.xp,
      level: mine.profile.level ?? me.level,
      xpToNextLevel: mine.profile.xp_to_next ?? me.xpToNextLevel,
      coins: mine.profile.coins ?? me.coins,
      displayName: mine.profile.display_name ?? me.displayName,
      username: mine.profile.username ?? me.username,
    });
  }

  if (typeof mine.coinsBalance === 'number') {
    useWalletStore.getState().setWallet({
      userId: me.id,
      coins: mine.coinsBalance,
      gems: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  return mine;
}
