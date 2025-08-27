import React, { useState, useEffect } from 'react';
import { ExternalLink, Bot, Phone, MessageSquare, Settings } from 'lucide-react';

const WidgetTester = ({ agentStatus }) => {
  const [widgetConfig, setWidgetConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  const loadWidget = async () => {
    console.log('🚀 Starting widget load process...');
    
    if (!agentStatus?.agent?.id) {
      console.error('❌ No agent ID available');
      setError('Agent ID not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📡 Fetching widget configuration...');
      
      // Get widget configuration from ElevenLabs
      const API_BASE_URL = import.meta.env.VITE_API_URL || 
        (import.meta.env.PROD ? 'https://bici-ryder-api.onrender.com/api' : 'http://localhost:3002/api');
      
      console.log('🔗 API URL:', API_BASE_URL);
      
      const response = await fetch(`${API_BASE_URL}/agent/widget`);
      console.log('📡 Widget API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Widget config received:', data);
      setWidgetConfig(data.widget_config);
      
      // Load ElevenLabs widget script dynamically
      loadElevenLabsWidget(data.widget_config);
    } catch (err) {
      console.error('❌ Widget loading error:', err);
      setError(`Widget loading failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadElevenLabsWidget = (config) => {
    console.log('📦 Loading ElevenLabs widget script...');
    
    // Remove any existing widget script
    const existingScript = document.getElementById('elevenlabs-widget');
    if (existingScript) {
      console.log('🗑️ Removing existing widget script');
      existingScript.remove();
    }

    // Create and load the ElevenLabs widget script (OFFICIAL URL)
    const script = document.createElement('script');
    script.id = 'elevenlabs-widget';
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    
    script.onload = () => {
      console.log('✅ ElevenLabs widget script loaded successfully');
      console.log('🔍 Window.ElevenLabsWidget available:', !!window.ElevenLabsWidget);
      
      // Wait a moment for script to initialize
      setTimeout(() => {
        console.log('🔍 Available window properties:', Object.keys(window).filter(key => key.toLowerCase().includes('eleven')));
        
        // ALL methods need dynamic variables - use Method 3 which gets them
        console.log('🎯 Using Method 3: Creating custom element with dynamic variables');
        createWidgetElement(config);
      }, 1000);
    };

    script.onerror = (scriptError) => {
      console.error('❌ Script loading error:', scriptError);
      setError('Failed to load ElevenLabs widget script from https://elevenlabs.io/convai-widget/index.js');
    };

    console.log('📤 Adding script to document head...');
    document.head.appendChild(script);
  };

  const initializeWithAPI = (config) => {
    try {
      window.ElevenLabsWidget.init({
        agentId: config.agent_id,
        ...config.widget_config,
        variant: 'full',
        placement: 'bottom-right',
        always_expanded: true,
        text_input_enabled: true
      });
      console.log('✅ Widget initialized with API method');
      setWidgetLoaded(true);
    } catch (error) {
      console.error('❌ API initialization failed:', error);
      setError(`API initialization failed: ${error.message}`);
    }
  };

  const initializeWithCustomElement = (config) => {
    try {
      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', config.agent_id);
      widget.setAttribute('widget-config', JSON.stringify(config.widget_config));
      document.body.appendChild(widget);
      console.log('✅ Widget created with custom element');
      setWidgetLoaded(true);
    } catch (error) {
      console.error('❌ Custom element initialization failed:', error);
      setError(`Custom element failed: ${error.message}`);
    }
  };

  const createWidgetElement = async (config) => {
    try {
      console.log('🎯 Creating widget with dynamic variables...');
      
      // Get dynamic variables from our webhook system (same as phone calls)
      const API_BASE_URL = import.meta.env.VITE_API_URL || 
        (import.meta.env.PROD ? 'https://bici-ryder-api.onrender.com/api' : 'http://localhost:3002/api');
      
      const contextResponse = await fetch(`${API_BASE_URL}/webhooks/elevenlabs/conversation-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: `widget_${Date.now()}`,
          agent_id: config.agent_id,
          metadata: { 
            caller_phone: '+1234567890', // Widget placeholder
            source: 'widget'
          }
        })
      });

      let dynamicVariables = {};
      if (contextResponse.ok) {
        const contextData = await contextResponse.json();
        dynamicVariables = contextData.dynamic_variables || {};
        console.log('✅ Got dynamic variables for widget:', Object.keys(dynamicVariables));
        console.log('🎯 Dynamic greeting value:', dynamicVariables.dynamic_greeting);
        console.log('🏪 Store greeting value:', dynamicVariables.store_greeting);
      } else {
        const errorText = await contextResponse.text();
        console.error('❌ Webhook failed:', contextResponse.status, errorText);
        throw new Error(`Webhook failed: ${contextResponse.status} - ${errorText}`);
      }

      // Create the widget element with ALL dynamic variables (same as phone calls)
      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', config.agent_id);
      
      // CRITICAL: Pass ALL dynamic variables that agent expects (ElevenLabs format)
      if (Object.keys(dynamicVariables).length > 0) {
        // Ensure we have the critical dynamic_greeting variable
        if (!dynamicVariables.dynamic_greeting) {
          console.error('❌ Missing dynamic_greeting in variables:', Object.keys(dynamicVariables));
          throw new Error('Dynamic greeting not available from webhook');
        }
        
        const widgetVariables = JSON.stringify(dynamicVariables);
        widget.setAttribute('dynamic-variables', widgetVariables);
        console.log('✅ Added dynamic variables to widget:', Object.keys(dynamicVariables));
        console.log('🎯 Widget dynamic-variables attribute:', widgetVariables);
      } else {
        console.error('❌ No dynamic variables received from webhook');
        throw new Error('No dynamic variables available - webhook failed');
      }
      
      // Widget configuration for testing
      widget.setAttribute('variant', 'expanded');
      widget.setAttribute('text-input-enabled', 'true');
      widget.setAttribute('default-expanded', 'true');
      widget.setAttribute('always-expanded', 'true');
      
      // Add to DOM
      document.body.appendChild(widget);
      console.log('✅ Widget element created with dynamic variables');
      setWidgetLoaded(true);
    } catch (error) {
      console.error('❌ Widget creation failed:', error);
      setError(`Widget creation failed: ${error.message}`);
    }
  };

  const removeWidget = () => {
    console.log('🗑️ Removing ElevenLabs widget...');
    
    // Remove script
    const script = document.getElementById('elevenlabs-widget');
    if (script) {
      script.remove();
      console.log('✅ Removed widget script');
    }
    
    // Remove all possible widget DOM elements
    const selectors = [
      'elevenlabs-convai',
      '[data-elevenlabs-widget]',
      '.elevenlabs-widget',
      '.convai-widget',
      '[class*="elevenlabs"]',
      '[id*="elevenlabs"]'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        element.remove();
        console.log('✅ Removed widget element:', selector);
      });
    });
    
    setWidgetLoaded(false);
    setWidgetConfig(null);
    console.log('✅ Widget cleanup complete');
  };

  return (
    <div className="space-y-6">
      {/* Widget Control Panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Bot className="h-6 w-6 text-primary-600" />
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">ElevenLabs Widget Tester</h2>
              <p className="text-sm text-neutral-600">Test Ryder with the official ElevenLabs widget</p>
            </div>
          </div>
          
          <span className={`status-indicator ${
            agentStatus?.agent?.status === 'active' ? 'status-online' : 'status-offline'
          }`}>
            {agentStatus?.agent?.status?.toUpperCase() || 'OFFLINE'}
          </span>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center mb-2">
            <MessageSquare className="h-5 w-5 text-green-600 mr-2" />
            <p className="text-green-800 font-medium">Official ElevenLabs Widget</p>
          </div>
          <p className="text-green-700 text-sm">
            This loads the actual ElevenLabs widget that customers would use on your website.
            Supports both voice and text conversations with full agent functionality.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center mb-2">
            <Phone className="h-5 w-5 text-blue-600 mr-2" />
            <p className="text-blue-800 font-medium">Voice + Text Testing</p>
          </div>
          <p className="text-blue-700 text-sm">
            The widget supports both voice calls and text chat. Perfect for testing without using Twilio minutes.
          </p>
        </div>

        {/* Controls */}
        <div className="flex space-x-3">
          <button
            onClick={loadWidget}
            disabled={loading || widgetLoaded || !agentStatus?.agent?.id}
            className={`btn-primary flex items-center space-x-2 ${
              loading || widgetLoaded || !agentStatus?.agent?.id ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Bot className="h-4 w-4" />
            {loading ? 'Loading Widget...' : 'Load ElevenLabs Widget'}
          </button>

          {widgetLoaded && (
            <button
              onClick={removeWidget}
              className="btn-secondary flex items-center space-x-2"
            >
              <Settings className="h-4 w-4" />
              Remove Widget
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
            <p className="text-red-800 text-sm">❌ {error}</p>
          </div>
        )}

        {!agentStatus?.agent?.id && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <p className="text-yellow-800 text-sm">⚠️ Agent not available. Please check agent status.</p>
          </div>
        )}
      </div>

      {/* Widget Status */}
      {widgetConfig && (
        <div className="card">
          <h3 className="font-semibold text-neutral-900 mb-4">Widget Information</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-neutral-600">Agent ID:</span>
              <span className="text-neutral-900 font-mono text-sm">{widgetConfig.agent_id}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Voice Enabled:</span>
              <span className="text-neutral-900">{!widgetConfig.widget_config.text_only ? 'Yes' : 'No'}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Text Chat Enabled:</span>
              <span className="text-neutral-900">{widgetConfig.widget_config.text_input_enabled ? 'Yes' : 'No'}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-neutral-600">Transcript Enabled:</span>
              <span className="text-neutral-900">{widgetConfig.widget_config.transcript_enabled ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {widgetLoaded && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <p className="text-green-800 text-sm">
                ✅ Widget loaded successfully! Look for the chat widget in the bottom-right corner of the screen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="card">
        <h3 className="font-semibold text-neutral-900 mb-4">How to Use the Widget</h3>
        
        <div className="space-y-3 text-sm text-neutral-600">
          <p><strong>1. Load Widget:</strong> Click "Load ElevenLabs Widget" above</p>
          <p><strong>2. Voice Testing:</strong> Click the microphone icon to test voice conversations</p>
          <p><strong>3. Text Testing:</strong> Use the text input to test chat conversations</p>
          <p><strong>4. Full Experience:</strong> Test both voice and text modes with real agent responses</p>
          <p><strong>5. Remove:</strong> Click "Remove Widget" to clean up when done</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
          <p className="text-yellow-800 text-sm">
            <strong>Note:</strong> The widget connects directly to ElevenLabs servers using your agent configuration.
            This provides the most accurate testing experience possible.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WidgetTester;