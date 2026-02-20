import { useAppStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, X, Info } from 'lucide-react';

const icons = {
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
    info: Info,
};

export function ToastContainer() {
    const { toasts, removeToast } = useAppStore();

    return (
        <div className="toast-container">
            <AnimatePresence>
                {toasts.map((toast) => {
                    const Icon = icons[toast.type];
                    return (
                        <motion.div
                            key={toast.id}
                            className={`toast toast--${toast.type}`}
                            initial={{ opacity: 0, x: 50, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 50, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        >
                            <Icon size={16} />
                            <span style={{ flex: 1 }}>{toast.message}</span>
                            <button
                                className="btn btn--icon btn--ghost"
                                onClick={() => removeToast(toast.id)}
                                style={{ marginLeft: 'auto' }}
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
