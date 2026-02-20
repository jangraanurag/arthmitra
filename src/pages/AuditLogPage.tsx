import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, ChevronRight, ChevronDown, Clock, User, Activity, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';

interface AuditLogEntry {
    id: number;
    prev_hash: string;
    data_hash: string;
    action: string;
    actor: string;
    actor_type: string;
    timestamp: string;
    details?: string;
    entity_id?: string;
    entity_type?: string;
}

export function AuditLogPage() {
    const { activeCompany, currentUser } = useAppStore();
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [integrityStatus, setIntegrityStatus] = useState<{ valid: boolean; errorId?: number } | null>(null);

    useEffect(() => {
        fetchLogs();
        verifyIntegrity();
    }, [activeCompany]);

    const fetchLogs = async () => {
        if (!activeCompany) return;
        setLoading(true);
        try {
            const result = await invoke<AuditLogEntry[]>('get_audit_logs', {
                uuid: activeCompany.uuid,
                limit: 100,
            });
            setLogs(result);
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const verifyIntegrity = async () => {
        if (!activeCompany) return;
        try {
            const [valid, errorId] = await invoke<[boolean, number | null]>('verify_audit_chain', {
                uuid: activeCompany.uuid,
            });
            setIntegrityStatus({ valid, errorId: errorId || undefined });
        } catch (error) {
            console.error('Failed to verify integrity:', error);
        }
    };

    const toggleExpand = (id: number) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    const renderDetails = (details: string) => {
        try {
            const json = JSON.parse(details);
            return (
                <pre style={{
                    background: 'var(--bg-subtle)',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    overflowX: 'auto',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)'
                }}>
                    {JSON.stringify(json, null, 2)}
                </pre>
            );
        } catch (e) {
            return <p>{details}</p>;
        }
    };

    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="p-8 text-center">
                <Shield size={48} className="mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p>Only administrators can view the Audit Log.</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Audit Log</h1>
                    <p className="page-subtitle">Immutable record of all system activities</p>
                </div>
                <div className="flex gap-2">
                    {integrityStatus && (
                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${integrityStatus.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            <Shield size={14} />
                            {integrityStatus.valid ? 'Chain Intact' : `Tampered at ID: ${integrityStatus.errorId}`}
                        </div>
                    )}
                    <button className="btn btn--secondary" onClick={fetchLogs} disabled={loading}>
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </header>

            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}></th>
                                <th>Timestamp</th>
                                <th>Action</th>
                                <th>Actor</th>
                                <th>Entity</th>
                                <th>Hash</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <>
                                    <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                                        <td>
                                            {expandedIds.has(log.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-gray-400" />
                                                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(log.timestamp))}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="font-medium text-primary-600">{log.action}</span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-gray-400" />
                                                {log.actor}
                                                <span className="text-xs text-gray-500">({log.actor_type})</span>
                                            </div>
                                        </td>
                                        <td>
                                            {log.entity_type && (
                                                <div className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                                                    <Activity size={12} />
                                                    {log.entity_type}:{log.entity_id?.slice(0, 8)}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <code className="text-xs text-gray-400" title={log.data_hash}>
                                                {log.data_hash.substring(0, 8)}...
                                            </code>
                                        </td>
                                    </tr>
                                    {expandedIds.has(log.id) && (
                                        <tr key={`${log.id}-details`}>
                                            <td colSpan={6} style={{ padding: 0 }}>
                                                <div className="p-4 bg-gray-50 border-b border-gray-100">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Previous Hash</h4>
                                                            <code className="text-xs block break-all">{log.prev_hash}</code>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Data Hash</h4>
                                                            <code className="text-xs block break-all">{log.data_hash}</code>
                                                        </div>
                                                    </div>

                                                    {log.details && (
                                                        <div className="mt-4">
                                                            <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Change Details</h4>
                                                            {renderDetails(log.details)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
