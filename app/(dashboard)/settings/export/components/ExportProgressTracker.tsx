/**
 * ExportProgressTracker - Real-time progress tracking for active export jobs
 *
 * This component provides visual feedback for export job progress including:
 * - Real-time progress bar with percentage completion
 * - Processing stage descriptions and item counts
 * - Estimated time remaining calculations
 * - Download button for completed exports
 * - Error handling and retry options
 *
 * @component
 * @category Export Components
 * @since 1.8.0
 */

'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { ExportJob } from '@/lib/types/exports';

interface ExportProgressTrackerProps {
  exportJob: ExportJob;
  onDownload: () => void;
}

/**
 * Get status badge variant based on export job status
 */
const getStatusBadge = (status: ExportJob['status']) => {
  switch (status) {
    case 'pending':
      return { variant: 'secondary' as const, icon: Clock, label: 'Pending' };
    case 'processing':
      return { variant: 'default' as const, icon: Loader2, label: 'Processing' };
    case 'completed':
      return { variant: 'default' as const, icon: CheckCircle, label: 'Completed' };
    case 'failed':
      return { variant: 'destructive' as const, icon: XCircle, label: 'Failed' };
    case 'cancelled':
      return { variant: 'secondary' as const, icon: AlertTriangle, label: 'Cancelled' };
    default:
      return { variant: 'secondary' as const, icon: Clock, label: 'Unknown' };
  }
};

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Format duration for display
 */
const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

/**
 * Get processing stage description based on progress
 */
const getProcessingStage = (progress: number, status: ExportJob['status'], totalItems: number) => {
  if (status === 'pending') {
    return 'Initializing export job...';
  }

  if (status === 'processing') {
    if (progress < 10) {
      return 'Gathering inventory data...';
    } else if (progress < 30) {
      return 'Processing item details...';
    } else if (progress < 60) {
      return 'Including photo references...';
    } else if (progress < 90) {
      return 'Generating CSV format...';
    } else {
      return 'Finalizing export file...';
    }
  }

  if (status === 'completed') {
    return 'Export ready for download';
  }

  if (status === 'failed') {
    return 'Export processing failed';
  }

  return 'Processing...';
};

/**
 * Export progress tracker component
 */
export function ExportProgressTracker({ exportJob, onDownload }: ExportProgressTrackerProps) {
  const statusBadge = getStatusBadge(exportJob.status);
  const StatusIcon = statusBadge.icon;
  const processingStage = getProcessingStage(exportJob.progress, exportJob.status, exportJob.totalItems);

  // Calculate estimated time remaining
  const estimatedTimeRemaining = exportJob.status === 'processing' && exportJob.progress > 0
    ? Math.max(0, Math.round((100 - exportJob.progress) * 2)) // Rough estimation
    : null;

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium text-lg truncate">{exportJob.filename}</h3>
              <Badge variant={statusBadge.variant} className="ml-auto">
                <StatusIcon className={`h-3 w-3 mr-1 ${exportJob.status === 'processing' ? 'animate-spin' : ''}`} />
                {statusBadge.label}
              </Badge>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <div>Format: CSV • Items: {exportJob.totalItems.toLocaleString()}</div>
              <div>Created: {new Date(exportJob.createdAt).toLocaleString()}</div>
              {exportJob.fileSize && (
                <div>Size: {formatFileSize(exportJob.fileSize)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {(exportJob.status === 'processing' || exportJob.status === 'pending') && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{processingStage}</span>
              <span className="font-medium">{exportJob.progress}%</span>
            </div>

            <Progress
              value={exportJob.progress}
              className="h-2"
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {exportJob.processedItems.toLocaleString()} of {exportJob.totalItems.toLocaleString()} items
              </span>
              {estimatedTimeRemaining !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ~{formatDuration(estimatedTimeRemaining)} remaining
                </span>
              )}
            </div>
          </div>
        )}

        {/* Completed State */}
        {exportJob.status === 'completed' && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
              <CheckCircle className="h-5 w-5" />
              <div>
                <div className="font-medium">Export completed successfully!</div>
                <div className="text-sm text-green-600">
                  {exportJob.totalItems.toLocaleString()} items exported
                  {exportJob.completedAt && (
                    <span className="ml-2">
                      • Completed {new Date(exportJob.completedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Failed State */}
        {exportJob.status === 'failed' && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg p-3">
              <XCircle className="h-5 w-5" />
              <div>
                <div className="font-medium">Export failed</div>
                <div className="text-sm text-red-600">
                  {exportJob.errorMessage || 'An unexpected error occurred during export processing.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {exportJob.expiresAt && (
              <>
                Expires: {new Date(exportJob.expiresAt).toLocaleDateString()}
              </>
            )}
          </div>

          <div className="flex gap-2">
            {exportJob.status === 'completed' && (
              <Button
                onClick={onDownload}
                size="sm"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}

            {exportJob.status === 'failed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            )}
          </div>
        </div>

        {/* Processing Animation Overlay */}
        {exportJob.status === 'processing' && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50 to-transparent opacity-30 animate-pulse pointer-events-none" />
        )}
      </CardContent>
    </Card>
  );
}