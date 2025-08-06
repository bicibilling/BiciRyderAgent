import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  Phone as PhoneIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import axios from 'axios';
import toast from 'react-hot-toast';

interface AnalyticsData {
  daily: Array<{
    date: string;
    total_conversations: number;
    total_duration: number;
    human_takeovers: number;
    successful_completions: number;
    call_types: Record<string, number>;
    peak_hours: Record<string, number>;
  }>;
  summary: {
    totalConversations: number;
    totalDuration: number;
    totalHumanTakeovers: number;
    totalSuccessfulCompletions: number;
    humanTakeoverRate: string;
    successRate: string;
    averageDuration: number;
  };
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const AnalyticsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState('7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getDateRange = () => {
    const today = new Date();
    let start: Date;
    let end: Date = endOfDay(today);

    switch (dateRange) {
      case '1d':
        start = startOfDay(today);
        break;
      case '7d':
        start = startOfDay(subDays(today, 6));
        break;
      case '30d':
        start = startOfDay(subDays(today, 29));
        break;
      case 'custom':
        start = startDate ? new Date(startDate) : startOfDay(subDays(today, 6));
        end = endDate ? new Date(endDate) : endOfDay(today);
        break;
      default:
        start = startOfDay(subDays(today, 6));
    }

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    };
  };

  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>(
    ['analytics', dateRange, startDate, endDate],
    async () => {
      const { startDate: start, endDate: end } = getDateRange();
      const response = await axios.get(`${API_BASE_URL}/api/analytics/range`, {
        params: { startDate: start, endDate: end }
      });
      return response.data.data;
    },
    {
      refetchInterval: 60000, // Refetch every minute
    }
  );

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const { startDate: start, endDate: end } = getDateRange();
      const response = await axios.get(`${API_BASE_URL}/api/analytics/export`, {
        params: { startDate: start, endDate: end, format },
        responseType: format === 'csv' ? 'blob' : 'json'
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics-${start}-${end}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics-${start}-${end}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
      }

      toast.success(`Analytics exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export analytics');
    }
  };

  // Prepare chart data
  const chartData = analytics?.daily.map(day => ({
    date: format(new Date(day.date), 'MMM dd'),
    conversations: day.total_conversations,
    humanTakeovers: day.human_takeovers,
    avgDuration: day.total_conversations > 0 ? Math.round(day.total_duration / day.total_conversations / 60) : 0,
    successRate: day.total_conversations > 0 ? Math.round(((day.total_conversations - day.human_takeovers) / day.total_conversations) * 100) : 100
  })) || [];

  // Prepare call types data for pie chart
  const callTypesData = analytics?.daily.reduce((acc, day) => {
    Object.entries(day.call_types || {}).forEach(([type, count]) => {
      acc[type] = (acc[type] || 0) + count;
    });
    return acc;
  }, {} as Record<string, number>);

  const pieData = callTypesData ? Object.entries(callTypesData).map(([name, value]) => ({
    name: name.replace('_', ' ').toUpperCase(),
    value
  })) : [];

  // Prepare peak hours data
  const peakHoursData = analytics?.daily.reduce((acc, day) => {
    Object.entries(day.peak_hours || {}).forEach(([hour, count]) => {
      acc[hour] = (acc[hour] || 0) + count;
    });
    return acc;
  }, {} as Record<string, number>);

  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour.toString().padStart(2, '0')}:00`,
    calls: peakHoursData?.[hour.toString()] || 0
  }));

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Analytics Dashboard
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Date Range</InputLabel>
            <Select
              value={dateRange}
              label="Date Range"
              onChange={(e) => setDateRange(e.target.value)}
            >
              <MenuItem value="1d">Today</MenuItem>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
            </Select>
          </FormControl>
          
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </>
          )}
          
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PhoneIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Calls</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {analytics?.summary.totalConversations || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {analytics?.summary.averageDuration || 0}s avg duration
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">AI Success Rate</Typography>
              </Box>
              <Typography variant="h3" color="success">
                {analytics?.summary.successRate || 100}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Conversations without human intervention
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PersonIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">Human Takeovers</Typography>
              </Box>
              <Typography variant="h3" color="warning">
                {analytics?.summary.totalHumanTakeovers || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {analytics?.summary.humanTakeoverRate || 0}% of total calls
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ScheduleIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Duration</Typography>
              </Box>
              <Typography variant="h3" color="info">
                {Math.round((analytics?.summary.totalDuration || 0) / 60)}m
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total call time
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Conversations Over Time */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Conversations Over Time
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="conversations"
                    stroke="#8884d8"
                    name="Total Conversations"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="humanTakeovers"
                    stroke="#ff7300"
                    name="Human Takeovers"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Call Types Distribution */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Call Types
              </Typography>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No call type data available
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Peak Hours */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Peak Hours Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Daily Breakdown Table */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Daily Breakdown
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Total Calls</TableCell>
                      <TableCell align="right">Duration (min)</TableCell>
                      <TableCell align="right">Human Takeovers</TableCell>
                      <TableCell align="right">Success Rate</TableCell>
                      <TableCell align="right">Avg Duration</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics?.daily.map((day) => (
                      <TableRow key={day.date} hover>
                        <TableCell>
                          {format(new Date(day.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell align="right">{day.total_conversations}</TableCell>
                        <TableCell align="right">{Math.round(day.total_duration / 60)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            {day.human_takeovers}
                            {day.human_takeovers > 0 && (
                              <Chip
                                label={`${Math.round((day.human_takeovers / day.total_conversations) * 100)}%`}
                                color="warning"
                                size="small"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${Math.round(((day.total_conversations - day.human_takeovers) / day.total_conversations) * 100)}%`}
                            color={day.human_takeovers === 0 ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          {day.total_conversations > 0 
                            ? Math.round(day.total_duration / day.total_conversations) + 's'
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AnalyticsPage;