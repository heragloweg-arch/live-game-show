import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProviders } from './app/providers';
import { SplashScreen } from './screens/splash/SplashScreen';
import { HomeScreen } from './screens/home/HomeScreen';
import { PlayScreen } from './screens/play/PlayScreen';
import { DifficultyScreen } from './screens/play/DifficultyScreen';
import { MatchmakingScreen } from './screens/play/MatchmakingScreen';
import { MatchScreen } from './screens/match/MatchScreen';
import { HostScreen } from './screens/host/HostScreen';
import { RoomScreen } from './screens/room/RoomScreen';
import { ProfileScreen } from './screens/home/ProfileScreen';
import { LeaderboardScreen } from './screens/home/LeaderboardScreen';
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen';
import { DailyChallengeScreen } from './screens/play/DailyChallengeScreen';
import { PrivacyScreen } from './screens/legal/PrivacyScreen';
import { TermsScreen } from './screens/legal/TermsScreen';
import { MetricsScreen } from './screens/home/MetricsScreen';
import { TournamentListScreen } from './screens/tournament/TournamentListScreen';
import { TournamentDetailScreen } from './screens/tournament/TournamentDetailScreen';
import { SubscriptionScreen } from './screens/home/SubscriptionScreen';
import { CoupleScreen } from './screens/couple/CoupleScreen';
import { TeamScreen } from './screens/team/TeamScreen';
import { CreatorScreen } from './screens/creator/CreatorScreen';
import { CreatorAdminScreen } from './screens/creator/CreatorAdminScreen';
import { InviteAcceptScreen } from './screens/play/InviteAcceptScreen';
import { InviteCreateScreen } from './screens/play/InviteCreateScreen';

export default function App() {
  return (
    <AppProviders>
      <div className="relative min-h-screen bg-hero-gradient safe-top safe-bottom">
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
      </div>
    </AppProviders>
  );
}
