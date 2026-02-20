import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import {
    validateCompany, getAccounts, getLedger, getCompanyProfile, updateCompany, getStates, createState,
    getFinancialYears, createFinancialYear, createBackup, getBackups, restoreBackup,
    getCompanySettings, updateCompanySettings, uploadImage
} from '../ipc';
import { open } from '@tauri-apps/plugin-dialog';
import type { CompanyProfile, OrganizationDetails, State, FinancialYear, BackupInfo } from '../ipc';
import {
    Building2, Shield, HardDrive, Database,
    CheckCircle2, AlertTriangle, RefreshCw,
    BookOpen, Receipt, Users,
    FolderOpen, Hash, Info, Edit2, Save, X, Phone, Mail, MapPin, Globe, Plus,
    Calendar, Download, RotateCcw, FileArchive, FileText, Upload
} from 'lucide-react';

interface DbStats {
    totalAccounts: number;
    totalEntries: number;
    recentEntryDate: string | null;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

// ── Info Row ────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, mono = false }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--border-subtle)',
        }}>
            <div style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                flexShrink: 0,
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                    {label}
                </div>
                <div style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                }}>
                    {value || '—'}
                </div>
            </div>
        </div>
    );
}

// ── Settings Page ───────────────────────────────────────────────────────

export function SettingsPage() {
    const { activeCompany, addToast, updateActiveCompany } = useAppStore();
    const [activeTab, setActiveTab] = useState<'general' | 'fy' | 'data' | 'invoice'>('general');

    // General Tab State
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [dbStats, setDbStats] = useState<DbStats | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<OrganizationDetails | null>(null);

    // FY Tab State
    const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
    const [newFYStart, setNewFYStart] = useState('');
    const [creatingFY, setCreatingFY] = useState(false);

    // Data Tab State
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

    // Invoice Tab State
    const [invoiceSettings, setInvoiceSettings] = useState<Record<string, string>>({});
    const [savingInvoice, setSavingInvoice] = useState(false);

    // Common State
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // States Management (for Address)
    const [states, setStates] = useState<State[]>([]);
    const [showAddState, setShowAddState] = useState(false);
    const [newState, setNewState] = useState({ code: '', name: '' });
    const [creatingState, setCreatingState] = useState(false);

    useEffect(() => {
        if (!activeCompany) return;
        loadData();
    }, [activeCompany?.uuid]);

    async function loadData() {
        if (!activeCompany) return;
        setLoading(true);
        try {
            // Load stats, profile, and states in parallel
            const [accounts, ledgerData, validationRes, profile, statesList, fyList, backupList, settings] = await Promise.all([
                getAccounts(activeCompany.uuid),
                getLedger(activeCompany.uuid, { limit: 1, offset: 0 }),
                validateCompany(activeCompany.uuid).catch(() => [true, []] as [boolean, string[]]),
                getCompanyProfile(activeCompany.uuid),
                getStates(activeCompany.uuid),
                getFinancialYears(activeCompany.uuid),
                getBackups(activeCompany.uuid),
                getCompanySettings(activeCompany.uuid)
            ]);

            setDbStats({
                totalAccounts: accounts.length,
                totalEntries: ledgerData.total_count,
                recentEntryDate: ledgerData.entries.length > 0 ? ledgerData.entries[0].date : null,
            });

            setValidation({
                isValid: validationRes[0],
                errors: validationRes[1],
            });

            setCompanyProfile(profile);
            setFormData(profile.details);
            setStates(statesList);
            setFinancialYears(fyList);
            setBackups(backupList);
            setInvoiceSettings(settings || {});

        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to load settings: ${err}` });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        if (!companyProfile || !formData || !activeCompany) return;
        setSaving(true);
        try {
            const updatedProfile = await updateCompany({
                uuid: activeCompany.uuid,
                company_name: activeCompany.company_name,
                gstin: activeCompany.gstin,
                details: formData
            });

            setCompanyProfile(updatedProfile);
            setFormData(updatedProfile.details);
            updateActiveCompany({
                company_name: updatedProfile.info.company_name,
                gstin: updatedProfile.info.gstin
            });

            setIsEditing(false);
            addToast({ type: 'success', message: 'Company settings updated successfully' });
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to save settings: ${err}` });
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateState() {
        if (!activeCompany || !newState.code || !newState.name) return;
        setCreatingState(true);
        try {
            const created = await createState(activeCompany.uuid, newState.code, newState.name);
            setStates([...states, created].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAddState(false);
            setNewState({ code: '', name: '' });
            addToast({ type: 'success', message: 'State created successfully' });
            if (formData) {
                setFormData({ ...formData, state: created.name });
            }
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to create state: ${err}` });
        } finally {
            setCreatingState(false);
        }
    }

    async function handleCreateFY() {
        if (!activeCompany || !newFYStart) return;
        setCreatingFY(true);
        try {
            const fy = await createFinancialYear(activeCompany.uuid, newFYStart);
            setFinancialYears([fy, ...financialYears]);
            setNewFYStart('');
            addToast({ type: 'success', message: `Financial Year ${fy.fy_id} created successfully` });
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to create FY: ${err}` });
        } finally {
            setCreatingFY(false);
        }
    }

    async function handleCreateBackup() {
        if (!activeCompany) return;
        setCreatingBackup(true);
        try {
            await createBackup(activeCompany.uuid);
            const updatedList = await getBackups(activeCompany.uuid);
            setBackups(updatedList);
            addToast({ type: 'success', message: 'Backup created successfully' });
        } catch (err: any) {
            addToast({ type: 'error', message: `Backup failed: ${err}` });
        } finally {
            setCreatingBackup(false);
        }
    }

    async function handleRestore(path: string) {
        if (!activeCompany || !confirm('Are you sure you want to restore this backup? Current data will be replaced.')) return;
        setRestoringBackup(path);
        try {
            await restoreBackup(activeCompany.uuid, path);
            addToast({ type: 'success', message: 'Backup restored successfully' });
            loadData(); // Reload all data
        } catch (err: any) {
            addToast({ type: 'error', message: `Restore failed: ${err}` });
        } finally {
            setRestoringBackup(null);
        }
    }

    async function handleImportBackup() {
        if (!activeCompany) return;
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'SQLite Database',
                    extensions: ['db', 'sqlite']
                }]
            });

            if (selected && typeof selected === 'string') {
                handleRestore(selected);
            }
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to open file dialog: ${err}` });
        }
    }

    async function handleSaveInvoice() {
        if (!activeCompany) return;
        setSavingInvoice(true);
        try {
            await updateCompanySettings(activeCompany.uuid, invoiceSettings);
            addToast({ type: 'success', message: 'Invoice settings saved' });
        } catch (err: any) {
            addToast({ type: 'error', message: `Failed to save: ${err}` });
        } finally {
            setSavingInvoice(false);
        }
    }

    async function handleImageUpload(key: string, e: React.ChangeEvent<HTMLInputElement>) {
        if (!activeCompany || !e.target.files?.[0]) return;
        const file = e.target.files[0];

        // Check size (max 500KB)
        if (file.size > 500 * 1024) {
            addToast({ type: 'error', message: 'Image too large. Max 500KB allowed.' });
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64 = reader.result as string;
                await uploadImage(activeCompany.uuid, key, base64);

                // Update local state immediately for preview
                setInvoiceSettings(prev => ({ ...prev, [key]: base64 }));
                addToast({ type: 'success', message: 'Image uploaded successfully' });
            } catch (err: any) {
                addToast({ type: 'error', message: `Upload failed: ${err}` });
            }
        };
        reader.readAsDataURL(file);
    }

    if (!activeCompany) return null;

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Settings</h1>
                    <p className="page-header__subtitle">
                        Company configuration & system information
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--secondary" onClick={loadData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-1)' }}>
                <button
                    className={`tab-item ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                >
                    <Building2 size={16} />
                    <span>General</span>
                </button>
                <button
                    className={`tab-item ${activeTab === 'fy' ? 'active' : ''}`}
                    onClick={() => setActiveTab('fy')}
                >
                    <Calendar size={16} />
                    <span>Financial Years</span>
                </button>
                <button
                    className={`tab-item ${activeTab === 'data' ? 'active' : ''}`}
                    onClick={() => setActiveTab('data')}
                >
                    <span>Data Management</span>
                </button>
                <button
                    className={`tab-item ${activeTab === 'invoice' ? 'active' : ''}`}
                    onClick={() => setActiveTab('invoice')}
                >
                    <FileText size={16} />
                    <span>Invoice</span>
                </button>
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                    {/* ── Company Information ─────────────────────────────── */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <Building2 size={18} className="text-primary-400" />
                                <span className="font-semibold">Company Information</span>
                            </div>
                            {!isEditing ? (
                                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setIsEditing(true)}>
                                    <Edit2 size={14} />
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                    <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setIsEditing(false)} disabled={saving}>
                                        <X size={14} />
                                    </button>
                                    <button className="btn btn--primary btn--sm btn--icon" onClick={handleSave} disabled={saving}>
                                        {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="card__body">
                            <InfoRow
                                icon={<Building2 size={16} />}
                                label="Company Name"
                                value={activeCompany.company_name}
                            />
                            <InfoRow
                                icon={<Receipt size={16} />}
                                label="GSTIN"
                                value={activeCompany.gstin || 'Not registered'}
                                mono
                            />

                            {isEditing && formData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                                    <div className="input-group">
                                        <label className="input-group__label">Address</label>
                                        <textarea
                                            className="input"
                                            rows={2}
                                            value={formData.address}
                                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                                            placeholder="Street Address, Building, etc."
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                        <div className="input-group">
                                            <label className="input-group__label">City</label>
                                            <input
                                                className="input"
                                                value={formData.city}
                                                onChange={e => setFormData({ ...formData, city: e.target.value })}
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-group__label">State</label>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                                <select
                                                    className="input"
                                                    value={formData.state}
                                                    onChange={e => setFormData({ ...formData, state: e.target.value })}
                                                >
                                                    <option value="">Select State</option>
                                                    {states.map(s => (
                                                        <option key={s.code} value={s.name}>
                                                            {s.name} ({s.code})
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    className="btn btn--secondary btn--icon"
                                                    onClick={() => setShowAddState(true)}
                                                    title="Add New State"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                        <div className="input-group">
                                            <label className="input-group__label">Pincode</label>
                                            <input
                                                className="input"
                                                value={formData.pincode}
                                                onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-group__label">PAN</label>
                                            <input
                                                className="input"
                                                value={formData.pan}
                                                onChange={e => setFormData({ ...formData, pan: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label className="input-group__label">Email</label>
                                        <input
                                            className="input"
                                            type="email"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-group__label">Phone</label>
                                        <input
                                            className="input"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-group__label">Website</label>
                                        <input
                                            className="input"
                                            value={formData.website}
                                            onChange={e => setFormData({ ...formData, website: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <InfoRow
                                        icon={<MapPin size={16} />}
                                        label="Address"
                                        value={[
                                            companyProfile?.details.address,
                                            companyProfile?.details.city,
                                            companyProfile?.details.state,
                                            companyProfile?.details.pincode
                                        ].filter(Boolean).join(', ')}
                                    />
                                    <InfoRow
                                        icon={<Mail size={16} />}
                                        label="Email"
                                        value={companyProfile?.details.email || ''}
                                    />
                                    <InfoRow
                                        icon={<Phone size={16} />}
                                        label="Phone"
                                        value={companyProfile?.details.phone || ''}
                                    />
                                    <InfoRow
                                        icon={<Globe size={16} />}
                                        label="Website"
                                        value={companyProfile?.details.website || ''}
                                    />
                                    <InfoRow
                                        icon={<Hash size={16} />}
                                        label="PAN"
                                        value={companyProfile?.details.pan || ''}
                                        mono
                                    />
                                </>
                            )}

                            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
                                <InfoRow
                                    icon={<Hash size={16} />}
                                    label="Company UUID"
                                    value={activeCompany.uuid}
                                    mono
                                />
                                <InfoRow
                                    icon={<FolderOpen size={16} />}
                                    label="Database Path"
                                    value={activeCompany.path}
                                    mono
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Database Statistics ─────────────────────────────── */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <Database size={18} className="text-accent-400" />
                                <span className="font-semibold">Database Statistics</span>
                            </div>
                        </div>
                        <div className="card__body">
                            {dbStats ? (
                                <>
                                    <div className="stat-grid">
                                        <div className="stat-item">
                                            <div className="stat-value text-primary-400">
                                                {dbStats.totalAccounts}
                                            </div>
                                            <div className="stat-label">
                                                Accounts
                                            </div>
                                        </div>
                                        <div className="stat-item">
                                            <div className="stat-value text-accent-400">
                                                {dbStats.totalEntries}
                                            </div>
                                            <div className="stat-label">
                                                Journal Entries
                                            </div>
                                        </div>
                                    </div>
                                    <InfoRow
                                        icon={<BookOpen size={16} />}
                                        label="Most Recent Entry"
                                        value={dbStats.recentEntryDate || 'No entries yet'}
                                    />
                                    <InfoRow
                                        icon={<Users size={16} />}
                                        label="Status"
                                        value={activeCompany.status.charAt(0).toUpperCase() + activeCompany.status.slice(1)}
                                    />
                                </>
                            ) : (
                                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    {loading ? 'Loading statistics…' : 'No data available'}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* ── Data Integrity ──────────────────────────────────── */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <Shield size={18} className="text-success-500" />
                                <span className="font-semibold">Data Integrity</span>
                            </div>
                            {validation && (
                                <div className={`badge ${validation.isValid ? 'badge--success' : 'badge--danger'}`}>
                                    {validation.isValid
                                        ? <><CheckCircle2 size={12} /> Verified</>
                                        : <><AlertTriangle size={12} /> Issues Found</>
                                    }
                                </div>
                            )}
                        </div>
                        <div className="card__body">
                            <div className={`alert ${validation?.isValid ? 'alert--success' : 'alert--danger'}`}>
                                {validation ? (
                                    validation.isValid ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                            <CheckCircle2 size={20} />
                                            <div>
                                                <div className="font-semibold text-sm">All integrity checks passed</div>
                                                <div className="text-xs text-tertiary mt-1">Database structure, audit chain, and checksums verified.</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="font-semibold text-sm flex items-center gap-2 mb-2">
                                                <AlertTriangle size={16} />
                                                Integrity issues detected
                                            </div>
                                            {validation.errors.map((err, i) => (
                                                <div key={i} className="text-xs text-secondary py-1 pl-5">
                                                    • {err}
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <div className="text-tertiary text-sm">Loading validation…</div>
                                )}
                            </div>

                            <div style={{ marginTop: 'var(--space-4)' }}>
                                <InfoRow
                                    icon={<Shield size={16} />}
                                    label="Security"
                                    value="WAL mode • Foreign keys enforced • Checksum verification"
                                />
                                <InfoRow
                                    icon={<Database size={16} />}
                                    label="Format"
                                    value="SQLite 3 • Schema v1.0"
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* ── About ──────────────────────────────────────────── */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <Info size={18} className="text-tertiary" />
                                <span className="font-semibold">About ArthMitra</span>
                            </div>
                        </div>
                        <div className="card__body">
                            <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: 'var(--radius-xl)',
                                    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto var(--space-3)', fontWeight: 800, fontSize: 'var(--text-xl)',
                                    color: 'white', boxShadow: '0 0 30px rgba(59, 130, 246, 0.2)'
                                }}>
                                    अ
                                </div>
                                <div className="text-lg font-bold tracking-tight">ArthMitra — अर्थमित्र</div>
                                <div className="text-xs text-tertiary mt-1">Your Trusted Financial Companion</div>
                                <div className="inline-block mt-3 px-3 py-2 bg-elevated rounded-md text-xs font-mono text-tertiary">
                                    v0.1.0 • Desktop Edition
                                </div>
                            </div>

                            <div style={{ marginTop: 'var(--space-2)' }}>
                                <InfoRow
                                    icon={<HardDrive size={16} />}
                                    label="Platform"
                                    value="Tauri 2.x • Rust + React"
                                />
                                <InfoRow
                                    icon={<Shield size={16} />}
                                    label="Compliance"
                                    value="India Schedule III • GST Ready"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Financial Years Tab */}
            {activeTab === 'fy' && (
                <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <Calendar size={18} className="text-primary-400" />
                                <span className="font-semibold">Financial Years</span>
                            </div>
                        </div>
                        <div className="card__body">
                            <div className="flex gap-4 items-end mb-6">
                                <div className="input-group flex-1 max-w-xs">
                                    <label className="input-group__label">Start Date</label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={newFYStart}
                                        onChange={e => setNewFYStart(e.target.value)}
                                        placeholder="YYYY-MM-DD"
                                    />
                                </div>
                                <button
                                    className="btn btn--primary"
                                    onClick={handleCreateFY}
                                    disabled={!newFYStart || creatingFY}
                                    style={{ marginBottom: '1px' }}
                                >
                                    {creatingFY ? <RefreshCw size={16} className="spin" /> : <Plus size={16} />}
                                    Create Financial Year
                                </button>
                            </div>

                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '20%' }}>FY ID</th>
                                        <th style={{ width: '25%' }}>Start Date</th>
                                        <th style={{ width: '25%' }}>End Date</th>
                                        <th style={{ width: '15%' }}>Status</th>
                                        <th style={{ width: '15%' }}>Closed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {financialYears.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-6)' }}>
                                                No financial years found.
                                            </td>
                                        </tr>
                                    ) : (
                                        financialYears.map(fy => (
                                            <tr key={fy.fy_id}>
                                                <td className="font-mono font-semibold">{fy.fy_id}</td>
                                                <td>{fy.start_date}</td>
                                                <td>{fy.end_date}</td>
                                                <td>
                                                    {fy.is_active ? (
                                                        <span className="badge badge--success">Active</span>
                                                    ) : (
                                                        <span className="badge badge--neutral">Inactive</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {fy.is_closed ? (
                                                        <span className="badge badge--neutral">Closed</span>
                                                    ) : (
                                                        <span className="badge badge--success">Open</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Data Management Tab */}
            {activeTab === 'data' && (
                <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <HardDrive size={18} className="text-warning-500" />
                                <span className="font-semibold">Backup & Restore</span>
                            </div>
                            <div className="flex gap-2">
                                <button className="btn btn--secondary btn--sm" onClick={handleImportBackup} disabled={restoringBackup !== null}>
                                    <FileArchive size={14} />
                                    Import Backup
                                </button>
                                <button className="btn btn--primary btn--sm" onClick={handleCreateBackup} disabled={creatingBackup}>
                                    {creatingBackup ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
                                    Create Backup
                                </button>
                            </div>
                        </div>
                        <div className="card__body">
                            <div className="alert alert--info mb-4">
                                <Info size={16} />
                                Backups are stored locally in the <code>backups/</code> folder of your company directory.
                            </div>

                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40%' }}>Filename</th>
                                        <th style={{ width: '20%' }}>Created At</th>
                                        <th style={{ width: '20%' }}>Size</th>
                                        <th style={{ width: '20%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backups.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-6)' }}>
                                                No backups found. Create one to safeguard your data.
                                            </td>
                                        </tr>
                                    ) : (
                                        backups.map(backup => (
                                            <tr key={backup.filename}>
                                                <td className="font-mono flex items-center gap-2">
                                                    <FileArchive size={16} className="text-tertiary" />
                                                    {backup.filename}
                                                </td>
                                                <td>{backup.created_at}</td>
                                                <td>{(backup.size / 1024 / 1024).toFixed(2)} MB</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className="btn btn--secondary btn--sm"
                                                        onClick={() => handleRestore(backup.path)}
                                                        disabled={restoringBackup !== null}
                                                        title="Restore this backup"
                                                    >
                                                        {restoringBackup === backup.path ? (
                                                            <RefreshCw size={14} className="spin" />
                                                        ) : (
                                                            <RotateCcw size={14} />
                                                        )}
                                                        Restore
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Invoice Settings Tab */}
            {activeTab === 'invoice' && (
                <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
                    {/* Bank Details & Terms */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="card__header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <FileText size={18} className="text-primary-400" />
                                <span className="font-semibold">Invoice Configuration</span>
                            </div>
                            <button
                                className="btn btn--primary btn--sm"
                                onClick={handleSaveInvoice}
                                disabled={savingInvoice}
                            >
                                {savingInvoice ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                                Save Changes
                            </button>
                        </div>
                        <div className="card__body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="input-group">
                                    <label className="input-group__label">Bank Name</label>
                                    <input
                                        className="input"
                                        value={invoiceSettings.bank_name || ''}
                                        onChange={e => setInvoiceSettings({ ...invoiceSettings, bank_name: e.target.value })}
                                        placeholder="e.g. HDFC Bank"
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">Account Number</label>
                                    <input
                                        className="input"
                                        value={invoiceSettings.bank_account_no || ''}
                                        onChange={e => setInvoiceSettings({ ...invoiceSettings, bank_account_no: e.target.value })}
                                        placeholder="e.g. 50100..."
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">IFSC Code</label>
                                    <input
                                        className="input"
                                        value={invoiceSettings.bank_ifsc || ''}
                                        onChange={e => setInvoiceSettings({ ...invoiceSettings, bank_ifsc: e.target.value })}
                                        placeholder="e.g. HDFC0001234"
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-group__label">Branch Name</label>
                                    <input
                                        className="input"
                                        value={invoiceSettings.bank_branch || ''}
                                        onChange={e => setInvoiceSettings({ ...invoiceSettings, bank_branch: e.target.value })}
                                        placeholder="e.g. Andheri East"
                                    />
                                </div>
                            </div>

                            <div className="input-group" style={{ marginTop: 'var(--space-4)' }}>
                                <label className="input-group__label">Terms & Conditions</label>
                                <textarea
                                    className="input"
                                    rows={4}
                                    value={invoiceSettings.terms_and_conditions || ''}
                                    onChange={e => setInvoiceSettings({ ...invoiceSettings, terms_and_conditions: e.target.value })}
                                    placeholder="Enter terms and conditions to appear on invoice..."
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Branding (Logo & Signature) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                        <motion.div
                            className="card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="card__header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <Upload size={18} className="text-secondary" />
                                    <span className="font-semibold">Company Logo</span>
                                </div>
                            </div>
                            <div className="card__body" style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: '100%', height: 160,
                                    border: '2px dashed var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 'var(--space-4)',
                                    overflow: 'hidden',
                                    background: 'var(--bg-subtle)'
                                }}>
                                    {invoiceSettings.company_logo ? (
                                        <img src={invoiceSettings.company_logo} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%' }} />
                                    ) : (
                                        <div className="text-tertiary text-sm">No logo uploaded</div>
                                    )}
                                </div>
                                <label className="btn btn--secondary btn--sm">
                                    <Upload size={14} />
                                    Upload Logo
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleImageUpload('company_logo', e)}
                                    />
                                </label>
                            </div>
                        </motion.div>

                        <motion.div
                            className="card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="card__header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <Edit2 size={18} className="text-secondary" />
                                    <span className="font-semibold">Authorized Signature</span>
                                </div>
                            </div>
                            <div className="card__body" style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: '100%', height: 160,
                                    border: '2px dashed var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 'var(--space-4)',
                                    overflow: 'hidden',
                                    background: 'var(--bg-subtle)'
                                }}>
                                    {invoiceSettings.authorized_signature ? (
                                        <img src={invoiceSettings.authorized_signature} alt="Signature" style={{ maxHeight: '100%', maxWidth: '100%' }} />
                                    ) : (
                                        <div className="text-tertiary text-sm">No signature uploaded</div>
                                    )}
                                </div>
                                <label className="btn btn--secondary btn--sm">
                                    <Upload size={14} />
                                    Upload Signature
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleImageUpload('authorized_signature', e)}
                                    />
                                </label>
                            </div>
                        </motion.div>
                    </div>
                </div>
            )}

            {/* ── Add State Modal (Common) ────────────────────────────────── */}
            {showAddState && (
                <div className="modal-overlay">
                    <motion.div
                        className="modal"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="modal__header">
                            <h3 className="modal__title">Add New State</h3>
                            <button className="btn btn--ghost btn--icon" onClick={() => setShowAddState(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal__body">
                            <div className="input-group">
                                <label className="input-group__label">State Name</label>
                                <input
                                    className="input"
                                    value={newState.name}
                                    onChange={e => setNewState({ ...newState, name: e.target.value })}
                                    placeholder="e.g. Maharashtra"
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-group__label">State Code (GST)</label>
                                <input
                                    className="input"
                                    value={newState.code}
                                    onChange={e => setNewState({ ...newState, code: e.target.value })}
                                    placeholder="e.g. 27"
                                    maxLength={2}
                                />
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--ghost" onClick={() => setShowAddState(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn--primary"
                                onClick={handleCreateState}
                                disabled={!newState.name || !newState.code || creatingState}
                            >
                                {creatingState ? 'Creating...' : 'Create State'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
