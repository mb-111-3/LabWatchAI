package main

import "time"

// Computer is real inventory. Status/CurrentUser/IsIdle are derived only from
// actual login/logout/heartbeat calls — nothing here is simulated.
type Computer struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Lab         string    `json:"lab"`
	OS          string    `json:"os"`
	IP          string    `json:"ip"`
	Status      string    `json:"status"` // "available" or "in-use", derived from CurrentUser
	CurrentUser string    `json:"currentUser"`
	IsIdle      bool      `json:"isIdle"`
	LastSeen    time.Time `json:"lastSeen"`
}

type Session struct {
	ID         string     `json:"id"`
	ComputerID string     `json:"computerId"`
	Name       string     `json:"name"`
	RollNumber string     `json:"rollNumber,omitempty"`
	Class      string     `json:"class,omitempty"`
	Batch      string     `json:"batch,omitempty"`
	IsGuest    bool       `json:"isGuest"`
	LoginTime  time.Time  `json:"loginTime"`
	LogoutTime *time.Time `json:"logoutTime,omitempty"`
}

type Alert struct {
	ID         string    `json:"id"`
	ComputerID string    `json:"computerId"`
	Type       string    `json:"type"`
	Severity   string    `json:"severity"`
	Message    string    `json:"message"`
	Timestamp  time.Time `json:"timestamp"`
}

type USBEvent struct {
	ID         string    `json:"id"`
	ComputerID string    `json:"computerId"`
	DeviceName string    `json:"deviceName"`
	VendorID   string    `json:"vendorId"`
	SerialNo   string    `json:"serialNo"`
	Action     string    `json:"action"`
	Timestamp  time.Time `json:"timestamp"`
}

type LoginRequest struct {
	ComputerID string `json:"computerId" binding:"required"`
	IsGuest    bool   `json:"isGuest"`
	Name       string `json:"name" binding:"required"`
	RollNumber string `json:"rollNumber"`
	Class      string `json:"class"`
	Batch      string `json:"batch"`
}

type CommandRequest struct {
	Action string `json:"action" binding:"required"` // lock, logoff — ends the real session
}

// HeartbeatRequest carries only genuinely observable signal: whether the
// browser tab has seen real mouse/keyboard input recently.
type HeartbeatRequest struct {
	Idle bool `json:"idle"`
}

type ActivityEvent struct {
	SessionID  string    `json:"sessionId"`
	ComputerID string    `json:"computerId"`
	Idle       bool      `json:"idle"`
	Timestamp  time.Time `json:"timestamp"`
}
