import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { LiveWorkspace } from './pages/LiveWorkspace';
import { History } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { Account } from './pages/Account';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-[#080C14] text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
          <Navbar />

          <main className="flex-1 pb-16">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workspace" element={<LiveWorkspace />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Persistent Footer */}
          <footer className="border-t border-slate-900 bg-[#06090F] py-6 text-center text-xs text-slate-400">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-300 font-['Outfit']">EchoMind AI</span>
                <span>— Listen. Understand. Answer. Remember.</span>
              </div>
              <div className="text-slate-400">
                Hacktoberfest 2026 Week 3: Slow and Steady • Powered by Open-Weight LLMs
              </div>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
