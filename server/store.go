package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	mu        sync.RWMutex
	computers map[string]*Computer
	sessions  map[string]*Session
	alerts    []*Alert
	usbEvents []*USBEvent
}

func NewStore() *Store {
	return &Store{
		computers: map[string]*Computer{},
		sessions:  map[string]*Session{},
	}
}

var labs = []string{"Lab A", "Lab B", "Lab C"}
var oses = []string{"Windows 11", "Ubuntu 22.04"}

// Seed registers the lab's computer inventory only — real hardware identity
// (name/lab/OS/IP), nothing simulated. Status starts "available" and only
// changes from real logins/logouts. No fake students, sessions, alerts, or
// USB events are created.
func (s *Store) Seed() {
	s.mu.Lock()
	defer s.mu.Unlock()

	names := []string{"PC-01", "PC-02", "PC-03", "PC-04", "PC-05", "PC-06", "PC-07", "PC-08", "PC-09", "PC-10", "PC-11", "PC-12"}

	for i, n := range names {
		id := uuid.NewString()
		lab := labs[i/4]
		os := oses[i%2]
		c := &Computer{
			ID:       id,
			Name:     n,
			Lab:      lab,
			OS:       os,
			IP:       fmt.Sprintf("192.168.1.%d", 10+i),
			Status:   "available",
			LastSeen: time.Now(),
		}
		s.computers[id] = c
	}
}

func (s *Store) ListComputers() []*Computer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Computer, 0, len(s.computers))
	for _, c := range s.computers {
		cp := *c
		out = append(out, &cp)
	}
	return out
}

func (s *Store) GetComputer(id string) (*Computer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.computers[id]
	if !ok {
		return nil, false
	}
	cp := *c
	return &cp, true
}

func (s *Store) ListSessions() []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		cp := *sess
		out = append(out, &cp)
	}
	return out
}

func (s *Store) ListAlerts() []*Alert {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Alert, len(s.alerts))
	copy(out, s.alerts)
	return out
}

func (s *Store) ListUSBEvents() []*USBEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*USBEvent, len(s.usbEvents))
	copy(out, s.usbEvents)
	return out
}

func (s *Store) AddAlert(a *Alert) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.alerts = append([]*Alert{a}, s.alerts...)
	if len(s.alerts) > 100 {
		s.alerts = s.alerts[:100]
	}
}

func (s *Store) AddUSBEvent(e *USBEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.usbEvents = append([]*USBEvent{e}, s.usbEvents...)
	if len(s.usbEvents) > 100 {
		s.usbEvents = s.usbEvents[:100]
	}
}

func (s *Store) UpdateComputer(id string, mutate func(c *Computer)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.computers[id]; ok {
		mutate(c)
		c.LastSeen = time.Now()
	}
}

func (s *Store) AddSession(sess *Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[sess.ID] = sess
}

func (s *Store) GetSession(id string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, false
	}
	cp := *sess
	return &cp, true
}

func (s *Store) EndSession(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, ok := s.sessions[id]; ok {
		now := time.Now()
		sess.LogoutTime = &now
	}
}
