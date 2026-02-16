package main

import (
	"sync"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type Plugin struct {
	plugin.MattermostPlugin
	configurationLock sync.RWMutex
	configuration     *configuration
	router            *mux.Router
}

func (p *Plugin) OnActivate() error {
	p.router = p.initAPI()

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "statusdashboard",
		DisplayName:      "User Status Dashboard",
		Description:      "Open the User Status Dashboard panel",
		AutoComplete:     true,
		AutoCompleteDesc: "Open the status dashboard in the right sidebar",
	}); err != nil {
		return err
	}

	return nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, error) {
	return &model.CommandResponse{}, nil
}

func main() {
	plugin.ClientMain(&Plugin{})
}
