export interface UserStatusInfo {
    user_id: string;
    username: string;
    first_name: string;
    last_name: string;
    nickname: string;
    status: 'online' | 'away' | 'dnd' | 'offline';
    custom_status: string;
    custom_emoji: string;
    last_activity_at: number;
}

export interface Folder {
    id: string;
    name: string;
    user_ids: string[];
}

export interface WatchedGroup {
    group_id: string;
    display_name: string;
}

export interface WatchedUsersV2 {
    version: number;
    user_ids: string[];
    folders: Folder[];
    groups: WatchedGroup[];
}

export interface FolderWithStatuses {
    id: string;
    name: string;
    users: UserStatusInfo[];
}

export interface GroupWithStatuses {
    group_id: string;
    display_name: string;
    users: UserStatusInfo[];
}

export interface StatusResponse {
    uncategorized: UserStatusInfo[];
    folders: FolderWithStatuses[];
    groups: GroupWithStatuses[];
}

export interface WatchedUsers {
    user_ids: string[];
}

export interface PluginRegistry {
    registerRightHandSidebarComponent(component: React.ComponentType<any>): { id: string; showRHSAction: () => void };
    registerChannelHeaderButtonAction(icon: React.ReactNode, action: () => void, dropdownText: string, tooltipText: string): void;
    registerWebSocketEventHandler(event: string, handler: (msg: any) => void): void;
    registerReconnectHandler(handler: () => void): void;
}

export interface PluginStore {
    dispatch: (action: any) => void;
    getState: () => any;
}
