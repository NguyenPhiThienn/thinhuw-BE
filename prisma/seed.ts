/**
 * Thinhuw — Prisma Seed Script
 * Chỉ tạo dữ liệu cấu hình mặc định (không có mock users).
 *
 * Chạy: npm run db:seed --workspace=apps/api
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Thinhuw database...\n');

  // Seed script hiện tại không tạo mock data.
  // Người dùng tự đăng ký qua app với OTP xác thực thực tế.

  console.log('✅ Seed complete — no mock data. Use the app to register real users.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
