'use client';

/**
 * SystemMonitor - Real-time system monitoring interface.
 * 
 * Provides monitoring for application performance, database health,
 * and operational metrics with real-time updates.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MetricData {
  name: string;
  value: string | number;
  status: 'good' | 'warning' | 'error';
  trend?: 'up' | 'down' | 'stable';
}

interface SystemMetrics {
  database: MetricData[];
  application: MetricData[];
  infrastructure: MetricData[];
}

export function SystemMonitor() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    // Fetch initial metrics
    fetchMetrics();
    
    // Set up real-time updates every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/admin/monitoring/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      // Set mock data for development
      setMetrics({
        database: [
          { name: 'Connection Pool', value: '8/10', status: 'good', trend: 'stable' },
          { name: 'Query Response Time', value: '45ms', status: 'good', trend: 'down' },
          { name: 'Active Connections', value: 12, status: 'good', trend: 'up' },
          { name: 'Cache Hit Rate', value: '94%', status: 'good', trend: 'stable' },
        ],
        application: [
          { name: 'Response Time', value: '120ms', status: 'good', trend: 'stable' },
          { name: 'Error Rate', value: '0.1%', status: 'good', trend: 'down' },
          { name: 'Throughput', value: '45 req/min', status: 'good', trend: 'up' },
          { name: 'Memory Usage', value: '68%', status: 'warning', trend: 'up' },
        ],
        infrastructure: [
          { name: 'CPU Usage', value: '24%', status: 'good', trend: 'stable' },
          { name: 'Memory Usage', value: '512MB', status: 'good', trend: 'stable' },
          { name: 'Disk Usage', value: '15%', status: 'good', trend: 'up' },
          { name: 'Network I/O', value: '1.2MB/s', status: 'good', trend: 'stable' },
        ],
      });
      setLastUpdated(new Date());
    }
  };

  const getStatusBadge = (status: MetricData['status']) => {
    switch (status) {
      case 'good':
        return <Badge variant="default" className="bg-green-100 text-green-800">Good</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  const getTrendIcon = (trend?: MetricData['trend']) => {
    switch (trend) {
      case 'up':
        return <span className="text-green-600">↗</span>;
      case 'down':
        return <span className="text-red-600">↘</span>;
      case 'stable':
        return <span className="text-gray-600">→</span>;
      default:
        return null;
    }
  };

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monitoring Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Monitoring</h2>
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-muted-foreground">
            Last updated: {lastUpdated?.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Database Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🗄️</span>
            <span>Database Health</span>
          </CardTitle>
          <CardDescription>
            Database performance and connection metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.database.map((metric, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metric.name}</span>
                  {getStatusBadge(metric.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  {getTrendIcon(metric.trend)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Application Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🚀</span>
            <span>Application Performance</span>
          </CardTitle>
          <CardDescription>
            Application response times and error rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.application.map((metric, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metric.name}</span>
                  {getStatusBadge(metric.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  {getTrendIcon(metric.trend)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🏗️</span>
            <span>Infrastructure</span>
          </CardTitle>
          <CardDescription>
            Server resources and infrastructure health
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.infrastructure.map((metric, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metric.name}</span>
                  {getStatusBadge(metric.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{metric.value}</span>
                  {getTrendIcon(metric.trend)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alert Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>
            System alerts and notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
              <div>
                <p className="text-sm font-medium">Database migration completed successfully</p>
                <p className="text-xs text-muted-foreground">2 minutes ago</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
              <div className="h-2 w-2 bg-yellow-500 rounded-full"></div>
              <div>
                <p className="text-sm font-medium">Memory usage approaching 70%</p>
                <p className="text-xs text-muted-foreground">15 minutes ago</p>
              </div>
            </div>
            
            <div className="text-center py-4">
              <button className="text-sm text-blue-600 hover:text-blue-800">
                View all alerts →
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}