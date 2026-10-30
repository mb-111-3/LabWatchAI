package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	store := NewStore()
	store.Seed()

	hub := NewHub()
	go hub.Run()

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization"},
	}))

	api := r.Group("/api")
	{
		api.POST("/login", loginHandler(store, hub))
		api.POST("/sessions/:id/heartbeat", heartbeatHandler(store, hub))
		api.POST("/sessions/:id/logout", logoutHandler(store, hub))
		api.GET("/computers", listComputersHandler(store))
		api.GET("/computers/:id", getComputerHandler(store))
		api.POST("/computers/:id/command", remoteCommandHandler(store, hub))
		api.GET("/sessions", listSessionsHandler(store))
		api.GET("/alerts", listAlertsHandler(store))
		api.GET("/usb-events", listUSBEventsHandler(store))
		api.GET("/stats/summary", summaryHandler(store))
		api.GET("/stats/usage-trend", usageTrendHandler(store))
		api.POST("/assistant/query", assistantHandler(store))
	}

	r.GET("/ws", func(c *gin.Context) {
		serveWS(hub, c.Writer, c.Request)
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now()})
	})

	log.Println("LabWatch AI server listening on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
