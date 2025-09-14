/**
 * Export Settings Page - Data export and backup interface
 *
 * This page provides users with comprehensive data export functionality including:
 * - Export trigger interface with format selection and filtering options
 * - Real-time progress tracking for export generation
 * - Download interface with export history
 * - Export job management and status monitoring
 *
 * QA CRITICAL: Implements user authentication validation
 * QA CRITICAL: Provides real-time feedback during export generation
 *
 * @component
 * @category Settings Pages
 * @since 1.8.0
 * @version 1.0.0 - Initial implementation with progress tracking
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Clock, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react';
import { ExportCreationForm } from './components/ExportCreationForm';
import { ExportHistoryList } from './components/ExportHistoryList';
import { ExportProgressTracker } from './components/ExportProgressTracker';
import type { ExportJob } from '@/lib/types/exports';

/**
 * Export settings page component with comprehensive export management
 */
export default function ExportPage() {
  const [activeExports, setActiveExports] = useState<ExportJob[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [isCreatingExport, setIsCreatingExport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /**
   * Create a new export job
   */
  const handleCreateExport = async (exportRequest: {
    format: 'csv';
    filters?: {
      locationIds?: string[];
      tagNames?: string[];
      status?: string[];
      createdAfter?: Date;
      createdBefore?: Date;
    };
  }) => {
    setIsCreatingExport(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/v1/exports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create export');
      }

      const { data: exportJob } = await response.json();

      // Add to active exports for tracking
      setActiveExports(prev => [...prev, exportJob]);
      setSuccessMessage(`Export job created successfully! Processing ${exportJob.totalItems} items.`);

      // Start polling for progress updates
      startProgressPolling(exportJob.id);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Export creation failed:', err);
    } finally {
      setIsCreatingExport(false);
    }
  };

  /**
   * Poll for export progress updates
   */
  const startProgressPolling = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/exports?jobId=${jobId}&includeDownloadUrl=true`);

        if (!response.ok) {
          clearInterval(pollInterval);
          return;
        }

        const { data: updatedJob } = await response.json();

        // Update active exports
        setActiveExports(prev =>
          prev.map(job => job.id === jobId ? updatedJob : job)
        );

        // If completed or failed, move to history and stop polling
        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          clearInterval(pollInterval);

          // Move to history after a short delay
          setTimeout(() => {
            setActiveExports(prev => prev.filter(job => job.id !== jobId));
            setExportHistory(prev => [updatedJob, ...prev]);
          }, 2000);

          if (updatedJob.status === 'completed') {
            setSuccessMessage(`Export completed! ${updatedJob.filename} is ready for download.`);
          } else {
            setError(`Export failed: ${updatedJob.errorMessage || 'Unknown error'}`);
          }
        }

      } catch (err) {
        console.error('Progress polling failed:', err);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    // Clean up polling after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
  };

  /**
   * Download completed export
   */
  const handleDownload = async (exportJob: ExportJob) => {
    try {
      const response = await fetch(`/api/v1/exports/${exportJob.id}/download`);

      if (!response.ok) {
        throw new Error('Failed to download export');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportJob.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccessMessage(`Downloaded ${exportJob.filename} successfully!`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      setError(errorMessage);
      console.error('Download failed:', err);
    }
  };

  /**
   * Clear messages after a delay
   */
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Data Export & Backup</h1>
        <p className="text-muted-foreground">
          Export your inventory data for backup, analysis, or migration purposes.
          All exports include comprehensive item details, photos, and metadata.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="mb-6 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create">Create Export</TabsTrigger>
          <TabsTrigger value="progress">
            Active Exports
            {activeExports.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeExports.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Export History</TabsTrigger>
        </TabsList>

        {/* Create Export Tab */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Create New Export
              </CardTitle>
              <CardDescription>
                Configure and create a new data export. Large exports (500+ items) will be
                processed in the background with progress tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExportCreationForm
                onCreateExport={handleCreateExport}
                isLoading={isCreatingExport}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Exports Tab */}
        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Active Export Jobs
              </CardTitle>
              <CardDescription>
                Monitor the progress of your current export jobs. Exports typically complete
                within 30 seconds for standard inventories.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeExports.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Active Exports</h3>
                  <p className="text-muted-foreground">
                    Create a new export to see progress tracking here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeExports.map((exportJob) => (
                    <ExportProgressTracker
                      key={exportJob.id}
                      exportJob={exportJob}
                      onDownload={() => handleDownload(exportJob)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Export History
              </CardTitle>
              <CardDescription>
                View and download your previous exports. Export files are available for
                7 days after creation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExportHistoryList
                exportHistory={exportHistory}
                onDownload={handleDownload}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}