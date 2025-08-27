import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD 
    ? 'https://bici-ryder-api.onrender.com/api'  // Production API URL
    : 'http://localhost:3002/api'                // Development API URL
);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout for cold starts
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor with retry logic for cold starts
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Retry on timeout or 502/503 errors (cold start indicators)
    if (!originalRequest._retry && (
      error.code === 'ECONNABORTED' || 
      error.response?.status === 502 || 
      error.response?.status === 503
    )) {
      originalRequest._retry = true;
      console.log('🔄 API cold start detected, retrying request...');
      
      // Wait 2 seconds for server to wake up, then retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      return api(originalRequest);
    }
    
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const agentAPI = {
  // Get agent status
  getStatus: () => api.get('/agent/status'),
  
  // Get recent conversations
  getConversations: (limit = 10) => api.get(`/agent/conversations?limit=${limit}`),
  
  // Test agent with sample message
  testAgent: (message) => api.post('/agent/test', { message }),
  
  // Update agent configuration
  updateAgent: (config) => api.post('/agent/update', config),
  
  // Get agent analytics
  getAnalytics: () => api.get('/agent/analytics'),

  // NEW: Prompt editing and deployment
  updatePrompt: (config) => api.post('/agent/update-prompt', config),
  
  deploy: () => api.post('/agent/deploy'),
  
  getTestPrompts: () => api.get('/agent/test-prompts'),
  
  runAllTests: () => api.post('/agent/run-all-tests'),
  
  // Get ElevenLabs widget configuration
  getWidget: () => api.get('/agent/widget'),
};

export const storeAPI = {
  // Get store status (hours, open/closed)
  getStatus: () => api.get('/tools/store-status'),
  
  // Qualify a lead
  qualifyLead: (leadData) => api.post('/tools/qualify-lead', leadData),
  
  // Request human handoff
  requestHuman: (data) => api.post('/tools/request-human', data),
  
  // Take a callback message
  takeMessage: (messageData) => api.post('/tools/take-message', messageData),
  
  // Detect Quebec caller
  detectQuebec: (phoneNumber) => api.post('/tools/detect-quebec', { phoneNumber }),
};

export const healthAPI = {
  // Server health check
  checkHealth: () => api.get('/health', { baseURL: 'http://localhost:3002' }),
  
  // ElevenLabs webhook health
  checkElevenLabsHealth: () => api.get('/webhooks/elevenlabs/health'),
  
  // Twilio webhook health
  checkTwilioHealth: () => api.get('/webhooks/twilio/health'),
};

export default api;