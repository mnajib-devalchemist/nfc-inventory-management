'use client';

import React, { useState } from 'react';
import { ItemForm } from '@/components/inventory/ItemForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LocationType } from '@prisma/client';

/**
 * Location interface for form
 */
interface Location {
  id: string;
  name: string;
  path: string;
  locationType: LocationType;
  parentId: string | null;
  level: number;
  itemCount?: number;
}

/**
 * Item interface
 */
interface Item {
  id?: string;
  name: string;
  description?: string | null;
  locationId: string;
  quantity: number;
  unit: string;
  purchasePrice?: number | null;
  currentValue?: number | null;
  purchaseDate?: Date | string | null;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
}

/**
 * Mock locations data
 */
const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc-1',
    name: 'Garage',
    path: 'Garage',
    locationType: LocationType.BUILDING,
    parentId: null,
    level: 0,
    itemCount: 5
  },
  {
    id: 'loc-2',
    name: 'Workbench',
    path: 'Garage → Workbench',
    locationType: LocationType.FURNITURE,
    parentId: 'loc-1',
    level: 1,
    itemCount: 3
  },
  {
    id: 'loc-3',
    name: 'Kitchen',
    path: 'Kitchen',
    locationType: LocationType.ROOM,
    parentId: null,
    level: 0,
    itemCount: 8
  },
  {
    id: 'loc-4',
    name: 'Master Bedroom',
    path: 'Master Bedroom',
    locationType: LocationType.ROOM,
    parentId: null,
    level: 0,
    itemCount: 2
  },
  {
    id: 'loc-5',
    name: 'Closet',
    path: 'Master Bedroom → Closet',
    locationType: LocationType.FURNITURE,
    parentId: 'loc-4',
    level: 1,
    itemCount: 12
  }
];

/**
 * New Item Page - Form for adding a new inventory item
 * 
 * This page provides a comprehensive form for adding new items with:
 * - React 19 useActionState form handling
 * - Photo upload with security validation
 * - Location selection with inline creation
 * - Mobile-responsive design
 * - Success/error state management
 * 
 * @page
 */
export default function NewItemPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>(MOCK_LOCATIONS);
  const [success, setSuccess] = useState(false);

  /**
   * Handle successful item creation
   */
  const handleSuccess = (item: Item) => {
    setSuccess(true);
    
    // Redirect to inventory after a short delay to show success message
    setTimeout(() => {
      router.push('/inventory');
    }, 2000);
  };

  /**
   * Handle cancellation
   */
  const handleCancel = () => {
    router.back();
  };

  /**
   * Handle location creation
   */
  const handleLocationCreate = async (locationData: {
    name: string;
    locationType: LocationType;
    parentId?: string;
    description?: string;
  }) => {
    // Mock location creation - in real app this would call API
    const newLocation: Location = {
      id: `loc-${Date.now()}`,
      name: locationData.name,
      path: locationData.parentId 
        ? `${locations.find(l => l.id === locationData.parentId)?.path} → ${locationData.name}`
        : locationData.name,
      locationType: locationData.locationType,
      parentId: locationData.parentId || null,
      level: locationData.parentId 
        ? (locations.find(l => l.id === locationData.parentId)?.level || 0) + 1
        : 0,
      itemCount: 0
    };

    setLocations(prev => [...prev, newLocation]);
    return newLocation;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Inventory
          </Button>
        </div>

        {/* Success State */}
        {success && (
          <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-800">Item Added Successfully!</h3>
                <p className="text-green-700">Redirecting to inventory...</p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <ItemForm
          mode="create"
          locations={locations}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          onLocationCreate={handleLocationCreate}
        />
      </div>
    </div>
  );
}

