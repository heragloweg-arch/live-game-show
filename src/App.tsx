import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProviders } from './app/providers';

const SplashScreen = lazy(() => import('./screens/splash/SplashScreen').then((m) => ({ default: m.SplashScreen })));
const HomeScreen = lazy(() => import('./screens/home/HomeScreen').then((m) => ({ default: m.HomeScreen })));
const PlayScreen = lazy(() => import('./screens/play/PlayScreen').then((m) => ({ default: m.PlayScreen })));
const DifficultyScreen = lazy(() => import('./screens/play/DifficultyScreen').then((m) => ({ default: m.DifficultyScreen })));
const MatchmakingScreen = lazy(() => import('./screens/play/MatchmakingScreen').then((m) => ({ default: m.MatchmakingScreen })));
const MatchScreen = lazy(() => import('./screens/match/MatchScreen').then((m) => ({ default: m.MatchScreen })));
const HostScreen = lazy(() => import('./screens/host/HostScreen').then((m) => ({ default: m.HostScreen })));
const RoomScreen = lazy(() => import('./screens/room/RoomScreen').then((m) => ({ default: m.RoomScreen })));
const ProfileScreen = lazy(() => import('./screens/home/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));
const LeaderboardScreen = lazy(() => import('./screens/home/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })));
const OnboardingScreen = lazy(() => import('./screens/onboarding/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })));
const DailyChallengeScreen = lazy(() => import('./screens/play/DailyChallengeScreen').then((m) => ({ default: m.DailyChallengeScreen })));
const PrivacyScreen = lazy(() => import('./screens/legal/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })));
const TermsScreen = lazy(() => import('./screens/legal/TermsScreen').then((m) => ({ default: m.TermsScreen })));
const MetricsScreen = lazy(() => import('./screens/home/MetricsScreen').then((m) => ({ default: m.MetricsScreen })));
const TournamentListScreen = lazy(() => import('./screens/tournament/TournamentListScreen').then((m) => ({ default: m.TournamentListScreen })));
const TournamentDetailScreen = lazy(() => import('./screens/tournament/TournamentDetailScreen').then((m) => ({ default: m.TournamentDetailScreen })));
const SubscriptionScreen = lazy(() => import('./screens/home/SubscriptionScreen').then((m) => ({ default: m.SubscriptionScreen })));
const ShopScreen = lazy(() => import('./screens/home/ShopScreen').then((m) => ({ default: m.ShopScreen })));
const CoupleScreen = lazy(() => import('./screens/couple/CoupleScreen').then((m) => ({ default: m.CoupleScreen })));
const TeamScreen = lazy(() => import('./screens/team/TeamScreen').then((m) => ({ default: m.TeamScreen })));
const CreatorScreen = lazy(() => import('./screens/creator/CreatorScreen').then((m) => ({ default: m.CreatorScreen })));
const CreatorAdminScreen = lazy(() => import('./screens/creator/CreatorAdminScreen').then((m) => ({ default: m.CreatorAdminScreen })));
const InviteAcceptScreen = lazy(() => import('./screens/play/InviteAcceptScreen').then((m) => ({ default: m.InviteAcceptScreen })));
const InviteCreateScreen = lazy(() => import('./screens/play/InviteCreateScreen').then((m) => ({ default: m.InviteCreateScreen })));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div className="card w-full max-w-sm p-8">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-zatona-400" />
        <p className="text-sm text-white/55">نجهّز تجربتك…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <div className="relative min-h-screen bg-hero-gradient safe-top safe-bottom">
        <Suspense fallback={<RouteFallback />}>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<SplashScreen />} />
              <Route path="/home" element={<HomeScreen />} />
              <Route path="/onboarding" element={<OnboardingScreen />} />
              <Route path="/daily" element={<DailyChallengeScreen />} />
              <Route path="/legal/privacy" element={<PrivacyScreen />} />
              <Route path="/legal/terms" element={<TermsScreen />} />
              <Route path="/metrics" element={<MetricsScreen />} />
              <Route path="/tournament" element={<TournamentListScreen />} />
              <Route path="/tournament/:tournamentId" element={<TournamentDetailScreen />} />
              <Route path="/subscription" element={<SubscriptionScreen />} />
              <Route path="/shop" element={<ShopScreen />} />
              <Route path="/couple" element={<CoupleScreen />} />
              <Route path="/team" element={<TeamScreen />} />
              <Route path="/creator" element={<CreatorScreen />} />
              <Route path="/creator/admin" element={<CreatorAdminScreen />} />
              <Route path="/play" element={<PlayScreen />} />
              <Route path="/play/invite/create" element={<InviteCreateScreen />} />
              <Route path="/play/invite/:token" element={<InviteAcceptScreen />} />
              <Route path="/play/difficulty" element={<DifficultyScreen />} />
              <Route path="/play/matchmaking" element={<MatchmakingScreen />} />
              <Route path="/match/:matchId" element={<MatchScreen />} />
              <Route path="/host" element={<HostScreen />} />
              <Route path="/room/join" element={<RoomScreen />} />
              <Route path="/room/:roomId" element={<RoomScreen />} />
              <Route path="/profile" element={<ProfileScreen />} />
              <Route path="/leaderboard" element={<LeaderboardScreen />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </div>
    </AppProviders>
  );
}
