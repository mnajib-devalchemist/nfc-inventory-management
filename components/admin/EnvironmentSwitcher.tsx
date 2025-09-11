'use client';

/**
 * EnvironmentSwitcher - Environment management interface.
 * 
 * Allows admins to switch between development and production databases
 * and manage environment-specific configurations.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EnvironmentSwitcherProps {
  onEnvironmentChange: () => void;
}

interface Environment {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  databaseUrl: string;
  type: 'development' | 'staging' | 'production';
}

export function EnvironmentSwitcher({ onEnvironmentChange }: EnvironmentSwitcherProps) {
  const [currentEnvironment, setCurrentEnvironment] = useState('development');
  const [switchingEnvironment, setSwitchingEnvironment] = useState(false);
  
  const environments: Environment[] = [
    {
      id: 'development',
      name: 'Development',
      description: 'AWS RDS t4g.micro - Development database',
      status: 'active',
      databaseUrl: 'postgresql://...rds.amazonaws.com:5432/inventory_dev',
      type: 'development',
    },
    {
      id: 'staging',
      name: 'Staging',
      description: 'AWS RDS - Staging environment for testing',
      status: 'inactive',
      databaseUrl: 'postgresql://...rds.amazonaws.com:5432/inventory_staging',
      type: 'staging',
    },
    {
      id: 'production',
      name: 'Production',
      description: 'AWS RDS - Live production database',
      status: 'inactive',
      databaseUrl: 'postgresql://...rds.amazonaws.com:5432/inventory_prod',
      type: 'production',
    },
  ];

  const handleEnvironmentSwitch = async (environmentId: string) => {
    setSwitchingEnvironment(true);
    
    try {
      const response = await fetch('/api/admin/environment/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ environment: environmentId }),
      });

      if (response.ok) {
        setCurrentEnvironment(environmentId);
        onEnvironmentChange();
        
        // Show success message
        alert(`Successfully switched to ${environmentId} environment`);
      } else {
        alert('Failed to switch environment');
      }
    } catch (error) {
      alert(`Error switching environment: ${error}`);
    } finally {
      setSwitchingEnvironment(false);
    }
  };

  const getEnvironmentBadge = (type: Environment['type'], status: Environment['status']) => {
    if (status === 'active') {
      const variant = type === 'production' ? 'destructive' : 'default';
      return <Badge variant={variant}>Active</Badge>;
    }
    return <Badge variant="secondary">Inactive</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Environment Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Management</CardTitle>
          <CardDescription>
            Switch between development, staging, and production environments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              <strong>⚠️ Caution:</strong> Switching environments will change the active database connection.
              Ensure you have proper backups before switching to production.
            </AlertDescription>
          </Alert>

          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">
                Select Environment
              </label>
              <Select 
                value={currentEnvironment} 
                onValueChange={setCurrentEnvironment}
                disabled={switchingEnvironment}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      <div className="flex items-center space-x-2">
                        <span>{env.name}</span>
                        {env.status === 'active' && (
                          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-6">
              <Button
                onClick={() => handleEnvironmentSwitch(currentEnvironment)}
                disabled={switchingEnvironment}
                variant={currentEnvironment === 'production' ? 'destructive' : 'default'}
              >
                {switchingEnvironment ? 'Switching...' : 'Switch Environment'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Environment Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {environments.map((env) => (
          <Card key={env.id} className={env.status === 'active' ? 'ring-2 ring-blue-500' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{env.name}</CardTitle>
                {getEnvironmentBadge(env.type, env.status)}
              </div>
              <CardDescription>{env.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Database URL
                  </label>
                  <p className="text-xs font-mono bg-gray-100 p-2 rounded truncate">
                    {env.databaseUrl}
                  </p>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="flex items-center space-x-1">
                    <div className={`h-2 w-2 rounded-full ${
                      env.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
                    }`}></div>
                    <span className="text-xs capitalize">{env.status}</span>
                  </div>
                </div>

                {env.status === 'active' && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/admin/environment/${env.id}/status`, '_blank')}
                      className="w-full"
                    >
                      View Details
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Environment Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Actions</CardTitle>
          <CardDescription>
            Common operations for the current environment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              onClick={() => window.open('/api/admin/environment/status', '_blank')}
            >
              <span className="text-lg">📊</span>
              <span className="text-sm">Environment Status</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">🔄</span>
              <span className="text-sm">Sync Environments</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">📋</span>
              <span className="text-sm">Export Config</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
            >
              <span className="text-lg">🔧</span>
              <span className="text-sm">Maintenance</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}