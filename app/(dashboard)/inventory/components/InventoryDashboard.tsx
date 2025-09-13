'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ItemGrid, ItemModal } from '@/components/inventory';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { 
  Plus, 
  Package, 
  TrendingUp, 
  MapPin, 
  DollarSign,
  AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemStatus, LocationType } from '@prisma/client';
import { useRouter } from 'next/navigation';

/**
 * Item data interface (mock for now)
 */
interface Item {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  currentValue?: number | null;
  purchasePrice?: number | null;
  purchaseDate?: Date | null;
  status: ItemStatus;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  location: {
    name: string;
    path: string;
  };
  photos?: Array<{
    id: string;
    thumbnailUrl: string;
    isPrimary: boolean;
  }>;
  creator?: {
    name: string | null;
    email: string;
  };
}

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
}

/**
 * Inventory statistics interface
 */
interface InventoryStats {
  totalItems: number;
  totalValue: number;
  locationsCount: number;
  recentlyAdded: number;
  statusBreakdown: Record<ItemStatus, number>;
}

/**
 * Mock data for development
 */
const MOCK_ITEMS: Item[] = [
  {
    id: '1',
    name: 'Cordless Power Drill',
    description: '18V cordless drill with battery and charger',
    quantity: 1,
    unit: 'piece',
    currentValue: 120.00,
    purchasePrice: 159.99,
    purchaseDate: new Date('2024-01-15'),
    status: ItemStatus.AVAILABLE,
    photoUrl: null,
    thumbnailUrl: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    location: {
      name: 'Workbench',
      path: 'Garage → Workbench'
    },
    creator: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  },
  {
    id: '2',
    name: 'Kitchen Stand Mixer',
    description: 'KitchenAid 5-quart stand mixer in red',
    quantity: 1,
    unit: 'piece',
    currentValue: 280.00,
    purchasePrice: 299.99,
    status: ItemStatus.AVAILABLE,
    photoUrl: null,
    thumbnailUrl: null,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-02-10'),
    location: {
      name: 'Kitchen Counter',
      path: 'Kitchen → Counter'
    },
    creator: {
      name: 'Jane Doe',
      email: 'jane@example.com'
    }
  }
];

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
  }
];

/**
 * InventoryDashboard - Main inventory management interface
 * 
 * Provides comprehensive inventory management with:
 * - Overview statistics and insights
 * - Item grid with search and filtering
 * - Add/edit/delete functionality
 * - Mobile-responsive design
 * - Integration with photo upload and location management
 * 
 * @component
 */
export function InventoryDashboard() {
  const router = useRouter();
  
  // State management
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS);
  const [locations, setLocations] = useState<Location[]>(MOCK_LOCATIONS);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<any>({});
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  /**
   * Calculate inventory statistics
   */
  const inventoryStats: InventoryStats = React.useMemo(() => {
    const totalItems = items.length;
    const totalValue = items.reduce((sum, item) => 
      sum + (item.currentValue || 0), 0
    );
    const locationsCount = locations.length;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentlyAdded = items.filter(item => 
      new Date(item.createdAt) > oneWeekAgo
    ).length;

    const statusBreakdown = items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<ItemStatus, number>);

    return {
      totalItems,
      totalValue,
      locationsCount,
      recentlyAdded,
      statusBreakdown
    };
  }, [items, locations]);

  /**
   * Handle adding new item
   */
  const handleAddNewItem = useCallback(() => {
    router.push('/inventory/new');
  }, [router]);

  /**
   * Handle viewing item details
   */
  const handleViewItem = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      setSelectedItem(item);
      setItemModalMode('view');
      setIsItemModalOpen(true);
    }
  }, [items]);

  /**
   * Handle editing item
   */
  const handleEditItem = useCallback((item: Item) => {
    setSelectedItem(item);
    setItemModalMode('edit');
    setIsItemModalOpen(true);
  }, []);

  /**
   * Handle deleting item
   */
  const handleDeleteItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
    setIsItemModalOpen(false);
  }, []);

  /**
   * Handle item modal close
   */
  const handleItemModalClose = useCallback(() => {
    setIsItemModalOpen(false);
    setSelectedItem(null);
  }, []);

  /**
   * Handle search
   */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    // TODO: Implement actual search API call
  }, []);

  /**
   * Handle filtering
   */
  const handleFilter = useCallback((newFilters: any) => {
    setFilters(newFilters);
    // TODO: Implement actual filter API call
  }, []);

  /**
   * Handle sorting
   */
  const handleSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setSortBy(field);
    setSortOrder(order);
    // TODO: Implement actual sort API call
  }, []);

  /**
   * Handle location creation
   */
  const handleLocationCreate = useCallback(async (locationData: {
    name: string;
    locationType: LocationType;
    parentId?: string;
    description?: string;
  }) => {
    // Mock location creation
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
  }, [locations]);

  // Filter items based on search and filters
  const filteredItems = React.useMemo(() => {
    let filtered = items;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.location.path.toLowerCase().includes(query)
      );
    }

    // Apply filters
    if (filters.status) {
      filtered = filtered.filter(item => item.status === filters.status);
    }
    if (filters.minValue !== undefined) {
      filtered = filtered.filter(item => (item.currentValue || 0) >= filters.minValue);
    }
    if (filters.maxValue !== undefined) {
      filtered = filtered.filter(item => (item.currentValue || 0) <= filters.maxValue);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy as keyof Item];
      let bValue: any = b[sortBy as keyof Item];

      if (sortBy === 'name') {
        aValue = a.name;
        bValue = b.name;
      } else if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [items, searchQuery, filters, sortBy, sortOrder]);

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">
            Manage your household items with photos and detailed information
          </p>
        </div>
        <Button onClick={handleAddNewItem} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventoryStats.totalItems}</div>
            <p className="text-xs text-muted-foreground">
              +{inventoryStats.recentlyAdded} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${inventoryStats.totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated current value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locations</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventoryStats.locationsCount}</div>
            <p className="text-xs text-muted-foreground">
              Organized storage areas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Overview</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {Object.entries(inventoryStats.statusBreakdown).map(([status, count]) => (
                <Badge key={status} variant="secondary" className="text-xs">
                  {count} {status.toLowerCase()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Items Grid */}
      <ItemGrid
        items={filteredItems}
        loading={loading}
        onEdit={handleEditItem}
        onDelete={handleDeleteItem}
        onView={handleViewItem}
        onAddNew={handleAddNewItem}
        onSearch={handleSearch}
        onFilter={handleFilter}
        onSort={handleSort}
        searchQuery={searchQuery}
        filters={filters}
        sortBy={sortBy}
        sortOrder={sortOrder}
        emptyStateMessage="No items in your inventory yet"
        emptyStateAction={
          <Button onClick={handleAddNewItem} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Item
          </Button>
        }
      />

      {/* Item Modal */}
      <ItemModal
        item={selectedItem}
        isOpen={isItemModalOpen}
        onClose={handleItemModalClose}
        onEdit={handleEditItem}
        onDelete={handleDeleteItem}
        onLocationCreate={handleLocationCreate}
        locations={locations}
        mode={itemModalMode}
      />
    </div>
  );
}