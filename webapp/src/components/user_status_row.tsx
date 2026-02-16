import React from 'react';

import {UserStatusInfo} from '../types';

interface Props {
    user: UserStatusInfo;
    onRemove: (userId: string) => void;
    onDragStart?: (e: React.DragEvent, userId: string) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDragOverRow?: (e: React.DragEvent, userId: string) => void;
    onDropRow?: (e: React.DragEvent, userId: string) => void;
    insertPosition?: 'above' | 'below' | null;
}

const STATUS_COLORS: Record<string, string> = {
    online: '#3DB887',
    away: '#FFBC1F',
    dnd: '#D24B4E',
    offline: '#B8B8B8',
};

const STATUS_LABELS: Record<string, string> = {
    online: 'Online',
    away: 'Away',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
};

function formatLastActivity(timestamp: number): string {
    if (!timestamp) {
        return '';
    }

    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function getDisplayName(user: UserStatusInfo): string {
    if (user.nickname) {
        return user.nickname;
    }
    if (user.first_name || user.last_name) {
        return `${user.first_name} ${user.last_name}`.trim();
    }
    return user.username;
}

const insertionLineStyle: React.CSSProperties = {
    height: '2px',
    backgroundColor: 'var(--button-bg)',
    margin: '0 16px',
    borderRadius: '1px',
};

const styles: Record<string, React.CSSProperties> = {
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        position: 'relative',
    },
    dragHandle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        marginRight: '6px',
        cursor: 'grab',
        opacity: 0,
        transition: 'opacity 0.15s',
        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
        fontSize: '10px',
        flexShrink: 0,
        userSelect: 'none' as const,
    },
    avatar: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        marginRight: '10px',
        position: 'relative',
        flexShrink: 0,
    },
    avatarImg: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        objectFit: 'cover' as const,
        display: 'block',
    },
    statusDot: {
        position: 'absolute',
        bottom: '-2px',
        right: '-2px',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: '2px solid var(--center-channel-bg)',
    },
    info: {
        flex: 1,
        minWidth: 0,
    },
    nameRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    name: {
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--center-channel-color)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    username: {
        fontSize: '12px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
    },
    statusLine: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '2px',
    },
    statusText: {
        fontSize: '12px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
    },
    customStatus: {
        fontSize: '12px',
        color: 'rgba(var(--center-channel-color-rgb), 0.72)',
    },
    lastActivity: {
        fontSize: '11px',
        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
    },
    removeButton: {
        position: 'absolute',
        top: '50%',
        right: '12px',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
        fontSize: '16px',
        padding: '4px',
        lineHeight: 1,
        opacity: 0,
        transition: 'opacity 0.15s',
    },
};

const UserStatusRow: React.FC<Props> = ({user, onRemove, onDragStart, onDragEnd, onDragOverRow, onDropRow, insertPosition}) => {
    const displayName = getDisplayName(user);
    const initials = displayName.charAt(0).toUpperCase();
    const statusColor = STATUS_COLORS[user.status] || STATUS_COLORS.offline;
    const statusLabel = STATUS_LABELS[user.status] || 'Offline';
    const lastActivity = user.status !== 'online' ? formatLastActivity(user.last_activity_at) : '';

    const handleClick = () => {
        const teamName = window.location.pathname.split('/')[1] || '';
        const dmPath = `/${teamName}/messages/@${user.username}`;
        const nav = (window as any).WebappUtils?.browserHistory;
        if (nav?.push) {
            nav.push(dmPath);
        } else {
            window.location.assign(dmPath);
        }
    };

    return (
        <div>
            {insertPosition === 'above' && <div style={insertionLineStyle}/>}
            <div
                style={styles.row}
                draggable={Boolean(onDragStart)}
                onDragStart={(e) => {
                    if (onDragStart) {
                        onDragStart(e, user.user_id);
                    }
                    e.currentTarget.style.opacity = '0.4';
                    document.body.style.cursor = 'grabbing';
                }}
                onDragEnd={(e) => {
                    e.currentTarget.style.opacity = '1';
                    document.body.style.cursor = '';
                    if (onDragEnd) {
                        onDragEnd(e);
                    }
                }}
                onDragOver={(e) => {
                    if (onDragOverRow) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        onDragOverRow(e, user.user_id);
                    }
                }}
                onDrop={(e) => {
                    if (onDropRow) {
                        e.preventDefault();
                        e.stopPropagation();
                        onDropRow(e, user.user_id);
                    }
                }}
                onClick={handleClick}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                        'rgba(var(--center-channel-color-rgb), 0.04)';
                    const btn = e.currentTarget.querySelector('[data-remove-btn]') as HTMLElement;
                    if (btn) {
                        btn.style.opacity = '1';
                    }
                    const handle = e.currentTarget.querySelector('[data-drag-handle]') as HTMLElement;
                    if (handle) {
                        handle.style.opacity = '1';
                    }
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    const btn = e.currentTarget.querySelector('[data-remove-btn]') as HTMLElement;
                    if (btn) {
                        btn.style.opacity = '0';
                    }
                    const handle = e.currentTarget.querySelector('[data-drag-handle]') as HTMLElement;
                    if (handle) {
                        handle.style.opacity = '0';
                    }
                }}
                title={`Message @${user.username}`}
            >
                {onDragStart && (
                    <div
                        data-drag-handle=""
                        style={styles.dragHandle}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {'⋮⋮'}
                    </div>
                )}

                <div style={styles.avatar}>
                    <img
                        style={styles.avatarImg}
                        src={`/api/v4/users/${user.user_id}/image?_=${user.last_activity_at || 0}`}
                        alt={initials}
                    />
                    <div
                        style={{
                            ...styles.statusDot,
                            backgroundColor: statusColor,
                        }}
                    />
                </div>

                <div style={styles.info}>
                    <div style={styles.nameRow}>
                        <span style={styles.name}>{displayName}</span>
                        {displayName !== user.username && (
                            <span style={styles.username}>@{user.username}</span>
                        )}
                    </div>
                    <div style={styles.statusLine}>
                        <span style={styles.statusText}>{statusLabel}</span>
                        {user.custom_status && (
                            <span style={styles.customStatus}>
                                {user.custom_emoji && `${user.custom_emoji} `}
                                {user.custom_status}
                            </span>
                        )}
                        {lastActivity && (
                            <span style={styles.lastActivity}>{lastActivity}</span>
                        )}
                    </div>
                </div>

                <button
                    data-remove-btn=""
                    style={styles.removeButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(user.user_id);
                    }}
                    title="Remove from watchlist"
                >
                    &times;
                </button>
            </div>
            {insertPosition === 'below' && <div style={insertionLineStyle}/>}
        </div>
    );
};

export default UserStatusRow;
