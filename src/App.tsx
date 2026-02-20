import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { CompanyLauncher } from './components/CompanyLauncher';
import { AppShell } from './components/AppShell';
import { ToastContainer } from './components/ToastContainer';
import { LoginPage } from './pages/LoginPage';
import { getCurrentUser } from './ipc';

function App() {
  const { activeCompany, currentUser, setCurrentUser } = useAppStore();
  const [checkingSession, setCheckingSession] = useState(true);

  // Attempt to restore session on app start
  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        if (user) setCurrentUser(user);
      })
      .catch(() => { })
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return null; // Blank while restoring session
  }

  if (!currentUser) {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      {activeCompany ? <AppShell /> : <CompanyLauncher />}
      <ToastContainer />
    </>
  );
}

export default App;
