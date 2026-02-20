import { useAppStore } from '../store';
import type { AppView } from '../store';
import {
    LayoutDashboard,
    BookOpen,
    Receipt,
    ClipboardCheck,
    PieChart,
    Settings,
    ChevronsLeft,
    ChevronsRight,
    LogOut,
    Building2,
    Shield,
    Package,
    Users,
    Power,
    FileText,
    Briefcase,
} from 'lucide-react';
import { logout as ipcLogout } from '../ipc';

interface NavItem {
    id: AppView;
    label: string;
    icon: React.ReactNode;
    section: string;
    badge?: number;
}


export function Sidebar() {
    const { currentView, setView, sidebarCollapsed, toggleSidebar, activeCompany, setActiveCompany, currentUser, setCurrentUser } = useAppStore();

    // Dynamically build nav items with RBAC
    const navItems: NavItem[] = [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, section: 'OVERVIEW' },
        { id: 'ledger', label: 'Day Book / Ledger', icon: <BookOpen size={20} />, section: 'ACCOUNTING' },
        { id: 'accounts', label: 'Chart of Accounts', icon: <Receipt size={20} />, section: 'ACCOUNTING' },
        { id: 'inventory', label: 'Inventory', icon: <Package size={20} />, section: 'ACCOUNTING' },
        ...(currentUser?.role === 'admin' ? [{ id: 'approvals' as AppView, label: 'Pending Approvals', icon: <ClipboardCheck size={20} />, section: 'ACCOUNTING' }] : []),
        { id: 'reports', label: 'Reports', icon: <PieChart size={20} />, section: 'ANALYTICS' },
        { id: 'tds', label: 'TDS', icon: <FileText size={20} />, section: 'COMPLIANCE' },
        { id: 'payroll', label: 'Payroll', icon: <Briefcase size={20} />, section: 'COMPLIANCE' },
        ...(currentUser?.role === 'admin' ? [{ id: 'users' as AppView, label: 'Users', icon: <Users size={20} />, section: 'SYSTEM' }] : []),
        ...(currentUser?.role === 'admin' ? [{ id: 'audit_logs' as AppView, label: 'Audit Logs', icon: <Shield size={20} />, section: 'SYSTEM' }] : []),
        { id: 'settings', label: 'Settings', icon: <Settings size={20} />, section: 'SYSTEM' },
    ];

    const sections = Array.from(new Set(navItems.map(n => n.section)));

    return (
        <aside className="sidebar">
            {/* Brand */}
            <div className="sidebar__brand">
                <div className="sidebar__brand-icon">अ</div>
                {!sidebarCollapsed && <span className="sidebar__brand-text">ArthMitra</span>}
            </div>

            {/* Active Company */}
            {activeCompany && !sidebarCollapsed && (
                <div style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                }}>
                    <Building2 size={14} style={{ color: 'var(--color-primary-400)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {activeCompany.company_name}
                        </div>
                        {activeCompany.gstin && (
                            <div style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--text-tertiary)',
                            }}>
                                {activeCompany.gstin}
                            </div>
                        )}
                    </div>
                    <span className="badge badge--mounted" style={{ fontSize: '9px' }}>
                        <Shield size={8} /> LIVE
                    </span>
                </div>
            )}

            {/* Navigation */}
            <nav className="sidebar__nav">
                {sections.map(section => (
                    <div key={section}>
                        {!sidebarCollapsed && (
                            <div className="sidebar__section-title">{section}</div>
                        )}
                        {navItems.filter(n => n.section === section).map(item => (
                            <button
                                key={item.id}
                                className={`nav-item ${currentView === item.id ? 'nav-item--active' : ''}`}
                                onClick={() => setView(item.id)}
                                title={sidebarCollapsed ? item.label : undefined}
                            >
                                <span className="nav-item__icon">{item.icon}</span>
                                {!sidebarCollapsed && <span>{item.label}</span>}
                                {!sidebarCollapsed && item.badge && (
                                    <span className="nav-item__badge">{item.badge}</span>
                                )}
                            </button>
                        ))}
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div style={{
                padding: 'var(--space-3)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
            }}>
                <button className="nav-item" onClick={toggleSidebar}>
                    <span className="nav-item__icon">
                        {sidebarCollapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
                    </span>
                    {!sidebarCollapsed && <span>Collapse</span>}
                </button>
                <button className="nav-item" onClick={() => setActiveCompany(null)}>
                    <span className="nav-item__icon"><LogOut size={20} /></span>
                    {!sidebarCollapsed && <span>Switch Company</span>}
                </button>
                <button className="nav-item" onClick={async () => { await ipcLogout(); setCurrentUser(null); }}>
                    <span className="nav-item__icon"><Power size={20} /></span>
                    {!sidebarCollapsed && <span>Sign Out</span>}
                </button>
            </div>
        </aside>
    );
}
