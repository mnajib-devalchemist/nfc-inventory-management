import { PrismaClient, LocationType, ItemStatus, PhotoStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Development seed data for testing and development
 */

export const seedUsers = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Johnson',
    subscriptionTier: 'free',
    preferences: {
      theme: 'light',
      notifications: true,
      language: 'en',
    },
  },
  {
    id: 'user-2', 
    email: 'bob@example.com',
    name: 'Bob Smith',
    subscriptionTier: 'premium',
    preferences: {
      theme: 'dark',
      notifications: false,
      language: 'en',
    },
  },
];

export const seedHouseholds = [
  {
    id: 'household-1',
    name: 'Johnson Family',
    description: 'Main family household',
    settings: {
      allowGuests: true,
      requireApproval: false,
      defaultLocationAccess: 'read',
    },
  },
  {
    id: 'household-2',
    name: 'Smith Residence',
    description: 'Bob\'s apartment',
    settings: {
      allowGuests: false,
      requireApproval: true,
      defaultLocationAccess: 'none',
    },
  },
];

export const seedHouseholdMembers = [
  {
    id: 'member-1',
    userId: 'user-1',
    householdId: 'household-1',
    role: 'owner',
    permissions: {
      canCreateItems: true,
      canDeleteItems: true,
      canManageLocations: true,
      canInviteMembers: true,
    },
  },
  {
    id: 'member-2',
    userId: 'user-2',
    householdId: 'household-2',
    role: 'owner',
    permissions: {
      canCreateItems: true,
      canDeleteItems: true,
      canManageLocations: true,
      canInviteMembers: true,
    },
  },
];

export const seedLocations = [
  // Johnson Family locations
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    householdId: 'household-1',
    name: 'Garage',
    description: 'Main garage for tools and storage',
    parentId: null,
    path: 'Garage',
    level: 0,
    locationType: LocationType.ROOM,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    householdId: 'household-1',
    name: 'Workbench',
    description: 'Main workbench in garage',
    parentId: '550e8400-e29b-41d4-a716-446655440001',
    path: 'Garage → Workbench',
    level: 1,
    locationType: LocationType.FURNITURE,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    householdId: 'household-1',
    name: 'Tool Drawer',
    description: 'Right side tool drawer',
    parentId: '550e8400-e29b-41d4-a716-446655440002',
    path: 'Garage → Workbench → Tool Drawer',
    level: 2,
    locationType: LocationType.CONTAINER,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    householdId: 'household-1',
    name: 'Kitchen',
    description: 'Main kitchen',
    parentId: null,
    path: 'Kitchen',
    level: 0,
    locationType: LocationType.ROOM,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    householdId: 'household-1',
    name: 'Pantry',
    description: 'Kitchen pantry',
    parentId: '550e8400-e29b-41d4-a716-446655440004',
    path: 'Kitchen → Pantry',
    level: 1,
    locationType: LocationType.CONTAINER,
  },
  
  // Bob's apartment locations
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    householdId: 'household-2',
    name: 'Living Room',
    description: 'Main living area',
    parentId: null,
    path: 'Living Room',
    level: 0,
    locationType: LocationType.ROOM,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440007',
    householdId: 'household-2',
    name: 'TV Stand',
    description: 'Entertainment center',
    parentId: '550e8400-e29b-41d4-a716-446655440006',
    path: 'Living Room → TV Stand',
    level: 1,
    locationType: LocationType.FURNITURE,
  },
];

export const seedTags = [
  // Johnson Family tags
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    householdId: 'household-1',
    name: 'tools',
    color: '#EF4444',
    usageCount: 5,
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    householdId: 'household-1',
    name: 'power-tools',
    color: '#F97316',
    usageCount: 3,
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440003',
    householdId: 'household-1',
    name: 'kitchen',
    color: '#10B981',
    usageCount: 8,
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440004',
    householdId: 'household-1',
    name: 'expensive',
    color: '#8B5CF6',
    usageCount: 2,
  },
  
  // Bob's tags
  {
    id: '660e8400-e29b-41d4-a716-446655440005',
    householdId: 'household-2',
    name: 'electronics',
    color: '#3B82F6',
    usageCount: 4,
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440006',
    householdId: 'household-2',
    name: 'gaming',
    color: '#EC4899',
    usageCount: 2,
  },
];

export const seedItems = [
  // Johnson Family items
  {
    id: '770e8400-e29b-41d4-a716-446655440001',
    householdId: 'household-1',
    locationId: '550e8400-e29b-41d4-a716-446655440003', // Tool Drawer
    name: 'Power Drill',
    description: 'Cordless 18V power drill with battery and charger',
    quantity: 1,
    unit: 'piece',
    purchasePrice: 159.99,
    currentValue: 140.00,
    purchaseDate: new Date('2023-06-15'),
    status: ItemStatus.AVAILABLE,
    metadata: {
      brand: 'DeWalt',
      model: 'DCD771C2',
      serialNumber: 'DW123456789',
      warranty: 'valid until 2026-06-15',
    },
    createdBy: 'user-1',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440002',
    householdId: 'household-1',
    locationId: '550e8400-e29b-41d4-a716-446655440003', // Tool Drawer
    name: 'Screwdriver Set',
    description: 'Phillips and flathead screwdrivers, various sizes',
    quantity: 1,
    unit: 'set',
    purchasePrice: 24.99,
    currentValue: 20.00,
    purchaseDate: new Date('2023-08-20'),
    status: ItemStatus.AVAILABLE,
    metadata: {
      brand: 'Craftsman',
      pieces: 12,
      material: 'chrome vanadium steel',
    },
    createdBy: 'user-1',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440003',
    householdId: 'household-1',
    locationId: '550e8400-e29b-41d4-a716-446655440005', // Pantry
    name: 'Stand Mixer',
    description: 'Heavy duty stand mixer for baking',
    quantity: 1,
    unit: 'piece',
    purchasePrice: 399.99,
    currentValue: 350.00,
    purchaseDate: new Date('2023-03-10'),
    status: ItemStatus.AVAILABLE,
    metadata: {
      brand: 'KitchenAid',
      model: 'KSM150PS',
      color: 'Imperial Red',
      attachments: ['dough hook', 'wire whip', 'flat beater'],
    },
    createdBy: 'user-1',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440004',
    householdId: 'household-1',
    locationId: '550e8400-e29b-41d4-a716-446655440002', // Workbench
    name: 'Circular Saw',
    description: '7-1/4" circular saw with laser guide',
    quantity: 1,
    unit: 'piece',
    purchasePrice: 89.99,
    currentValue: 75.00,
    purchaseDate: new Date('2023-09-05'),
    status: ItemStatus.BORROWED,
    borrowedBy: 'user-2',
    borrowedAt: new Date('2024-01-08'),
    borrowedUntil: new Date('2024-01-15'),
    metadata: {
      brand: 'Black & Decker',
      model: 'BDECS300C',
      bladeDiameter: '7.25 inches',
    },
    createdBy: 'user-1',
  },
  
  // Bob's items
  {
    id: '770e8400-e29b-41d4-a716-446655440005',
    householdId: 'household-2',
    locationId: '550e8400-e29b-41d4-a716-446655440007', // TV Stand
    name: 'Gaming Console',
    description: 'PlayStation 5 gaming console',
    quantity: 1,
    unit: 'piece',
    purchasePrice: 499.99,
    currentValue: 450.00,
    purchaseDate: new Date('2023-11-20'),
    status: ItemStatus.AVAILABLE,
    metadata: {
      brand: 'Sony',
      model: 'PlayStation 5',
      storage: '825GB SSD',
      serialNumber: 'PS5123456789',
    },
    createdBy: 'user-2',
  },
  {
    id: '770e8400-e29b-41d4-a716-446655440006',
    householdId: 'household-2',
    locationId: '550e8400-e29b-41d4-a716-446655440007', // TV Stand
    name: '4K TV',
    description: '55" OLED 4K Smart TV',
    quantity: 1,
    unit: 'piece',
    purchasePrice: 1299.99,
    currentValue: 1100.00,
    purchaseDate: new Date('2023-07-15'),
    status: ItemStatus.AVAILABLE,
    metadata: {
      brand: 'LG',
      model: 'OLED55C3PUA',
      screenSize: '55 inches',
      resolution: '4K Ultra HD',
      smartFeatures: ['webOS', 'Dolby Vision', 'Dolby Atmos'],
    },
    createdBy: 'user-2',
  },
];

export const seedItemTags = [
  // Power drill tags
  { itemId: '770e8400-e29b-41d4-a716-446655440001', tagId: '660e8400-e29b-41d4-a716-446655440001' }, // tools
  { itemId: '770e8400-e29b-41d4-a716-446655440001', tagId: '660e8400-e29b-41d4-a716-446655440002' }, // power-tools
  { itemId: '770e8400-e29b-41d4-a716-446655440001', tagId: '660e8400-e29b-41d4-a716-446655440004' }, // expensive
  
  // Screwdriver set tags
  { itemId: '770e8400-e29b-41d4-a716-446655440002', tagId: '660e8400-e29b-41d4-a716-446655440001' }, // tools
  
  // Stand mixer tags
  { itemId: '770e8400-e29b-41d4-a716-446655440003', tagId: '660e8400-e29b-41d4-a716-446655440003' }, // kitchen
  { itemId: '770e8400-e29b-41d4-a716-446655440003', tagId: '660e8400-e29b-41d4-a716-446655440004' }, // expensive
  
  // Circular saw tags
  { itemId: '770e8400-e29b-41d4-a716-446655440004', tagId: '660e8400-e29b-41d4-a716-446655440001' }, // tools
  { itemId: '770e8400-e29b-41d4-a716-446655440004', tagId: '660e8400-e29b-41d4-a716-446655440002' }, // power-tools
  
  // Gaming console tags
  { itemId: '770e8400-e29b-41d4-a716-446655440005', tagId: '660e8400-e29b-41d4-a716-446655440005' }, // electronics
  { itemId: '770e8400-e29b-41d4-a716-446655440005', tagId: '660e8400-e29b-41d4-a716-446655440006' }, // gaming
  
  // 4K TV tags
  { itemId: '770e8400-e29b-41d4-a716-446655440006', tagId: '660e8400-e29b-41d4-a716-446655440005' }, // electronics
];

export const seedItemPhotos = [
  // Power drill photos
  {
    id: '880e8400-e29b-41d4-a716-446655440001',
    itemId: '770e8400-e29b-41d4-a716-446655440001',
    originalUrl: 'https://example.com/photos/power-drill-original.jpg',
    thumbnailUrl: 'https://example.com/photos/power-drill-thumb.jpg',
    optimizedUrl: 'https://example.com/photos/power-drill-optimized.jpg',
    filename: 'power-drill-001.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2547890,
    width: 1920,
    height: 1080,
    processingStatus: PhotoStatus.COMPLETED,
    optimizationSavings: 65.5,
    displayOrder: 0,
    isPrimary: true,
    uploadedBy: 'user-1',
  },
  
  // Stand mixer photos
  {
    id: '880e8400-e29b-41d4-a716-446655440002',
    itemId: '770e8400-e29b-41d4-a716-446655440003',
    originalUrl: 'https://example.com/photos/stand-mixer-original.jpg',
    thumbnailUrl: 'https://example.com/photos/stand-mixer-thumb.jpg',
    optimizedUrl: 'https://example.com/photos/stand-mixer-optimized.jpg',
    filename: 'stand-mixer-001.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1890456,
    width: 1280,
    height: 960,
    processingStatus: PhotoStatus.COMPLETED,
    optimizationSavings: 72.3,
    displayOrder: 0,
    isPrimary: true,
    uploadedBy: 'user-1',
  },
  
  // Gaming console photos
  {
    id: '880e8400-e29b-41d4-a716-446655440003',
    itemId: '770e8400-e29b-41d4-a716-446655440005',
    originalUrl: 'https://example.com/photos/ps5-original.jpg',
    thumbnailUrl: 'https://example.com/photos/ps5-thumb.jpg',
    optimizedUrl: 'https://example.com/photos/ps5-optimized.jpg',
    filename: 'ps5-console-001.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1567234,
    width: 1600,
    height: 1200,
    processingStatus: PhotoStatus.COMPLETED,
    optimizationSavings: 58.9,
    displayOrder: 0,
    isPrimary: true,
    uploadedBy: 'user-2',
  },
];

/**
 * Main seeding function for development data
 */
export async function seedDevelopmentData() {
  console.log('🌱 Starting development data seeding...');

  // Clean existing data in development
  await prisma.itemTag.deleteMany();
  await prisma.itemPhoto.deleteMany();
  await prisma.item.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.location.deleteMany();
  await prisma.householdMember.deleteMany();
  await prisma.household.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleaned existing data');

  // Seed households first (required for foreign key constraints)
  for (const household of seedHouseholds) {
    await prisma.household.create({
      data: {
        id: household.id,
        name: household.name,
        description: household.description,
        settings: household.settings,
      },
    });
  }
  console.log('🏠 Seeded households');

  // Seed users with default household assignments
  for (const user of seedUsers) {
    // Assign default household IDs for proper authentication testing
    const defaultHouseholdId = user.id === 'user-1' ? 'household-1' : 'household-2';
    
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscriptionTier,
        preferences: user.preferences,
        defaultHouseholdId,
      },
    });
  }
  console.log('👥 Seeded users with default household assignments');

  // Seed household members
  for (const member of seedHouseholdMembers) {
    await prisma.householdMember.create({
      data: {
        id: member.id,
        userId: member.userId,
        householdId: member.householdId,
        role: member.role,
        permissions: member.permissions,
      },
    });
  }
  console.log('👨‍👩‍👧‍👦 Seeded household members');

  // Seed locations
  for (const location of seedLocations) {
    await prisma.location.create({
      data: location,
    });
  }
  console.log('📍 Seeded locations');

  // Seed tags
  for (const tag of seedTags) {
    await prisma.tag.create({
      data: tag,
    });
  }
  console.log('🏷️ Seeded tags');

  // Seed items
  for (const item of seedItems) {
    await prisma.item.create({
      data: item,
    });
  }
  console.log('📦 Seeded items');

  // Seed item tags
  for (const itemTag of seedItemTags) {
    await prisma.itemTag.create({
      data: itemTag,
    });
  }
  console.log('🔗 Seeded item tags');

  // Seed item photos
  for (const photo of seedItemPhotos) {
    await prisma.itemPhoto.create({
      data: photo,
    });
  }
  console.log('📷 Seeded item photos');

  // Update location statistics
  await updateLocationStatistics();

  console.log('✅ Development data seeding completed successfully!');
}

/**
 * Update location item counts and total values
 */
async function updateLocationStatistics() {
  const locations = await prisma.location.findMany({
    include: {
      items: {
        select: {
          currentValue: true,
        },
      },
    },
  });

  for (const location of locations) {
    const itemCount = location.items.length;
    const totalValue = location.items.reduce(
      (sum, item) => sum + (item.currentValue?.toNumber() || 0),
      0
    );

    await prisma.location.update({
      where: { id: location.id },
      data: {
        itemCount,
        totalValue,
        lastAccessed: new Date(),
      },
    });
  }

  console.log('📊 Updated location statistics');
}