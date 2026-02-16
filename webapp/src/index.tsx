import React from 'react';

import SidebarPanel from './components/sidebar_panel';
import {PluginRegistry, PluginStore} from './types';

const PLUGIN_ID = 'com.github.alun.user-status-dashboard';

let rhsShowAction: (() => void) | null = null;

const Icon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <circle cx="4" cy="5" r="2.5" />
        <circle cx="12" cy="5" r="2.5" />
        <path d="M0 12c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5" />
        <path d="M8 12c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5" />
        <circle cx="14" cy="3" r="1.5" fill="#4CAF50" />
    </svg>
);

export default class Plugin {
    public initialize(registry: PluginRegistry, store: PluginStore): void {
        const {id, showRHSAction} = registry.registerRightHandSidebarComponent(SidebarPanel);
        rhsShowAction = () => store.dispatch(showRHSAction);

        registry.registerChannelHeaderButtonAction(
            <Icon />,
            () => {
                if (rhsShowAction) {
                    rhsShowAction();
                }
            },
            'Status Dashboard',
            'Open User Status Dashboard',
        );
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(PLUGIN_ID, new Plugin());
