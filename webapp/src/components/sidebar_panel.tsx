import React, {useCallback, useEffect, useRef, useState} from 'react';

import {StatusResponse, UserStatusInfo, WatchedUsersV2} from '../types';

import UserSelector from './user_selector';
import UserStatusRow from './user_status_row';

const PLUGIN_ID = 'com.github.alun.user-status-dashboard';
const FALLBACK_POLL_INTERVAL = 300000; // 5 min fallback for custom status changes

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
    headerButtons: {
        display: 'flex',
        gap: '6px',
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
    secondaryButton: {
        background: 'none',
        color: 'var(--button-bg)',
        border: '1px solid var(--button-bg)',
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
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px 4px',
        cursor: 'pointer',
        userSelect: 'none' as const,
    },
    sectionChevron: {
        fontSize: '12px',
        marginRight: '6px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        transition: 'transform 0.15s',
        width: '14px',
        textAlign: 'center' as const,
    },
    sectionName: {
        fontSize: '12px',
        fontWeight: 700,
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    sectionActions: {
        display: 'flex',
        gap: '4px',
        opacity: 0,
        transition: 'opacity 0.15s',
    },
    sectionActionButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontSize: '14px',
        padding: '2px 4px',
        lineHeight: 1,
        borderRadius: '2px',
    },
    dropTarget: {
        minHeight: '4px',
        transition: 'all 0.15s',
    },
    dropTargetActive: {
        minHeight: '32px',
        backgroundColor: 'rgba(var(--button-bg-rgb, 28, 88, 217), 0.08)',
        border: '2px dashed var(--button-bg)',
        borderRadius: '4px',
        margin: '4px 16px',
    },
    inlineInput: {
        padding: '4px 16px 8px',
    },
    inlineInputField: {
        width: '100%',
        padding: '6px 8px',
        border: '1px solid var(--button-bg)',
        borderRadius: '4px',
        fontSize: '13px',
        backgroundColor: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        outline: 'none',
        boxSizing: 'border-box' as const,
    },
    sectionCount: {
        fontSize: '11px',
        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
        marginLeft: '4px',
    },
};

const SidebarPanel: React.FC = () => {
    const [statusData, setStatusData] = useState<StatusResponse | null>(null);
    const [watchedUsers, setWatchedUsers] = useState<WatchedUsersV2 | null>(null);
    const [showSelector, setShowSelector] = useState(false);
    const [loading, setLoading] = useState(true);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editFolderName, setEditFolderName] = useState('');
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const newFolderInputRef = useRef<HTMLInputElement>(null);
    const editFolderInputRef = useRef<HTMLInputElement>(null);

    const fetchStatuses = useCallback(async () => {
        try {
            const resp = await fetch(`/plugins/${PLUGIN_ID}/api/v1/statuses`, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (resp.ok) {
                const data: StatusResponse = await resp.json();
                setStatusData(data);
            }
        } catch (err) {
            // Silently handle fetch errors
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchWatchedUsers = useCallback(async () => {
        try {
            const resp = await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (resp.ok) {
                const data: WatchedUsersV2 = await resp.json();
                setWatchedUsers(data);
            }
        } catch (err) {
            // Silently handle errors
        }
    }, []);

    useEffect(() => {
        fetchStatuses();
        fetchWatchedUsers();

        pollRef.current = setInterval(fetchStatuses, FALLBACK_POLL_INTERVAL);

        const handleStatusChange = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail) {
                return;
            }
            const userId = detail.user_id;
            const status = detail.status;
            if (!userId || !status) {
                return;
            }
            setStatusData((prev) => {
                if (!prev) {
                    return prev;
                }

                const updateUser = (u: UserStatusInfo): UserStatusInfo =>
                    u.user_id === userId
                        ? {...u, status, last_activity_at: Date.now()}
                        : u;

                return {
                    uncategorized: prev.uncategorized.map(updateUser),
                    folders: prev.folders.map((f) => ({
                        ...f,
                        users: f.users.map(updateUser),
                    })),
                    groups: prev.groups.map((g) => ({
                        ...g,
                        users: g.users.map(updateUser),
                    })),
                };
            });
        };

        const handleReconnect = () => {
            fetchStatuses();
        };

        window.addEventListener('status_dashboard_status_change', handleStatusChange);
        window.addEventListener('status_dashboard_reconnect', handleReconnect);

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
            window.removeEventListener('status_dashboard_status_change', handleStatusChange);
            window.removeEventListener('status_dashboard_reconnect', handleReconnect);
        };
    }, [fetchStatuses, fetchWatchedUsers]);

    const handleUserAdded = useCallback(() => {
        fetchStatuses();
        fetchWatchedUsers();
    }, [fetchStatuses, fetchWatchedUsers]);

    const handleRemoveUser = useCallback(async (userId: string) => {
        if (!watchedUsers) {
            return;
        }

        const updated: WatchedUsersV2 = {
            ...watchedUsers,
            user_ids: watchedUsers.user_ids.filter((id) => id !== userId),
            folders: watchedUsers.folders.map((f) => ({
                ...f,
                user_ids: f.user_ids.filter((id) => id !== userId),
            })),
        };

        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(updated),
            });
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [watchedUsers, fetchStatuses, fetchWatchedUsers]);

    const toggleSection = useCallback((sectionId: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            return next;
        });
    }, []);

    // Folder CRUD
    const handleCreateFolder = useCallback(async () => {
        const name = newFolderName.trim();
        if (!name) {
            return;
        }
        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/folders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({name}),
            });
            setCreatingFolder(false);
            setNewFolderName('');
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [newFolderName, fetchStatuses, fetchWatchedUsers]);

    const handleRenameFolder = useCallback(async (folderId: string) => {
        const name = editFolderName.trim();
        if (!name) {
            return;
        }
        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/folders/${encodeURIComponent(folderId)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({name}),
            });
            setEditingFolderId(null);
            setEditFolderName('');
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [editFolderName, fetchStatuses, fetchWatchedUsers]);

    const handleDeleteFolder = useCallback(async (folderId: string) => {
        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/folders/${encodeURIComponent(folderId)}`, {
                method: 'DELETE',
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [fetchStatuses, fetchWatchedUsers]);

    const handleRemoveGroup = useCallback(async (groupId: string) => {
        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-groups/${encodeURIComponent(groupId)}`, {
                method: 'DELETE',
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [fetchStatuses, fetchWatchedUsers]);

    // Drag and drop
    const handleDragStart = useCallback((e: React.DragEvent, userId: string) => {
        e.dataTransfer.setData('text/plain', userId);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTarget(targetId);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOverTarget(null);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        setDragOverTarget(null);

        const userId = e.dataTransfer.getData('text/plain');
        if (!userId || !watchedUsers) {
            return;
        }

        // Remove user from all locations
        const updated: WatchedUsersV2 = {
            ...watchedUsers,
            user_ids: watchedUsers.user_ids.filter((id) => id !== userId),
            folders: watchedUsers.folders.map((f) => ({
                ...f,
                user_ids: f.user_ids.filter((id) => id !== userId),
            })),
        };

        // Add to target
        if (targetId === 'uncategorized') {
            updated.user_ids.push(userId);
        } else {
            const folder = updated.folders.find((f) => f.id === targetId);
            if (folder) {
                folder.user_ids.push(userId);
            }
        }

        try {
            await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(updated),
            });
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [watchedUsers, fetchStatuses, fetchWatchedUsers]);

    useEffect(() => {
        if (creatingFolder && newFolderInputRef.current) {
            newFolderInputRef.current.focus();
        }
    }, [creatingFolder]);

    useEffect(() => {
        if (editingFolderId && editFolderInputRef.current) {
            editFolderInputRef.current.focus();
        }
    }, [editingFolderId]);

    const totalUsers = statusData
        ? statusData.uncategorized.length +
          statusData.folders.reduce((acc, f) => acc + f.users.length, 0) +
          statusData.groups.reduce((acc, g) => acc + g.users.length, 0)
        : 0;

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
                <div style={styles.headerButtons}>
                    <button
                        style={styles.secondaryButton}
                        onClick={() => {
                            setCreatingFolder(true);
                            setNewFolderName('');
                        }}
                    >
                        + Folder
                    </button>
                    <button
                        style={styles.addButton}
                        onClick={() => setShowSelector(true)}
                    >
                        + Add
                    </button>
                </div>
            </div>

            <div style={styles.list}>
                {totalUsers === 0 && !statusData?.folders.length && !statusData?.groups.length ? (
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
                    <>
                        {/* New folder input */}
                        {creatingFolder && (
                            <div style={styles.inlineInput}>
                                <input
                                    ref={newFolderInputRef}
                                    style={styles.inlineInputField}
                                    type="text"
                                    placeholder="Folder name..."
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleCreateFolder();
                                        } else if (e.key === 'Escape') {
                                            setCreatingFolder(false);
                                            setNewFolderName('');
                                        }
                                    }}
                                    onBlur={() => {
                                        if (newFolderName.trim()) {
                                            handleCreateFolder();
                                        } else {
                                            setCreatingFolder(false);
                                        }
                                    }}
                                    maxLength={64}
                                />
                            </div>
                        )}

                        {/* Uncategorized users */}
                        {statusData && statusData.uncategorized.length > 0 && (
                            <div
                                onDragOver={(e) => handleDragOver(e, 'uncategorized')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'uncategorized')}
                            >
                                <div
                                    style={{
                                        ...styles.dropTarget,
                                        ...(dragOverTarget === 'uncategorized' ? styles.dropTargetActive : {}),
                                    }}
                                />
                                {statusData.uncategorized.map((user) => (
                                    <UserStatusRow
                                        key={user.user_id}
                                        user={user}
                                        onRemove={handleRemoveUser}
                                        onDragStart={handleDragStart}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Empty drop target for uncategorized when empty but folders exist */}
                        {statusData && statusData.uncategorized.length === 0 && (statusData.folders.length > 0 || statusData.groups.length > 0) && (
                            <div
                                onDragOver={(e) => handleDragOver(e, 'uncategorized')}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, 'uncategorized')}
                                style={{
                                    ...styles.dropTarget,
                                    ...(dragOverTarget === 'uncategorized' ? styles.dropTargetActive : {}),
                                }}
                            />
                        )}

                        {/* Folders */}
                        {statusData?.folders.map((folder) => {
                            const isCollapsed = collapsedSections.has(folder.id);
                            const isEditing = editingFolderId === folder.id;

                            return (
                                <div key={folder.id}>
                                    <div
                                        style={styles.sectionHeader}
                                        onClick={() => toggleSection(folder.id)}
                                        onMouseEnter={(e) => {
                                            const actions = e.currentTarget.querySelector('[data-section-actions]') as HTMLElement;
                                            if (actions) {
                                                actions.style.opacity = '1';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            const actions = e.currentTarget.querySelector('[data-section-actions]') as HTMLElement;
                                            if (actions) {
                                                actions.style.opacity = '0';
                                            }
                                        }}
                                    >
                                        <span
                                            style={{
                                                ...styles.sectionChevron,
                                                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                            }}
                                        >
                                            {'▾'}
                                        </span>
                                        <span style={styles.sectionName}>{folder.name}</span>
                                        <span style={styles.sectionCount}>{folder.users.length}</span>
                                        <div data-section-actions="" style={styles.sectionActions}>
                                            <button
                                                style={styles.sectionActionButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingFolderId(folder.id);
                                                    setEditFolderName(folder.name);
                                                }}
                                                title="Rename folder"
                                            >
                                                {'✎'}
                                            </button>
                                            <button
                                                style={styles.sectionActionButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteFolder(folder.id);
                                                }}
                                                title="Delete folder"
                                            >
                                                {'×'}
                                            </button>
                                        </div>
                                    </div>

                                    {isEditing && (
                                        <div style={styles.inlineInput}>
                                            <input
                                                ref={editFolderInputRef}
                                                style={styles.inlineInputField}
                                                type="text"
                                                value={editFolderName}
                                                onChange={(e) => setEditFolderName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleRenameFolder(folder.id);
                                                    } else if (e.key === 'Escape') {
                                                        setEditingFolderId(null);
                                                        setEditFolderName('');
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (editFolderName.trim()) {
                                                        handleRenameFolder(folder.id);
                                                    } else {
                                                        setEditingFolderId(null);
                                                    }
                                                }}
                                                maxLength={64}
                                            />
                                        </div>
                                    )}

                                    {!isCollapsed && (
                                        <div
                                            onDragOver={(e) => handleDragOver(e, folder.id)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, folder.id)}
                                        >
                                            <div
                                                style={{
                                                    ...styles.dropTarget,
                                                    ...(dragOverTarget === folder.id ? styles.dropTargetActive : {}),
                                                }}
                                            />
                                            {folder.users.map((user) => (
                                                <UserStatusRow
                                                    key={user.user_id}
                                                    user={user}
                                                    onRemove={handleRemoveUser}
                                                    onDragStart={handleDragStart}
                                                />
                                            ))}
                                            {folder.users.length === 0 && dragOverTarget !== folder.id && (
                                                <div
                                                    style={{
                                                        padding: '8px 16px',
                                                        fontSize: '12px',
                                                        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    Drag users here
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Groups */}
                        {statusData?.groups.map((group) => {
                            const isCollapsed = collapsedSections.has(group.group_id);

                            return (
                                <div key={group.group_id}>
                                    <div
                                        style={styles.sectionHeader}
                                        onClick={() => toggleSection(group.group_id)}
                                        onMouseEnter={(e) => {
                                            const actions = e.currentTarget.querySelector('[data-section-actions]') as HTMLElement;
                                            if (actions) {
                                                actions.style.opacity = '1';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            const actions = e.currentTarget.querySelector('[data-section-actions]') as HTMLElement;
                                            if (actions) {
                                                actions.style.opacity = '0';
                                            }
                                        }}
                                    >
                                        <span
                                            style={{
                                                ...styles.sectionChevron,
                                                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                            }}
                                        >
                                            {'▾'}
                                        </span>
                                        <span style={styles.sectionName}>{group.display_name}</span>
                                        <span style={styles.sectionCount}>{group.users.length}</span>
                                        <div data-section-actions="" style={styles.sectionActions}>
                                            <button
                                                style={styles.sectionActionButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveGroup(group.group_id);
                                                }}
                                                title="Remove group"
                                            >
                                                {'×'}
                                            </button>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <div>
                                            {group.users.map((user) => (
                                                <UserStatusRow
                                                    key={user.user_id}
                                                    user={user}
                                                    onRemove={handleRemoveUser}
                                                />
                                            ))}
                                            {group.users.length === 0 && (
                                                <div
                                                    style={{
                                                        padding: '8px 16px',
                                                        fontSize: '12px',
                                                        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    No members
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            {showSelector && watchedUsers && (
                <UserSelector
                    onClose={() => setShowSelector(false)}
                    onUserAdded={handleUserAdded}
                    watchedUsers={watchedUsers}
                />
            )}
        </div>
    );
};

export default SidebarPanel;
