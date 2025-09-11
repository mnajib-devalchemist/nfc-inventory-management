'use server';

import { auth } from '@/lib/auth';
import { validateImageFile } from '@/lib/utils/file-validation';
import { processPhotoUpload, deleteItemPhotos } from '@/lib/utils/photos';
import { revalidatePath } from 'next/cache';

/**
 * Server action for secure photo upload
 * Implements comprehensive security validation and processing
 */
export async function uploadPhotoAction(itemId: string, formData: FormData) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required' 
      };
    }

    // 2. Extract file from form data
    const file = formData.get('photo') as File;
    if (!file || file.size === 0) {
      return { 
        success: false, 
        error: 'No file provided' 
      };
    }

    // 3. Comprehensive file validation (SEC-003 mitigation)
    const validationResult = await validateImageFile(file);
    if (!validationResult.valid) {
      return { 
        success: false, 
        error: validationResult.error || 'File validation failed' 
      };
    }

    // 4. Process and store the photo securely
    const photoResult = await processPhotoUpload(file, itemId);

    // 5. TODO: Update database with photo information
    // This would integrate with the items service to store photo metadata
    // await itemsService.addItemPhoto(itemId, {
    //   photoUrl: photoResult.photoUrl,
    //   thumbnailUrl: photoResult.thumbnailUrl,
    //   metadata: photoResult.metadata
    // });

    // 6. Revalidate relevant paths
    revalidatePath(`/inventory/${itemId}`);
    revalidatePath('/inventory');

    return {
      success: true,
      photoUrl: photoResult.photoUrl,
      thumbnailUrl: photoResult.thumbnailUrl,
      metadata: photoResult.metadata,
      message: 'Photo uploaded successfully'
    };

  } catch (error) {
    console.error('Photo upload action error:', error);
    
    // Provide user-friendly error messages while logging details
    let userMessage = 'Photo upload failed';
    
    if (error instanceof Error) {
      if (error.message.includes('processing failed')) {
        userMessage = 'The image could not be processed. Please try a different image.';
      } else if (error.message.includes('storage')) {
        userMessage = 'Could not save the image. Please try again.';
      } else if (error.message.includes('validation')) {
        userMessage = 'The selected file is not a valid image.';
      }
    }

    return {
      success: false,
      error: userMessage
    };
  }
}

/**
 * Server action for removing a photo
 * Cleans up stored files and database references
 */
export async function removePhotoAction(itemId: string, photoId?: string) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required' 
      };
    }

    // 2. TODO: Verify user has permission to modify this item
    // This would check the item belongs to the user's household

    // 3. Remove specific photo or all photos for item
    if (photoId) {
      // TODO: Remove specific photo from database and filesystem
      // For MVP, we'll implement removal of all photos for the item
    }
    
    // Remove all photos for the item (MVP approach - single photo per item)
    await deleteItemPhotos(itemId);

    // 4. TODO: Update database to remove photo references
    // await itemsService.removeItemPhotos(itemId);

    // 5. Revalidate relevant paths
    revalidatePath(`/inventory/${itemId}`);
    revalidatePath('/inventory');

    return {
      success: true,
      message: 'Photo removed successfully'
    };

  } catch (error) {
    console.error('Photo removal action error:', error);
    
    return {
      success: false,
      error: 'Failed to remove photo'
    };
  }
}

/**
 * Server action for bulk photo upload validation
 * Validates multiple files for potential batch processing
 */
export async function validatePhotosAction(formData: FormData) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required' 
      };
    }

    // 2. Extract all files from form data
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('photo') && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return { 
        success: false, 
        error: 'No files provided' 
      };
    }

    // 3. Validate all files
    const validationResults = await Promise.all(
      files.map(async (file, index) => ({
        index,
        filename: file.name,
        size: file.size,
        validation: await validateImageFile(file)
      }))
    );

    // 4. Separate valid and invalid files
    const validFiles = validationResults.filter(r => r.validation.valid);
    const invalidFiles = validationResults.filter(r => !r.validation.valid);

    return {
      success: true,
      totalFiles: files.length,
      validFiles: validFiles.length,
      invalidFiles: invalidFiles.length,
      errors: invalidFiles.map(f => ({
        filename: f.filename,
        error: f.validation.error
      }))
    };

  } catch (error) {
    console.error('Photo validation action error:', error);
    
    return {
      success: false,
      error: 'Failed to validate photos'
    };
  }
}

/**
 * Server action to get photo storage statistics
 * For admin monitoring and storage management
 */
export async function getStorageStatsAction() {
  try {
    // 1. Authentication check (admin only)
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required' 
      };
    }

    // TODO: Check if user is admin
    // if (!session.user.isAdmin) {
    //   return { success: false, error: 'Admin access required' };
    // }

    // 2. Get storage statistics
    const { getPhotoStorageStats } = await import('@/lib/utils/photos');
    const stats = await getPhotoStorageStats();

    return {
      success: true,
      stats
    };

  } catch (error) {
    console.error('Storage stats action error:', error);
    
    return {
      success: false,
      error: 'Failed to get storage statistics'
    };
  }
}

/**
 * Server action for photo cleanup (admin only)
 * Removes old or orphaned photo files
 */
export async function cleanupPhotosAction(maxAgeDays: number = 7) {
  try {
    // 1. Authentication check (admin only)
    const session = await auth();
    if (!session?.user?.id) {
      return { 
        success: false, 
        error: 'Authentication required' 
      };
    }

    // TODO: Check if user is admin
    // if (!session.user.isAdmin) {
    //   return { success: false, error: 'Admin access required' };
    // }

    // 2. Perform cleanup
    const { cleanupOrphanedPhotos } = await import('@/lib/utils/photos');
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cleanupResult = await cleanupOrphanedPhotos(maxAgeMs);

    return {
      success: true,
      result: cleanupResult
    };

  } catch (error) {
    console.error('Photo cleanup action error:', error);
    
    return {
      success: false,
      error: 'Failed to cleanup photos'
    };
  }
}