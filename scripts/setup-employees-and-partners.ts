import { prisma } from '../server/src/prisma/prisma.service';
import { AuthService } from '../server/src/auth/auth.service';

async function main() {
  console.log('🚀 Setting up Stores, Partners, and Sellers...');

  // 1. Ensure the 3 retail stores and 1 main warehouse exist
  const storesData = [
    { id: 'main-warehouse', name: 'Главный склад', isMainWarehouse: true },
    { id: 'store-sadbarg', name: 'Магазин «Садбарг»', isMainWarehouse: false },
    { id: 'store-siyoma', name: 'Магазин «Сиёма»', isMainWarehouse: false },
    { id: 'store-tsum', name: 'Магазин «ЦУМ»', isMainWarehouse: false },
  ];

  for (const st of storesData) {
    await prisma.store.upsert({
      where: { id: st.id },
      update: { name: st.name, isMainWarehouse: st.isMainWarehouse },
      create: { id: st.id, name: st.name, isMainWarehouse: st.isMainWarehouse },
    });
  }
  console.log('✓ Stores verified: Главный склад, Садбарг, Сиёма, ЦУМ');

  // 2. Admin User and Owner (60% profit share)
  const adminPasswordHash = await AuthService.hashPassword('admin123');
  const adminUser = await prisma.user.upsert({
    where: { login: 'admin' },
    update: { name: 'Далер', role: 'ADMIN', active: true },
    create: {
      login: 'admin',
      password: adminPasswordHash,
      name: 'Далер',
      role: 'ADMIN',
      active: true,
    },
  });

  await prisma.owner.upsert({
    where: { id: 'owner-admin' },
    update: {
      name: 'Далер',
      profitSharePercent: 60,
      userId: adminUser.id,
      storeId: null,
    },
    create: {
      id: 'owner-admin',
      name: 'Далер',
      profitSharePercent: 60,
      userId: adminUser.id,
      storeId: null,
      capitalBalanceUsd: 0,
      totalAccruedProfitUsd: 0,
      availableProfitUsd: 0,
    },
  });
  console.log('✓ Admin configured: Далер (60% profit share)');

  // 3. For each store: a dedicated Partner (40% profit share) and a Seller (salary)
  const storeStaff = [
    {
      storeId: 'store-sadbarg',
      storeName: 'Магазин «Садбарг»',
      partnerLogin: 'partner_sadbarg',
      partnerName: 'Рустам',
      partnerOwnerName: 'Рустам',
      partnerOwnerId: 'owner-partner-sadbarg',
      sellerLogin: 'seller_sadbarg',
      sellerName: 'Алишер',
      sellerSalaryTjs: 3000,
    },
    {
      storeId: 'store-siyoma',
      storeName: 'Магазин «Сиёма»',
      partnerLogin: 'partner_siyoma',
      partnerName: 'Фаррух',
      partnerOwnerName: 'Фаррух',
      partnerOwnerId: 'owner-partner-siyoma',
      sellerLogin: 'seller_siyoma',
      sellerName: 'Ахмад',
      sellerSalaryTjs: 3000,
    },
    {
      storeId: 'store-tsum',
      storeName: 'Магазин «ЦУМ»',
      partnerLogin: 'partner_tsum',
      partnerName: 'Сомон',
      partnerOwnerName: 'Сомон',
      partnerOwnerId: 'owner-partner-tsum',
      sellerLogin: 'seller_tsum',
      sellerName: 'Баходур',
      sellerSalaryTjs: 3000,
    },
  ];

  const defaultPartnerPassword = await AuthService.hashPassword('partner123');
  const defaultSellerPassword = await AuthService.hashPassword('seller123');

  for (const staff of storeStaff) {
    // A. Partner User
    const partnerUser = await prisma.user.upsert({
      where: { login: staff.partnerLogin },
      update: {
        password: defaultPartnerPassword,
        name: staff.partnerName,
        role: 'PARTNER',
        storeId: staff.storeId,
        active: true,
      },
      create: {
        login: staff.partnerLogin,
        password: defaultPartnerPassword,
        name: staff.partnerName,
        role: 'PARTNER',
        storeId: staff.storeId,
        active: true,
      },
    });

    // B. Partner Owner Profile (40% for this store)
    await prisma.owner.upsert({
      where: { id: staff.partnerOwnerId },
      update: {
        name: staff.partnerOwnerName,
        profitSharePercent: 40,
        userId: partnerUser.id,
        storeId: staff.storeId,
      },
      create: {
        id: staff.partnerOwnerId,
        name: staff.partnerOwnerName,
        profitSharePercent: 40,
        userId: partnerUser.id,
        storeId: staff.storeId,
        capitalBalanceUsd: 0,
        totalAccruedProfitUsd: 0,
        availableProfitUsd: 0,
      },
    });

    // C. Seller User (works on salary)
    await prisma.user.upsert({
      where: { login: staff.sellerLogin },
      update: {
        password: defaultSellerPassword,
        name: staff.sellerName,
        role: 'SELLER',
        storeId: staff.storeId,
        baseSalaryTjs: staff.sellerSalaryTjs,
        salesCommissionPercent: 0,
        active: true,
      },
      create: {
        login: staff.sellerLogin,
        password: defaultSellerPassword,
        name: staff.sellerName,
        role: 'SELLER',
        storeId: staff.storeId,
        baseSalaryTjs: staff.sellerSalaryTjs,
        salesCommissionPercent: 0,
        active: true,
      },
    });

    console.log(`✓ Store ${staff.storeName}:`);
    console.log(`   - Partner: ${staff.partnerName} (${staff.partnerLogin} / partner123) -> 40% profit share`);
    console.log(`   - Seller: ${staff.sellerName} (${staff.sellerLogin} / seller123) -> Оклад: ${staff.sellerSalaryTjs} TJS`);
  }

  console.log('\n========================================================');
  console.log('SETUP COMPLETE: All partners and sellers configured!');
  console.log('========================================================');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error during setup:', err);
  process.exit(1);
});
