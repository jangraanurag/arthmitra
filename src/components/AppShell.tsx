import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { Sidebar } from './Sidebar';
import { SearchModal } from './SearchModal';
import { DashboardPage } from '../pages/DashboardPage';
import { LedgerPage } from '../pages/LedgerPage';
import { AccountsPage } from '../pages/AccountsPage';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { VoucherEntryPage } from '../pages/VoucherEntryPage';
import { InventoryPage } from '../pages/InventoryPage';
import { StockSummaryPage } from '../pages/StockSummaryPage';
import { ItemLedgerPage } from '../pages/ItemLedgerPage';
import { BOMPage } from '../pages/BOMPage';
import { ProductionPage } from '../pages/ProductionPage';
import { UserManagementPage } from '../pages/UserManagementPage';
import { AuditLogPage } from '../pages/AuditLogPage';
import { TDSPage } from '../pages/TDSPage';
import { PayrollPage } from '../pages/PayrollPage';
import { ImportPage } from '../pages/ImportPage';
import { Search, Bell, User } from 'lucide-react';

export function AppShell() {
    const { currentView, setView, sidebarCollapsed, activeCompany, currentUser } = useAppStore();
    const [searchOpen, setSearchOpen] = useState(false);

    const viewTitles: Record<string, string> = {
        dashboard: 'Dashboard',
        ledger: 'Day Book / Ledger',
        voucher: 'Voucher Entry',
        accounts: 'Chart of Accounts',
        approvals: 'Pending Approvals',
        reports: 'Reports',
        inventory: 'Inventory Management',
        settings: 'Settings',
        users: 'User Management',
        audit_logs: 'Audit Logs',
        import: 'Data Import',
    };

    // Global Ctrl+K shortcut
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setSearchOpen(prev => !prev);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const renderPage = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardPage onNavigate={setView} />;
            case 'ledger': return <LedgerPage />;
            case 'voucher': return <VoucherEntryPage />;
            case 'accounts': return <AccountsPage />;
            case 'inventory': return <InventoryPage />;
            case 'stock_summary': return <StockSummaryPage />;
            case 'item_ledger': return <ItemLedgerPage />;
            case 'bom': return <BOMPage />;
            case 'production': return <ProductionPage />;
            case 'approvals': return <ApprovalsPage />;
            case 'reports': return <ReportsPage />;
            // case 'search': return <SearchPage />; 
            case 'settings': return <SettingsPage />;
            case 'users': return <UserManagementPage />;
            case 'audit_logs': return <AuditLogPage />;
            case 'tds': return <TDSPage />;
            case 'payroll': return <PayrollPage />;
            case 'import': return <ImportPage />;
            default: return <DashboardPage onNavigate={setView} />;
        }
    };

    return (
        <div className={`app-shell ${sidebarCollapsed ? 'app-shell--collapsed' : ''}`}>
            <Sidebar />

            {/* Header */}
            <header className="header">
                <div className="header__breadcrumb">
                    <span>{activeCompany?.company_name}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>/</span>
                    <span>{viewTitles[currentView] || currentView}</span>
                </div>

                <div className="header__actions">
                    <button
                        className="btn btn--ghost btn--icon"
                        title="Search (Ctrl+K)"
                        onClick={() => setSearchOpen(true)}
                    >
                        <Search size={18} />
                    </button>
                    <button className="btn btn--ghost btn--icon" title="Notifications">
                        <Bell size={18} />
                    </button>
                    <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--radius-full)',
                        background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'default',
                    }} title={currentUser?.display_name || 'User'}>
                        <User size={16} color="white" />
                    </div>
                    {currentUser && (
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {currentUser.display_name}
                        </span>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="main-content">
                {renderPage()}
            </main>

            {/* Search Command Palette */}
            <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
        </div>
    );
}
