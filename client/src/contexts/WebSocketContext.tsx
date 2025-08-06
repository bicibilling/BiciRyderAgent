import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';

export interface ConversationEvent {
  type: string;
  conversationId?: string;
  eventData?: any;
  timestamp: string;
  [key: string]: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  activeConversations: Map<string, any>;
  subscribeToConversation: (conversationId: string) => void;
  unsubscribeFromConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, message: string, messageType?: string) => void;
  takeoverConversation: (conversationId: string, agentName?: string) => void;
  releaseConversation: (conversationId: string) => void;
  addEventListener: (eventType: string, handler: (event: ConversationEvent) => void) => void;
  removeEventListener: (eventType: string, handler: (event: ConversationEvent) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

const WS_BASE_URL = process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:3001';

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [activeConversations, setActiveConversations] = useState<Map<string, any>>(new Map());
  
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<(event: ConversationEvent) => void>>>(new Map());
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  // Connect to WebSocket when user is authenticated
  useEffect(() => {
    if (user && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user, token]);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    if (!token || !user) {
      console.warn('Cannot connect WebSocket: No authentication');
      return;
    }

    try {
      setConnectionStatus('connecting');
      
      const wsUrl = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        
        toast.success('Dashboard connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: ConversationEvent = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        if (!event.wasClean && reconnectAttempts.current < maxReconnectAttempts) {
          attemptReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        toast.error('Dashboard connection error');
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  const disconnect = () => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User logout');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus('disconnected');
    setActiveConversations(new Map());
  };

  const attemptReconnect = () => {
    reconnectAttempts.current++;
    const delay = Math.pow(2, reconnectAttempts.current) * 1000; // Exponential backoff

    console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts}) in ${delay}ms`);
    
    reconnectTimeout.current = setTimeout(() => {
      if (user && token) {
        connect();
      }
    }, delay);
  };

  const handleWebSocketMessage = (data: ConversationEvent) => {
    console.log('WebSocket message received:', data.type);

    // Update active conversations based on message type
    switch (data.type) {
      case 'dashboard_connected':
        console.log('Dashboard connected with session:', data.sessionId);
        break;

      case 'new_conversation':
        if (data.conversationId) {
          setActiveConversations(prev => new Map(prev.set(data.conversationId!, data)));
          toast.success(`New conversation started: ${data.customerPhone}`);
        }
        break;

      case 'conversation_ended':
        if (data.conversationId) {
          setActiveConversations(prev => {
            const newMap = new Map(prev);
            newMap.delete(data.conversationId!);
            return newMap;
          });
          toast.info(`Conversation ended: ${data.conversationId}`);
        }
        break;

      case 'conversation_event':
        if (data.conversationId) {
          setActiveConversations(prev => {
            const conversation = prev.get(data.conversationId!);
            if (conversation) {
              const updated = { ...conversation, lastEvent: data.eventData, lastEventAt: data.timestamp };
              return new Map(prev.set(data.conversationId!, updated));
            }
            return prev;
          });
        }
        break;

      case 'conversation_takeover':
        if (data.conversationId) {
          setActiveConversations(prev => {
            const conversation = prev.get(data.conversationId!);
            if (conversation) {
              const updated = { ...conversation, isHumanTakeover: true, humanAgent: data.agentName };
              return new Map(prev.set(data.conversationId!, updated));
            }
            return prev;
          });
          toast.info(`Conversation taken over by ${data.agentName}`);
        }
        break;

      case 'conversation_released':
        if (data.conversationId) {
          setActiveConversations(prev => {
            const conversation = prev.get(data.conversationId!);
            if (conversation) {
              const updated = { ...conversation, isHumanTakeover: false, humanAgent: null };
              return new Map(prev.set(data.conversationId!, updated));
            }
            return prev;
          });
          toast.info('Conversation released back to AI');
        }
        break;

      case 'human_takeover_requested':
        toast.error(`Human takeover requested for conversation ${data.conversationId}`, {
          duration: 10000
        });
        break;

      case 'error':
        toast.error(data.message || 'Dashboard error');
        break;
    }

    // Trigger event handlers
    triggerEventHandlers(data.type, data);
    triggerEventHandlers('*', data); // Wildcard handlers
  };

  const sendWebSocketMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
      toast.error('Dashboard not connected');
    }
  };

  const subscribeToConversation = (conversationId: string) => {
    sendWebSocketMessage({
      type: 'subscribe_conversation',
      conversationId
    });
  };

  const unsubscribeFromConversation = (conversationId: string) => {
    sendWebSocketMessage({
      type: 'unsubscribe_conversation',
      conversationId
    });
  };

  const sendMessage = (conversationId: string, message: string, messageType: string = 'text') => {
    sendWebSocketMessage({
      type: 'send_human_message',
      conversationId,
      message,
      messageType
    });
  };

  const takeoverConversation = (conversationId: string, agentName?: string) => {
    sendWebSocketMessage({
      type: 'takeover_conversation',
      conversationId,
      agentName: agentName || user?.email
    });
  };

  const releaseConversation = (conversationId: string) => {
    sendWebSocketMessage({
      type: 'release_conversation',
      conversationId
    });
  };

  const addEventListener = (eventType: string, handler: (event: ConversationEvent) => void) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    eventHandlersRef.current.get(eventType)!.add(handler);
  };

  const removeEventListener = (eventType: string, handler: (event: ConversationEvent) => void) => {
    const handlers = eventHandlersRef.current.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        eventHandlersRef.current.delete(eventType);
      }
    }
  };

  const triggerEventHandlers = (eventType: string, event: ConversationEvent) => {
    const handlers = eventHandlersRef.current.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Event handler error:', error);
        }
      });
    }
  };

  const value: WebSocketContextType = {
    isConnected,
    connectionStatus,
    activeConversations,
    subscribeToConversation,
    unsubscribeFromConversation,
    sendMessage,
    takeoverConversation,
    releaseConversation,
    addEventListener,
    removeEventListener,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};