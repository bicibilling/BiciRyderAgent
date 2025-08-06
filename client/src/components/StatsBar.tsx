import React from 'react';
import { DashboardStats } from '../types';

interface StatsBarProps {
  stats: DashboardStats;
}

const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <div className="bg-bici-gray border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-bici-black">{stats.total_leads}</div>
            <div className="text-sm text-bici-text">Total Leads</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-bici-black">{stats.total_calls}</div>
            <div className="text-sm text-bici-text">Total Calls</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-bici-black">{stats.total_conversations}</div>
            <div className="text-sm text-bici-text">Conversations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-bici-black flex items-center justify-center">
              {stats.active_sessions}
              {stats.active_sessions > 0 && (
                <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              )}
            </div>
            <div className="text-sm text-bici-text">Active Sessions</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsBar;