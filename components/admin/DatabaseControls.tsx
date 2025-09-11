'use client';

/**
 * DatabaseControls - Database management interface for admin panel.
 * 
 * Provides controls for database operations, migrations, backups,
 * and environment switching with real-time status updates.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DatabaseControlsProps {
  onStatusChange: () => void;
}

interface DatabaseOperation {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'success' | 'error';
  result?: string;
}

export function DatabaseControls({ onStatusChange }: DatabaseControlsProps) {
  const [operations, setOperations] = useState<DatabaseOperation[]>([
    { id: 'migrate', name: 'Run Migrations', description: 'Apply pending database migrations', status: 'idle' },
    { id: 'backup', name: 'Create Backup', description: 'Create database backup', status: 'idle' },
    { id: 'validate', name: 'Validate Schema', description: 'Check database integrity', status: 'idle' },
    { id: 'reset', name: 'Reset Database', description: 'Reset to clean state (DEV ONLY)', status: 'idle' },
  ]);

  const updateOperationStatus = (id: string, status: DatabaseOperation['status'], result?: string) => {
    setOperations(prev => prev.map(op => 
      op.id === id ? { ...op, status, result } : op
    ));
  };

  const executeOperation = async (operationId: string) => {
    updateOperationStatus(operationId, 'running');
    
    try {
      const response = await fetch(`/api/admin/database/${operationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok) {
        updateOperationStatus(operationId, 'success', result.message);
        onStatusChange();
      } else {
        updateOperationStatus(operationId, 'error', result.error);
      }
    } catch (error) {
      updateOperationStatus(operationId, 'error', `Operation failed: ${error}`);
    }
  };

  const getStatusBadge = (status: DatabaseOperation['status']) => {
    switch (status) {
      case 'running':
        return <Badge variant="secondary">Running...</Badge>;
      case 'success':
        return <Badge variant="default">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Database Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Database Operations</CardTitle>
          <CardDescription>
            Manage database migrations, backups, and maintenance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {operations.map((operation) => (
              <div
                key={operation.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{operation.name}</h4>
                    {getStatusBadge(operation.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {operation.description}
                  </p>
                  {operation.result && (
                    <p className={`text-xs mt-1 ${
                      operation.status === 'error' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {operation.result}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => executeOperation(operation.id)}
                  disabled={operation.status === 'running'}
                  variant={operation.status === 'error' ? 'destructive' : 'outline'}
                  size="sm"
                >
                  {operation.status === 'running' ? 'Running...' : 'Run'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Database Information */}
      <Card>
        <CardHeader>
          <CardTitle>Database Connection</CardTitle>
          <CardDescription>
            Current database configuration and connection details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Database Type</label>
                <p className="text-sm text-muted-foreground">PostgreSQL</p>
              </div>
              <div>
                <label className="text-sm font-medium">Environment</label>
                <p className="text-sm text-muted-foreground">Development</p>
              </div>
              <div>
                <label className="text-sm font-medium">Host</label>
                <p className="text-sm text-muted-foreground font-mono">
                  AWS RDS (t4g.micro)
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-muted-foreground">Connected</span>
                </div>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                <strong>Current Database:</strong> Development environment pointing to AWS RDS PostgreSQL instance.
                Use Environment tab to switch between dev and production databases.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common database maintenance tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              onClick={() => executeOperation('validate')}
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">🔍</span>
              <span className="text-sm">Health Check</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => executeOperation('backup')}
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">💾</span>
              <span className="text-sm">Backup Now</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => executeOperation('migrate')}
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">⚡</span>
              <span className="text-sm">Migrate</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.open('/api/admin/database/logs', '_blank')}
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">📋</span>
              <span className="text-sm">View Logs</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}