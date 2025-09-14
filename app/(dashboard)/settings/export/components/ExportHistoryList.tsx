/**
 * ExportHistoryList - Display and manage previous export jobs
 *
 * This component provides a comprehensive view of export history including:
 * - Chronological list of completed and failed exports
 * - Download functionality for available exports
 * - Export metadata and statistics
 * - Expiration status and cleanup notifications
 * - Filtering and sorting options
 *
 * @component
 * @category Export Components
 * @since 1.8.0
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Download,
  FileText,
  Calendar,
  Clock,
  AlertTriangle,
  Filter,
  Archive,
} from 'lucide-react';
import type { ExportJob } from '@/lib/types/exports';

interface ExportHistoryListProps {
  exportHistory: ExportJob[];
  onDownload: (exportJob: ExportJob) => void;
}

type SortOption = 'newest' | 'oldest' | 'size' | 'status';
type StatusFilter = 'all' | 'completed' | 'failed';

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
 * Check if export has expired
 */
const isExpired = (expiresAt?: Date): boolean => {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
};

/**
 * Get days until expiration
 */
const getDaysUntilExpiration = (expiresAt?: Date): number => {
  if (!expiresAt) return 0;
  const now = new Date();
  const expiration = new Date(expiresAt);
  const diffTime = expiration.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Get status display information
 */
const getStatusInfo = (status: ExportJob['status']) => {
  switch (status) {
    case 'completed':
      return {
        icon: CheckCircle,
        label: 'Completed',
        variant: 'default' as const,
        color: 'text-green-600',
      };
    case 'failed':
      return {
        icon: XCircle,
        label: 'Failed',
        variant: 'destructive' as const,
        color: 'text-red-600',
      };
    default:
      return {
        icon: Clock,
        label: 'Unknown',
        variant: 'secondary' as const,
        color: 'text-gray-600',
      };
  }
};

/**
 * Export history list component
 */
export function ExportHistoryList({ exportHistory, onDownload }: ExportHistoryListProps) {
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Filter and sort exports
  const filteredAndSortedExports = React.useMemo(() => {
    let filtered = [...exportHistory];

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(export_ => export_.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'size':
          return (b.fileSize || 0) - (a.fileSize || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return filtered;
  }, [exportHistory, sortBy, statusFilter]);

  // Calculate statistics
  const stats = React.useMemo(() => {
    const total = exportHistory.length;
    const completed = exportHistory.filter(e => e.status === 'completed').length;
    const failed = exportHistory.filter(e => e.status === 'failed').length;
    const totalSize = exportHistory
      .filter(e => e.fileSize)
      .reduce((sum, e) => sum + (e.fileSize || 0), 0);

    return { total, completed, failed, totalSize };
  }, [exportHistory]);

  if (exportHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">No Export History</h3>
        <p className="text-muted-foreground">
          Your completed exports will appear here. Create your first export to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Exports</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {formatFileSize(stats.totalSize)}
            </div>
            <div className="text-sm text-muted-foreground">Total Size</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Sorting */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="size">File Size</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto text-sm text-muted-foreground">
          Showing {filteredAndSortedExports.length} of {exportHistory.length} exports
        </div>
      </div>

      {/* Export List */}
      <div className="space-y-3">
        {filteredAndSortedExports.map((exportJob) => {
          const statusInfo = getStatusInfo(exportJob.status);
          const StatusIcon = statusInfo.icon;
          const expired = isExpired(exportJob.expiresAt);
          const daysUntilExpiration = getDaysUntilExpiration(exportJob.expiresAt);

          return (
            <Card key={exportJob.id} className={expired ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h3 className="font-medium truncate">{exportJob.filename}</h3>
                      <Badge variant={statusInfo.variant} className="flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
                      {expired && (
                        <Badge variant="outline" className="text-red-600 border-red-200">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created: {new Date(exportJob.createdAt).toLocaleDateString()}
                      </div>

                      <div>
                        Items: {exportJob.totalItems.toLocaleString()}
                        {exportJob.fileSize && (
                          <span className="ml-2">• Size: {formatFileSize(exportJob.fileSize)}</span>
                        )}
                      </div>

                      <div>
                        {exportJob.status === 'completed' && exportJob.completedAt && (
                          <>
                            Completed: {new Date(exportJob.completedAt).toLocaleDateString()}
                          </>
                        )}
                        {exportJob.status === 'failed' && exportJob.errorMessage && (
                          <span className="text-red-600">
                            Error: {exportJob.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expiration Warning */}
                    {!expired && daysUntilExpiration <= 2 && daysUntilExpiration > 0 && (
                      <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 inline-block">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Expires in {daysUntilExpiration} day{daysUntilExpiration !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {exportJob.status === 'completed' && !expired && (
                      <Button
                        onClick={() => onDownload(exportJob)}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    )}

                    {exportJob.status === 'completed' && expired && (
                      <Button disabled size="sm" variant="outline">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Expired
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
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredAndSortedExports.length === 0 && (
        <div className="text-center py-8">
          <Archive className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">
            No exports match the current filter criteria.
          </p>
        </div>
      )}
    </div>
  );
}