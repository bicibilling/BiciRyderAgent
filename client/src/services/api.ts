import axios from 'axios';
import { Lead, Conversation, DashboardStats } from '../types';

const API_BASE = typeof window !== 'undefined' && window.location.origin
  ? `${window.location.origin}/api`
  : '/api';

const ORGANIZATION_ID = 'b0c1b1c1-0000-0000-0000-000000000001';

// Configure axios defaults
axios.defaults.headers.common['X-Organization-Id'] = ORGANIZATION_ID;

// Lead API
export const leadAPI = {
  getAll: async (): Promise<Lead[]> => {
    const response = await axios.get(`${API_BASE}/leads`);
    return response.data;
  },
  
  getById: async (id: string): Promise<Lead> => {
    const response = await axios.get(`${API_BASE}/leads/${id}`);
    return response.data;
  }
};

// Conversation API
export const conversationAPI = {
  getByLeadId: async (leadId: string): Promise<Conversation[]> => {
    const response = await axios.get(`${API_BASE}/conversations/${leadId}`);
    return response.data;
  }
};

// Human Control API
export const humanControlAPI = {
  join: async (leadId: string, agentName: string = 'Agent') => {
    const response = await axios.post(`${API_BASE}/human-control/join`, {
      leadId,
      agentName
    });
    return response.data;
  },
  
  leave: async (leadId: string) => {
    const response = await axios.post(`${API_BASE}/human-control/leave`, {
      leadId
    });
    return response.data;
  },
  
  sendMessage: async (leadId: string, message: string, phoneNumber: string) => {
    const response = await axios.post(`${API_BASE}/human-control/send-message`, {
      leadId,
      message,
      phoneNumber
    });
    return response.data;
  }
};

// Call API
export const callAPI = {
  initiateOutbound: async (phoneNumber: string, leadId: string) => {
    const response = await axios.post(`${API_BASE}/elevenlabs/outbound-call`, {
      phoneNumber,
      leadId
    });
    return response.data;
  }
};

// SMS API
export const smsAPI = {
  send: async (phoneNumber: string, message: string) => {
    const response = await axios.post(`${API_BASE}/sms/send`, {
      phoneNumber,
      message
    });
    return response.data;
  }
};

// Dashboard API
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await axios.get(`${API_BASE}/dashboard/stats`);
    return response.data;
  }
};

// SSE Connection for real-time updates
export const createSSEConnection = (clientId: string, onMessage: (data: any) => void) => {
  const eventSource = new EventSource(`${API_BASE}/stream/${clientId}`);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
  };
  
  return eventSource;
};