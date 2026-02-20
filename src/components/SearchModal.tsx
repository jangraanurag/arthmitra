import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import type { SearchResult, AppView } from '../store';
import { globalSearch } from '../ipc';
import {
    Search, X, Receipt, BookOpen,
    ArrowRight, CornerDownLeft, Command,
    LayoutDashboard, ClipboardCheck, PieChart, Settings
} from 'lucide-react';

const NAV_ITEMS: { id: AppView; label: string; keywords: string[]; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', keywords: ['dashboard', 'home', 'overview'], icon: LayoutDashboard },
    { id: 'ledger', label: 'Day Book / Ledger', keywords: ['ledger', 'day book', 'journal', 'entries', 'voucher'], icon: BookOpen },
    { id: 'accounts', label: 'Chart of Accounts', keywords: ['accounts', 'chart', 'coa'], icon: Receipt },
    { id: 'approvals', label: 'Pending Approvals', keywords: ['approvals', 'pending', 'approve', 'draft'], icon: ClipboardCheck },
    { id: 'reports', label: 'Reports', keywords: ['reports', 'trial balance', 'profit', 'loss', 'balance sheet', 'p&l'], icon: PieChart },
    { id: 'settings', label: 'Settings', keywords: ['settings', 'config', 'about', 'company', 'gstin'], icon: Settings },
];

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
    const { activeCompany, setView } = useAppStore();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Auto-focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Filter nav items matching query
    const navResults = useMemo((): SearchResult[] => {
        if (query.trim().length < 1) return [];
        const q = query.toLowerCase();
        return NAV_ITEMS
            .filter(item => item.label.toLowerCase().includes(q) || item.keywords.some(kw => kw.includes(q)))
            .map(item => ({
                result_type: 'page',
                id: item.id,
                title: item.label,
                subtitle: 'Go to page',
                meta: null,
            }));
    }, [query]);

    // Debounced backend search
    const doSearch = useCallback(async (q: string) => {
        if (!activeCompany || q.trim().length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const res = await globalSearch(activeCompany.uuid, q.trim(), 15);
            setResults(res.results);
            setSelectedIndex(0);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [activeCompany]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query), 200);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    // Combined results: pages first, then backend search results
    const allResults = useMemo(() => [...navResults, ...results], [navResults, results]);

    // Navigate to result
    function handleSelect(result: SearchResult) {
        if (result.result_type === 'page') {
            setView(result.id as AppView);
        } else if (result.result_type === 'account') {
            setView('accounts');
        } else {
            setView('ledger');
        }
        onClose();
    }

    // Keyboard navigation
    function handleKeyDown(e: React.KeyboardEvent) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, allResults.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (allResults[selectedIndex]) handleSelect(allResults[selectedIndex]);
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: '15vh',
                }}
            >
                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '100%',
                        maxWidth: 580,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xl)',
                        overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                    }}
                >
                    {/* Search Input */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-4) var(--space-5)',
                        borderBottom: '1px solid var(--border-subtle)',
                    }}>
                        <Search size={20} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search accounts, entries, narrations…"
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                fontSize: 'var(--text-base)',
                                color: 'var(--text-primary)',
                                fontFamily: 'inherit',
                            }}
                        />
                        {query && (
                            <button
                                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                                style={{
                                    background: 'var(--bg-elevated)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: 'var(--space-1)',
                                    cursor: 'pointer',
                                    color: 'var(--text-tertiary)',
                                    display: 'flex',
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Results */}
                    <div style={{
                        maxHeight: 360,
                        overflowY: 'auto',
                        padding: query.length >= 2 ? 'var(--space-2)' : 0,
                    }}>
                        {loading && (
                            <div style={{
                                padding: 'var(--space-4)',
                                textAlign: 'center',
                                color: 'var(--text-tertiary)',
                                fontSize: 'var(--text-sm)',
                            }}>
                                Searching…
                            </div>
                        )}

                        {!loading && query.length >= 2 && allResults.length === 0 && (
                            <div style={{
                                padding: 'var(--space-6)',
                                textAlign: 'center',
                                color: 'var(--text-tertiary)',
                            }}>
                                <Search size={32} style={{ margin: '0 auto var(--space-2)', opacity: 0.3 }} />
                                <div style={{ fontSize: 'var(--text-sm)' }}>No results for "{query}"</div>
                            </div>
                        )}

                        {!loading && allResults.map((result, i) => {
                            const isSelected = i === selectedIndex;
                            const navItem = result.result_type === 'page' ? NAV_ITEMS.find(n => n.id === result.id) : null;
                            const Icon = navItem ? navItem.icon : (result.result_type === 'account' ? Receipt : BookOpen);
                            return (
                                <motion.button
                                    key={`${result.result_type}-${result.id}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    onClick={() => handleSelect(result)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-3)',
                                        padding: 'var(--space-3) var(--space-4)',
                                        borderRadius: 'var(--radius-md)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontFamily: 'inherit',
                                        transition: 'background 100ms ease',
                                        background: isSelected
                                            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(139, 92, 246, 0.08))'
                                            : 'transparent',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 'var(--radius-md)',
                                        background: result.result_type === 'account'
                                            ? 'rgba(59, 130, 246, 0.1)'
                                            : 'rgba(34, 197, 94, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: result.result_type === 'account'
                                            ? 'var(--color-primary-400)'
                                            : 'var(--color-success-500)',
                                        flexShrink: 0,
                                    }}>
                                        <Icon size={16} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 600,
                                            fontSize: 'var(--text-sm)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {result.title}
                                        </div>
                                        <div style={{
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--text-tertiary)',
                                        }}>
                                            {result.subtitle}
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <ArrowRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Footer Hints */}
                    <div style={{
                        padding: 'var(--space-2) var(--space-4)',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex',
                        gap: 'var(--space-4)',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CornerDownLeft size={11} /> Select
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            ↑↓ Navigate
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Command size={11} />K Toggle
                        </span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Esc Close
                        </span>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
