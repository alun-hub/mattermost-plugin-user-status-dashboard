package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type WatchedUsers struct {
	UserIDs []string `json:"user_ids"`
}

type UserStatusInfo struct {
	UserID         string `json:"user_id"`
	Username       string `json:"username"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Nickname       string `json:"nickname"`
	Status         string `json:"status"`
	CustomStatus   string `json:"custom_status"`
	CustomEmoji    string `json:"custom_emoji"`
	LastActivityAt int64  `json:"last_activity_at"`
}

func (p *Plugin) initAPI() *mux.Router {
	router := mux.NewRouter()
	apiRouter := router.PathPrefix("/api/v1").Subrouter()

	apiRouter.HandleFunc("/watched-users", p.handleGetWatchedUsers).Methods(http.MethodGet)
	apiRouter.HandleFunc("/watched-users", p.handlePutWatchedUsers).Methods(http.MethodPut)
	apiRouter.HandleFunc("/statuses", p.handleGetStatuses).Methods(http.MethodGet)
	apiRouter.HandleFunc("/groups", p.handleSearchGroups).Methods(http.MethodGet)
	apiRouter.HandleFunc("/groups/{groupId}/members", p.handleGetGroupMembers).Methods(http.MethodGet)

	return router
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	p.router.ServeHTTP(w, r)
}

func (p *Plugin) kvKeyForUser(userID string) string {
	return "watched_" + userID
}

func (p *Plugin) handleGetWatchedUsers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	data, appErr := p.API.KVGet(p.kvKeyForUser(userID))
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	watched := WatchedUsers{UserIDs: []string{}}
	if data != nil {
		if err := json.Unmarshal(data, &watched); err != nil {
			http.Error(w, "Failed to parse stored data", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handlePutWatchedUsers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	var watched WatchedUsers
	if err := json.NewDecoder(r.Body).Decode(&watched); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	data, err := json.Marshal(watched)
	if err != nil {
		http.Error(w, "Failed to marshal data", http.StatusInternalServerError)
		return
	}

	if appErr := p.API.KVSet(p.kvKeyForUser(userID), data); appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handleGetStatuses(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	data, appErr := p.API.KVGet(p.kvKeyForUser(userID))
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	watched := WatchedUsers{UserIDs: []string{}}
	if data != nil {
		if err := json.Unmarshal(data, &watched); err != nil {
			http.Error(w, "Failed to parse stored data", http.StatusInternalServerError)
			return
		}
	}

	if len(watched.UserIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]UserStatusInfo{})
		return
	}

	statuses, appErr := p.API.GetUserStatusesByIds(watched.UserIDs)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	statusMap := make(map[string]*UserStatusInfo)
	for _, s := range statuses {
		statusMap[s.UserId] = &UserStatusInfo{
			UserID:         s.UserId,
			Status:         s.Status,
			LastActivityAt: s.LastActivityAt,
		}
	}

	result := make([]UserStatusInfo, 0, len(watched.UserIDs))
	for _, uid := range watched.UserIDs {
		info, ok := statusMap[uid]
		if !ok {
			info = &UserStatusInfo{
				UserID: uid,
				Status: "offline",
			}
		}

		user, appErr := p.API.GetUser(uid)
		if appErr == nil {
			info.Username = user.Username
			info.FirstName = user.FirstName
			info.LastName = user.LastName
			info.Nickname = user.Nickname

			if user.Props != nil {
				if csStr, ok := user.Props["customStatus"]; ok && csStr != "" {
					var customStatus map[string]interface{}
					if err := json.Unmarshal([]byte(csStr), &customStatus); err == nil {
						if text, ok := customStatus["text"].(string); ok {
							info.CustomStatus = text
						}
						if emoji, ok := customStatus["emoji"].(string); ok {
							info.CustomEmoji = emoji
						}
					}
				}
			}
		}

		result = append(result, *info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

type GroupInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	MemberCount int    `json:"member_count"`
}

func (p *Plugin) handleSearchGroups(w http.ResponseWriter, r *http.Request) {
	term := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	groups, appErr := p.API.GetGroupsBySource(model.GroupSourceCustom)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	var results []GroupInfo
	for _, g := range groups {
		if g.DeleteAt != 0 {
			continue
		}
		if term != "" {
			nameMatch := g.Name != nil && strings.Contains(strings.ToLower(*g.Name), term)
			displayMatch := strings.Contains(strings.ToLower(g.DisplayName), term)
			if !nameMatch && !displayMatch {
				continue
			}
		}

		name := ""
		if g.Name != nil {
			name = *g.Name
		}
		memberCount := 0
		if g.MemberCount != nil {
			memberCount = *g.MemberCount
		}

		results = append(results, GroupInfo{
			ID:          g.Id,
			Name:        name,
			DisplayName: g.DisplayName,
			MemberCount: memberCount,
		})
	}

	if results == nil {
		results = []GroupInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (p *Plugin) handleGetGroupMembers(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	groupID := vars["groupId"]

	users, appErr := p.API.GetGroupMemberUsers(groupID, 0, 200)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	userIDs := make([]string, 0, len(users))
	for _, u := range users {
		userIDs = append(userIDs, u.Id)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"user_ids": userIDs})
}
