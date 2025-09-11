import { PrismaClient } from '@prisma/client';
import { seedDevelopmentData } from './dev-data';

const prisma = new PrismaClient();

/**
 * Main seeding entry point
 * Determines which seed data to run based on environment
 */
async function main() {
  try {
    const environment = process.env.NODE_ENV || 'development';
    
    console.log(`🌱 Starting database seeding for ${environment} environment...`);
    
    if (environment === 'development' || environment === 'test') {
      await seedDevelopmentData();
    } else {
      console.log('⚠️ Production seeding not implemented yet');
      console.log('💡 For production, consider using data migration scripts instead');
    }
    
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('🎉 Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export { main as seedDatabase };