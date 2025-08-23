import React from 'react';

const StatusCard = ({ title, status, value, icon: Icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'text-primary-600 bg-primary-50 border-primary-200',
    green: 'text-green-600 bg-green-50 border-green-200',
    yellow: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    red: 'text-red-600 bg-red-50 border-red-200',
  };

  const statusColors = {
    active: 'text-green-600',
    open: 'text-green-600',
    closed: 'text-yellow-600',
    offline: 'text-red-600',
    unknown: 'text-neutral-400',
  };

  return (
    <div className={`card border-l-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-600">{title}</p>
          <p className={`text-xs mt-1 font-medium ${statusColors[status] || 'text-neutral-500'}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </p>
        </div>
        <Icon className={`h-8 w-8 ${colorClasses[color].split(' ')[0]}`} />
      </div>
      <div className="mt-4">
        <p className="text-sm text-neutral-900 font-medium truncate" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
};

export default StatusCard;