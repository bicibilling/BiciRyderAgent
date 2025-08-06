import React from 'react';
import { Lead } from '../types';

interface LeadsListProps {
  leads: Lead[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead) => void;
  loading: boolean;
}

const LeadsList: React.FC<LeadsListProps> = ({ leads, selectedLead, onSelectLead, loading }) => {
  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hot': return 'bg-red-100 text-red-700';
      case 'qualified': return 'bg-green-100 text-green-700';
      case 'contacted': return 'bg-blue-100 text-blue-700';
      case 'new': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      default: return '😐';
    }
  };

  if (loading) {
    return (
      <div className="bici-card">
        <h2 className="text-lg font-semibold mb-4">Leads</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bici-card">
      <h2 className="text-lg font-semibold mb-4">Leads ({leads.length})</h2>
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              selectedLead?.id === lead.id
                ? 'border-bici-black bg-bici-gray'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="font-medium text-bici-black">
                  {lead.customer_name || 'Unknown Customer'}
                </div>
                <div className="text-sm text-bici-text">
                  {formatPhone(lead.phone_number)}
                </div>
              </div>
              <div className="text-lg ml-2">{getSentimentIcon(lead.sentiment)}</div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(lead.status)}`}>
                {lead.status}
              </span>
              <span className="text-xs text-bici-muted">
                {lead.last_contact_at ? formatDate(lead.last_contact_at) : formatDate(lead.created_at)}
              </span>
            </div>

            {lead.bike_interest?.type && (
              <div className="mt-2 text-xs text-bici-text">
                Interest: {lead.bike_interest.type} bike
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeadsList;