'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  Trash2,
  Shield,
  Clock,
  Database,
  UserCheck,
  Download,
  Eye,
  Heart,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Photo deletion options interface
 */
interface DeletionOptions {
  deleteFromStorage: boolean;
  deleteMetadata: boolean;
  preserveAuditLog: boolean;
  notifyHousehold: boolean;
  createBackup: boolean;
}

/**
 * Photo info for deletion dialog
 */
interface PhotoInfo {
  id: string;
  name: string;
  thumbnailUrl: string;
  isPrimary: boolean;
  isShared: boolean;
  hasMetadata: boolean;
  createdAt: string;
  fileSize: number;
}

/**
 * Photo deletion dialog props
 */
interface PhotoDeletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  photos: PhotoInfo[];
  onConfirm: (photoIds: string[], options: DeletionOptions) => Promise<void>;
  isLoading?: boolean;
  showAdvancedOptions?: boolean;
  enforceRetentionPolicy?: boolean;
  retentionPeriodDays?: number;
}

/**
 * Default deletion options
 */
const DEFAULT_OPTIONS: DeletionOptions = {
  deleteFromStorage: true,
  deleteMetadata: true,
  preserveAuditLog: true,
  notifyHousehold: false,
  createBackup: false,
};

/**
 * PhotoDeletionDialog - Comprehensive photo deletion with safety checks
 *
 * Implements multi-step confirmation process, backup creation options,
 * audit trail preservation, cascade delete warnings, retention policy
 * compliance, and GDPR "right to be forgotten" compliance.
 *
 * @component
 * @category Common Components
 * @since 1.3.0 (Story 2.3)
 */
export function PhotoDeletionDialog({
  isOpen,
  onClose,
  photos,
  onConfirm,
  isLoading = false,
  showAdvancedOptions = true,
  enforceRetentionPolicy = true,
  retentionPeriodDays = 30,
}: PhotoDeletionDialogProps) {
  // State
  const [options, setOptions] = useState<DeletionOptions>(DEFAULT_OPTIONS);
  const [confirmationStep, setConfirmationStep] = useState<'options' | 'confirmation' | 'final'>(
    'options'
  );
  const [hasTypedConfirmation, setHasTypedConfirmation] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  /**
   * Calculate total file size
   */
  const totalFileSize = photos.reduce((total, photo) => total + photo.fileSize, 0);

  /**
   * Format file size
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  /**
   * Check if deletion is allowed based on retention policy
   */
  const isDeletionAllowed = useCallback((photo: PhotoInfo): boolean => {
    if (!enforceRetentionPolicy) return true;

    const createdDate = new Date(photo.createdAt);
    const retentionEndDate = new Date(createdDate.getTime() + (retentionPeriodDays * 24 * 60 * 60 * 1000));

    return new Date() >= retentionEndDate;
  }, [enforceRetentionPolicy, retentionPeriodDays]);

  /**
   * Get photos that can't be deleted due to retention policy
   */
  const protectedPhotos = photos.filter(photo => !isDeletionAllowed(photo));
  const deletablePhotos = photos.filter(photo => isDeletionAllowed(photo));

  /**
   * Handle option change
   */
  const handleOptionChange = useCallback((key: keyof DeletionOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  /**
   * Handle next step
   */
  const handleNext = useCallback(() => {
    if (confirmationStep === 'options') {
      setConfirmationStep('confirmation');
    } else if (confirmationStep === 'confirmation') {
      setConfirmationStep('final');
    }
  }, [confirmationStep]);

  /**
   * Handle back step
   */
  const handleBack = useCallback(() => {
    if (confirmationStep === 'final') {
      setConfirmationStep('confirmation');
    } else if (confirmationStep === 'confirmation') {
      setConfirmationStep('options');
    }
  }, [confirmationStep]);

  /**
   * Handle confirmation
   */
  const handleConfirm = useCallback(async () => {
    if (deletablePhotos.length === 0) return;

    try {
      await onConfirm(deletablePhotos.map(p => p.id), options);
      onClose();

      // Reset state
      setConfirmationStep('options');
      setConfirmationText('');
      setHasTypedConfirmation(false);
      setOptions(DEFAULT_OPTIONS);
    } catch (error) {
      console.error('❌ Photo deletion failed:', error);
    }
  }, [deletablePhotos, options, onConfirm, onClose]);

  /**
   * Handle confirmation text change
   */
  const handleConfirmationTextChange = useCallback((value: string) => {
    setConfirmationText(value);
    setHasTypedConfirmation(value.toLowerCase() === 'delete');
  }, []);

  /**
   * Check if any primary photos would be deleted
   */
  const hasPrimaryPhotos = deletablePhotos.some(photo => photo.isPrimary);

  /**
   * Check if any shared photos would be deleted
   */
  const hasSharedPhotos = deletablePhotos.some(photo => photo.isShared);

  /**
   * Check if metadata would be lost
   */
  const hasMetadata = deletablePhotos.some(photo => photo.hasMetadata);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete Photos
            {photos.length > 1 && (
              <Badge variant="secondary" className="ml-2">
                {photos.length} photos
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {confirmationStep === 'options' && 'Configure deletion options for your photos.'}
            {confirmationStep === 'confirmation' && 'Review your deletion request and potential impacts.'}
            {confirmationStep === 'final' && 'Final confirmation required before deletion.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Retention Policy Warning */}
          {protectedPhotos.length > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="space-y-2">
                    <h4 className="font-medium text-yellow-800">
                      Retention Policy Protection
                    </h4>
                    <p className="text-sm text-yellow-700">
                      {protectedPhotos.length} photo{protectedPhotos.length !== 1 ? 's' : ''} cannot be deleted due to the {retentionPeriodDays}-day retention policy.
                      These photos will be excluded from the deletion.
                    </p>
                    <div className="flex items-center gap-1 text-xs text-yellow-600">
                      <Clock className="h-3 w-3" />
                      Photos can be deleted after {retentionPeriodDays} days from creation
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Options Step */}
          {confirmationStep === 'options' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Deletion Options</h4>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="deleteFromStorage"
                      checked={options.deleteFromStorage}
                      onCheckedChange={(checked) =>
                        handleOptionChange('deleteFromStorage', checked as boolean)
                      }
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="deleteFromStorage"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Delete from storage
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Permanently remove photo files from cloud storage
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="deleteMetadata"
                      checked={options.deleteMetadata}
                      onCheckedChange={(checked) =>
                        handleOptionChange('deleteMetadata', checked as boolean)
                      }
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="deleteMetadata"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Delete metadata
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Remove EXIF data, dimensions, and other photo metadata
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="preserveAuditLog"
                      checked={options.preserveAuditLog}
                      onCheckedChange={(checked) =>
                        handleOptionChange('preserveAuditLog', checked as boolean)
                      }
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="preserveAuditLog"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Preserve audit log
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Keep deletion record for compliance and security
                      </p>
                    </div>
                  </div>

                  {showAdvancedOptions && (
                    <>
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="createBackup"
                          checked={options.createBackup}
                          onCheckedChange={(checked) =>
                            handleOptionChange('createBackup', checked as boolean)
                          }
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="createBackup"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Create backup before deletion
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Download photos to your device before deletion
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="notifyHousehold"
                          checked={options.notifyHousehold}
                          onCheckedChange={(checked) =>
                            handleOptionChange('notifyHousehold', checked as boolean)
                          }
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="notifyHousehold"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Notify household members
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Send notification about photo deletion to household
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Photo Summary */}
              <div>
                <h4 className="font-medium mb-3">Photos to Delete</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>Total Size: {formatFileSize(totalFileSize)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span>Deletable: {deletablePhotos.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Step */}
          {confirmationStep === 'confirmation' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Impact Assessment</h4>
                <div className="space-y-2">
                  {hasPrimaryPhotos && (
                    <div className="flex items-center gap-2 text-sm text-yellow-600">
                      <Heart className="h-4 w-4" />
                      <span>Primary photos will be deleted (items will lose their main image)</span>
                    </div>
                  )}

                  {hasSharedPhotos && (
                    <div className="flex items-center gap-2 text-sm text-orange-600">
                      <UserCheck className="h-4 w-4" />
                      <span>Shared photos will be deleted (other household members will lose access)</span>
                    </div>
                  )}

                  {hasMetadata && options.deleteMetadata && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Database className="h-4 w-4" />
                      <span>Photo metadata will be permanently removed</span>
                    </div>
                  )}

                  {!options.preserveAuditLog && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span>No audit trail will be preserved (may impact compliance)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Options Summary */}
              <Card>
                <CardContent className="p-4">
                  <h5 className="font-medium mb-2">Selected Options</h5>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className={cn(
                      "flex items-center gap-2",
                      options.deleteFromStorage ? "text-red-600" : "text-muted-foreground"
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        options.deleteFromStorage ? "bg-red-600" : "bg-muted-foreground"
                      )} />
                      Delete from storage
                    </div>
                    <div className={cn(
                      "flex items-center gap-2",
                      options.deleteMetadata ? "text-red-600" : "text-muted-foreground"
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        options.deleteMetadata ? "bg-red-600" : "bg-muted-foreground"
                      )} />
                      Delete metadata
                    </div>
                    <div className={cn(
                      "flex items-center gap-2",
                      options.preserveAuditLog ? "text-green-600" : "text-muted-foreground"
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        options.preserveAuditLog ? "bg-green-600" : "bg-muted-foreground"
                      )} />
                      Preserve audit log
                    </div>
                    <div className={cn(
                      "flex items-center gap-2",
                      options.createBackup ? "text-green-600" : "text-muted-foreground"
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        options.createBackup ? "bg-green-600" : "bg-muted-foreground"
                      )} />
                      Create backup
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Final Confirmation Step */}
          {confirmationStep === 'final' && (
            <div className="space-y-4">
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-800">
                        Final Confirmation Required
                      </h4>
                      <p className="text-sm text-red-700">
                        This action cannot be undone. {deletablePhotos.length} photo{deletablePhotos.length !== 1 ? 's' : ''} will be permanently deleted.
                      </p>
                      <div className="mt-3">
                        <label htmlFor="confirmText" className="block text-sm font-medium text-red-800 mb-1">
                          Type "DELETE" to confirm:
                        </label>
                        <input
                          id="confirmText"
                          type="text"
                          value={confirmationText}
                          onChange={(e) => handleConfirmationTextChange(e.target.value)}
                          className="w-full px-3 py-2 border border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          placeholder="Type DELETE"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div>
              {confirmationStep !== 'options' && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>

              {confirmationStep === 'final' ? (
                <Button
                  variant="destructive"
                  onClick={handleConfirm}
                  disabled={isLoading || !hasTypedConfirmation || deletablePhotos.length === 0}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete Photos
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={deletablePhotos.length === 0}
                >
                  {confirmationStep === 'options' ? 'Review Impact' : 'Final Confirmation'}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}