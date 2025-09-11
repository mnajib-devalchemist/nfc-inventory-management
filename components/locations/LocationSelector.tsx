'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  ChevronRight, 
  Home, 
  Plus, 
  MapPin, 
  Archive, 
  Container, 
  Building 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationType } from '@prisma/client';

/**
 * Location data interface
 */
interface Location {
  id: string;
  name: string;
  path: string;
  locationType: LocationType;
  parentId: string | null;
  level: number;
  itemCount?: number;
  children?: Location[];
}

/**
 * LocationSelector Component Props
 */
interface LocationSelectorProps {
  value?: string;
  onValueChange?: (locationId: string, location: Location) => void;
  locations?: Location[];
  onCreateLocation?: (locationData: { 
    name: string; 
    locationType: LocationType; 
    parentId?: string;
    description?: string;
  }) => Promise<Location>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showCreateButton?: boolean;
  showPath?: boolean;
  filterByType?: LocationType[];
}

/**
 * Location type icons mapping
 */
const LOCATION_TYPE_ICONS = {
  [LocationType.BUILDING]: Building,
  [LocationType.ROOM]: Home,
  [LocationType.FURNITURE]: Archive,
  [LocationType.CONTAINER]: Container,
  [LocationType.AREA]: MapPin,
};

/**
 * Location type colors for badges
 */
const LOCATION_TYPE_COLORS = {
  [LocationType.BUILDING]: 'bg-blue-100 text-blue-800',
  [LocationType.ROOM]: 'bg-green-100 text-green-800',
  [LocationType.FURNITURE]: 'bg-purple-100 text-purple-800',
  [LocationType.CONTAINER]: 'bg-orange-100 text-orange-800',
  [LocationType.AREA]: 'bg-gray-100 text-gray-800',
};

/**
 * LocationSelector - Hierarchical location picker with inline creation
 * 
 * Provides a user-friendly interface for selecting and creating locations
 * with proper hierarchy visualization and type management
 * 
 * @component
 */
export function LocationSelector({
  value,
  onValueChange,
  locations = [],
  onCreateLocation,
  placeholder = 'Select a location...',
  disabled = false,
  className,
  showCreateButton = true,
  showPath = true,
  filterByType,
}: LocationSelectorProps) {
  // State management
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);

  // New location form state
  const [newLocationForm, setNewLocationForm] = useState({
    name: '',
    locationType: LocationType.ROOM as LocationType,
    parentId: '',
    description: '',
  });

  /**
   * Filter locations based on type filter if provided
   */
  useEffect(() => {
    let filtered = locations;

    if (filterByType && filterByType.length > 0) {
      filtered = locations.filter(loc => filterByType.includes(loc.locationType));
    }

    // Sort locations by path for hierarchical display
    filtered = filtered.sort((a, b) => {
      // First by level (parents first)
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      // Then by path alphabetically
      return a.path.localeCompare(b.path);
    });

    setFilteredLocations(filtered);
  }, [locations, filterByType]);

  /**
   * Update selected location when value changes
   */
  useEffect(() => {
    if (value) {
      const location = locations.find(loc => loc.id === value);
      setSelectedLocation(location || null);
    } else {
      setSelectedLocation(null);
    }
  }, [value, locations]);

  /**
   * Handle location selection
   */
  const handleLocationSelect = useCallback((locationId: string) => {
    const location = locations.find(loc => loc.id === locationId);
    if (location && onValueChange) {
      onValueChange(locationId, location);
    }
  }, [locations, onValueChange]);

  /**
   * Handle new location creation
   */
  const handleCreateLocation = useCallback(async () => {
    if (!onCreateLocation || !newLocationForm.name.trim()) return;

    try {
      const newLocation = await onCreateLocation({
        name: newLocationForm.name.trim(),
        locationType: newLocationForm.locationType,
        parentId: newLocationForm.parentId || undefined,
        description: newLocationForm.description.trim() || undefined,
      });

      // Select the newly created location
      if (onValueChange) {
        onValueChange(newLocation.id, newLocation);
      }

      // Reset form and close dialog
      setNewLocationForm({
        name: '',
        locationType: LocationType.ROOM,
        parentId: '',
        description: '',
      });
      setIsCreateDialogOpen(false);

    } catch (error) {
      console.error('Failed to create location:', error);
      // TODO: Show error message to user
    }
  }, [newLocationForm, onCreateLocation, onValueChange]);

  /**
   * Render breadcrumb path for a location
   */
  const renderLocationPath = useCallback((location: Location) => {
    if (!showPath || !location.path.includes(' → ')) {
      return location.name;
    }

    const pathParts = location.path.split(' → ');
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {pathParts.map((part, index) => (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
            <span className={cn(
              index === pathParts.length - 1 ? 'font-medium' : 'text-muted-foreground'
            )}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  }, [showPath]);

  /**
   * Render location option with type icon and metadata
   */
  const renderLocationOption = useCallback((location: Location) => {
    const IconComponent = LOCATION_TYPE_ICONS[location.locationType];
    
    return (
      <div className="flex items-center gap-3 py-2">
        <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {renderLocationPath(location)}
            <Badge variant="secondary" className={cn(
              'text-xs px-2 py-0.5 flex-shrink-0',
              LOCATION_TYPE_COLORS[location.locationType]
            )}>
              {location.locationType.toLowerCase()}
            </Badge>
          </div>
          {location.itemCount !== undefined && location.itemCount > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {location.itemCount} items
            </div>
          )}
        </div>
      </div>
    );
  }, [renderLocationPath]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Location Selector */}
      <Select
        value={value || ''}
        onValueChange={handleLocationSelect}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder}>
            {selectedLocation && renderLocationPath(selectedLocation)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {filteredLocations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No locations available</p>
              {showCreateButton && onCreateLocation && (
                <p className="text-xs mt-1">Create your first location below</p>
              )}
            </div>
          ) : (
            filteredLocations.map((location) => (
              <SelectItem 
                key={location.id} 
                value={location.id}
                className="cursor-pointer"
              >
                {renderLocationOption(location)}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Create New Location Button */}
      {showCreateButton && onCreateLocation && (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Location
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Location</DialogTitle>
            </DialogHeader>
            
            <Card>
              <CardContent className="p-6 space-y-4">
                {/* Location Name */}
                <div className="space-y-2">
                  <Label htmlFor="location-name">Location Name *</Label>
                  <Input
                    id="location-name"
                    placeholder="e.g., Kitchen, Garage, Master Bedroom"
                    value={newLocationForm.name}
                    onChange={(e) => setNewLocationForm(prev => ({
                      ...prev,
                      name: e.target.value
                    }))}
                  />
                </div>

                {/* Location Type */}
                <div className="space-y-2">
                  <Label htmlFor="location-type">Location Type *</Label>
                  <Select
                    value={newLocationForm.locationType}
                    onValueChange={(value: LocationType) => 
                      setNewLocationForm(prev => ({ ...prev, locationType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(LocationType).map((type) => {
                        const IconComponent = LOCATION_TYPE_ICONS[type];
                        return (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              <span className="capitalize">{type.toLowerCase()}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Parent Location */}
                <div className="space-y-2">
                  <Label htmlFor="parent-location">Parent Location</Label>
                  <Select
                    value={newLocationForm.parentId}
                    onValueChange={(value) => 
                      setNewLocationForm(prev => ({ ...prev, parentId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent location (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No parent (root level)</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {renderLocationOption(location)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="location-description">Description</Label>
                  <Input
                    id="location-description"
                    placeholder="Optional description"
                    value={newLocationForm.description}
                    onChange={(e) => setNewLocationForm(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateLocation}
                    disabled={!newLocationForm.name.trim()}
                  >
                    Create Location
                  </Button>
                </div>
              </CardContent>
            </Card>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}