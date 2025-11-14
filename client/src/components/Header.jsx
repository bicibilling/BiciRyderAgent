import React from 'react';
import { Bot, RefreshCw, ExternalLink, Phone } from 'lucide-react';

const Header = ({ agentStatus, storeStatus, onRefresh }) => {
  const currentTime = new Date().toLocaleString('en-CA', {
    timeZone: 'America/Vancouver',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <header className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">Ryder AI Dashboard</h1>
                <p className="text-sm text-neutral-500">Bici Customer Service Agent</p>
              </div>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center space-x-6">
            {/* Store Status */}
            <div className="text-right">
              <div className="flex items-center space-x-2">
                <span className={`status-indicator ${storeStatus?.data?.isOpen ? 'status-online' : 'status-warning'}`}>
                  {storeStatus?.data?.isOpen ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{currentTime}</p>
            </div>

            {/* Agent Status */}
            <div className="text-right">
              <div className="flex items-center space-x-2">
                <span className={`status-indicator ${agentStatus?.agent?.status === 'active' ? 'status-online' : 'status-offline'}`}>
                  RYDER {agentStatus?.agent?.status?.toUpperCase() || 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {agentStatus?.server?.uptime ? `Uptime: ${Math.floor(agentStatus.server.uptime / 60)}m` : 'Offline'}
              </p>
            </div>

            {/* Phone Number */}
            <div className="flex items-center space-x-2 text-neutral-600">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">+1 (778) 650-9966</span>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onRefresh}
                className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              <a
                href="https://www.bici.cc"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                title="Visit Bici website"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;