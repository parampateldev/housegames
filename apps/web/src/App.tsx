import { Suspense } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AccountScreen } from './auth/AccountScreen';
import { Home } from './Home';
import { findGame } from './games/registry';
import { ComingSoon } from './games/ComingSoon';

function GameRoute() {
  const { slug } = useParams();
  const game = findGame(slug ?? '');
  if (!game) return <ComingSoon label="That game" />;
  const { Component } = game;
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/:slug" element={<GameRoute />} />
        <Route path="/:slug/:code" element={<GameRoute />} />
      </Routes>
    </AuthProvider>
  );
}
