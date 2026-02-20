import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, HardDrive, Usb, Wifi, FolderOpen, Shield, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { useAppStore } from '../store';
import { discoverCompanies, mountCompany, createCompany } from '../ipc';
import type { CompanyInfo } from '../store';

export function CompanyLauncher() {
    const { companies, setCompanies, setActiveCompany, addToast, isLoading, setLoading } = useAppStore();
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        loadCompanies();
    }, []);

    async function loadCompanies() {
        setLoading(true);
        try {
            const result = await discoverCompanies();
            setCompanies(result);
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to discover companies: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    async function handleMount(company: CompanyInfo) {
        setLoading(true);
        try {
            const mounted = await mountCompany(company.uuid);
            setActiveCompany(mounted);
            addToast({ type: 'success', message: `Opened "${mounted.company_name}" successfully` });
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to open company: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    const driveIcon = (type: string) => {
        switch (type) {
            case 'usb': return <Usb size={16} />;
            case 'external': return <HardDrive size={16} />;
            default: return <HardDrive size={16} />;
        }
    };

    return (
        <div className="launcher">
            {/* Hero Header */}
            <motion.div
                className="launcher__header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
                <motion.div
                    className="launcher__logo"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 200 }}
                >
                    अ
                </motion.div>
                <h1 className="launcher__title">ArthMitra</h1>
                <p className="launcher__subtitle">
                    Autonomous Accounting for India • अर्थमित्र
                </p>
            </motion.div>

            {/* Company Grid */}
            <motion.div
                className="launcher__grid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                {companies.map((company, i) => (
                    <motion.div
                        key={company.uuid}
                        className="company-card"
                        onClick={() => company.status !== 'disconnected' && handleMount(company)}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        whileHover={{ y: -4 }}
                        style={{ cursor: company.status === 'disconnected' ? 'not-allowed' : 'pointer' }}
                    >
                        <div className="company-card__icon">
                            <Building2 size={24} />
                        </div>
                        <div className="company-card__name">{company.company_name}</div>
                        <div className="company-card__meta">
                            {driveIcon(company.drive_type)}
                            <span>{company.drive_type}</span>
                            {company.gstin && (
                                <>
                                    <span>•</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                                        {company.gstin}
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="company-card__footer">
                            <span className={`badge badge--${company.status}`}>
                                {company.status === 'disconnected' && <Wifi size={10} />}
                                {company.status === 'mounted' && <Shield size={10} />}
                                {company.status}
                            </span>
                            {company.last_opened && (
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                    {new Date(company.last_opened).toLocaleDateString('en-IN')}
                                </span>
                            )}
                        </div>
                    </motion.div>
                ))}

                {/* Create New Company Card */}
                <motion.div
                    className="company-card company-card--create"
                    onClick={() => setShowCreate(true)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + companies.length * 0.05 }}
                    whileHover={{ y: -4 }}
                >
                    <Plus size={32} />
                    <span style={{ fontWeight: 600 }}>Create New Company</span>
                    <span style={{ fontSize: 'var(--text-xs)' }}>
                        Set up a new company container
                    </span>
                </motion.div>
            </motion.div>

            {isLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                        position: 'fixed',
                        bottom: 'var(--space-6)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--text-sm)',
                    }}
                >
                    <Loader2 size={16} className="spinner" />
                    Scanning drives...
                </motion.div>
            )}

            {/* Create Company Modal */}
            {showCreate && (
                <CreateCompanyModal onClose={() => setShowCreate(false)} />
            )}
        </div>
    );
}

function CreateCompanyModal({ onClose }: { onClose: () => void }) {
    const { setActiveCompany, addToast, setLoading } = useAppStore();
    const [name, setName] = useState('');
    const [gstin, setGstin] = useState('');
    const [path, setPath] = useState('');
    const [fyStart, setFyStart] = useState('2025-04-01');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Set default path based on user's home directory
        homeDir().then(home => {
            setPath(`${home}ArthMitra/${name.replace(/\s+/g, '_') || 'NewCompany'}`);
        }).catch(() => {
            setPath(`/home/ArthMitra/${name.replace(/\s+/g, '_') || 'NewCompany'}`);
        });
    }, [name]);

    async function handleBrowseFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Company Storage Folder',
            });
            if (selected) {
                setPath(selected as string);
            }
        } catch (err: any) {
            addToast({ type: 'error', message: `Folder selection failed: ${err}` });
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            addToast({ type: 'warning', message: 'Company name is required' });
            return;
        }

        setSubmitting(true);
        setLoading(true);
        try {
            const company = await createCompany({
                company_name: name.trim(),
                path: path.trim(),
                gstin: gstin.trim() || null,
                financial_year_start: fyStart,
            });
            setActiveCompany(company);
            addToast({ type: 'success', message: `"${company.company_name}" created and ready!` });
            onClose();
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to create company: ${err}` });
        } finally {
            setSubmitting(false);
            setLoading(false);
        }
    }

    return (
        <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="modal"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="modal__title">Create New Company</h2>
                <form onSubmit={handleSubmit}>
                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Company Name *</label>
                        <input
                            className="input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Sharma Trading Co."
                            autoFocus
                            required
                        />
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">GSTIN (optional)</label>
                        <input
                            className="input"
                            type="text"
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value.toUpperCase())}
                            placeholder="e.g. 27AAPFU0939F1ZV"
                            maxLength={15}
                            style={{ fontFamily: 'var(--font-mono)' }}
                        />
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Storage Path</label>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <input
                                className="input"
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn--secondary" title="Browse folder" onClick={handleBrowseFolder}>
                                <FolderOpen size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="input-group__label">Financial Year Start</label>
                        <input
                            className="input"
                            type="date"
                            value={fyStart}
                            onChange={(e) => setFyStart(e.target.value)}
                        />
                    </div>

                    <div className="modal__actions">
                        <button type="button" className="btn btn--secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn--accent" disabled={submitting}>
                            {submitting ? <><Loader2 size={14} className="spinner" /> Creating...</> : 'Create Company'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
