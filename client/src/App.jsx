import React, { useState, useEffect } from 'react';
import { Phone, Bot, Users, BarChart3, Settings, AlertCircle, CheckCircle, Clock, MapPin, Edit3, Headphones } from 'lucide-react';
import { agentAPI, storeAPI, healthAPI } from './services/api';

// Components
import Header from './components/Header';
import StatusCard from './components/StatusCard';
import ConversationPanel from './components/ConversationPanel';
import AgentTester from './components/AgentTester';
import Analytics from './components/Analytics';
import PromptEditor from './components/PromptEditor';

function App() {
  const [agentStatus, setAgentStatus] = useState(null);
  const [storeStatus, setStoreStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'overview';
  });

  // Transfer phone number state
  const [currentTransferNumber, setCurrentTransferNumber] = useState('');
  const [newTransferNumber, setNewTransferNumber] = useState('');
  const [transferNumberLoading, setTransferNumberLoading] = useState(false);
  const [transferNumberMessage, setTransferNumberMessage] = useState(null);

  // Fetch initial data
  useEffect(() => {
    fetchAllData();
    fetchTransferNumber();

    // Disabled auto-refresh - was causing painful page refreshing
    // const interval = setInterval(fetchAllData, 30000); // Every 30 seconds
    // return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentRes, storeRes, conversationsRes, analyticsRes] = await Promise.all([
        agentAPI.getStatus(),
        storeAPI.getStatus(),
        agentAPI.getConversations(10),
        agentAPI.getAnalytics(),
      ]);

      setAgentStatus(agentRes.data);
      setStoreStatus(storeRes.data);
      setConversations(conversationsRes.data.conversations || []);
      setCustomers(conversationsRes.data.customers || []);
      setAnalytics(analyticsRes.data.analytics);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransferNumber = async () => {
    try {
      const response = await agentAPI.getTransferNumber();
      const transferNumber = response.data.current_transfer_number;
      setCurrentTransferNumber(transferNumber);
      setNewTransferNumber(transferNumber);
    } catch (err) {
      console.error('Failed to fetch transfer number:', err);
      setCurrentTransferNumber('Error loading');
    }
  };

  const updateTransferNumber = async () => {
    if (!newTransferNumber) {
      setTransferNumberMessage({ type: 'error', text: 'Phone number is required' });
      return;
    }

    // Basic E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(newTransferNumber)) {
      setTransferNumberMessage({
        type: 'error',
        text: 'Phone number must be in E.164 format (e.g., +17787193080)'
      });
      return;
    }

    setTransferNumberLoading(true);
    setTransferNumberMessage(null);

    try {
      const response = await agentAPI.updateTransferNumber(newTransferNumber);
      setCurrentTransferNumber(newTransferNumber);
      setTransferNumberMessage({
        type: 'success',
        text: 'Transfer number updated and deployed immediately via ElevenLabs PATCH API!'
      });
    } catch (err) {
      console.error('Failed to update transfer number:', err);
      setTransferNumberMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to update transfer number'
      });
    } finally {
      setTransferNumberLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-primary-500 mx-auto mb-4 animate-pulse-slow" />
          <p className="text-neutral-600">Loading Ryder dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Connection Error</h2>
          <p className="text-neutral-600 mb-4">{error}</p>
          <button 
            onClick={fetchAllData}
            className="btn-primary"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'conversations', name: 'Conversations', icon: Users },
    { id: 'testing', name: 'Agent Testing', icon: Bot },
    { id: 'prompt-editor', name: 'Prompt Editor', icon: Edit3 },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header 
        agentStatus={agentStatus}
        storeStatus={storeStatus}
        onRefresh={fetchAllData}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="border-b border-neutral-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    localStorage.setItem('activeTab', tab.id);
                  }}
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatusCard
                title="Ryder Status"
                status={agentStatus?.agent?.status || 'unknown'}
                value={agentStatus?.agent?.name || 'Unknown Agent'}
                icon={Bot}
                color="blue"
              />
              
              <StatusCard
                title="Store Status"
                status={storeStatus?.data?.isOpen ? 'open' : 'closed'}
                value={storeStatus?.data?.greeting || 'Unknown Status'}
                icon={storeStatus?.data?.isOpen ? CheckCircle : Clock}
                color={storeStatus?.data?.isOpen ? 'green' : 'yellow'}
              />
              
              <StatusCard
                title="Phone Number"
                status="active"
                value={agentStatus?.server?.uptime ? '+1 (778) 650-9966' : 'Offline'}
                icon={Phone}
                color="blue"
              />
              
              <StatusCard
                title="Location"
                status="active"
                value="Vancouver, BC"
                icon={MapPin}
                color="green"
              />
            </div>

            {/* Quick Stats */}
            {analytics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card">
                  <h3 className="font-medium text-neutral-900 mb-2">Total Calls</h3>
                  <p className="text-2xl font-bold text-primary-600">{analytics.total_calls}</p>
                  <p className="text-sm text-neutral-500">Last 7 days</p>
                </div>
                
                <div className="card">
                  <h3 className="font-medium text-neutral-900 mb-2">Resolution Rate</h3>
                  <p className="text-2xl font-bold text-green-600">{analytics.performance.resolution_rate}</p>
                  <p className="text-sm text-neutral-500">Successfully handled</p>
                </div>
                
                <div className="card">
                  <h3 className="font-medium text-neutral-900 mb-2">Avg Response Time</h3>
                  <p className="text-2xl font-bold text-blue-600">{analytics.performance.response_time}</p>
                  <p className="text-sm text-neutral-500">Per interaction</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conversations' && (
          <ConversationPanel 
            conversations={conversations}
            customers={customers}
            onRefresh={fetchAllData}
          />
        )}

        {activeTab === 'testing' && (
          <AgentTester
            agentStatus={agentStatus}
            onTest={(message) => agentAPI.testAgent(message)}
          />
        )}

        {activeTab === 'prompt-editor' && (
          <PromptEditor
            agentStatus={agentStatus}
            onUpdate={fetchAllData}
          />
        )}

        {activeTab === 'analytics' && (
          <Analytics 
            analytics={analytics}
            storeStatus={storeStatus}
          />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Agent Configuration */}
            <div className="card">
              <div className="card-header">
                <h2 className="text-xl font-semibold text-neutral-900">Agent Configuration</h2>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={agentStatus?.agent?.name || ''}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Agent ID
                  </label>
                  <input
                    type="text"
                    value={agentStatus?.agent?.id || ''}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Voice Model
                  </label>
                  <input
                    type="text"
                    value={agentStatus?.agent?.conversation_config?.tts?.model_id || ''}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    LLM Model
                  </label>
                  <input
                    type="text"
                    value={agentStatus?.agent?.conversation_config?.agent?.prompt?.llm || ''}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500"
                  />
                </div>
              </div>
            </div>

            {/* Transfer Settings */}
            <div className="card">
              <div className="card-header">
                <h2 className="text-xl font-semibold text-neutral-900">Human Transfer Settings</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Configure the phone number for human agent transfers
                </p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Current Transfer Phone Number
                  </label>
                  <input
                    type="text"
                    value={currentTransferNumber}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    New Transfer Phone Number
                  </label>
                  <input
                    type="text"
                    value={newTransferNumber}
                    onChange={(e) => setNewTransferNumber(e.target.value)}
                    placeholder="e.g., +17787193080"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-500 font-mono"
                  />
                  <p className="text-sm text-neutral-500 mt-1">
                    Must be in E.164 format (starts with + followed by country code and number)
                  </p>
                </div>

                {transferNumberMessage && (
                  <div className={`p-4 rounded-lg ${
                    transferNumberMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {transferNumberMessage.text}
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <button
                    onClick={updateTransferNumber}
                    disabled={transferNumberLoading || newTransferNumber === currentTransferNumber}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      transferNumberLoading || newTransferNumber === currentTransferNumber
                        ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {transferNumberLoading ? (
                      <>
                        <div className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Updating...
                      </>
                    ) : (
                      'Update Transfer Number'
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setNewTransferNumber(currentTransferNumber);
                      setTransferNumberMessage(null);
                    }}
                    className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Reset
                  </button>
                </div>

                <div className="text-sm text-neutral-600 bg-neutral-50 p-4 rounded-lg">
                  <p><strong>Note:</strong> Transfer number changes are deployed immediately to ElevenLabs via PATCH API. No additional deployment step required.</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-neutral-600">
              Agent configuration is managed via ElevenLabs CLI. Use <code className="bg-neutral-100 px-2 py-1 rounded text-xs">convai sync</code> to deploy changes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;