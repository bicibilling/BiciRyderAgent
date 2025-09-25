import { useState, useEffect } from 'react';
import LeadsList from './components/LeadsList';
import ConversationPanel from './components/ConversationPanel';
import StatsBar from './components/StatsBar';
import { Lead, DashboardStats } from './types';
import { leadAPI, dashboardAPI, createSSEConnection, agentAPI } from './services/api';
import './index.css';

function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    total_leads: 0,
    total_calls: 0,
    total_conversations: 0,
    active_sessions: 0
  });
  const [loading, setLoading] = useState(true);
  const [realtimeData, setRealtimeData] = useState<any>(null);

  // Transfer number state
  const [showSettings, setShowSettings] = useState(false);
  const [currentTransferNumber, setCurrentTransferNumber] = useState('');
  const [newTransferNumber, setNewTransferNumber] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    // Load initial data
    loadLeads();
    loadStats();
    loadTransferNumber();

    // Set up SSE connection
    const clientId = `client_${Date.now()}`;
    const eventSource = createSSEConnection(clientId, (data) => {
      handleRealtimeUpdate(data);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const loadLeads = async () => {
    try {
      const leadsData = await leadAPI.getAll();
      setLeads(leadsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading leads:', error);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await dashboardAPI.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadTransferNumber = async () => {
    try {
      const response = await agentAPI.getTransferNumber();
      const transferNumber = response.current_transfer_number;
      setCurrentTransferNumber(transferNumber);
      setNewTransferNumber(transferNumber);
    } catch (error) {
      console.error('Failed to fetch transfer number:', error);
      setCurrentTransferNumber('Error loading');
    }
  };

  const updateTransferNumber = async () => {
    if (!newTransferNumber) {
      setTransferMessage({ type: 'error', text: 'Phone number is required' });
      return;
    }

    // Basic E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(newTransferNumber)) {
      setTransferMessage({
        type: 'error',
        text: 'Phone number must be in E.164 format (e.g., +17787193080)'
      });
      return;
    }

    setTransferLoading(true);
    setTransferMessage(null);

    try {
      await agentAPI.updateTransferNumber(newTransferNumber);
      // Refresh the transfer number from server to ensure we have the latest value
      await loadTransferNumber();
      setTransferMessage({
        type: 'success',
        text: 'Transfer number updated and deployed immediately!'
      });
    } catch (err: any) {
      console.error('Failed to update transfer number:', err);
      setTransferMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to update transfer number'
      });
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRealtimeUpdate = (data: any) => {
    console.log('Realtime update:', data);
    
    // Pass real-time data to components
    setRealtimeData(data);
    
    switch (data.type) {
      case 'call_initiated':
      case 'call_completed':
      case 'sms_received':
      case 'sms_sent':
      case 'conversation_user':
      case 'conversation_agent':
      case 'lead_updated':  // Listen for lead updates (like customer name)
        // Reload data on important events
        loadLeads();
        loadStats();
        
        // If the updated lead is currently selected, update it immediately
        if (data.type === 'lead_updated' && data.lead_id && selectedLead?.id === data.lead_id) {
          // Update the selected lead with new data
          setSelectedLead(prev => prev ? {...prev, customer_name: data.customer_name, ...data.updates} : null);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold">BICI</h1>
              <span className="ml-4 text-bici-text">AI Voice Agent Dashboard</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-bici-muted">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-bici-text">System Active</span>
              <button
                onClick={() => setShowSettings(true)}
                className="ml-4 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar stats={stats} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Leads List */}
          <div className="lg:col-span-1">
            <LeadsList 
              leads={leads} 
              selectedLead={selectedLead}
              onSelectLead={setSelectedLead}
              loading={loading}
            />
          </div>

          {/* Conversation Panel */}
          <div className="lg:col-span-2">
            {selectedLead ? (
              <ConversationPanel 
                lead={selectedLead} 
                onUpdate={() => {
                  loadLeads();
                  loadStats();
                }}
                realtimeData={realtimeData}
              />
            ) : (
              <div className="bici-card h-full flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-bici-text">Select a lead to view conversation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setTransferMessage(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Human Transfer Phone Number
                </label>
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">
                    Current: {currentTransferNumber}
                  </div>
                  <input
                    type="tel"
                    value={newTransferNumber}
                    onChange={(e) => setNewTransferNumber(e.target.value)}
                    placeholder="Enter phone number (e.g., +17787193080)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={transferLoading}
                  />
                  <div className="text-xs text-gray-500">
                    Must be in E.164 format (e.g., +17787193080)
                  </div>
                </div>
              </div>

              {transferMessage && (
                <div className={`p-3 rounded-md text-sm ${
                  transferMessage.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {transferMessage.text}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setTransferMessage(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={transferLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={updateTransferNumber}
                  disabled={transferLoading || !newTransferNumber}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                >
                  {transferLoading ? 'Updating...' : 'Update Number'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;