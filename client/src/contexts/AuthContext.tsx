import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string, organizationId: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Configure axios defaults
  useEffect(() => {
    const savedToken = localStorage.getItem('bici_token');
    if (savedToken) {
      setToken(savedToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      validateToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Set up axios interceptors
  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && token) {
          // Token expired, try to refresh
          try {
            await refreshToken();
          } catch (refreshError) {
            // Refresh failed, logout user
            logout();
            toast.error('Session expired. Please login again.');
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);

  const validateToken = async (tokenToValidate: string) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/auth/validate`, {
        headers: { Authorization: `Bearer ${tokenToValidate}` }
      });
      
      if (response.data.success) {
        setUser(response.data.user);
        setToken(tokenToValidate);
        axios.defaults.headers.common['Authorization'] = `Bearer ${tokenToValidate}`;
      } else {
        // Invalid token
        localStorage.removeItem('bici_token');
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      localStorage.removeItem('bici_token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, organizationId: string) => {
    try {
      setIsLoading(true);
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password,
        organizationId
      });

      if (response.data.success) {
        const { token: newToken, user: userData } = response.data;
        
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('bici_token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        
        toast.success('Login successful!');
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Login failed';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`);
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('bici_token');
      delete axios.defaults.headers.common['Authorization'];
      toast.success('Logged out successfully');
    }
  };

  const refreshToken = async () => {
    if (!token) {
      throw new Error('No token to refresh');
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
        token
      });

      if (response.data.success) {
        const { token: newToken } = response.data;
        setToken(newToken);
        localStorage.setItem('bici_token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    logout,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};