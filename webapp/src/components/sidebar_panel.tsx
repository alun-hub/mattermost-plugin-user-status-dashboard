import React, {useCallback, useEffect, useRef, useState} from 'react';

import {UserStatusInfo} from '../types';

import UserSelector from './user_selector';
import UserStatusRow from './user_status_row';

const PLUGIN_ID = 'com.github.alun.user-status-dashboard';
const POLL_INTERVAL = 30000;

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
    },
    title: {
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--center-channel-color)',
        margin: 0,
    },
    addButton: {
        background: 'var(--button-bg)',
        color: 'var(--button-color)',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
    },
    list: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: '8px 0',
    },
    empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        textAlign: 'center' as const,
    },
    emptyText: {
        fontSize: '14px',
        marginBottom: '16px',
    },
};

const SidebarPanel: React.FC = () => {
    const [statuses, setStatuses] = useState<UserStatusInfo[]>([]);
    const [showSelector, setShowSelector] = useState(false);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchStatuses = useCallback(async () => {
        try {
            const resp = await fetch(`/plugins/${PLUGIN_ID}/api/v1/statuses`, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (resp.ok) {
                const data: UserStatusInfo[] = await resp.json();
                setStatuses(data);
            }
        } catch (err) {
            // Silently handle fetch errors
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatuses();

        pollRef.current = setInterval(fetchStatuses, POLL_INTERVAL);
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
        };
    }, [fetchStatuses]);

    const handleUserAdded = useCallback(() => {
        fetchStatuses();
    }, [fetchStatuses]);

    const handleRemoveUser = useCallback(async (userId: string) => {
        try {
            const resp = await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (!resp.ok) {
                return;
            }
            const data = await resp.json();
            const userIds: string[] = data.user_ids || [];
            const updated = userIds.filter((id: string) => id !== userId);

            await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({user_ids: updated}),
            });

            fetchStatuses();
        } catch (err) {
            // Silently handle errors
        }
    }, [fetchStatuses]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h4 style={styles.title}>Status Dashboard</h4>
                </div>
                <div style={styles.empty}>
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h4 style={styles.title}>Status Dashboard</h4>
                <button
                    style={styles.addButton}
                    onClick={() => setShowSelector(true)}
                >
                    + Add User
                </button>
            </div>

            <div style={styles.list}>
                {statuses.length === 0 ? (
                    <div style={styles.empty}>
                        <p style={styles.emptyText}>
                            No users being watched yet.
                        </p>
                        <button
                            style={styles.addButton}
                            onClick={() => setShowSelector(true)}
                        >
                            Add Users to Watch
                        </button>
                    </div>
                ) : (
                    statuses.map((user) => (
                        <UserStatusRow
                            key={user.user_id}
                            user={user}
                            onRemove={handleRemoveUser}
                        />
                    ))
                )}
            </div>

            {showSelector && (
                <UserSelector
                    onClose={() => setShowSelector(false)}
                    onUserAdded={handleUserAdded}
                    currentUserIds={statuses.map((u) => u.user_id)}
                />
            )}
        </div>
    );
};

export default SidebarPanel;
