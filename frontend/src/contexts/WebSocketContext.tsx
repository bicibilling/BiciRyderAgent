import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

interface ConversationEvent {
  type: string
  conversationId: string
  data: any
  timestamp: string
}

interface ActiveConversation {
  id: string
  customerPhone: string
  status: string
  startedAt: string
  isHumanTakeover: boolean
  duration?: number
  lastEvent?: any
}

interface WebSocketContextType {
  isConnected: boolean
  activeConversations: Map<string, ActiveConversation>
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  subscribeToConversation: (conversationId: string) => void
  unsubscribeFromConversation: (conversationId: string) => void
  sendMessage: (conversationId: string, message: string, type?: string) => void
  takeoverConversation: (conversationId: string) => void
  releaseConversation: (conversationId: string) => void
  addEventListener: (eventType: string, handler: (event: ConversationEvent) => void) => void
  removeEventListener: (eventType: string, handler: (event: ConversationEvent) => void) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

interface WebSocketProviderProps {
  children: ReactNode
}

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3001'

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const [activeConversations, setActiveConversations] = useState<Map<string, ActiveConversation>>(new Map())
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number>()
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  const eventListenersRef = useRef<Map<string, Set<(event: ConversationEvent) => void>>>(new Map())

  const connect = () => {
    if (!isAuthenticated || !token) {
      console.log('Not authenticated, skipping WebSocket connection')
      return
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected or connecting')
      return
    }

    try {
      setConnectionStatus('connecting')
      const wsUrl = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setConnectionStatus('connected')
        reconnectAttempts.current = 0
        
        // Send initial connection message
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'dashboard_connect',
            organizationId: user?.organizationId,
            sessionId: `dashboard-${Date.now()}`
          }))
        }

        toast.success('Dashboard connected to real-time updates')
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        setConnectionStatus('disconnected')
        
        if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect()
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionStatus('error')
        setIsConnected(false)
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setConnectionStatus('error')
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect')
      wsRef.current = null
    }
    
    setIsConnected(false)
    setConnectionStatus('disconnected')
    setActiveConversations(new Map())
  }

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000) // Exponential backoff, max 30s
    reconnectAttempts.current++

    console.log(`Scheduling reconnect attempt ${reconnectAttempts.current} in ${delay}ms`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isAuthenticated && reconnectAttempts.current <= maxReconnectAttempts) {
        connect()
      }
    }, delay)
  }

  const handleWebSocketMessage = (data: any) => {
    const event: ConversationEvent = {
      type: data.type,
      conversationId: data.conversationId || data.leadId,
      data: data,
      timestamp: data.timestamp || new Date().toISOString()
    }

    // Update active conversations
    if (data.type === 'conversation_event' || data.type === 'conversation_update') {
      setActiveConversations(prev => {
        const updated = new Map(prev)
        const conversationId = event.conversationId
        
        if (conversationId) {
          const existing = updated.get(conversationId)
          updated.set(conversationId, {
            id: conversationId,
            customerPhone: data.customerPhone || existing?.customerPhone || 'Unknown',
            status: data.status || existing?.status || 'active',
            startedAt: data.startedAt || existing?.startedAt || new Date().toISOString(),
            isHumanTakeover: data.isHumanTakeover ?? existing?.isHumanTakeover ?? false,
            duration: data.duration ?? existing?.duration,
            lastEvent: data
          })
        }
        
        return updated
      })
    }

    // Handle conversation ended
    if (data.type === 'conversation_ended' && event.conversationId) {
      setActiveConversations(prev => {
        const updated = new Map(prev)
        updated.delete(event.conversationId)
        return updated
      })
    }

    // Dispatch to event listeners
    const listeners = eventListenersRef.current.get(event.type) || new Set()
    const allListeners = eventListenersRef.current.get('*') || new Set()
    
    listeners.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.error('Error in WebSocket event handler:', error)
      }
    })
    
    allListeners.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.error('Error in WebSocket event handler:', error)
      }
    })
  }

  const sendMessage = (conversationId: string, message: string, type: string = 'user_message') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected to server')
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'send_message',
      conversationId,
      messageType: type,
      message
    }))
  }

  const subscribeToConversation = (conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'subscribe_conversation',
      conversationId
    }))
  }

  const unsubscribeFromConversation = (conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'unsubscribe_conversation',
      conversationId
    }))
  }

  const takeoverConversation = (conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected to server')
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'takeover_conversation',
      conversationId,
      agentName: user?.name || user?.email || 'Human Agent'
    }))
  }

  const releaseConversation = (conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected to server')
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'release_conversation',
      conversationId
    }))
  }

  const addEventListener = (eventType: string, handler: (event: ConversationEvent) => void) => {
    if (!eventListenersRef.current.has(eventType)) {
      eventListenersRef.current.set(eventType, new Set())
    }
    eventListenersRef.current.get(eventType)!.add(handler)
  }

  const removeEventListener = (eventType: string, handler: (event: ConversationEvent) => void) => {
    const listeners = eventListenersRef.current.get(eventType)
    if (listeners) {
      listeners.delete(handler)
    }
  }

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [isAuthenticated, token])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  const value: WebSocketContextType = {
    isConnected,
    activeConversations,
    connectionStatus,
    subscribeToConversation,
    unsubscribeFromConversation,
    sendMessage,
    takeoverConversation,
    releaseConversation,
    addEventListener,
    removeEventListener
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}