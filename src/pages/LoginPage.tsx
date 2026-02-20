import { useState } from 'react';
import { useAppStore } from '../store';
import { login as ipcLogin, changePassword } from '../ipc';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Eye, EyeOff, KeyRound, ArrowRight, Shield, AlertTriangle } from 'lucide-react';

export function LoginPage() {
    const { setCurrentUser, addToast } = useAppStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Change-password state
    const [changePasswordMode, setChangePasswordMode] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pendingUser, setPendingUser] = useState<{ user_id: string; display_name: string } | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const session = await ipcLogin(username, password);
            if (session.must_change_password) {
                setPendingUser({ user_id: session.user_id, display_name: session.display_name });
                setChangePasswordMode(true);
                setLoading(false);
            } else {
                setCurrentUser(session);
                addToast({ type: 'success', message: `Welcome, ${session.display_name}!` });
            }
        } catch (err: any) {
            setError(typeof err === 'string' ? err : err.message || 'Login failed');
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setError(null);
        setLoading(true);

        try {
            await changePassword(pendingUser!.user_id, newPassword, password);
            // Re-login with new password
            const session = await ipcLogin(username, newPassword);
            setCurrentUser(session);
            addToast({ type: 'success', message: `Welcome, ${session.display_name}! Password updated.` });
        } catch (err: any) {
            setError(typeof err === 'string' ? err : err.message || 'Failed to change password');
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-page__backdrop" />

            <motion.div
                className="login-page__card"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Logo / Branding */}
                <div className="login-page__header">
                    <div className="login-page__logo">
                        <Shield size={32} />
                    </div>
                    <h1 className="login-page__title">ArthMitra</h1>
                    <p className="login-page__subtitle">
                        {changePasswordMode
                            ? 'Please set a new password to continue'
                            : 'Secure Accounting Platform'}
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {!changePasswordMode ? (
                        <motion.form
                            key="login-form"
                            className="login-page__form"
                            onSubmit={handleLogin}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {/* Error Banner */}
                            {error && (
                                <motion.div
                                    className="login-page__error"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    <AlertTriangle size={16} />
                                    <span>{error}</span>
                                </motion.div>
                            )}

                            <div className="login-page__field">
                                <label htmlFor="username">Username</label>
                                <div className="login-page__input-wrapper">
                                    <User size={18} className="login-page__input-icon" />
                                    <input
                                        id="username"
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter username"
                                        autoFocus
                                        autoComplete="off"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="login-page__field">
                                <label htmlFor="password">Password</label>
                                <div className="login-page__input-wrapper">
                                    <Lock size={18} className="login-page__input-icon" />
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="login-page__toggle-pw"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn btn--primary login-page__submit"
                                disabled={loading || !username || !password}
                            >
                                {loading ? (
                                    <span className="login-page__spinner" />
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </motion.form>
                    ) : (
                        <motion.form
                            key="change-pw-form"
                            className="login-page__form"
                            onSubmit={handleChangePassword}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {error && (
                                <motion.div
                                    className="login-page__error"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    <AlertTriangle size={16} />
                                    <span>{error}</span>
                                </motion.div>
                            )}

                            <div className="login-page__notice">
                                <KeyRound size={18} />
                                <span>Hi <strong>{pendingUser?.display_name}</strong>, you must change your default password before continuing.</span>
                            </div>

                            <div className="login-page__field">
                                <label htmlFor="new-password">New Password</label>
                                <div className="login-page__input-wrapper">
                                    <Lock size={18} className="login-page__input-icon" />
                                    <input
                                        id="new-password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Min 6 characters"
                                        autoFocus
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            <div className="login-page__field">
                                <label htmlFor="confirm-password">Confirm Password</label>
                                <div className="login-page__input-wrapper">
                                    <Lock size={18} className="login-page__input-icon" />
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Re-enter password"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn btn--primary login-page__submit"
                                disabled={loading || !newPassword || !confirmPassword}
                            >
                                {loading ? (
                                    <span className="login-page__spinner" />
                                ) : (
                                    <>
                                        Set Password & Continue
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </motion.form>
                    )}
                </AnimatePresence>

                <div className="login-page__footer">
                    <p>Offline &bull; Autonomous &bull; Audit-Grade</p>
                </div>
            </motion.div>
        </div>
    );
}
