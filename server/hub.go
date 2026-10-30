package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func publish(hub *Hub, msgType string, data interface{}) {
	b, err := json.Marshal(WSMessage{Type: msgType, Data: data})
	if err != nil {
		return
	}
	select {
	case hub.Publish <- b:
	default:
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]bool
	Publish chan []byte
}

func NewHub() *Hub {
	return &Hub{
		clients: map[*websocket.Conn]bool{},
		Publish: make(chan []byte, 256),
	}
}

func (h *Hub) Run() {
	for msg := range h.Publish {
		h.mu.Lock()
		for c := range h.clients {
			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				c.Close()
				delete(h.clients, c)
			}
		}
		h.mu.Unlock()
	}
}

func serveWS(h *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}
	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()

	go func() {
		defer func() {
			h.mu.Lock()
			delete(h.clients, conn)
			h.mu.Unlock()
			conn.Close()
		}()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}
