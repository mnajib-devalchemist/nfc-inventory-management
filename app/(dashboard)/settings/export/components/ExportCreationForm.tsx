/**
 * ExportCreationForm - Form component for creating new export jobs
 *
 * This component provides a user-friendly interface for configuring export parameters:
 * - Export format selection (currently CSV only)
 * - Advanced filtering options for locations, tags, status, and date ranges
 * - Form validation and user feedback
 * - Progress indication during export creation
 *
 * @component
 * @category Export Components
 * @since 1.8.0
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Filter, Calendar, MapPin, Tag, Settings } from 'lucide-react';

interface ExportCreationFormProps {
  onCreateExport: (request: {
    format: 'csv';
    filters?: {
      locationIds?: string[];
      tagNames?: string[];
      status?: string[];
      createdAfter?: Date;
      createdBefore?: Date;
    };
  }) => Promise<void>;
  isLoading: boolean;
}

interface ExportFilters {
  locationIds: string[];
  tagNames: string[];
  status: string[];
  createdAfter: string;
  createdBefore: string;
}

const ITEM_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'MAINTENANCE', label: 'In Maintenance' },
  { value: 'LOST', label: 'Lost' },
  { value: 'SOLD', label: 'Sold' },
];

/**
 * Export creation form component with comprehensive filtering options
 */
export function ExportCreationForm({ onCreateExport, isLoading }: ExportCreationFormProps) {
  const [format, setFormat] = useState<'csv'>('csv');
  const [useFilters, setUseFilters] = useState(false);
  const [filters, setFilters] = useState<ExportFilters>({
    locationIds: [],
    tagNames: [],
    status: [],
    createdAfter: '',
    createdBefore: '',
  });

  const [customTagInput, setCustomTagInput] = useState('');

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const exportRequest: Parameters<typeof onCreateExport>[0] = {
      format,
    };

    // Add filters if enabled and has values
    if (useFilters) {
      const exportFilters: any = {};

      if (filters.locationIds.length > 0) {
        exportFilters.locationIds = filters.locationIds;
      }

      if (filters.tagNames.length > 0) {
        exportFilters.tagNames = filters.tagNames;
      }

      if (filters.status.length > 0) {
        exportFilters.status = filters.status;
      }

      if (filters.createdAfter) {
        exportFilters.createdAfter = new Date(filters.createdAfter);
      }

      if (filters.createdBefore) {
        exportFilters.createdBefore = new Date(filters.createdBefore);
      }

      if (Object.keys(exportFilters).length > 0) {
        exportRequest.filters = exportFilters;
      }
    }

    await onCreateExport(exportRequest);
  };

  /**
   * Add custom tag to filters
   */
  const handleAddTag = () => {
    if (customTagInput.trim() && !filters.tagNames.includes(customTagInput.trim())) {
      setFilters(prev => ({
        ...prev,
        tagNames: [...prev.tagNames, customTagInput.trim()],
      }));
      setCustomTagInput('');
    }
  };

  /**
   * Remove tag from filters
   */
  const handleRemoveTag = (tagToRemove: string) => {
    setFilters(prev => ({
      ...prev,
      tagNames: prev.tagNames.filter(tag => tag !== tagToRemove),
    }));
  };

  /**
   * Toggle status filter
   */
  const handleStatusToggle = (status: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      status: checked
        ? [...prev.status, status]
        : prev.status.filter(s => s !== status),
    }));
  };

  /**
   * Clear all filters
   */
  const handleClearFilters = () => {
    setFilters({
      locationIds: [],
      tagNames: [],
      status: [],
      createdAfter: '',
      createdBefore: '',
    });
  };

  /**
   * Get active filter count for display
   */
  const getActiveFilterCount = () => {
    if (!useFilters) return 0;

    return (
      filters.locationIds.length +
      filters.tagNames.length +
      filters.status.length +
      (filters.createdAfter ? 1 : 0) +
      (filters.createdBefore ? 1 : 0)
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Export Format Selection */}
      <div className="space-y-3">
        <Label htmlFor="format" className="text-base font-medium">
          Export Format
        </Label>
        <Select value={format} onValueChange={(value: 'csv') => setFormat(value)}>
          <SelectTrigger id="format">
            <SelectValue placeholder="Select export format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CSV (Comma-Separated Values)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          CSV format includes all item details, locations, photos, and tags. Compatible with Excel,
          Google Sheets, and other spreadsheet applications.
        </p>
      </div>

      {/* Advanced Filters Toggle */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="use-filters"
            checked={useFilters}
            onCheckedChange={(checked) => setUseFilters(checked === true)}
          />
          <Label htmlFor="use-filters" className="text-base font-medium cursor-pointer">
            Apply Advanced Filters
            {useFilters && getActiveFilterCount() > 0 && (
              <Badge variant="secondary" className="ml-2">
                {getActiveFilterCount()} active
              </Badge>
            )}
          </Label>
        </div>

        {useFilters && (
          <Card className="border-dashed">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Export Filters
              </CardTitle>
              <CardDescription>
                Apply filters to export only specific items. Leave empty to export all items.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="status" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="status">Status</TabsTrigger>
                  <TabsTrigger value="tags">Tags</TabsTrigger>
                  <TabsTrigger value="dates">Dates</TabsTrigger>
                  <TabsTrigger value="locations">Locations</TabsTrigger>
                </TabsList>

                {/* Status Filters */}
                <TabsContent value="status" className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Item Status</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {ITEM_STATUSES.map((status) => (
                        <div key={status.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`status-${status.value}`}
                            checked={filters.status.includes(status.value)}
                            onCheckedChange={(checked) =>
                              handleStatusToggle(status.value, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={`status-${status.value}`}
                            className="text-sm cursor-pointer"
                          >
                            {status.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Tag Filters */}
                <TabsContent value="tags" className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Filter by Tags</Label>
                    <div className="flex gap-2 mb-3">
                      <Input
                        placeholder="Enter tag name..."
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddTag}
                        disabled={!customTagInput.trim()}
                      >
                        <Tag className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>

                    {filters.tagNames.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {filters.tagNames.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => handleRemoveTag(tag)}
                          >
                            {tag}
                            <span className="ml-1 text-xs">×</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Date Filters */}
                <TabsContent value="dates" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="created-after" className="text-sm font-medium">
                        Created After
                      </Label>
                      <Input
                        id="created-after"
                        type="date"
                        value={filters.createdAfter}
                        onChange={(e) =>
                          setFilters(prev => ({ ...prev, createdAfter: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="created-before" className="text-sm font-medium">
                        Created Before
                      </Label>
                      <Input
                        id="created-before"
                        type="date"
                        value={filters.createdBefore}
                        onChange={(e) =>
                          setFilters(prev => ({ ...prev, createdBefore: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Location Filters */}
                <TabsContent value="locations" className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Filter by Locations</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Location filtering will be available in the next version. For now, all
                      accessible locations will be included in the export.
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm">All locations included</span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {getActiveFilterCount() > 0 && (
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    {getActiveFilterCount()} filter(s) active
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isLoading} className="min-w-[200px]">
          {isLoading ? (
            <>
              <Settings className="h-4 w-4 mr-2 animate-spin" />
              Creating Export...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Create Export
            </>
          )}
        </Button>
      </div>

      {/* Export Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">What&apos;s included in your export:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Complete item details (name, description, quantity, values, dates)</li>
          <li>• Location hierarchy and paths</li>
          <li>• Photo URLs for all item images</li>
          <li>• All associated tags and metadata</li>
          <li>• Household information</li>
        </ul>
      </div>
    </form>
  );
}