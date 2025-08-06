import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  HomeIcon, 
  ChatBubbleLeftRightIcon, 
  ChartBarIcon, 
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  PowerIcon,
  PhoneIcon
} from '@heroicons/react/24/outline'
import { 
  HomeIcon as HomeIconSolid, 
  ChatBubbleLeftRightIcon as ChatIconSolid, 
  ChartBarIcon as ChartIconSolid, 
  Cog6ToothIcon as CogIconSolid 
} from '@heroicons/react/24/solid'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/contexts/WebSocketContext'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { clsx } from 'clsx'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { isConnected, activeConversations, connectionStatus } = useWebSocket()
  const location = useLocation()

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: HomeIcon,
      iconSolid: HomeIconSolid,
    },
    {
      name: 'Conversations',
      href: '/conversations',
      icon: ChatBubbleLeftRightIcon,
      iconSolid: ChatIconSolid,
      badge: activeConversations.size > 0 ? activeConversations.size : undefined
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: ChartBarIcon,
      iconSolid: ChartIconSolid,
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Cog6ToothIcon,
      iconSolid: CogIconSolid,
    },
  ]

  const handleLogout = () => {
    logout()
  }

  const connectionStatusColor = {
    connecting: 'warning',
    connected: 'success',
    disconnected: 'danger',
    error: 'danger'
  } as const

  const connectionStatusText = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Connection Error'
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-neutral-600 bg-opacity-75 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        <motion.div
          initial={false}
          animate={{ x: sidebarOpen ? 0 : '-100%' }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={clsx(
            'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg lg:translate-x-0 lg:static lg:inset-0',
            'flex flex-col'
          )}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <PhoneIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-neutral-900">BICI AI</h1>
                <p className="text-xs text-neutral-500">Voice Agent</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md hover:bg-neutral-100"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Connection Status */}
          <div className="px-6 py-3 border-b border-neutral-200">
            <div className="flex items-center space-x-2">
              <Badge 
                variant={connectionStatusColor[connectionStatus]} 
                dot 
                size="sm" 
              />
              <span className="text-sm text-neutral-600">
                {connectionStatusText[connectionStatus]}
              </span>
              {activeConversations.size > 0 && (
                <Badge variant="primary" size="sm">
                  {activeConversations.size} active
                </Badge>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              const Icon = isActive ? item.iconSolid : item.icon
              
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    clsx(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
                      isActive
                        ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-500'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                    )
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  <span className="flex-1">{item.name}</span>
                  {item.badge && (
                    <Badge variant="primary" size="sm">
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* User Profile */}
          <div className="px-4 py-4 border-t border-neutral-200">
            <div className="flex items-center space-x-3 mb-3">
              <Avatar
                src={user?.avatar}
                initials={user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                size="sm"
                status={isConnected ? 'online' : 'offline'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={<PowerIcon />}
              onClick={handleLogout}
            >
              Sign Out
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-neutral-100"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-2">
              <Badge 
                variant={connectionStatusColor[connectionStatus]} 
                dot 
                size="sm" 
              />
              <span className="text-sm text-neutral-600">
                {isConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout