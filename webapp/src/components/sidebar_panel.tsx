import React, {useCallback, useEffect, useRef, useState} from 'react';

import {doDelete, doGet, doPost, doPut, pluginApiUrl} from '../client';
import {StatusResponse, UserStatusInfo, WatchedUsersV2} from '../types';

import UserSelector from './user_selector';
import UserStatusRow from './user_status_row';
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
        transition: 'background-color 0.15s',
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
    folderWrapper: {
        transition: 'background-color 0.15s, border-left 0.15s',
        borderLeft: '2px solid transparent',
    },
    folderWrapperDragOver: {
        backgroundColor: 'rgba(var(--button-bg-rgb, 28, 88, 217), 0.06)',
        borderLeft: '2px solid var(--button-bg)',
    },
};

interface InsertIndicator {
    sectionId: string;
    userId: string;
    position: 'above' | 'below';
}

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
    const [isDragging, setIsDragging] = useState(false);
    const [insertIndicator, setInsertIndicator] = useState<InsertIndicator | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const newFolderInputRef = useRef<HTMLInputElement>(null);
    const editFolderInputRef = useRef<HTMLInputElement>(null);
    const dragCounters = useRef<Record<string, number>>({});
    const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchStatuses = useCallback(async () => {
        try {
            const resp = await doGet(pluginApiUrl('/statuses'));
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
            const resp = await doGet(pluginApiUrl('/watched-users'));
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
            await doPut(pluginApiUrl('/watched-users'), updated);
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
            await doPost(pluginApiUrl('/folders'), {name});
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
            await doPut(pluginApiUrl(`/folders/${encodeURIComponent(folderId)}`), {name});
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
            await doDelete(pluginApiUrl(`/folders/${encodeURIComponent(folderId)}`));
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [fetchStatuses, fetchWatchedUsers]);

    const handleRemoveGroup = useCallback(async (groupId: string) => {
        try {
            await doDelete(pluginApiUrl(`/watched-groups/${encodeURIComponent(groupId)}`));
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [fetchStatuses, fetchWatchedUsers]);

    // Drag and drop
    const clearAutoExpandTimer = useCallback(() => {
        if (autoExpandTimer.current) {
            clearTimeout(autoExpandTimer.current);
            autoExpandTimer.current = null;
        }
    }, []);

    const clearAllDragState = useCallback(() => {
        setDragOverTarget(null);
        setInsertIndicator(null);
        setIsDragging(false);
        dragCounters.current = {};
        clearAutoExpandTimer();
    }, [clearAutoExpandTimer]);

    const handleDragStart = useCallback((e: React.DragEvent, userId: string) => {
        e.dataTransfer.setData('text/plain', userId);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
    }, []);

    const handleDragEnd = useCallback(() => {
        clearAllDragState();
    }, [clearAllDragState]);

    const handleDragEnter = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!dragCounters.current[targetId]) {
            dragCounters.current[targetId] = 0;
        }
        dragCounters.current[targetId]++;
        setDragOverTarget(targetId);

        // Auto-expand collapsed sections after 500ms
        if (collapsedSections.has(targetId)) {
            clearAutoExpandTimer();
            autoExpandTimer.current = setTimeout(() => {
                setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete(targetId);
                    return next;
                });
            }, 500);
        }
    }, [collapsedSections, clearAutoExpandTimer]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!dragCounters.current[targetId]) {
            dragCounters.current[targetId] = 0;
        }
        dragCounters.current[targetId]--;
        if (dragCounters.current[targetId] <= 0) {
            dragCounters.current[targetId] = 0;
            setDragOverTarget((prev) => (prev === targetId ? null : prev));
            clearAutoExpandTimer();
        }
    }, [clearAutoExpandTimer]);

    const handleDragOverRow = useCallback((e: React.DragEvent, userId: string, sectionId: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
        setInsertIndicator((prev) => {
            if (prev && prev.sectionId === sectionId && prev.userId === userId && prev.position === position) {
                return prev;
            }
            return {sectionId, userId, position};
        });
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const userId = e.dataTransfer.getData('text/plain');
        const currentInsert = insertIndicator;

        clearAllDragState();

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

        // Add to target at correct position
        if (targetId === 'uncategorized') {
            if (currentInsert && currentInsert.sectionId === 'uncategorized') {
                const idx = updated.user_ids.indexOf(currentInsert.userId);
                if (idx !== -1) {
                    const insertIdx = currentInsert.position === 'above' ? idx : idx + 1;
                    updated.user_ids.splice(insertIdx, 0, userId);
                } else {
                    updated.user_ids.push(userId);
                }
            } else {
                updated.user_ids.push(userId);
            }
        } else {
            const folder = updated.folders.find((f) => f.id === targetId);
            if (folder) {
                if (currentInsert && currentInsert.sectionId === targetId) {
                    const idx = folder.user_ids.indexOf(currentInsert.userId);
                    if (idx !== -1) {
                        const insertIdx = currentInsert.position === 'above' ? idx : idx + 1;
                        folder.user_ids.splice(insertIdx, 0, userId);
                    } else {
                        folder.user_ids.push(userId);
                    }
                } else {
                    folder.user_ids.push(userId);
                }
            }
        }

        try {
            await doPut(pluginApiUrl('/watched-users'), updated);
            fetchStatuses();
            fetchWatchedUsers();
        } catch (err) {
            // Silently handle errors
        }
    }, [watchedUsers, insertIndicator, fetchStatuses, fetchWatchedUsers, clearAllDragState]);

    const handleDropOnRow = useCallback((e: React.DragEvent, targetId: string) => {
        handleDrop(e, targetId);
    }, [handleDrop]);

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

    // Global dragend cleanup
    useEffect(() => {
        const onDragEnd = () => {
            clearAllDragState();
        };
        window.addEventListener('dragend', onDragEnd);
        return () => window.removeEventListener('dragend', onDragEnd);
    }, [clearAllDragState]);

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

    const getInsertPosition = (sectionId: string, userId: string): 'above' | 'below' | null => {
        if (!insertIndicator) {
            return null;
        }
        if (insertIndicator.sectionId === sectionId && insertIndicator.userId === userId) {
            return insertIndicator.position;
        }
        return null;
    };

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
                        {statusData && (statusData.uncategorized.length > 0 || statusData.folders.length > 0 || statusData.groups.length > 0) && (
                            <div
                                style={{
                                    ...styles.folderWrapper,
                                    ...(dragOverTarget === 'uncategorized' ? styles.folderWrapperDragOver : {}),
                                }}
                                onDragEnter={(e) => handleDragEnter(e, 'uncategorized')}
                                onDragOver={handleDragOver}
                                onDragLeave={(e) => handleDragLeave(e, 'uncategorized')}
                                onDrop={(e) => handleDrop(e, 'uncategorized')}
                            >
                                {statusData.uncategorized.length > 0 ? (
                                    statusData.uncategorized.map((user) => (
                                        <UserStatusRow
                                            key={user.user_id}
                                            user={user}
                                            onRemove={handleRemoveUser}
                                            onDragStart={handleDragStart}
                                            onDragEnd={handleDragEnd}
                                            onDragOverRow={(e, uid) => handleDragOverRow(e, uid, 'uncategorized')}
                                            onDropRow={(e) => handleDropOnRow(e, 'uncategorized')}
                                            insertPosition={getInsertPosition('uncategorized', user.user_id)}
                                        />
                                    ))
                                ) : isDragging ? (
                                    <div
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: '12px',
                                            color: 'rgba(var(--center-channel-color-rgb), 0.40)',
                                            fontStyle: 'italic',
                                        }}
                                    >
                                        Drop here for uncategorized
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {/* Folders */}
                        {statusData?.folders.map((folder) => {
                            const isCollapsed = collapsedSections.has(folder.id);
                            const isEditing = editingFolderId === folder.id;
                            const isDragOver = dragOverTarget === folder.id;

                            return (
                                <div
                                    key={folder.id}
                                    style={{
                                        ...styles.folderWrapper,
                                        ...(isDragOver ? styles.folderWrapperDragOver : {}),
                                    }}
                                    onDragEnter={(e) => handleDragEnter(e, folder.id)}
                                    onDragOver={handleDragOver}
                                    onDragLeave={(e) => handleDragLeave(e, folder.id)}
                                    onDrop={(e) => handleDrop(e, folder.id)}
                                >
                                    <div
                                        style={{
                                            ...styles.sectionHeader,
                                            ...(isDragOver ? {backgroundColor: 'rgba(var(--button-bg-rgb, 28, 88, 217), 0.10)'} : {}),
                                        }}
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
                                        <div>
                                            {folder.users.map((user) => (
                                                <UserStatusRow
                                                    key={user.user_id}
                                                    user={user}
                                                    onRemove={handleRemoveUser}
                                                    onDragStart={handleDragStart}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOverRow={(e, uid) => handleDragOverRow(e, uid, folder.id)}
                                                    onDropRow={(e) => handleDropOnRow(e, folder.id)}
                                                    insertPosition={getInsertPosition(folder.id, user.user_id)}
                                                />
                                            ))}
                                            {folder.users.length === 0 && !isDragOver && (
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
