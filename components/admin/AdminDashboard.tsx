'use client';

/**
 * AdminDashboard - Main administrative interface component.
 * 
 * Provides comprehensive database management, environment switching,
 * and operational controls through an intuitive web interface.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatabaseControls } from './DatabaseControls';
import { EnvironmentSwitcher } from './EnvironmentSwitcher';
import { SystemMonitor } from './SystemMonitor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SystemStatus {
  database: {
    connected: boolean;
    recordCount: number;
    lastBackup?: string;
    migrations: number;
  };
  environment: string;
  uptime: string;
  version: string;
}

export function AdminDashboard() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemStatus();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/status');
      if (response.ok) {
        const status = await response.json();
        setSystemStatus(status);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* System Status Overview */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Status</CardTitle>
            <div className="h-4 w-4 rounded-full bg-green-500"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemStatus?.database.connected ? 'Connected' : 'Disconnected'}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemStatus?.database.recordCount || 0} records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Environment</CardTitle>
            <Badge variant={systemStatus?.environment === 'production' ? 'destructive' : 'default'}>
              {systemStatus?.environment}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">
              Uptime: {systemStatus?.uptime || 'Unknown'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Migrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus?.database.migrations || 0}</div>
            <p className="text-xs text-muted-foreground">
              All up to date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemStatus?.database.lastBackup ? 'Recent' : 'None'}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemStatus?.database.lastBackup || 'No backups yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Admin Tabs */}
      <Tabs defaultValue="database" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="environment">Environment</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="database" className="space-y-4">
          <DatabaseControls onStatusChange={fetchSystemStatus} />
        </TabsContent>
        
        <TabsContent value="environment" className="space-y-4">
          <EnvironmentSwitcher onEnvironmentChange={fetchSystemStatus} />
        </TabsContent>
        
        <TabsContent value="monitoring" className="space-y-4">
          <SystemMonitor />
        </TabsContent>
        
        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Production Operations</CardTitle>
              <CardDescription>
                Deployment, scaling, and maintenance operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline">
                  Deploy to Staging
                </Button>
                <Button variant="outline">
                  Deploy to Production
                </Button>
                <Button variant="outline">
                  Scale Resources
                </Button>
                <Button variant="outline">
                  Maintenance Mode
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}