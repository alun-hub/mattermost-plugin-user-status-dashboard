package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// Legacy type for migration
type WatchedUsers struct {
	UserIDs []string `json:"user_ids"`
}

type WatchedUsersV2 struct {
	Version int            `json:"version"`
	UserIDs []string       `json:"user_ids"`
	Folders []Folder       `json:"folders"`
	Groups  []WatchedGroup `json:"groups"`
}

type Folder struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	UserIDs []string `json:"user_ids"`
}

type WatchedGroup struct {
	GroupID     string `json:"group_id"`
	DisplayName string `json:"display_name"`
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

type FolderWithStatuses struct {
	ID    string           `json:"id"`
	Name  string           `json:"name"`
	Users []UserStatusInfo `json:"users"`
}

type GroupWithStatuses struct {
	GroupID     string           `json:"group_id"`
	DisplayName string           `json:"display_name"`
	Users       []UserStatusInfo `json:"users"`
}

type StatusResponse struct {
	Uncategorized []UserStatusInfo    `json:"uncategorized"`
	Folders       []FolderWithStatuses `json:"folders"`
	Groups        []GroupWithStatuses  `json:"groups"`
}

type GroupInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	MemberCount int    `json:"member_count"`
}

func (p *Plugin) initAPI() *mux.Router {
	router := mux.NewRouter()
	apiRouter := router.PathPrefix("/api/v1").Subrouter()

	apiRouter.HandleFunc("/watched-users", p.handleGetWatchedUsers).Methods(http.MethodGet)
	apiRouter.HandleFunc("/watched-users", p.handlePutWatchedUsers).Methods(http.MethodPut)
	apiRouter.HandleFunc("/statuses", p.handleGetStatuses).Methods(http.MethodGet)
	apiRouter.HandleFunc("/groups", p.handleSearchGroups).Methods(http.MethodGet)
	apiRouter.HandleFunc("/groups/{groupId}/members", p.handleGetGroupMembers).Methods(http.MethodGet)

	apiRouter.HandleFunc("/folders", p.handleCreateFolder).Methods(http.MethodPost)
	apiRouter.HandleFunc("/folders/{folderId}", p.handleUpdateFolder).Methods(http.MethodPut)
	apiRouter.HandleFunc("/folders/{folderId}", p.handleDeleteFolder).Methods(http.MethodDelete)

	apiRouter.HandleFunc("/watched-groups", p.handleAddWatchedGroup).Methods(http.MethodPost)
	apiRouter.HandleFunc("/watched-groups/{groupId}", p.handleDeleteWatchedGroup).Methods(http.MethodDelete)

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

// migrateToV2 parses raw KV data, handling both legacy and V2 formats.
func migrateToV2(raw []byte) WatchedUsersV2 {
	if raw == nil {
		return WatchedUsersV2{
			Version: 2,
			UserIDs: []string{},
			Folders: []Folder{},
			Groups:  []WatchedGroup{},
		}
	}

	// Try V2 first
	var v2 WatchedUsersV2
	if err := json.Unmarshal(raw, &v2); err == nil && v2.Version == 2 {
		if v2.UserIDs == nil {
			v2.UserIDs = []string{}
		}
		if v2.Folders == nil {
			v2.Folders = []Folder{}
		}
		if v2.Groups == nil {
			v2.Groups = []WatchedGroup{}
		}
		for i := range v2.Folders {
			if v2.Folders[i].UserIDs == nil {
				v2.Folders[i].UserIDs = []string{}
			}
		}
		return v2
	}

	// Legacy format
	var legacy WatchedUsers
	if err := json.Unmarshal(raw, &legacy); err != nil {
		return WatchedUsersV2{
			Version: 2,
			UserIDs: []string{},
			Folders: []Folder{},
			Groups:  []WatchedGroup{},
		}
	}

	ids := legacy.UserIDs
	if ids == nil {
		ids = []string{}
	}
	return WatchedUsersV2{
		Version: 2,
		UserIDs: ids,
		Folders: []Folder{},
		Groups:  []WatchedGroup{},
	}
}

func (p *Plugin) getWatchedV2(userID string) (WatchedUsersV2, error) {
	data, appErr := p.API.KVGet(p.kvKeyForUser(userID))
	if appErr != nil {
		return WatchedUsersV2{}, appErr
	}
	return migrateToV2(data), nil
}

func (p *Plugin) saveWatchedV2(userID string, watched WatchedUsersV2) error {
	watched.Version = 2
	data, err := json.Marshal(watched)
	if err != nil {
		return err
	}
	if appErr := p.API.KVSet(p.kvKeyForUser(userID), data); appErr != nil {
		return appErr
	}
	return nil
}

func validateFolderName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", false
	}
	if utf8.RuneCountInString(name) > 64 {
		return "", false
	}
	// Reject control chars (0-31) except tab (9), and null bytes
	for _, r := range name {
		if r == 0 {
			return "", false
		}
		if r < 32 && r != 9 {
			return "", false
		}
	}
	return name, true
}

func validateWatchedUsersV2(w *WatchedUsersV2) bool {
	if len(w.Folders) > 50 {
		return false
	}
	if len(w.Groups) > 20 {
		return false
	}
	for i := range w.Folders {
		if w.Folders[i].ID == "" {
			return false
		}
		name, ok := validateFolderName(w.Folders[i].Name)
		if !ok {
			return false
		}
		w.Folders[i].Name = name
	}
	return true
}

func (p *Plugin) handleGetWatchedUsers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handlePutWatchedUsers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	var watched WatchedUsersV2
	if err := json.NewDecoder(r.Body).Decode(&watched); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if watched.UserIDs == nil {
		watched.UserIDs = []string{}
	}
	if watched.Folders == nil {
		watched.Folders = []Folder{}
	}
	if watched.Groups == nil {
		watched.Groups = []WatchedGroup{}
	}
	for i := range watched.Folders {
		if watched.Folders[i].UserIDs == nil {
			watched.Folders[i].UserIDs = []string{}
		}
	}

	if !validateWatchedUsersV2(&watched) {
		http.Error(w, "Validation failed", http.StatusBadRequest)
		return
	}

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) buildUserStatusInfo(userIDs []string, statusMap map[string]*UserStatusInfo, userMap map[string]*model.User) []UserStatusInfo {
	result := make([]UserStatusInfo, 0, len(userIDs))
	for _, uid := range userIDs {
		info, ok := statusMap[uid]
		if !ok {
			info = &UserStatusInfo{
				UserID: uid,
				Status: "offline",
			}
		}

		if user, ok := userMap[uid]; ok {
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
	return result
}

func (p *Plugin) handleGetStatuses(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Collect all unique user IDs
	allIDSet := make(map[string]bool)
	for _, id := range watched.UserIDs {
		allIDSet[id] = true
	}
	for _, f := range watched.Folders {
		for _, id := range f.UserIDs {
			allIDSet[id] = true
		}
	}

	// Collect group member IDs
	type groupMembers struct {
		groupID string
		userIDs []string
	}
	var groupMembersList []groupMembers
	for _, g := range watched.Groups {
		members, appErr := p.API.GetGroupMemberUsers(g.GroupID, 0, 200)
		if appErr != nil {
			// Group might have been deleted — show empty
			groupMembersList = append(groupMembersList, groupMembers{groupID: g.GroupID, userIDs: []string{}})
			continue
		}
		ids := make([]string, 0, len(members))
		for _, m := range members {
			ids = append(ids, m.Id)
			allIDSet[m.Id] = true
		}
		groupMembersList = append(groupMembersList, groupMembers{groupID: g.GroupID, userIDs: ids})
	}

	// Build flat list for batch API calls
	allIDs := make([]string, 0, len(allIDSet))
	for id := range allIDSet {
		allIDs = append(allIDs, id)
	}

	response := StatusResponse{
		Uncategorized: []UserStatusInfo{},
		Folders:       []FolderWithStatuses{},
		Groups:        []GroupWithStatuses{},
	}

	if len(allIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	// Batch fetch statuses and user info
	statuses, appErr := p.API.GetUserStatusesByIds(allIDs)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	statusMap := make(map[string]*UserStatusInfo, len(statuses))
	for _, s := range statuses {
		statusMap[s.UserId] = &UserStatusInfo{
			UserID:         s.UserId,
			Status:         s.Status,
			LastActivityAt: s.LastActivityAt,
		}
	}

	users, appErr := p.API.GetUsersByIds(allIDs)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	userMap := make(map[string]*model.User, len(users))
	for _, u := range users {
		userMap[u.Id] = u
	}

	// Build response
	response.Uncategorized = p.buildUserStatusInfo(watched.UserIDs, statusMap, userMap)

	for _, f := range watched.Folders {
		response.Folders = append(response.Folders, FolderWithStatuses{
			ID:    f.ID,
			Name:  f.Name,
			Users: p.buildUserStatusInfo(f.UserIDs, statusMap, userMap),
		})
	}

	for i, g := range watched.Groups {
		memberIDs := []string{}
		if i < len(groupMembersList) {
			memberIDs = groupMembersList[i].userIDs
		}
		response.Groups = append(response.Groups, GroupWithStatuses{
			GroupID:     g.GroupID,
			DisplayName: g.DisplayName,
			Users:       p.buildUserStatusInfo(memberIDs, statusMap, userMap),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (p *Plugin) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	name, ok := validateFolderName(body.Name)
	if !ok {
		http.Error(w, "Invalid folder name", http.StatusBadRequest)
		return
	}

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(watched.Folders) >= 50 {
		http.Error(w, "Maximum number of folders reached", http.StatusBadRequest)
		return
	}

	folder := Folder{
		ID:      uuid.New().String(),
		Name:    name,
		UserIDs: []string{},
	}
	watched.Folders = append(watched.Folders, folder)

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handleUpdateFolder(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	folderID := mux.Vars(r)["folderId"]

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	name, ok := validateFolderName(body.Name)
	if !ok {
		http.Error(w, "Invalid folder name", http.StatusBadRequest)
		return
	}

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	found := false
	for i := range watched.Folders {
		if watched.Folders[i].ID == folderID {
			watched.Folders[i].Name = name
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Folder not found", http.StatusNotFound)
		return
	}

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handleDeleteFolder(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	folderID := mux.Vars(r)["folderId"]

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	found := false
	for i, f := range watched.Folders {
		if f.ID == folderID {
			// Move folder's users to uncategorized
			watched.UserIDs = append(watched.UserIDs, f.UserIDs...)
			watched.Folders = append(watched.Folders[:i], watched.Folders[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Folder not found", http.StatusNotFound)
		return
	}

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handleAddWatchedGroup(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")

	var body struct {
		GroupID     string `json:"group_id"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.GroupID == "" {
		http.Error(w, "group_id is required", http.StatusBadRequest)
		return
	}

	// Validate group exists
	_, appErr := p.API.GetGroup(body.GroupID)
	if appErr != nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(watched.Groups) >= 20 {
		http.Error(w, "Maximum number of watched groups reached", http.StatusBadRequest)
		return
	}

	// Check if already watching
	for _, g := range watched.Groups {
		if g.GroupID == body.GroupID {
			http.Error(w, "Group already watched", http.StatusConflict)
			return
		}
	}

	watched.Groups = append(watched.Groups, WatchedGroup{
		GroupID:     body.GroupID,
		DisplayName: body.DisplayName,
	})

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
}

func (p *Plugin) handleDeleteWatchedGroup(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	groupID := mux.Vars(r)["groupId"]

	watched, err := p.getWatchedV2(userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	found := false
	for i, g := range watched.Groups {
		if g.GroupID == groupID {
			watched.Groups = append(watched.Groups[:i], watched.Groups[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	if err := p.saveWatchedV2(userID, watched); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(watched)
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
