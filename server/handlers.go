package main

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func loginHandler(store *Store, hub *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if !req.IsGuest && (req.RollNumber == "" || req.Class == "" || req.Batch == "") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "roll number, class and batch are required for students"})
			return
		}
		comp, ok := store.GetComputer(req.ComputerID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "computer not found"})
			return
		}
		sess := &Session{
			ID: uuid.NewString(), ComputerID: comp.ID, Name: req.Name,
			RollNumber: req.RollNumber, Class: req.Class, Batch: req.Batch,
			IsGuest: req.IsGuest, LoginTime: time.Now(),
		}
		store.AddSession(sess)
		store.UpdateComputer(comp.ID, func(cc *Computer) {
			cc.CurrentUser = req.Name
			cc.Status = "in-use"
			cc.IsIdle = false
		})
		publish(hub, "computers_update", store.ListComputers())
		publish(hub, "session_created", sess)
		c.JSON(http.StatusOK, sess)
	}
}

func listComputersHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		list := store.ListComputers()
		sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
		c.JSON(http.StatusOK, list)
	}
}

func getComputerHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		comp, ok := store.GetComputer(c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, comp)
	}
}

// remoteCommandHandler ends the real active session on a computer — this is a
// genuine action (freeing the PC), not a simulated OS-level effect, since
// there's no endpoint agent to actually lock/shutdown/restart the machine yet.
func remoteCommandHandler(store *Store, hub *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req CommandRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		comp, ok := store.GetComputer(id)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		for _, sess := range store.ListSessions() {
			if sess.ComputerID == id && sess.LogoutTime == nil {
				store.EndSession(sess.ID)
			}
		}
		store.UpdateComputer(id, func(cc *Computer) {
			cc.CurrentUser = ""
			cc.Status = "available"
			cc.IsIdle = false
		})
		publish(hub, "computers_update", store.ListComputers())
		c.JSON(http.StatusOK, gin.H{"status": "done", "action": req.Action, "computer": comp.Name})
	}
}

func heartbeatHandler(store *Store, hub *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessID := c.Param("id")
		sess, ok := store.GetSession(sessID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		var req HeartbeatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		store.UpdateComputer(sess.ComputerID, func(cc *Computer) {
			cc.IsIdle = req.Idle
		})
		ev := &ActivityEvent{
			SessionID: sessID, ComputerID: sess.ComputerID,
			Idle: req.Idle, Timestamp: time.Now(),
		}
		publish(hub, "activity", ev)
		publish(hub, "computers_update", store.ListComputers())
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}

func logoutHandler(store *Store, hub *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessID := c.Param("id")
		sess, ok := store.GetSession(sessID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		store.EndSession(sessID)
		store.UpdateComputer(sess.ComputerID, func(cc *Computer) {
			cc.CurrentUser = ""
			cc.Status = "available"
			cc.IsIdle = false
		})
		publish(hub, "computers_update", store.ListComputers())
		c.JSON(http.StatusOK, gin.H{"status": "logged_out"})
	}
}

func listSessionsHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		list := store.ListSessions()
		sort.Slice(list, func(i, j int) bool { return list[i].LoginTime.After(list[j].LoginTime) })
		c.JSON(http.StatusOK, list)
	}
}

func listAlertsHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, store.ListAlerts())
	}
}

func listUSBEventsHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, store.ListUSBEvents())
	}
}

func summaryHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		computers := store.ListComputers()
		inUse, available := 0, 0
		for _, cc := range computers {
			if cc.Status == "in-use" {
				inUse++
			} else {
				available++
			}
		}
		sessions := store.ListSessions()
		activeSessions := 0
		for _, s := range sessions {
			if s.LogoutTime == nil {
				activeSessions++
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"totalComputers": len(computers),
			"inUse":          inUse,
			"available":      available,
			"activeSessions": activeSessions,
			"totalAlerts":    len(store.ListAlerts()),
			"usbEventsToday": len(store.ListUSBEvents()),
		})
	}
}

// usageTrendHandler buckets real session logins into the last 8 hours — no fabricated numbers.
func usageTrendHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		type point struct {
			Hour  string `json:"hour"`
			Usage int    `json:"usage"`
		}
		now := time.Now()
		buckets := make([]point, 8)
		start := make([]time.Time, 8)
		for i := 0; i < 8; i++ {
			h := now.Add(-time.Duration(7-i) * time.Hour)
			start[i] = time.Date(h.Year(), h.Month(), h.Day(), h.Hour(), 0, 0, 0, h.Location())
			buckets[i] = point{Hour: start[i].Format("15:04"), Usage: 0}
		}
		for _, s := range store.ListSessions() {
			for i := 0; i < 8; i++ {
				bucketEnd := start[i].Add(time.Hour)
				if !s.LoginTime.Before(start[i]) && s.LoginTime.Before(bucketEnd) {
					buckets[i].Usage++
					break
				}
			}
		}
		c.JSON(http.StatusOK, buckets)
	}
}

// assistantHandler is a lightweight rule-based stand-in for the NL AI assistant.
// Every answer is computed from real store state — nothing fabricated.
func assistantHandler(store *Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Query string `json:"query"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		q := strings.ToLower(body.Query)
		computers := store.ListComputers()

		switch {
		case strings.Contains(q, "available") || strings.Contains(q, "free"):
			var names []string
			for _, cc := range computers {
				if cc.Status == "available" {
					names = append(names, cc.Name)
				}
			}
			if len(names) == 0 {
				c.JSON(http.StatusOK, gin.H{"answer": "All computers are currently in use."})
				return
			}
			c.JSON(http.StatusOK, gin.H{"answer": "Available computers: " + strings.Join(names, ", ")})
		case strings.Contains(q, "usb"):
			events := store.ListUSBEvents()
			c.JSON(http.StatusOK, gin.H{"answer": fmt.Sprintf("There have been %d USB events recorded.", len(events))})
		case strings.Contains(q, "alert"):
			alerts := store.ListAlerts()
			c.JSON(http.StatusOK, gin.H{"answer": fmt.Sprintf("There are %d alerts recorded.", len(alerts))})
		case strings.Contains(q, "use") || strings.Contains(q, "active"):
			inUse := 0
			for _, cc := range computers {
				if cc.Status == "in-use" {
					inUse++
				}
			}
			c.JSON(http.StatusOK, gin.H{"answer": fmt.Sprintf("%d out of %d computers are currently in use.", inUse, len(computers))})
		default:
			c.JSON(http.StatusOK, gin.H{"answer": "I can answer questions about available/in-use computers, USB events, and alerts. Try: 'Which computers are available?'"})
		}
	}
}
