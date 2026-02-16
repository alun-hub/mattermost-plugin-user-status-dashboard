import React, {useCallback, useEffect, useRef, useState} from 'react';

const PLUGIN_ID = 'com.github.alun.user-status-dashboard';

interface Props {
    onClose: () => void;
    onUserAdded: () => void;
    currentUserIds: string[];
}

interface SearchResult {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    nickname: string;
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
    },
    modal: {
        backgroundColor: 'var(--center-channel-bg)',
        borderRadius: '8px',
        width: '480px',
        maxHeight: '500px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.24)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: 'var(--center-channel-color)',
        margin: 0,
    },
    closeButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '20px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        padding: '4px',
    },
    searchContainer: {
        padding: '12px 20px',
    },
    searchInput: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        borderRadius: '4px',
        fontSize: '14px',
        backgroundColor: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        outline: 'none',
        boxSizing: 'border-box',
    },
    results: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 8px 8px',
    },
    resultItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        cursor: 'pointer',
        borderRadius: '4px',
        transition: 'background-color 0.15s',
    },
    resultAvatar: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        backgroundColor: 'rgba(var(--center-channel-color-rgb), 0.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 600,
        marginRight: '10px',
        flexShrink: 0,
    },
    resultInfo: {
        flex: 1,
    },
    resultName: {
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--center-channel-color)',
    },
    resultUsername: {
        fontSize: '12px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
    },
    alreadyAdded: {
        fontSize: '12px',
        color: 'rgba(var(--center-channel-color-rgb), 0.40)',
        fontStyle: 'italic',
    },
    noResults: {
        padding: '20px',
        textAlign: 'center',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontSize: '14px',
    },
};

function getDisplayName(user: SearchResult): string {
    if (user.nickname) {
        return user.nickname;
    }
    if (user.first_name || user.last_name) {
        return `${user.first_name} ${user.last_name}`.trim();
    }
    return user.username;
}

const UserSelector: React.FC<Props> = ({onClose, onUserAdded, currentUserIds}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const searchUsers = useCallback(async (term: string) => {
        if (term.length < 2) {
            setResults([]);
            return;
        }

        setSearching(true);
        try {
            const resp = await fetch('/api/v4/users/autocomplete?name=' + encodeURIComponent(term), {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (resp.ok) {
                const data = await resp.json();
                setResults(data.users || []);
            }
        } catch (err) {
            // Silently handle errors
        } finally {
            setSearching(false);
        }
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            searchUsers(value);
        }, 300);
    }, [searchUsers]);

    const handleAddUser = useCallback(async (userId: string) => {
        if (currentUserIds.includes(userId)) {
            return;
        }

        try {
            const resp = await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
            });
            if (!resp.ok) {
                return;
            }
            const data = await resp.json();
            const userIds: string[] = data.user_ids || [];

            if (!userIds.includes(userId)) {
                userIds.push(userId);
            }

            await fetch(`/plugins/${PLUGIN_ID}/api/v1/watched-users`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({user_ids: userIds}),
            });

            onUserAdded();
            onClose();
        } catch (err) {
            // Silently handle errors
        }
    }, [currentUserIds, onUserAdded, onClose]);

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Add User to Watch</h3>
                    <button style={styles.closeButton} onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div style={styles.searchContainer}>
                    <input
                        ref={inputRef}
                        style={styles.searchInput}
                        type="text"
                        placeholder="Search for a user..."
                        value={query}
                        onChange={handleInputChange}
                    />
                </div>

                <div style={styles.results}>
                    {searching && (
                        <div style={styles.noResults}>Searching...</div>
                    )}

                    {!searching && query.length >= 2 && results.length === 0 && (
                        <div style={styles.noResults}>No users found</div>
                    )}

                    {!searching && results.map((user) => {
                        const isAdded = currentUserIds.includes(user.id);
                        const displayName = getDisplayName(user);
                        const initial = displayName.charAt(0).toUpperCase();

                        return (
                            <div
                                key={user.id}
                                style={{
                                    ...styles.resultItem,
                                    opacity: isAdded ? 0.5 : 1,
                                    cursor: isAdded ? 'default' : 'pointer',
                                }}
                                onClick={() => handleAddUser(user.id)}
                                onMouseEnter={(e) => {
                                    if (!isAdded) {
                                        (e.currentTarget as HTMLElement).style.backgroundColor =
                                            'rgba(var(--center-channel-color-rgb), 0.08)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                }}
                            >
                                <div style={styles.resultAvatar}>{initial}</div>
                                <div style={styles.resultInfo}>
                                    <div style={styles.resultName}>{displayName}</div>
                                    <div style={styles.resultUsername}>@{user.username}</div>
                                </div>
                                {isAdded && (
                                    <span style={styles.alreadyAdded}>Already watching</span>
                                )}
                            </div>
                        );
                    })}

                    {!searching && query.length < 2 && (
                        <div style={styles.noResults}>
                            Type at least 2 characters to search
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserSelector;
