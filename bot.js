require('dotenv').config({ override: false });
const grammy = require('grammy');
const Bot = grammy.Bot;
const { InlineKeyboard, Keyboard, InputFile } = require('grammy');
const { Pool } = require('pg');
const XLSX  = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

let bot, pool;

try {
  bot = global.botInstance || new Bot(process.env.BOT_TOKEN || '');
  pool = global.poolInstance || new Pool({ connectionString: process.env.DATABASE_URL });
  
  if (global.botInstance) {
    console.log("⚠️ Bot already initialized, reusing existing instance.");
  } else {
    global.botInstance = bot;
    global.poolInstance = pool;
  }
} catch (error) {
  if (error.message && error.message.includes('token')) {
    console.warn('⚠️ BOT_TOKEN not set - bot will not respond to messages');
    console.warn('   Please set BOT_TOKEN in Secrets and restart');
    process.exit(0);
  }
  throw error;
}


async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function importProductsFromExcel(buffer, region = null) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2;
    
    try {
      const model = row['MODEL'] || row['Model'] || row['model'];
      const category = row['CATEGORY'] || row['Category'] || row['category'];
      const subcategory = row['SUB CATEGORY'] || row['Sub Category'] || row['sub category'] || row['SUBCATEGORY'] || row['Subcategory'];
      const quantity = row['QUANTITY'] || row['Quantity'] || row['quantity'];
      
      if (!model || String(model).trim() === '') {
        skipped++;
        errors.push(`Qator ${rowNum}: MODEL ustuni bo'sh`);
        continue;
      }
      
      const existing = await pool.query(
        'SELECT id FROM warehouse WHERE name = $1 AND (region = $2 OR (region IS NULL AND $2 IS NULL))',
        [String(model).trim(), region]
      );
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE warehouse SET category = COALESCE($1, category), subcategory = COALESCE($2, subcategory) WHERE id = $3',
          [category || null, subcategory || null, existing.rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          'INSERT INTO warehouse (name, category, subcategory, region, quantity, price) VALUES ($1, $2, $3, $4, 0, 0)',
          [String(model).trim(), category || null, subcategory || null, region]
        );
        imported++;
      }
    } catch (err) {
      skipped++;
      errors.push(`Qator ${rowNum}: ${err.message}`);
    }
  }
  
  return { imported, updated, skipped, errors, total: data.length };
}
const ADMIN_USER_ID = process.env.ADMIN_USER_ID
  ? process.env.ADMIN_USER_ID.split(",").map(id => id.trim())
  : [];

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID
  ? process.env.ADMIN_CHAT_ID.split(",").map(id => id.trim())
  : [];

const REGIONS = {
  "Toshkent shahri": ["Bektemir", "Chilonzor", "Mirobod", "Mirzo Ulug'bek", "Olmazor", "Sergeli", "Shayxontohur", "Uchtepa", "Yakkasaroy", "Yunusobod", "Yashnobod"],
  "Toshkent viloyati": ["Angren", "Bekobod", "Bo'ka", "Bo'stonliq", "Chinoz", "Chirchiq", "Ohangaron", "Olmaliq", "Oqqo'rg'on", "Parkent", "Piskent", "Qibray", "Quyi Chirchiq", "Toshkent", "Yangiyo'l", "Zangiota", "Yuqori Chirchiq"],
  "Andijon viloyati": ["Andijon", "Asaka", "Baliqchi", "Bo'z", "Buloqboshi", "Izboskan", "Jalaquduq", "Xo'jaobod", "Marhamat", "Oltinko'l", "Paxtaobod", "Qo'rg'ontepa", "Shahrixon", "Ulug'nor", "Xonobod"],
  "Buxoro viloyati": ["Buxoro", "G'ijduvon", "Jondor", "Kogon", "Olot", "Peshku", "Qorako'l", "Qorovulbozor", "Romitan", "Shofirkon", "Vobkent"],
  "Farg'ona viloyati": ["Bag'dod", "Beshariq", "Buvayda", "Dang'ara", "Farg'ona", "Furqat", "Marg'ilon", "Oltiariq", "Quva", "Qo'qon", "Qo'shtepa", "Rishton", "So'x", "Toshloq", "Uchko'prik", "O'zbekiston", "Yozyovon"],
  "Jizzax viloyati": ["Arnasoy", "Baxmal", "Do'stlik", "Forish", "G'allaorol", "Jizzax", "Mirzacho'l", "Paxtakor", "Sharof Rashidov", "Yangiobod", "Zafarobod", "Zarbdor", "Zomin"],
  "Xorazm viloyati": ["Bog'ot", "Gurlan", "Xonqa", "Hazorasp", "Xiva", "Qo'shko'pir", "Shovot", "Urganch", "Yangiariq", "Yangibozor"],
  "Namangan viloyati": ["Chortoq", "Chust", "Kosonsoy", "Mingbuloq", "Namangan", "Norin", "Pop", "To'raqo'rg'on", "Uchqo'rg'on", "Uychi", "Yangiqo'rg'on"],
  "Navoiy viloyati": ["Karmana", "Konimex", "Navbahor", "Navoiy", "Nurota", "Qiziltepa", "Tomdi", "Uchquduq", "Xatirchi", "Zarafshon"],
  "Qashqadaryo viloyati": ["Chiroqchi", "Dehqonobod", "G'uzor", "Kasbi", "Kitob", "Koson", "Mirishkor", "Muborak", "Nishon", "Qamashi", "Qarshi", "Shahrisabz", "Yakkabog'", "Ko'kdala"],
  "Qoraqalpog'iston": ["Amudaryo", "Beruniy", "Chimboy", "Ellikqal'a", "Kegeyli", "Mo'ynoq", "Nukus", "Qanliko'l", "Qo'ng'irot", "Shumanay", "Taxtako'pir", "To'rtko'l", "Xo'jayli"],
  "Samarqand viloyati": ["Bulung'ur", "Ishtixon", "Jomboy", "Kattaqo'rg'on", "Narpay", "Nurobod", "Oqdaryo", "Pastdarg'om", "Paxtachi", "Payariq", "Qo'shrabot", "Samarqand", "Tayloq", "Urgut"],
  "Sirdaryo viloyati": ["Boyovut", "Guliston", "Mirzaobod", "Oqoltin", "Sardoba", "Sayxunobod", "Sirdaryo", "Xovos", "Yangiyer"],
  "Surxondaryo viloyati": ["Angor", "Bandixon", "Boysun", "Denov", "Jarqo'rg'on", "Muzrabot", "Oltinsoy", "Qiziriq", "Qumqo'rg'on", "Sariosiyo", "Sherobod", "Sho'rchi", "Termiz", "Uzun"]
};

function getRegionCategories() {
  return Object.keys(REGIONS);
}

function getSubcategories(category) {
  return REGIONS[category] || [];
}

const sessions = new Map();
const masterLocations = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: null, data: {} });
  }
  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.set(userId, { step: null, data: {} });
}

function hasMasterSharedLocation(userId) {
  return masterLocations.has(userId);
}

function setMasterLocation(userId, lat, lng) {
  masterLocations.set(userId, { lat, lng, timestamp: Date.now() });
}

async function saveMasterLocationToDb(telegramId, lat, lng) {
  try {
    await pool.query(
      'UPDATE masters SET last_lat = $1, last_lng = $2, last_location_update = NOW() WHERE telegram_id = $3',
      [lat, lng, telegramId]
    );
  } catch (error) {
    console.error('Failed to save master location to DB:', error);
  }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateDistanceFee(distanceKm) {
  return distanceKm * 3000;
}

function getWorkFee(workType) {
  return workType === 'difficult' ? 150000 : 100000;
}

async function findClosestMaster(region, orderLat, orderLng, excludeTelegramIds = []) {
  try {
    let query = `SELECT id, telegram_id, name, phone, last_lat, last_lng, last_location_update 
       FROM masters 
       WHERE region = $1 AND last_lat IS NOT NULL AND last_lng IS NOT NULL 
       AND last_location_update > NOW() - INTERVAL '24 hours'`;
    
    const params = [region];
    
    if (excludeTelegramIds.length > 0) {
      query += ` AND telegram_id NOT IN (${excludeTelegramIds.map((_, i) => `$${i + 2}`).join(', ')})`;
      params.push(...excludeTelegramIds);
    }
    
    query += ` ORDER BY last_location_update DESC`;
    
    const masters = await pool.query(query, params);
    
    if (masters.rows.length === 0) return null;
    
    let closestMaster = null;
    let minDistance = Infinity;
    
    for (const master of masters.rows) {
      const distance = calculateDistance(orderLat, orderLng, master.last_lat, master.last_lng);
      if (distance < minDistance) {
        minDistance = distance;
        closestMaster = { ...master, distance };
      }
    }
    
    return closestMaster;
  } catch (error) {
    console.error('Error finding closest master:', error);
    return null;
  }
}

function getMasterLocation(userId) {
  return masterLocations.get(userId);
}

function clearMasterLocation(userId) {
  masterLocations.delete(userId);
}

function isAdmin(userId) {
  return ADMIN_USER_ID && ADMIN_USER_ID.includes(String(userId));
}

async function notifyAdmins(message, options = {}) {
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID.length === 0) return;
  
  for (const chatId of ADMIN_CHAT_ID) {
    if (!chatId) continue;
    try {
      await bot.api.sendMessage(chatId, message, options);
    } catch (error) {
      console.error(`Failed to notify admin ${chatId}:`, error);
    }
  }
}

async function sendPhotoToAdmins(fileId, options = {}) {
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID.length === 0) return;
  
  for (const chatId of ADMIN_CHAT_ID) {
    if (!chatId) continue;
    try {
      await bot.api.sendPhoto(chatId, fileId, options);
    } catch (error) {
      console.error(`Failed to send photo to admin ${chatId}:`, error);
    }
  }
}

const pendingOrderLocations = new Map();
const rejectedOrderMasters = new Map();

async function notifyClosestMaster(region, orderId, orderDetails, orderLat, orderLng, excludeTelegramIds = []) {
  try {
    if (orderLat && orderLng) {
      const closestMaster = await findClosestMaster(region, orderLat, orderLng, excludeTelegramIds);
      
      if (closestMaster) {
        const distanceKm = closestMaster.distance.toFixed(2);
        
        try {
          const acceptKeyboard = new InlineKeyboard()
            .text('✅ Qabul qilish', `accept_order:${orderId}`)
            .row()
            .text('❌ Rad etish', `reject_order:${orderId}`);
          
          await bot.api.sendMessage(
            closestMaster.telegram_id,
            `🆕 YANGI BUYURTMA (Sizga eng yaqin!)\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Buyurtma ID: #${orderId}\n` +
            `👤 Mijoz: ${orderDetails.clientName}\n` +
            `📦 Mahsulot: ${orderDetails.product}\n` +
            `📍 Manzil: ${orderDetails.address}\n` +
            `📏 Masofa: ~${distanceKm} km\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `⚡ Siz bu buyurtmaga eng yaqin ustasiz!\n` +
            `Buyurtmani qabul qilasizmi?`,
            { reply_markup: acceptKeyboard }
          );
          
          if (orderLat && orderLng) {
            await bot.api.sendLocation(closestMaster.telegram_id, orderLat, orderLng);
          }
          
          await notifyAdmins(
            `📍 Eng yaqin usta topildi!\n\n` +
            `📋 Buyurtma ID: #${orderId}\n` +
            `👷 Usta: ${closestMaster.name}\n` +
            `📏 Masofa: ~${distanceKm} km\n` +
            `📞 Tel: ${closestMaster.phone || 'Kiritilmagan'}\n\n` +
            `Usta tasdiqlashini kutmoqda...`
          );
          
          return { success: true, closestMaster, distance: distanceKm };
        } catch (error) {
          console.error(`Failed to notify closest master ${closestMaster.telegram_id}:`, error);
        }
      }
    }
    
    const masters = await pool.query(
      'SELECT telegram_id, name FROM masters WHERE region = $1',
      [region]
    );
    
    if (masters.rows.length === 0) return { success: false, reason: 'no_masters' };
    
    let notified = 0;
    for (const master of masters.rows) {
      if (!master.telegram_id) continue;
      if (excludeTelegramIds.includes(master.telegram_id)) continue;
      
      try {
        const acceptKeyboard = new InlineKeyboard()
          .text('✅ Qabul qilish', `accept_order:${orderId}`)
          .row()
          .text('❌ Rad etish', `reject_order:${orderId}`);
        
        await bot.api.sendMessage(
          master.telegram_id,
          `🆕 YANGI BUYURTMA!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `👤 Mijoz: ${orderDetails.clientName}\n` +
          `📦 Mahsulot: ${orderDetails.product}\n` +
          `📍 Manzil: ${orderDetails.address}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Buyurtmani qabul qilasizmi?`,
          { reply_markup: acceptKeyboard }
        );
        
        if (orderLat && orderLng) {
          await bot.api.sendLocation(master.telegram_id, orderLat, orderLng);
        }
        
        notified++;
      } catch (error) {
        console.error(`Failed to notify master ${master.telegram_id}:`, error);
      }
    }
    
    return { success: true, notifiedCount: notified, fallback: true };
  } catch (error) {
    console.error('Error notifying masters:', error);
    return { success: false, error };
  }
}

function getMainMenu() {
  return new Keyboard()
    .text('Mening buyurtmalarim').text('Ombor').row()
    .text('📦 Mahsulot qo\'shish').text('📊 Excel yuklab olish').row()
    .text('🔙 Orqaga')
    .resized()
    .persistent();
}

function getAdminMenu() {
  return new Keyboard()
    .text('+ Yangi yetkazish').row()
    .text('➕ Usta qo\'shish').text('➕ Mahsulot qo\'shish').row()
    .text('🏢 Xizmat markazicha qo\'shish').row()
    .text('📥 Excel import').text('📋 Barcha buyurtmalar').row()
    .text('👥 Barcha ustalar').text('📦 Ombor').row()
    .text('📅 Kunlik hisobot').text('📊 Oylik hisobot').row()
    .text('🔙 Orqaga')
    .resized()
    .persistent();
}

bot.command('start', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    clearSession(telegramId);
    clearMasterLocation(telegramId);
    
    if (isAdmin(telegramId)) {
      return ctx.reply('Admin paneliga xush kelibsiz! 🔧', { reply_markup: getAdminMenu() });
    }
    
    const result = await pool.query(
      'SELECT * FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (result.rows.length === 0) {
      return ctx.reply('Malumotingiz topilmadi. Iltimos adminga aloqaga chiqing!');
    }

    const master = result.rows[0];
    const session = getSession(telegramId);
    session.step = 'awaiting_start_location';
    session.data = { masterName: master.name };
    
    const locationKeyboard = new Keyboard()
      .requestLocation('📍 Joylashuvni yuborish')
      .resized()
      .oneTime();
    
    ctx.reply(
      `Xush kelibsiz ${master.name}!\n\n` +
      `📍 Davom etish uchun joriy joylashuvingizni yuboring:`,
      { reply_markup: locationKeyboard }
    );
  } catch (error) {
    console.error('Start command error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.command('addmaster', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu buyruq faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'admin_master_name';
    session.data = {};
    ctx.reply('Yangi usta ismini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('+ Yangi yetkazish', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'phone';
    session.data = {};
    ctx.reply('Telefon raqamini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('Mening buyurtmalarim', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    if (!isAdmin(telegramId) && !hasMasterSharedLocation(telegramId)) {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      const session = getSession(telegramId);
      session.step = 'awaiting_start_location';
      
      return ctx.reply(
        '⚠️ Avval joylashuvingizni yuboring!\n\n📍 Davom etish uchun joylashuvni yuboring:',
        { reply_markup: locationKeyboard }
      );
    }
    
    const master = await pool.query(
      'SELECT id FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (master.rows.length === 0) {
      return ctx.reply('Adminga murojaat qiling');
    }
    
    const orders = await pool.query(
      `SELECT id, client_name, product, status 
       FROM orders 
       WHERE master_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [master.rows[0].id]
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Buyurtmalar topilmadi');
    }
    
    let message = '📋 Mening buyurtmalarim:\n\n';
    orders.rows.forEach(order => {
      message += `ID: ${order.id}\n`;
      message += `Mijoz: ${order.client_name}\n`;
      message += `Mahsulot: ${order.product}\n`;
      message += `Holat: ${order.status}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears(['Ombor', '📦 Ombor'], async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    if (!isAdmin(telegramId) && !hasMasterSharedLocation(telegramId)) {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      const session = getSession(telegramId);
      session.step = 'awaiting_start_location';
      
      return ctx.reply(
        '⚠️ Avval joylashuvingizni yuboring!\n\n📍 Davom etish uchun joylashuvni yuboring:',
        { reply_markup: locationKeyboard }
      );
    }
    
    let products;
    
    if (isAdmin(telegramId)) {
      products = await pool.query(
        'SELECT name, quantity, price, region FROM warehouse ORDER BY region, name'
      );
    } else {
      const master = await pool.query(
        'SELECT region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length > 0) {
        products = await pool.query(
          'SELECT name, quantity, price FROM warehouse WHERE region = $1 OR region IS NULL ORDER BY name',
          [master.rows[0].region]
        );
      } else {
        products = await pool.query(
          'SELECT name, quantity, price FROM warehouse ORDER BY name'
        );
      }
    }
    
    if (products.rows.length === 0) {
      return ctx.reply('Omborda mahsulot yo\'q');
    }
    
    let message = '📦 Ombor:\n\n';
    products.rows.forEach(product => {
      const regionText = product.region ? ` (${product.region})` : '';
      message += `${product.name}${regionText} - ${product.quantity} dona - ${product.price} so'm\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📦 Mahsulot qo\'shish', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    if (!isAdmin(telegramId) && !hasMasterSharedLocation(telegramId)) {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      const session = getSession(telegramId);
      session.step = 'awaiting_start_location';
      
      return ctx.reply(
        '⚠️ Avval joylashuvingizni yuboring!\n\n📍 Davom etish uchun joylashuvni yuboring:',
        { reply_markup: locationKeyboard }
      );
    }
    
    const master = await pool.query(
      'SELECT id, name, region FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (master.rows.length === 0) {
      return ctx.reply('Siz ro\'yxatdan o\'tmagansiz. Adminga murojaat qiling.');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'master_product_name';
    session.data = { masterRegion: master.rows[0].region };
    ctx.reply(`📦 O'z viloyatingiz (${master.rows[0].region}) omboriga mahsulot qo'shish\n\nMahsulot nomini kiriting:`);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('➕ Usta qo\'shish', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'admin_master_name';
    session.data = {};
    ctx.reply('Yangi usta ismini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('➕ Mahsulot qo\'shish', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'admin_product_name';
    session.data = {};
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('🏢 Xizmat markazicha qo\'shish', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'admin_service_center_name';
    session.data = {};
    ctx.reply('Xizmat markazi nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📊 Excel yuklab olish', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    if (!isAdmin(telegramId) && !hasMasterSharedLocation(telegramId)) {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      const session = getSession(telegramId);
      session.step = 'awaiting_start_location';
      
      return ctx.reply(
        '⚠️ Avval joylashuvingizni yuboring!\n\n📍 Davom etish uchun joylashuvni yuboring:',
        { reply_markup: locationKeyboard }
      );
    }
    
    const master = await pool.query(
      'SELECT id, name, region FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (master.rows.length === 0) {
      return ctx.reply('Siz ro\'yxatdan o\'tmagansiz. Adminga murojaat qiling.');
    }
    
    const masterId = master.rows[0].id;
    const masterName = master.rows[0].name;
    
    const orders = await pool.query(
      `SELECT o.id, o.client_name, o.client_phone, o.address, o.product, 
              o.quantity, o.status, o.created_at, o.barcode,
              o.warranty_expired, o.before_photo, o.after_photo
       FROM orders o
       WHERE o.master_id = $1
       ORDER BY o.created_at DESC`,
      [masterId]
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Sizda hali buyurtmalar yo\'q.', { reply_markup: getMainMenu() });
    }
    
    ctx.reply('⏳ Excel fayl tayyorlanmoqda...');
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Telegram Delivery Bot';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Buyurtmalar');
    
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Mijoz ismi', key: 'client_name', width: 20 },
      { header: 'Telefon', key: 'client_phone', width: 15 },
      { header: 'Manzil', key: 'address', width: 25 },
      { header: 'Mahsulot', key: 'product', width: 20 },
      { header: 'Miqdor', key: 'quantity', width: 10 },
      { header: 'Holat', key: 'status', width: 12 },
      { header: 'Shtrix kod', key: 'barcode', width: 15 },
      { header: 'Kafolat', key: 'warranty', width: 12 },
      { header: 'Sana', key: 'created_at', width: 18 }
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    const statusMap = {
      'new': 'Yangi',
      'accepted': 'Qabul qilingan',
      'on_way': 'Yo\'lda',
      'arrived': 'Yetib keldi',
      'delivered': 'Yetkazildi'
    };
    
    orders.rows.forEach(order => {
      let warrantyText = '-';
      if (order.warranty_expired === true) {
        warrantyText = 'Tugagan';
      } else if (order.warranty_expired === false) {
        warrantyText = 'Amal qilmoqda';
      }
      
      let formattedDate = '-';
      if (order.created_at) {
        try {
          const dateObj = order.created_at instanceof Date 
            ? order.created_at 
            : new Date(order.created_at);
          if (!isNaN(dateObj.getTime())) {
            formattedDate = dateObj.toLocaleString('uz-UZ');
          }
        } catch (dateError) {
          formattedDate = String(order.created_at);
        }
      }
      
      worksheet.addRow({
        id: order.id,
        client_name: order.client_name || '-',
        client_phone: order.client_phone || '-',
        address: order.address || '-',
        product: order.product || '-',
        quantity: order.quantity || 0,
        status: statusMap[order.status] || order.status,
        barcode: order.barcode || '-',
        warranty: warrantyText,
        created_at: formattedDate
      });
    });
    
    const fileName = `buyurtmalar_${masterName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
    const filePath = path.join('/tmp', fileName);
    
    await workbook.xlsx.writeFile(filePath);
    
    try {
      await ctx.replyWithDocument(
        new InputFile(filePath, fileName),
        { 
          caption: `📊 Sizning buyurtmalaringiz\n\n👷 Usta: ${masterName}\n📋 Jami: ${orders.rows.length} ta buyurtma`,
          reply_markup: getMainMenu()
        }
      );
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
    
  } catch (error) {
    console.error('Excel export error:', error);
    ctx.reply('Excel faylni yaratishda xatolik yuz berdi', { reply_markup: getMainMenu() });
  }
});

bot.hears('📥 Excel import', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'excel_region_select';
    session.data = {};
    ctx.reply(
      '📥 Excel import\n\n' +
      'Avval viloyatni tanlang yoki kiriting.\n' +
      'Barcha viloyatlar uchun import qilish uchun "Hammasi" deb yozing.\n\n' +
      '📍 Viloyat nomini kiriting:'
    );
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('👥 Barcha ustalar', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const masters = await pool.query(
      'SELECT id, name, phone, region FROM masters ORDER BY id'
    );
    
    if (masters.rows.length === 0) {
      return ctx.reply('Ustalar topilmadi');
    }
    
    let message = '👥 Barcha ustalar:\n\n';
    masters.rows.forEach(master => {
      message += `ID: ${master.id}\n`;
      message += `Ism: ${master.name}\n`;
      message += `Telefon: ${master.phone}\n`;
      message += `Hudud: ${master.region}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📋 Barcha buyurtmalar', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const orders = await pool.query(
      `SELECT o.id, m.name as master_name, o.client_name, o.product, o.status, o.created_at
       FROM orders o
       JOIN masters m ON o.master_id = m.id
       ORDER BY o.created_at DESC
       LIMIT 20`
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Buyurtmalar topilmadi');
    }
    
    let message = '📋 Oxirgi 20 buyurtma:\n\n';
    orders.rows.forEach(order => {
      message += `ID: ${order.id}\n`;
      message += `Usta: ${order.master_name}\n`;
      message += `Mijoz: ${order.client_name}\n`;
      message += `Mahsulot: ${order.product}\n`;
      message += `Holat: ${order.status}\n`;
      message += `Sana: ${order.created_at.toLocaleString('uz-UZ')}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📅 Kunlik hisobot', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    ctx.reply('⏳ Kunlik hisobot tayyorlanmoqda...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const orders = await pool.query(
      `SELECT o.id, m.name as master_name, m.region, o.client_name, o.address, 
              o.product, o.status, o.created_at, o.distance_km, o.distance_fee, 
              o.work_fee, o.product_total, o.total_payment
       FROM orders o
       LEFT JOIN masters m ON o.master_id = m.id
       WHERE o.created_at >= $1 AND o.created_at < $2
       ORDER BY o.created_at ASC`,
      [today, tomorrow]
    );
    
    const masters = await pool.query(
      `SELECT DISTINCT m.id, m.name
       FROM masters m
       ORDER BY m.name`
    );
    
    const statuses = {
      'new': 'Yangi',
      'accepted': 'Qabul qilindi',
      'on_way': 'Yo\'lda',
      'arrived': 'Yetib keldi',
      'in_progress': 'Jarayonda',
      'completed': 'Yakunlangan',
      'delivered': 'Yetkazildi'
    };
    
    let report = '📅 KUNLIK HISOBOT\n';
    report += `📆 Sana: ${today.toLocaleDateString('uz-UZ')}\n`;
    report += '═══════════════════════════════\n\n';
    
    if (orders.rows.length === 0) {
      report += '❌ Bugun buyurtmalar yo\'q\n';
    } else {
      report += `📊 BUYURTMALAR STATISTIKASI:\n`;
      report += `• Jami: ${orders.rows.length} ta buyurtma\n`;
      
      const statusCounts = {};
      orders.rows.forEach(o => {
        const status = statuses[o.status] || o.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      
      Object.entries(statusCounts).forEach(([status, count]) => {
        report += `• ${status}: ${count} ta\n`;
      });
      
      report += '\n🗺️ BUYURTMALAR GEOGRAFIYASI:\n';
      const regionMap = {};
      orders.rows.forEach(o => {
        const region = o.region || 'Hudud kiritilmagan';
        regionMap[region] = (regionMap[region] || 0) + 1;
      });
      
      Object.entries(regionMap).forEach(([region, count]) => {
        report += `• ${region}: ${count} ta\n`;
      });
      
      report += '\n✅ YAKUNLANGAN BUYURTMALAR:\n';
      const completedOrders = orders.rows.filter(o => o.status === 'delivered' || o.status === 'completed');
      if (completedOrders.length === 0) {
        report += '• Hech qanday buyurtma yakunlanmagan\n';
      } else {
        report += `• Jami yakunlangan: ${completedOrders.length} ta\n`;
      }
      
      report += '\n💼 USTALAR BO\'YICHA TAHLIL:\n';
      const masterStats = {};
      orders.rows.forEach(o => {
        const masterName = o.master_name || 'Tayinlanmagan';
        if (!masterStats[masterName]) {
          masterStats[masterName] = {
            total: 0,
            completed: 0,
            distance: 0,
            distanceFee: 0,
            workFee: 0,
            productTotal: 0,
            totalPayment: 0
          };
        }
        masterStats[masterName].total++;
        if (o.status === 'delivered' || o.status === 'completed') {
          masterStats[masterName].completed++;
        }
        masterStats[masterName].distance += o.distance_km || 0;
        masterStats[masterName].distanceFee += o.distance_fee || 0;
        masterStats[masterName].workFee += o.work_fee || 0;
        masterStats[masterName].productTotal += o.product_total || 0;
        masterStats[masterName].totalPayment += o.total_payment || 0;
      });
      
      Object.entries(masterStats).forEach(([masterName, stats]) => {
        report += `\n👷 ${masterName}:\n`;
        report += `  • Buyurtmalar: ${stats.total} ta (yakunlangan: ${stats.completed} ta)\n`;
        report += `  • Masofa: ${stats.distance.toFixed(1)} km\n`;
        report += `  💰 Masofa to\'lovi: ${Math.round(stats.distanceFee).toLocaleString()} so'm\n`;
        report += `  💰 Ish to\'lovi: ${Math.round(stats.workFee).toLocaleString()} so'm\n`;
        report += `  💰 Mahsulot summasi: ${Math.round(stats.productTotal).toLocaleString()} so'm\n`;
        report += `  💰 UMUMIY TO\'LOV: ${Math.round(stats.totalPayment).toLocaleString()} so'm\n`;
      });
      
      report += '\n═══════════════════════════════\n';
      const totalDistance = orders.rows.reduce((sum, o) => sum + (o.distance_km || 0), 0);
      const totalDistanceFee = orders.rows.reduce((sum, o) => sum + (o.distance_fee || 0), 0);
      const totalWorkFee = orders.rows.reduce((sum, o) => sum + (o.work_fee || 0), 0);
      const totalProductSum = orders.rows.reduce((sum, o) => sum + (o.product_total || 0), 0);
      const totalPaymentSum = orders.rows.reduce((sum, o) => sum + (o.total_payment || 0), 0);
      
      report += '📈 UMUMIY JAMI:\n';
      report += `• Jami masofa: ${totalDistance.toFixed(1)} km\n`;
      report += `• Masofa to\'lovi: ${Math.round(totalDistanceFee).toLocaleString()} so'm\n`;
      report += `• Ish to\'lovi: ${Math.round(totalWorkFee).toLocaleString()} so'm\n`;
      report += `• Mahsulot summasi: ${Math.round(totalProductSum).toLocaleString()} so'm\n`;
      report += `• 💰 JAMI: ${Math.round(totalPaymentSum).toLocaleString()} so'm\n`;
    }
    
    report += '\n═══════════════════════════════\n';
    
    const messages = [report];
    if (report.length > 4096) {
      const parts = report.match(/[\s\S]{1,4000}/g) || [report];
      for (const part of parts) {
        await ctx.reply(part);
      }
    } else {
      await ctx.reply(report, { reply_markup: getAdminMenu() });
    }
  } catch (error) {
    console.error('Daily report error:', error);
    ctx.reply('Kunlik hisobot tayyorlanishda xatolik yuz berdi', { reply_markup: getAdminMenu() });
  }
});

bot.hears('📊 Oylik hisobot', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'monthly_report_year';
    session.data = {};
    
    const currentYear = new Date().getFullYear();
    const keyboard = new InlineKeyboard();
    
    for (let year = currentYear; year >= currentYear - 2; year--) {
      keyboard.text(`${year}`, `report_year:${year}`).row();
    }
    
    ctx.reply(
      '📊 Oylik hisobot\n\n' +
      'Yilni tanlang:',
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Monthly report error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('🔙 Orqaga', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    
    if (isAdmin(telegramId)) {
      return ctx.reply('Admin paneliga xush kelibsiz! 🔧', { reply_markup: getAdminMenu() });
    }
    
    if (!hasMasterSharedLocation(telegramId)) {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      const session = getSession(telegramId);
      session.step = 'awaiting_start_location';
      
      return ctx.reply(
        '⚠️ Avval joylashuvingizni yuboring!\n\n📍 Davom etish uchun joylashuvni yuboring:',
        { reply_markup: locationKeyboard }
      );
    }
    
    const result = await pool.query(
      'SELECT * FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (result.rows.length > 0) {
      const master = result.rows[0];
      ctx.reply(`Xush kelibsiz ${master.name}!`, { reply_markup: getMainMenu() });
    }
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('new_delivery', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'phone';
    session.data = {};
    ctx.reply('Telefon raqamini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^select_master:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'select_master') {
      return;
    }
    
    const masterId = parseInt(ctx.match[1]);
    const masterResult = await pool.query(
      'SELECT id, name, phone, region, telegram_id FROM masters WHERE id = $1',
      [masterId]
    );
    
    if (masterResult.rows.length === 0) {
      clearSession(ctx.from.id);
      return ctx.reply('❌ Usta topilmadi.', { reply_markup: getAdminMenu() });
    }
    
    const master = masterResult.rows[0];
    session.data.selectedMasterId = master.id;
    session.data.selectedMasterName = master.name;
    session.data.selectedMasterPhone = master.phone;
    session.data.selectedMasterRegion = master.region;
    session.data.selectedMasterTelegramId = master.telegram_id;
    session.data.masterRegion = master.region;
    
    session.step = 'product_category';
    
    const categories = await pool.query(
      'SELECT DISTINCT category FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 AND category IS NOT NULL ORDER BY category',
      [master.region]
    );
    
    if (categories.rows.length > 0) {
      const keyboard = new InlineKeyboard();
      categories.rows.forEach(c => {
        keyboard.text(c.category, `product_cat:${c.category}`).row();
      });
      await ctx.editMessageText(`👷 Tanlangan usta: ${master.name}\n\n📁 Kategoriyani tanlang:`, { reply_markup: keyboard });
    } else {
      clearSession(ctx.from.id);
      await ctx.editMessageText('❌ Omborda mahsulot yo\'q.');
      ctx.reply('Admin menyu:', { reply_markup: getAdminMenu() });
    }
  } catch (error) {
    console.error('Select master callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^product_cat:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'product_category') {
      return;
    }
    
    const category = ctx.match[1];
    session.data.productCategory = category;
    session.step = 'product_subcategory';
    
    const subcategories = await pool.query(
      'SELECT DISTINCT subcategory FROM warehouse WHERE category = $1 AND (region = $2 OR region IS NULL) AND quantity > 0 AND subcategory IS NOT NULL ORDER BY subcategory',
      [category, session.data.masterRegion]
    );
    
    if (subcategories.rows.length > 0) {
      const keyboard = new InlineKeyboard();
      subcategories.rows.forEach(s => {
        keyboard.text(s.subcategory, `product_subcat:${s.subcategory}`).row();
      });
      keyboard.text('🔙 Orqaga', 'product_cat_back').row();
      await ctx.editMessageText(`📁 Kategoriya: ${category}\n\n📂 Subkategoriyani tanlang:`, { reply_markup: keyboard });
    } else {
      session.step = 'product';
      session.data.productPage = 0;
      
      const products = await pool.query(
        'SELECT DISTINCT name, quantity FROM warehouse WHERE category = $1 AND (region = $2 OR region IS NULL) AND quantity > 0 ORDER BY name',
        [category, session.data.masterRegion]
      );
      
      if (products.rows.length > 0) {
        const pageSize = 8;
        const keyboard = new InlineKeyboard();
        products.rows.slice(0, pageSize).forEach(p => {
          keyboard.text(`${p.name} (${p.quantity})`, `product:${p.name}`).row();
        });
        if (products.rows.length > pageSize) {
          keyboard.text('➡️ Keyingisi', 'product_next:1').row();
        }
        keyboard.text('🔙 Orqaga', 'product_cat_back').row();
        await ctx.editMessageText(`📁 Kategoriya: ${category}\n\n📦 Mahsulotni tanlang:`, { reply_markup: keyboard });
      } else {
        await ctx.editMessageText('❌ Bu kategoriyada mahsulot yo\'q.');
        clearSession(ctx.from.id);
      }
    }
  } catch (error) {
    console.error('Product category callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^product_subcat:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'product_subcategory') {
      return;
    }
    
    const subcategory = ctx.match[1];
    session.data.productSubcategory = subcategory;
    session.step = 'product';
    session.data.productPage = 0;
    
    const products = await pool.query(
      'SELECT DISTINCT name, quantity FROM warehouse WHERE category = $1 AND subcategory = $2 AND (region = $3 OR region IS NULL) AND quantity > 0 ORDER BY name',
      [session.data.productCategory, subcategory, session.data.masterRegion]
    );
    
    if (products.rows.length > 0) {
      const pageSize = 8;
      const keyboard = new InlineKeyboard();
      products.rows.slice(0, pageSize).forEach(p => {
        keyboard.text(`${p.name} (${p.quantity})`, `product:${p.name}`).row();
      });
      if (products.rows.length > pageSize) {
        keyboard.text('➡️ Keyingisi', 'product_next:1').row();
      }
      keyboard.text('🔙 Orqaga', 'product_subcat_back').row();
      await ctx.editMessageText(`📂 Subkategoriya: ${subcategory}\n\n📦 Mahsulotni tanlang:`, { reply_markup: keyboard });
    } else {
      await ctx.editMessageText('❌ Bu subkategoriyada mahsulot yo\'q.');
      clearSession(ctx.from.id);
    }
  } catch (error) {
    console.error('Product subcategory callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('product_cat_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    session.step = 'product_category';
    delete session.data.productCategory;
    
    const categories = await pool.query(
      'SELECT DISTINCT category FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 AND category IS NOT NULL ORDER BY category',
      [session.data.masterRegion]
    );
    
    if (categories.rows.length > 0) {
      const keyboard = new InlineKeyboard();
      categories.rows.forEach(c => {
        keyboard.text(c.category, `product_cat:${c.category}`).row();
      });
      const masterName = session.data.selectedMasterName || '';
      const headerText = masterName ? `👷 Tanlangan usta: ${masterName}\n\n` : '';
      await ctx.editMessageText(`${headerText}📁 Kategoriyani tanlang:`, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Product cat back callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('product_subcat_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    session.step = 'product_subcategory';
    delete session.data.productSubcategory;
    
    const category = session.data.productCategory;
    
    const subcategories = await pool.query(
      'SELECT DISTINCT subcategory FROM warehouse WHERE category = $1 AND (region = $2 OR region IS NULL) AND quantity > 0 AND subcategory IS NOT NULL ORDER BY subcategory',
      [category, session.data.masterRegion]
    );
    
    if (subcategories.rows.length > 0) {
      const keyboard = new InlineKeyboard();
      subcategories.rows.forEach(s => {
        keyboard.text(s.subcategory, `product_subcat:${s.subcategory}`).row();
      });
      keyboard.text('🔙 Orqaga', 'product_cat_back').row();
      await ctx.editMessageText(`📁 Kategoriya: ${category}\n\n📂 Subkategoriyani tanlang:`, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Product subcat back callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^region_cat:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'admin_master_region_category') {
      return;
    }
    
    const category = ctx.match[1];
    session.data.regionCategory = category;
    session.step = 'admin_master_region_subcategory';
    
    const subcategories = getSubcategories(category);
    const keyboard = new InlineKeyboard();
    
    subcategories.forEach((sub, index) => {
      keyboard.text(sub, `region_sub:${sub}`);
      if ((index + 1) % 2 === 0) keyboard.row();
    });
    keyboard.row().text('🔙 Orqaga', 'region_back');
    
    await ctx.editMessageText(`📍 Viloyat: ${category}\n\n🏘 Tumanni tanlang:`, { reply_markup: keyboard });
  } catch (error) {
    console.error('Region category callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('region_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    session.step = 'admin_master_region_category';
    delete session.data.regionCategory;
    
    const categories = getRegionCategories();
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, index) => {
      keyboard.text(cat, `region_cat:${cat}`);
      if ((index + 1) % 2 === 0) keyboard.row();
    });
    
    await ctx.editMessageText('📍 Viloyatni tanlang:', { reply_markup: keyboard });
  } catch (error) {
    console.error('Region back callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^region_sub:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'admin_master_region_subcategory') {
      return;
    }
    
    const subcategory = ctx.match[1];
    const category = session.data.regionCategory;
    const fullRegion = `${category}, ${subcategory}`;
    session.data.masterRegion = fullRegion;
    session.step = 'admin_master_service_center_selection';
    
    // Get available service centers for this region
    const serviceCenters = await pool.query(
      'SELECT id, name FROM service_centers WHERE region = $1 ORDER BY name',
      [category]
    );
    
    await ctx.editMessageText(`✅ Tanlangan hudud: ${fullRegion}\n\nEsta xizmat markazini tanlang:`);
    
    if (serviceCenters.rows.length === 0) {
      ctx.reply(
        '⚠️ Ushbu viloyatda hali xizmat markazi yo\'q.\n' +
        'Avval "🏢 Xizmat markazicha qo\'shish" tugmasini orqali xizmat markazi qo\'shing.',
        { reply_markup: getAdminMenu() }
      );
      clearSession(ctx.from.id);
      return;
    }
    
    const keyboard = new InlineKeyboard();
    serviceCenters.rows.forEach(sc => {
      keyboard.text(sc.name, `select_sc:${sc.id}`).row();
    });
    
    ctx.reply('🏢 Xizmat markazini tanlang:', { reply_markup: keyboard });
  } catch (error) {
    console.error('Region subcategory callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^select_sc:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'admin_master_service_center_selection') {
      return;
    }
    
    const serviceCenterId = parseInt(ctx.match[1]);
    session.data.serviceCenterId = serviceCenterId;
    
    try {
      // Get service center details
      const scDetails = await pool.query(
        'SELECT name FROM service_centers WHERE id = $1',
        [serviceCenterId]
      );
      
      // Insert master with service_center_id
      await pool.query(
        'INSERT INTO masters (name, phone, telegram_id, region, service_center_id) VALUES ($1, $2, $3, $4, $5)',
        [session.data.masterName, session.data.masterPhone, session.data.masterTelegramId, session.data.masterRegion, serviceCenterId]
      );
      
      const scName = scDetails.rows.length > 0 ? scDetails.rows[0].name : 'Noma\'lum';
      
      await ctx.editMessageText(
        `✅ Yangi usta qo'shildi!\n\n` +
        `Ism: ${session.data.masterName}\n` +
        `Telefon: ${session.data.masterPhone}\n` +
        `Telegram ID: ${session.data.masterTelegramId}\n` +
        `Hudud: ${session.data.masterRegion}\n` +
        `🏢 Xizmat markazi: ${scName}`
      );
      
      ctx.reply('Admin menyu:', { reply_markup: getAdminMenu() });
      clearSession(ctx.from.id);
    } catch (dbError) {
      if (dbError.code === '23505') {
        ctx.reply('Xatolik: Bu telefon yoki Telegram ID allaqachon mavjud', { reply_markup: getAdminMenu() });
      } else {
        ctx.reply('Ma\'lumotlar bazasiga saqlashda xatolik', { reply_markup: getAdminMenu() });
      }
      clearSession(ctx.from.id);
    }
  } catch (error) {
    console.error('Service center selection callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^sc_region:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'admin_service_center_region') {
      return;
    }
    
    const region = ctx.match[1];
    session.data.serviceCenterRegion = region;
    session.step = 'admin_service_center_location';
    
    const locationKeyboard = new Keyboard()
      .requestLocation('📍 Xizmat markazi joylashuvini yuborish')
      .resized()
      .oneTime();
    
    await ctx.editMessageText(
      `✅ Tanlangan viloyat: ${region}\n\n` +
      `Endi xizmat markazi joylashuvini Telegram location button orqali yuboring.`
    );
    
    ctx.reply('📍 Joylashuvni yuboring:', { reply_markup: locationKeyboard });
  } catch (error) {
    console.error('Service center region callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:text', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    
    if (session.step === 'admin_master_name') {
      session.data.masterName = ctx.message.text;
      session.step = 'admin_master_phone';
      ctx.reply('Telefon raqamini kiriting:');
    } else if (session.step === 'admin_master_phone') {
      session.data.masterPhone = ctx.message.text;
      session.step = 'admin_master_telegram_id';
      ctx.reply('Telegram ID ni kiriting (foydalanuvchi @userinfobot ga yozsin):');
    } else if (session.step === 'admin_master_telegram_id') {
      const telegramId = parseInt(ctx.message.text);
      if (isNaN(telegramId)) {
        return ctx.reply('Iltimos, to\'g\'ri Telegram ID kiriting (raqam)');
      }
      session.data.masterTelegramId = telegramId;
      session.step = 'admin_master_region_category';
      
      const categories = getRegionCategories();
      const keyboard = new InlineKeyboard();
      categories.forEach((cat, index) => {
        keyboard.text(cat, `region_cat:${cat}`);
        if ((index + 1) % 2 === 0) keyboard.row();
      });
      
      ctx.reply('📍 Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'admin_product_name') {
      session.data.productName = ctx.message.text;
      session.step = 'admin_product_quantity';
      ctx.reply('Miqdorni kiriting:');
    } else if (session.step === 'admin_product_quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity < 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting (0 yoki katta)');
      }
      session.data.productQuantity = quantity;
      session.step = 'admin_product_price';
      ctx.reply('Narxni kiriting:');
    } else if (session.step === 'admin_product_price') {
      const price = parseFloat(ctx.message.text);
      if (isNaN(price) || price < 0) {
        return ctx.reply('Iltimos, to\'g\'ri narxni kiriting');
      }
      session.data.productPrice = price;
      session.step = 'admin_product_category';
      ctx.reply('Kategoriyani kiriting (ixtiyoriy, o\'tkazish uchun "-" yozing):');
    } else if (session.step === 'admin_product_category') {
      session.data.productCategory = ctx.message.text === '-' ? null : ctx.message.text;
      session.step = 'admin_product_subcategory';
      ctx.reply('Subkategoriyani kiriting (ixtiyoriy, o\'tkazish uchun "-" yozing):');
    } else if (session.step === 'admin_product_subcategory') {
      session.data.productSubcategory = ctx.message.text === '-' ? null : ctx.message.text;
      
      try {
        await pool.query(
          'INSERT INTO warehouse (name, quantity, price, category, subcategory) VALUES ($1, $2, $3, $4, $5)',
          [session.data.productName, session.data.productQuantity, session.data.productPrice, 
           session.data.productCategory, session.data.productSubcategory]
        );
        
        ctx.reply(
          `✅ Yangi mahsulot qo'shildi!\n\n` +
          `Nomi: ${session.data.productName}\n` +
          `Miqdor: ${session.data.productQuantity}\n` +
          `Narx: ${session.data.productPrice} so'm\n` +
          `Kategoriya: ${session.data.productCategory || 'Yo\'q'}\n` +
          `Subkategoriya: ${session.data.productSubcategory || 'Yo\'q'}`,
          { reply_markup: getAdminMenu() }
        );
        
        clearSession(ctx.from.id);
      } catch (dbError) {
        if (dbError.code === '23505') {
          ctx.reply('Xatolik: Bu mahsulot allaqachon mavjud');
        } else {
          ctx.reply('Ma\'lumotlar bazasiga saqlashda xatolik');
        }
      }
    } else if (session.step === 'admin_service_center_name') {
      session.data.serviceCenterName = ctx.message.text;
      session.step = 'admin_service_center_region';
      
      const categories = getRegionCategories();
      const keyboard = new InlineKeyboard();
      categories.forEach((cat, index) => {
        keyboard.text(cat, `sc_region:${cat}`);
        if ((index + 1) % 2 === 0) keyboard.row();
      });
      
      ctx.reply('📍 Xizmat markazi viloyatini tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'excel_region_select') {
      const regionInput = ctx.message.text.trim();
      session.data.importRegion = regionInput.toLowerCase() === 'hammasi' ? null : regionInput;
      session.step = 'excel_import';
      
      const regionText = session.data.importRegion ? session.data.importRegion : 'Barcha viloyatlar';
      ctx.reply(
        `📥 Excel faylni yuklash\n\n` +
        `📍 Tanlangan viloyat: ${regionText}\n\n` +
        `Excel faylda quyidagi ustunlar bo'lishi kerak:\n` +
        `• CATEGORY\n` +
        `• SUB CATEGORY\n` +
        `• MODEL\n\n` +
        `📎 Iltimos, Excel faylni (.xlsx, .xls) yuboring:`
      );
    } else if (session.step === 'master_product_name') {
      session.data.productName = ctx.message.text;
      session.step = 'master_product_quantity';
      ctx.reply('Miqdorni kiriting (dona):');
    } else if (session.step === 'master_product_quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity < 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting (0 yoki katta)');
      }
      session.data.productQuantity = quantity;
      session.step = 'master_product_price';
      ctx.reply('Narxni kiriting (so\'m):');
    } else if (session.step === 'master_product_price') {
      const price = parseFloat(ctx.message.text);
      if (isNaN(price) || price < 0) {
        return ctx.reply('Iltimos, to\'g\'ri narxni kiriting');
      }
      session.data.productPrice = price;
      session.step = 'master_product_category';
      ctx.reply('Kategoriyani kiriting (ixtiyoriy, o\'tkazish uchun "-" yozing):');
    } else if (session.step === 'master_product_category') {
      session.data.productCategory = ctx.message.text === '-' ? null : ctx.message.text;
      
      try {
        const existingProduct = await pool.query(
          'SELECT id, quantity FROM warehouse WHERE name = $1 AND region = $2',
          [session.data.productName, session.data.masterRegion]
        );
        
        if (existingProduct.rows.length > 0) {
          await pool.query(
            'UPDATE warehouse SET quantity = quantity + $1, price = $2, category = COALESCE($3, category) WHERE id = $4',
            [session.data.productQuantity, session.data.productPrice, session.data.productCategory, existingProduct.rows[0].id]
          );
          
          ctx.reply(
            `✅ Mahsulot yangilandi!\n\n` +
            `Nomi: ${session.data.productName}\n` +
            `Yangi miqdor: ${existingProduct.rows[0].quantity + session.data.productQuantity} dona\n` +
            `Narx: ${session.data.productPrice} so'm\n` +
            `Viloyat: ${session.data.masterRegion}`,
            { reply_markup: getMainMenu() }
          );
        } else {
          await pool.query(
            'INSERT INTO warehouse (name, quantity, price, category, region) VALUES ($1, $2, $3, $4, $5)',
            [session.data.productName, session.data.productQuantity, session.data.productPrice, 
             session.data.productCategory, session.data.masterRegion]
          );
          
          ctx.reply(
            `✅ Yangi mahsulot qo'shildi!\n\n` +
            `Nomi: ${session.data.productName}\n` +
            `Miqdor: ${session.data.productQuantity} dona\n` +
            `Narx: ${session.data.productPrice} so'm\n` +
            `Kategoriya: ${session.data.productCategory || 'Yo\'q'}\n` +
            `Viloyat: ${session.data.masterRegion}`,
            { reply_markup: getMainMenu() }
          );
        }
        
        clearSession(ctx.from.id);
      } catch (dbError) {
        console.error('Database error:', dbError);
        ctx.reply('Ma\'lumotlar bazasiga saqlashda xatolik');
      }
    } else if (session.step === 'phone') {
      const phone = ctx.message.text;
      try {
        const client = await pool.query('SELECT * FROM clients WHERE phone = $1', [phone]);
        if (client.rows.length > 0) {
          session.data.customerName = client.rows[0].name;
          session.data.phone = phone;
          session.data.address = client.rows[0].address;
          session.step = 'order_region_category';
          const categories = getRegionCategories();
          const keyboard = new InlineKeyboard();
          categories.forEach(cat => {
            keyboard.text(cat, `order_cat:${cat}`).row();
          });
          ctx.reply('📍 Viloyatni tanlang:', { reply_markup: keyboard });
        } else {
          session.data.phone = phone;
          session.step = 'customer_name';
          ctx.reply('Mijoz ismini kiriting:');
        }
      } catch (error) {
        ctx.reply('Xatolik yuz berdi');
      }
    } else if (session.step === 'customer_name') {
      session.data.customerName = ctx.message.text;
      session.step = 'address';
      
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      ctx.reply('📍 Mijoz joylashuvini yuboring:', { reply_markup: locationKeyboard });
    } else if (session.step === 'address') {
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      return ctx.reply('⚠️ Faqat joylashuv qabul qilinadi. Iltimos, joylashuvni yuboring:', { reply_markup: locationKeyboard });
    } else if (session.step === 'barcode') {
      session.data.barcode = ctx.message.text;
      session.step = 'quantity';
      ctx.reply('Miqdorni kiriting:');
    } else if (session.step === 'completion_barcode') {
      const completionBarcode = ctx.message.text;
      const orderId = session.data.orderId;
      
      await pool.query(
        "UPDATE orders SET status = 'delivered', completion_barcode = $1 WHERE id = $2",
        [completionBarcode, orderId]
      );
      
      // Recalculate mileage charge based on service center location
      try {
        const order = await pool.query(
          `SELECT o.completion_gps_lat, o.completion_gps_lng, o.product_total, o.work_fee, 
                  m.service_center_id, sc.lat as service_center_lat, sc.lng as service_center_lng
           FROM orders o
           JOIN masters m ON o.master_id = m.id
           LEFT JOIN service_centers sc ON m.service_center_id = sc.id
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (order.rows.length > 0) {
          const { completion_gps_lat, completion_gps_lng, product_total, work_fee, 
                  service_center_lat, service_center_lng } = order.rows[0];
          
          // Calculate distance from service center to order location
          if (service_center_lat && service_center_lng && completion_gps_lat && completion_gps_lng) {
            const distanceKm = calculateDistance(service_center_lat, service_center_lng, completion_gps_lat, completion_gps_lng);
            const distanceFee = calculateDistanceFee(distanceKm);
            const totalPayment = product_total + distanceFee + work_fee;
            
            await pool.query(
              `UPDATE orders SET distance_km = $1, distance_fee = $2, total_payment = $3 WHERE id = $4`,
              [distanceKm, distanceFee, totalPayment, orderId]
            );
          }
        }
      } catch (calcError) {
        console.error('Error recalculating mileage:', calcError);
      }
      
      clearSession(ctx.from.id);
      
      try {
        const orderDetails = await pool.query(
          `SELECT o.*, m.name as master_name, m.telegram_id as master_telegram_id
           FROM orders o 
           JOIN masters m ON o.master_id = m.id 
           WHERE o.id = $1`,
          [orderId]
        );
        
        if (orderDetails.rows.length > 0) {
          const od = orderDetails.rows[0];
          const warrantyStatus = od.warranty_expired ? 'Tugagan' : 'Amal qilmoqda';
          const workTypeText = od.work_type === 'difficult' ? 'Qiyin' : 'Oddiy';
          
          // Format payment breakdown for master
          let paymentMessage = `💰 TO'LOV HISOB-KITOBINI:\n\n`;
          paymentMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
          paymentMessage += `📋 Buyurtma ID: #${orderId}\n`;
          paymentMessage += `👤 Mijoz: ${od.client_name}\n`;
          paymentMessage += `📦 Mahsulot: ${od.product}\n\n`;
          
          paymentMessage += `📊 TO'LOV TAFSILOTI:\n`;
          paymentMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
          
          // Product total
          const productTotal = od.product_total || 0;
          paymentMessage += `📦 Mahsulot summasi:\n`;
          paymentMessage += `   ${productTotal.toLocaleString('uz-UZ')} so'm\n\n`;
          
          // Distance fee
          const distanceFee = od.distance_fee || 0;
          const distanceKm = od.distance_km || 0;
          paymentMessage += `🚗 Masofa to'lovi:\n`;
          paymentMessage += `   ${distanceKm.toFixed(2)} km × 3,000 so'm/km\n`;
          paymentMessage += `   = ${distanceFee.toLocaleString('uz-UZ')} so'm\n\n`;
          
          // Work fee
          const workFee = od.work_fee || 0;
          paymentMessage += `🔧 Ish to'lovi (${workTypeText}):\n`;
          paymentMessage += `   ${workFee.toLocaleString('uz-UZ')} so'm\n\n`;
          
          // Total payment
          const totalPayment = od.total_payment || (productTotal + distanceFee + workFee);
          paymentMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
          paymentMessage += `💵 JAMI TO'LOV:\n`;
          paymentMessage += `   ${totalPayment.toLocaleString('uz-UZ')} so'm\n`;
          paymentMessage += `━━━━━━━━━━━━━━━━━━━━`;
          
          ctx.reply('✅ Buyurtma muvaffaqiyatli yakunlandi!\n\n' + paymentMessage, { reply_markup: getMainMenu() });
          
          // Also send the payment breakdown directly to the master
          if (od.master_telegram_id && od.master_telegram_id !== ctx.from.id) {
            try {
              await bot.api.sendMessage(od.master_telegram_id, '✅ Buyurtmaniz yakunlandi!\n\n' + paymentMessage);
            } catch (masterNotifyError) {
              console.error('Failed to notify master about payment:', masterNotifyError);
            }
          }
          
          // Notify admin with payment details
          await notifyAdmins(
            `✅ BUYURTMA YAKUNLANDI!\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Buyurtma ID: #${orderId}\n` +
            `👷 Usta: ${od.master_name}\n` +
            `👤 Mijoz: ${od.client_name}\n` +
            `📦 Mahsulot: ${od.product}\n` +
            `🛡️ Kafolat: ${warrantyStatus}\n` +
            `📊 Shtrix kod: ${completionBarcode}\n\n` +
            `💰 USTA UCHUN TO'LOV:\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📦 Mahsulot: ${productTotal.toLocaleString('uz-UZ')} so'm\n` +
            `🚗 Masofa (${distanceKm.toFixed(2)} km): ${distanceFee.toLocaleString('uz-UZ')} so'm\n` +
            `🔧 Ish (${workTypeText}): ${workFee.toLocaleString('uz-UZ')} so'm\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💵 JAMI: ${totalPayment.toLocaleString('uz-UZ')} so'm`
          );
        }
      } catch (adminError) {
        console.error('Failed to notify admin about completion:', adminError);
      }
    } else if (session.step === 'quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity <= 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting');
      }
      
      session.data.quantity = quantity;
      
      session.step = 'warranty_selection';
      const keyboard = new InlineKeyboard()
        .text('✅ KAFOLAT BOR', 'warranty:valid')
        .row()
        .text('❌ KAFOLAT YO\'Q', 'warranty:expired');
      ctx.reply('📋 Mahsulotning kafolati bormi?', { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Message text handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:contact', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    if (session.step === 'phone') {
      const phone = ctx.message.contact.phone_number;
      try {
        const client = await pool.query('SELECT * FROM clients WHERE phone = $1', [phone]);
        if (client.rows.length > 0) {
          session.data.customerName = client.rows[0].name;
          session.data.phone = phone;
          session.data.address = client.rows[0].address;
          session.step = 'order_region_category';
          const categories = getRegionCategories();
          const keyboard = new InlineKeyboard();
          categories.forEach(cat => {
            keyboard.text(cat, `order_cat:${cat}`).row();
          });
          ctx.reply('📍 Viloyatni tanlang:', { reply_markup: keyboard });
        } else {
          session.data.phone = phone;
          session.step = 'customer_name';
          ctx.reply('Mijoz ismini kiriting:');
        }
      } catch (error) {
        ctx.reply('Xatolik yuz berdi');
      }
    }
  } catch (error) {
    console.error('Contact handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:location', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    const telegramId = ctx.from.id;
    
    if (pendingOrderLocations.has(telegramId) && !session.step) {
      const pendingOrder = pendingOrderLocations.get(telegramId);
      const lat = ctx.message.location.latitude;
      const lng = ctx.message.location.longitude;
      
      pendingOrderLocations.delete(telegramId);
      
      setMasterLocation(telegramId, lat, lng);
      await saveMasterLocationToDb(telegramId, lat, lng);
      
      const master = await pool.query(
        'SELECT id, name FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length > 0) {
        try {
          await notifyAdmins(
            `📍 USTA JOYLASHUVNI YUBORDI!\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Buyurtma ID: #${pendingOrder.orderId}\n` +
            `👷 Usta: ${master.rows[0].name}\n` +
            `📍 Koordinatalar: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n` +
            `📍 Viloyat: ${pendingOrder.region}\n` +
            `━━━━━━━━━━━━━━━━━━━━`
          );
        } catch (adminError) {
          console.error('Failed to notify admin about master location:', adminError);
        }
      }
      
      ctx.reply(
        `✅ Joylashuvingiz qabul qilindi!\n\n` +
        `📋 Buyurtma ID: #${pendingOrder.orderId}\n` +
        `📍 Koordinatalar: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n\n` +
        `Admin sizni buyurtmaga tayinlashi mumkin.`,
        { reply_markup: getMainMenu() }
      );
      return;
    }
    
    if (session.step === 'awaiting_start_location') {
      pendingOrderLocations.delete(telegramId);
      const lat = ctx.message.location.latitude;
      const lng = ctx.message.location.longitude;
      
      setMasterLocation(telegramId, lat, lng);
      await saveMasterLocationToDb(telegramId, lat, lng);
      clearSession(telegramId);
      
      ctx.reply(
        `✅ Joylashuv qabul qilindi!\n\n` +
        `📍 Koordinatalar: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n\n` +
        `Endi botdan foydalanishingiz mumkin.`,
        { reply_markup: getMainMenu() }
      );
      return;
    }
    
    if (session.step === 'admin_service_center_location') {
      const lat = ctx.message.location.latitude;
      const lng = ctx.message.location.longitude;
      
      try {
        await pool.query(
          'INSERT INTO service_centers (name, region, lat, lng) VALUES ($1, $2, $3, $4)',
          [session.data.serviceCenterName, session.data.serviceCenterRegion, lat, lng]
        );
        
        ctx.reply(
          `✅ Xizmat markazi qo'shildi!\n\n` +
          `Nomi: ${session.data.serviceCenterName}\n` +
          `Viloyat: ${session.data.serviceCenterRegion}\n` +
          `📍 Koordinatalar: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          { reply_markup: getAdminMenu() }
        );
        
        clearSession(ctx.from.id);
      } catch (dbError) {
        ctx.reply('Ma\'lumotlar bazasiga saqlashda xatolik', { reply_markup: getAdminMenu() });
        clearSession(ctx.from.id);
      }
      return;
    }
    
    if (session.step === 'address') {
      session.data.address = 'Joylashuv';
      session.data.lat = ctx.message.location.latitude;
      session.data.lng = ctx.message.location.longitude;
      
      session.step = 'order_region_category';
      const categories = getRegionCategories();
      const keyboard = new InlineKeyboard();
      categories.forEach(cat => {
        keyboard.text(cat, `order_cat:${cat}`).row();
      });
      ctx.reply('📍 Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'master_gps') {
      const masterLat = ctx.message.location.latitude;
      const masterLng = ctx.message.location.longitude;
      
      await pool.query(
        'UPDATE orders SET master_current_lat = $1, master_current_lng = $2 WHERE id = $3',
        [masterLat, masterLng, session.data.orderId]
      );
      
      const order = await pool.query(
        `SELECT o.lat, o.lng, o.client_name, o.address, o.product, m.service_center_id
         FROM orders o
         JOIN masters m ON o.master_id = m.id
         WHERE o.id = $1`,
        [session.data.orderId]
      );
      
      let distanceText = '';
      if (order.rows.length > 0 && order.rows[0].lat && order.rows[0].lng) {
        const clientLat = order.rows[0].lat;
        const clientLng = order.rows[0].lng;
        
        let serviceCenter = null;
        let distanceFromServiceCenter = 0;
        
        if (order.rows[0].service_center_id) {
          serviceCenter = await pool.query(
            'SELECT lat, lng FROM service_centers WHERE id = $1',
            [order.rows[0].service_center_id]
          );
          
          if (serviceCenter.rows.length > 0) {
            distanceFromServiceCenter = calculateDistance(
              serviceCenter.rows[0].lat, 
              serviceCenter.rows[0].lng, 
              clientLat, 
              clientLng
            );
          }
        }
        
        distanceText = `\n📏 Xizmat markazidan masofa: ~${distanceFromServiceCenter.toFixed(2)} km`;
        
        await ctx.reply(
          `📍 GPS joylashuv saqlandi!\n` +
          `Holat: Yo'lda${distanceText}\n\n` +
          `👤 Mijoz: ${order.rows[0].client_name}\n` +
          `📦 Mahsulot: ${order.rows[0].product}\n\n` +
          `📍 Mijoz joylashuvi:`
        );
        
        await ctx.api.sendLocation(ctx.from.id, clientLat, clientLng);
      } else {
        await ctx.reply('📍 GPS joylashuv saqlandi!\nHolat: Yo\'lda');
      }
      
      session.step = 'arrived_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yetib keldim', `arrived:${session.data.orderId}`);
      
      ctx.reply('Yetib kelganingizda tugmani bosing:', { reply_markup: keyboard });
    } else if (session.step === 'completion_gps') {
      const completionLat = ctx.message.location.latitude;
      const completionLng = ctx.message.location.longitude;
      
      await pool.query(
        'UPDATE orders SET completion_gps_lat = $1, completion_gps_lng = $2 WHERE id = $3',
        [completionLat, completionLng, session.data.orderId]
      );
      
      // Get warranty status from database
      const orderData = await pool.query(
        'SELECT warranty_expired FROM orders WHERE id = $1',
        [session.data.orderId]
      );
      
      ctx.reply('📍 Joylashuv saqlandi!');
      
      if (orderData.rows.length > 0 && orderData.rows[0].warranty_expired === false) {
        // Warranty is valid - ask for spare parts photo
        session.step = 'spare_part_photo';
        ctx.reply('⚠️ Kafolat hali amal qilmoqda!\n\n' +
          'Eski ehtiyot qismni yangi bilan almashtirishingiz kerak.\n' +
          'Eski qismni katta omborga yuborishingiz kerak.\n\n' +
          '📸 Iltimos, eski ehtiyot qism rasmini yuboring:');
      } else {
        // Warranty is expired or not set - finish order
        session.step = 'finish_order_ready';
        const keyboard = new InlineKeyboard()
          .text('✅ Buyurtmani yakunlash', `finish_order:${session.data.orderId}`);
        
        ctx.reply('🛡️ Kafolat muddati tugagan. Buyurtmani yakunlash uchun tugmani bosing:', { reply_markup: keyboard });
      }
    }
  } catch (error) {
    console.error('Location handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^order_cat:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'order_region_category') {
      return;
    }
    
    const category = ctx.match[1];
    session.data.orderRegionCategory = category;
    session.step = 'order_region_subcategory';
    
    const subcategories = getSubcategories(category);
    const keyboard = new InlineKeyboard();
    subcategories.forEach(sub => {
      keyboard.text(sub, `order_sub:${sub}`).row();
    });
    keyboard.text('🔙 Orqaga', 'order_cat_back');
    
    await ctx.editMessageText(`📍 ${category}\n\nTumanni tanlang:`, { reply_markup: keyboard });
  } catch (error) {
    console.error('Order category callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('order_cat_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    
    session.step = 'order_region_category';
    delete session.data.orderRegionCategory;
    
    const categories = getRegionCategories();
    const keyboard = new InlineKeyboard();
    categories.forEach(cat => {
      keyboard.text(cat, `order_cat:${cat}`).row();
    });
    
    await ctx.editMessageText('📍 Viloyatni tanlang:', { reply_markup: keyboard });
  } catch (error) {
    console.error('Order category back callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^order_sub:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    const telegramId = ctx.from.id;
    
    if (session.step !== 'order_region_subcategory') {
      return;
    }
    
    const subcategory = ctx.match[1];
    session.data.orderRegionSubcategory = subcategory;
    session.data.selectedRegion = subcategory;
    
    await ctx.editMessageText(`✅ Tanlangan hudud: ${session.data.orderRegionCategory} - ${subcategory}`);
    
    if (isAdmin(telegramId)) {
      session.step = 'select_master';
      const masters = await pool.query(
        'SELECT id, name, region FROM masters WHERE region = $1 ORDER BY name',
        [subcategory]
      );
      
      if (masters.rows.length === 0) {
        const allMasters = await pool.query(
          'SELECT id, name, region FROM masters ORDER BY region, name'
        );
        
        if (allMasters.rows.length === 0) {
          clearSession(ctx.from.id);
          return ctx.reply('❌ Ustalar topilmadi. Avval usta qo\'shing.', { reply_markup: getAdminMenu() });
        }
        
        const keyboard = new InlineKeyboard();
        allMasters.rows.forEach(m => {
          keyboard.text(`${m.name} (${m.region || 'Hudud yo\'q'})`, `select_master:${m.id}`).row();
        });
        ctx.reply(`⚠️ ${subcategory} hududida usta yo'q. Boshqa ustalardan tanlang:`, { reply_markup: keyboard });
      } else {
        const keyboard = new InlineKeyboard();
        masters.rows.forEach(m => {
          keyboard.text(`${m.name} (${m.region || 'Hudud yo\'q'})`, `select_master:${m.id}`).row();
        });
        ctx.reply('👷 Usta tanlang:', { reply_markup: keyboard });
      }
    } else {
      session.step = 'product_category';
      
      const masterResult = await pool.query(
        'SELECT region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      const masterRegion = masterResult.rows.length > 0 ? masterResult.rows[0].region : null;
      session.data.masterRegion = masterRegion;
      
      const categories = await pool.query(
        'SELECT DISTINCT category FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 AND category IS NOT NULL ORDER BY category',
        [masterRegion]
      );
      
      if (categories.rows.length > 0) {
        const keyboard = new InlineKeyboard();
        categories.rows.forEach(c => {
          keyboard.text(c.category, `product_cat:${c.category}`).row();
        });
        ctx.reply('📁 Kategoriyani tanlang:', { reply_markup: keyboard });
      } else {
        clearSession(ctx.from.id);
        ctx.reply('❌ Omborda mahsulot yo\'q. Iltimos adminga murojaat qiling.', { reply_markup: getMainMenu() });
      }
    }
  } catch (error) {
    console.error('Order subcategory callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^product:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    const productName = ctx.match[1];
    
    session.data.product = productName;
    
    await ctx.editMessageText(`✅ Tanlangan mahsulot: ${productName}`);
    
    if (isAdmin(ctx.from.id)) {
      session.step = 'barcode';
      ctx.reply('📊 Mahsulot shtrix kodini kiriting (kafolat tekshirish uchun):');
    } else {
      session.step = 'quantity';
      ctx.reply('Miqdorni kiriting:');
    }
  } catch (error) {
    console.error('Product callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^product_next:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    const pageSize = 8;
    
    let products;
    if (session.data.productCategory && session.data.productSubcategory) {
      products = await pool.query(
        'SELECT DISTINCT name, quantity FROM warehouse WHERE category = $1 AND subcategory = $2 AND (region = $3 OR region IS NULL) AND quantity > 0 ORDER BY name',
        [session.data.productCategory, session.data.productSubcategory, session.data.masterRegion]
      );
    } else if (session.data.productCategory) {
      products = await pool.query(
        'SELECT DISTINCT name, quantity FROM warehouse WHERE category = $1 AND (region = $2 OR region IS NULL) AND quantity > 0 ORDER BY name',
        [session.data.productCategory, session.data.masterRegion]
      );
    } else {
      products = await pool.query(
        'SELECT DISTINCT name, quantity FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 ORDER BY name',
        [session.data.masterRegion]
      );
    }
    
    if (products.rows.length === 0) {
      clearSession(ctx.from.id);
      await ctx.editMessageText('❌ Omborda mahsulot yo\'q. Iltimos adminga murojaat qiling.');
      return ctx.reply('Bosh menyu:', { reply_markup: getMainMenu() });
    }
    
    const totalPages = Math.ceil(products.rows.length / pageSize);
    let page = parseInt(ctx.match[1]);
    
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;
    
    const start = page * pageSize;
    const end = start + pageSize;
    const pageProducts = products.rows.slice(start, end);
    
    const keyboard = new InlineKeyboard();
    
    pageProducts.forEach(p => {
      keyboard.text(`${p.name} (${p.quantity})`, `product:${p.name}`).row();
    });
    
    if (page > 0) {
      keyboard.text('⬅️ Oldingi', `product_next:${page - 1}`);
    }
    if (end < products.rows.length) {
      keyboard.text('➡️ Keyingisi', `product_next:${page + 1}`);
    }
    if (page > 0 || end < products.rows.length) {
      keyboard.row();
    }
    
    if (session.data.productSubcategory) {
      keyboard.text('🔙 Orqaga', 'product_subcat_back').row();
    } else if (session.data.productCategory) {
      keyboard.text('🔙 Orqaga', 'product_cat_back').row();
    }
    
    await ctx.editMessageText(`📦 Mahsulotni tanlang (${page + 1}/${totalPages}):`, { reply_markup: keyboard });
  } catch (error) {
    console.error('Product pagination error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^accept_order:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    const master = await pool.query(
      'SELECT id, name FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (master.rows.length === 0) {
      return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
    }
    
    const order = await pool.query(
      'SELECT id, status, master_id FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (order.rows.length === 0) {
      return ctx.reply('Buyurtma topilmadi.');
    }
    
    if (order.rows[0].status !== 'new') {
      return ctx.reply('Bu buyurtma allaqachon boshqa usta tomonidan qabul qilingan.');
    }
    
    const updateResult = await pool.query(
      `UPDATE orders SET master_id = $1, master_telegram_id = $2, status = 'accepted' 
       WHERE id = $3 AND status = 'new' RETURNING id`,
      [master.rows[0].id, telegramId, orderId]
    );
    
    if (updateResult.rows.length === 0) {
      return ctx.reply('Bu buyurtma allaqachon boshqa usta tomonidan qabul qilingan.');
    }
    
    const orderData = await pool.query(
      'SELECT distance_km, distance_fee, product_total, work_fee FROM orders WHERE id = $1',
      [orderId]
    );
    
    let distanceFeeText = '';
    let paymentDetails = '';
    if (orderData.rows.length > 0) {
      const distanceKm = orderData.rows[0].distance_km || 0;
      const distanceFee = orderData.rows[0].distance_fee || 0;
      const productTotal = orderData.rows[0].product_total || 0;
      const workFee = orderData.rows[0].work_fee || 0;
      const totalPayment = distanceFee + productTotal + workFee;
      
      if (distanceKm > 0) {
        distanceFeeText = `\n💰 Masofa to'lovi: ${distanceFee.toLocaleString('uz-UZ')} so'm (~${distanceKm.toFixed(2)} km × 3,000 so'm)`;
      }
      
      paymentDetails = `💰 Masofa to'lovi: ${distanceFee.toLocaleString('uz-UZ')} so'm\n` +
                      `📦 Mahsulot summasi: ${productTotal.toLocaleString('uz-UZ')} so'm\n` +
                      `🔧 Ish to'lovi: ${workFee.toLocaleString('uz-UZ')} so'm\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💵 JAMI TO'LOV: ${totalPayment.toLocaleString('uz-UZ')} so'm`;
    }
    
    rejectedOrderMasters.delete(orderId);
    
    await notifyAdmins(
      `✅ BUYURTMA QABUL QILINDI!\n\n` +
      `📋 Buyurtma ID: #${orderId}\n` +
      `👷 Usta: ${master.rows[0].name}\n` +
      `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}${distanceFeeText}`
    );
    
    const session = getSession(telegramId);
    session.data.orderId = orderId;
    session.step = 'on_way_pending';
    
    const keyboard = new InlineKeyboard()
      .text('Yo\'ldaman', `on_way:${orderId}`);
    
    ctx.reply(
      `✅ Buyurtma #${orderId} qabul qilindi!\n\n` +
      `${paymentDetails}\n\n` +
      `Yo'lga chiqsangiz "Yo'ldaman" tugmasini bosing.`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Accept order error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^reject_order:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    const telegramId = ctx.from.id;
    
    const master = await pool.query(
      'SELECT name, region FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (master.rows.length === 0) {
      return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
    }
    
    const order = await pool.query(
      'SELECT id, client_name, product, address, lat, lng FROM orders WHERE id = $1 AND status = $2',
      [orderId, 'new']
    );
    
    if (order.rows.length === 0) {
      return ctx.reply('Buyurtma topilmadi yoki allaqachon qabul qilingan.');
    }
    
    if (!rejectedOrderMasters.has(orderId)) {
      rejectedOrderMasters.set(orderId, []);
    }
    rejectedOrderMasters.get(orderId).push(telegramId);
    
    const excludedMasters = rejectedOrderMasters.get(orderId);
    
    await notifyAdmins(
      `❌ BUYURTMA RAD ETILDI!\n\n` +
      `📋 Buyurtma ID: #${orderId}\n` +
      `👷 Usta: ${master.rows[0].name}\n` +
      `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}\n\n` +
      `Keyingi eng yaqin ustaga xabar yuborilmoqda...`
    );
    
    ctx.reply(
      `❌ Buyurtma #${orderId} rad etildi.\n\n` +
      `Keyingi eng yaqin ustaga xabar yuboriladi.`,
      { reply_markup: getMainMenu() }
    );
    
    const orderData = order.rows[0];
    const notifyResult = await notifyClosestMaster(master.rows[0].region, orderId, {
      clientName: orderData.client_name,
      product: orderData.product,
      address: orderData.address
    }, orderData.lat, orderData.lng, excludedMasters);
    
    if (!notifyResult.closestMaster && notifyResult.fallback) {
      await notifyAdmins(
        `⚠️ Hech qanday yaqin usta topilmadi!\n\n` +
        `📋 Buyurtma ID: #${orderId}\n` +
        `Barcha viloyat ustalariga xabar yuborildi.`
      );
    } else if (!notifyResult.success) {
      await notifyAdmins(
        `⚠️ Ustalar topilmadi!\n\n` +
        `📋 Buyurtma ID: #${orderId}\n` +
        `Iltimos, buyurtmani qo'lda tayinlang.`
      );
    }
    
  } catch (error) {
    console.error('Reject order error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^on_way:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    await pool.query(
      "UPDATE orders SET status = 'on_way' WHERE id = $1",
      [orderId]
    );
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'master_gps';
    
    const keyboard = new Keyboard()
      .requestLocation('📍 GPS joylashuvni yuborish')
      .resized()
      .oneTime();
    
    ctx.reply('Iltimos, GPS joylashuvingizni yuboring:', { reply_markup: keyboard });
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^arrived:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    await pool.query(
      "UPDATE orders SET status = 'arrived' WHERE id = $1",
      [orderId]
    );
    
    const order = await pool.query(
      'SELECT product_date FROM orders WHERE id = $1',
      [orderId]
    );
    
    let warrantyStatus = 'unknown';
    let warrantyMessage = '';
    
    if (order.rows.length > 0 && order.rows[0].product_date) {
      const productDate = new Date(order.rows[0].product_date);
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - productDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const diffMonths = diffDays / 30;
      
      if (diffMonths < 2) {
        warrantyStatus = 'valid';
        warrantyMessage = `\n🛡️ ✅ Kafolat hali AMAL QILMOQDA (${Math.round(diffMonths * 10) / 10} oy)\n🎁 ISH TO'LOVI: BEPUL!`;
      } else {
        warrantyStatus = 'expired';
        warrantyMessage = `\n🛡️ ❌ Kafolat TUGAGAN (${Math.round(diffMonths * 10) / 10} oy)\n💰 ISH TO'LOVI: TO'LANADI!`;
      }
    }
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.data.warrantyStatus = warrantyStatus;
    
    // If warranty is valid, skip work type selection (no payment needed)
    if (warrantyStatus === 'valid') {
      session.step = 'awaiting_completion';
      
      await pool.query(
        'UPDATE orders SET work_type = $1, work_fee = $2, total_payment = product_total + distance_fee WHERE id = $3',
        ['warranty', 0, orderId]
      );
      
      ctx.reply(`📍 Yetib keldingiz! Holat yangilandi.${warrantyMessage}\n\n📸 Ishni tugatish uchun foto yuborish kerak...`);
    } else {
      // If warranty expired, ask about work difficulty
      session.step = 'work_type_pending';
      
      const keyboard = new InlineKeyboard()
        .text('🟢 OSON ISH (100,000 so\'m)', `work_type:easy:${orderId}`)
        .row()
        .text('🔴 MURAKKAB ISH (150,000 so\'m)', `work_type:difficult:${orderId}`);
      
      ctx.reply(`📍 Yetib keldingiz! Holat yangilandi.${warrantyMessage}\n\n💼 Ish turini tanlang:`, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Arrived callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^work_type:(\w+):(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const workType = ctx.match[1];
    const orderId = ctx.match[2];
    
    const order = await pool.query('SELECT product_total, distance_fee, warranty_expired FROM orders WHERE id = $1', [orderId]);
    const { product_total, distance_fee, warranty_expired } = order.rows[0];
    
    let warrantyStatus = 'unknown';
    let isWarrantyValid = !warranty_expired;
    
    let workFee = 0;
    if (!isWarrantyValid) {
      workFee = workType === 'difficult' ? 150000 : 100000;
    }
    
    const totalPayment = product_total + distance_fee + workFee;
    
    await pool.query(
      'UPDATE orders SET work_type = $1, work_fee = $2, total_payment = $3 WHERE id = $4',
      [workType, workFee, totalPayment, orderId]
    );
    
    const workTypeText = workType === 'difficult' ? '🔴 MURAKKAB ISH' : '🟢 OSON ISH';
    const workFeeText = workFee === 0 ? 'BEPUL ✅' : workFee.toLocaleString('uz-UZ') + ' so\'m';
    
    await ctx.editMessageText(
      `${workTypeText}\n✅ Tanlandi!\n\n` +
      `Ish turi to'lovi: ${workFeeText}`
    );
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'after_photo';
    ctx.reply('📸 Ishni tugatgach rasmni yuboring:');
  } catch (error) {
    console.error('Work type callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});


bot.callbackQuery(/^accept_spare_part:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const existingOrder = await pool.query(
      'SELECT spare_part_received, spare_part_sent, master_telegram_id, product FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (existingOrder.rows.length === 0) {
      return ctx.reply('Buyurtma topilmadi');
    }
    
    if (existingOrder.rows[0].spare_part_received) {
      return ctx.reply('⚠️ Bu buyurtma uchun ehtiyot qism allaqachon qabul qilingan!');
    }
    
    if (!existingOrder.rows[0].spare_part_sent) {
      return ctx.reply('⚠️ Usta hali ehtiyot qism rasmini yubormagan!');
    }
    
    await pool.query(
      'UPDATE orders SET spare_part_received = TRUE WHERE id = $1',
      [orderId]
    );
    
    const masterTelegramId = existingOrder.rows[0].master_telegram_id;
    
    if (masterTelegramId) {
      try {
        const keyboard = new InlineKeyboard()
          .text('✅ Buyurtmani yakunlash', `finish_order:${orderId}`);
        
        await bot.api.sendMessage(
          masterTelegramId,
          `✅ Ehtiyot qism qabul qilindi!\n\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `📦 Mahsulot: ${existingOrder.rows[0].product}\n\n` +
          `Endi buyurtmani yakunlashingiz mumkin:`,
          { reply_markup: keyboard }
        );
      } catch (notifyError) {
        console.error('Failed to notify master:', notifyError);
      }
    }
    
    ctx.reply(`✅ Buyurtma #${orderId} uchun ehtiyot qism qabul qilindi. Usta xabardor qilindi.`);
  } catch (error) {
    console.error('Accept spare part callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^warranty:(valid|expired)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const warrantyChoice = ctx.match[1];
    const session = getSession(ctx.from.id);
    
    if (session.step !== 'warranty_selection') {
      return;
    }
    
    session.data.warrantyExpired = warrantyChoice === 'expired';
    
    const warrantyText = warrantyChoice === 'valid' ? '✅ KAFOLAT BOR' : '❌ KAFOLAT YO\'Q';
    await ctx.editMessageText(`${warrantyText}\n✅ Tanlandi!`);
    
    const telegramId = ctx.from.id;
    let masterId, masterName, masterPhone, masterRegion, masterTelegramId;
    
    if (session.data.selectedMasterId) {
      masterId = session.data.selectedMasterId;
      masterName = session.data.selectedMasterName;
      masterPhone = session.data.selectedMasterPhone;
      masterRegion = session.data.selectedMasterRegion;
      masterTelegramId = session.data.selectedMasterTelegramId;
    } else {
      const master = await pool.query(
        'SELECT id, name, phone, region, telegram_id FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        clearSession(ctx.from.id);
        return ctx.reply('Siz ro\'yxatdan o\'tmagansiz. Adminga murojaat qiling.');
      }
      
      masterId = master.rows[0].id;
      masterName = master.rows[0].name;
      masterPhone = master.rows[0].phone;
      masterRegion = master.rows[0].region;
      masterTelegramId = master.rows[0].telegram_id;
    }
    
    const stock = await pool.query(
      `SELECT id, quantity, region FROM warehouse 
       WHERE name = $1 AND (region = $2 OR region IS NULL)
       ORDER BY CASE WHEN region = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [session.data.product, masterRegion]
    );
    
    const available = stock.rows.length > 0 ? stock.rows[0].quantity : 0;
    const stockId = stock.rows.length > 0 ? stock.rows[0].id : null;
    
    if (stock.rows.length === 0 || available < session.data.quantity) {
      const shortage = session.data.quantity - available;
      
      try {
        await notifyAdmins(
          `⚠️ OMBORDA MAHSULOT YETISHMAYAPTI!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📍 Viloyat: ${masterRegion || 'Noma\'lum'}\n` +
          `👷 Usta: ${masterName}\n` +
          `📦 Mahsulot: ${session.data.product}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📊 Omborda mavjud: ${available} dona\n` +
          `📋 Kerak: ${session.data.quantity} dona\n` +
          `❗ Yetishmayapti: ${shortage} dona\n\n` +
          `Iltimos, omborni to'ldiring!`
        );
      } catch (adminError) {
        console.error('Failed to notify admin about shortage:', adminError);
      }
      
      clearSession(ctx.from.id);
      const replyMenu = isAdmin(telegramId) ? getAdminMenu() : getMainMenu();
      return ctx.reply(`Omborda yetarli emas. Mavjud: ${available} dona. Adminga xabar yuborildi.`, { reply_markup: replyMenu });
    }
    
    const productPrice = await pool.query(
      'SELECT price FROM warehouse WHERE name = $1 LIMIT 1',
      [session.data.product]
    );
    const productTotal = (productPrice.rows.length > 0 ? parseFloat(productPrice.rows[0].price) : 0) * session.data.quantity;
    
    const orderResult = await pool.query(
      `INSERT INTO orders (master_id, client_name, client_phone, address, lat, lng, product, quantity, status, master_telegram_id, barcode, product_total, warranty_expired) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10, $11, $12) RETURNING id, created_at`,
      [masterId, session.data.customerName, session.data.phone, 
       session.data.address, session.data.lat, session.data.lng,
       session.data.product, session.data.quantity, masterTelegramId, session.data.barcode || null, productTotal, session.data.warrantyExpired]
    );
    
    await pool.query(
      'UPDATE warehouse SET quantity = quantity - $1 WHERE id = $2',
      [session.data.quantity, stockId]
    );
    
    session.data.orderId = orderResult.rows[0].id;
    
    if (isAdmin(telegramId)) {
      clearSession(ctx.from.id);
      
      const barcodeInfo = session.data.barcode ? `\n📊 Shtrix kod: ${session.data.barcode}` : '';
      
      const notifyResult = await notifyClosestMaster(masterRegion, orderResult.rows[0].id, {
        clientName: session.data.customerName,
        product: session.data.product,
        address: session.data.address,
        barcode: session.data.barcode
      }, session.data.lat, session.data.lng);
      
      if (notifyResult.closestMaster) {
        ctx.reply(`✅ Buyurtma yaratildi!\n\n📋 Buyurtma ID: #${orderResult.rows[0].id}\n👷 Tanlangan usta: ${masterName}\n📦 Mahsulot: ${session.data.product}\n📊 Miqdor: ${session.data.quantity} dona${barcodeInfo}\n\n📍 Eng yaqin usta (${notifyResult.closestMaster.name}, ~${notifyResult.distance} km) xabardor qilindi!`, { reply_markup: getAdminMenu() });
      } else {
        ctx.reply(`✅ Buyurtma yaratildi!\n\n📋 Buyurtma ID: #${orderResult.rows[0].id}\n👷 Usta: ${masterName}\n📦 Mahsulot: ${session.data.product}\n📊 Miqdor: ${session.data.quantity} dona${barcodeInfo}\n\n📍 Barcha ${masterRegion} ustalariga joylashuv so'rovi yuborildi!`, { reply_markup: getAdminMenu() });
      }
    } else {
      session.step = 'on_way_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yo\'ldaman', `on_way:${session.data.orderId}`);
      
      ctx.reply('Buyurtma yaratildi!', { reply_markup: keyboard });
    }
    
    try {
      const orderDate = orderResult.rows[0].created_at.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const locationInfo = session.data.lat && session.data.lng 
        ? `📍 GPS: ${session.data.lat}, ${session.data.lng}\n` 
        : '';
      
      const barcodeAdminInfo = session.data.barcode 
        ? `   📊 Shtrix kod: ${session.data.barcode}\n` 
        : '';
      
      await notifyAdmins(
        `🆕 Yangi buyurtma yaratildi:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Buyurtma ID: #${orderResult.rows[0].id}\n` +
        `📅 Sana: ${orderDate}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👷 USTA MA'LUMOTLARI:\n` +
        `   Ism: ${masterName}\n` +
        `   Tel: ${masterPhone || 'Kiritilmagan'}\n` +
        `   Viloyat: ${masterRegion || 'Kiritilmagan'}\n\n` +
        `👤 MIJOZ MA'LUMOTLARI:\n` +
        `   Ism: ${session.data.customerName}\n` +
        `   Tel: ${session.data.phone}\n` +
        `   Manzil: ${session.data.address}\n` +
        locationInfo + `\n` +
        `📦 BUYURTMA:\n` +
        `   Mahsulot: ${session.data.product}\n` +
        `   Miqdor: ${session.data.quantity} dona\n` +
        barcodeAdminInfo
      );
    } catch (adminError) {
      console.error('Failed to notify admin:', adminError);
    }
  } catch (error) {
    console.error('Warranty selection callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^finish_order:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    const order = await pool.query(
      `SELECT status, warranty_expired, spare_part_received, spare_part_sent, 
              before_photo, after_photo, completion_gps_lat, completion_gps_lng 
       FROM orders WHERE id = $1`,
      [orderId]
    );
    
    if (order.rows.length === 0) {
      return ctx.reply('Buyurtma topilmadi');
    }
    
    const { status, warranty_expired, spare_part_received, spare_part_sent, 
            before_photo, after_photo, completion_gps_lat, completion_gps_lng } = order.rows[0];
    
    if (status === 'delivered') {
      return ctx.reply('⚠️ Bu buyurtma allaqachon yakunlangan!');
    }
    
    if (!after_photo) {
      return ctx.reply('⚠️ Ishdan keyingi rasm yuklanmagan!');
    }
    
    if (!completion_gps_lat || !completion_gps_lng) {
      return ctx.reply('⚠️ Joylashuv yuklanmagan!');
    }
    
    if (warranty_expired === false) {
      if (!spare_part_sent) {
        return ctx.reply('⚠️ Eski ehtiyot qism rasmi yuklanmagan!');
      }
      if (!spare_part_received) {
        return ctx.reply('⚠️ Admin ehtiyot qismni qabul qilishini kuting!');
      }
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'completion_barcode';
    session.data.orderId = orderId;
    
    ctx.reply('📊 Mahsulot shtrix kodini kiriting (kafolat tekshirish uchun):');
  } catch (error) {
    console.error('Finish order callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^report_year:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const year = parseInt(ctx.match[1]);
    
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.data.reportYear = year;
    session.step = 'monthly_report_month';
    
    const keyboard = new InlineKeyboard();
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    
    months.forEach((month, index) => {
      keyboard.text(month, `report_month:${index + 1}`).row();
    });
    
    await ctx.editMessageText(
      `📊 Oylik hisobot\n\n` +
      `Yil: ${year}\n\n` +
      `Oyni tanlang:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Report year callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^report_month:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const month = parseInt(ctx.match[1]);
    
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    const year = session.data.reportYear;
    
    if (!year) {
      return ctx.reply('Yil tanlanmagan');
    }
    
    ctx.editMessageText('⏳ Hisobot tayyorlanmoqda...');
    
    // Generate Excel report for the selected month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    
    const orders = await pool.query(
      `SELECT 
        o.id, m.name as master_name, m.region, o.client_name, o.client_phone,
        o.address, o.product, o.quantity, o.status, o.created_at,
        o.product_date, o.barcode, o.completion_barcode,
        o.distance_km, o.distance_fee, o.work_type, o.work_fee,
        o.product_total, o.total_payment,
        CASE 
          WHEN o.warranty_expired = true THEN 'Tugagan'
          WHEN o.warranty_expired = false THEN 'Amal qilmoqda'
          ELSE '-'
        END as warranty_status
       FROM orders o
       JOIN masters m ON o.master_id = m.id
       WHERE o.created_at >= $1 AND o.created_at < $2
       ORDER BY o.created_at ASC`,
      [startDate, endDate]
    );
    
    if (orders.rows.length === 0) {
      return ctx.editMessageText(
        `📊 Oylik hisobot\n\n` +
        `Yil: ${year}\n` +
        `Oy: ${month}\n\n` +
        `❌ Bu oy uchun buyurtmalar topilmadi`,
        { reply_markup: new InlineKeyboard().text('🔙 Orqaga', 'back_to_admin') }
      );
    }
    
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Oylik hisobot');
    
    // Set column headers
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Usta', key: 'master_name', width: 20 },
      { header: 'Viloyat', key: 'region', width: 15 },
      { header: 'Mijoz', key: 'client_name', width: 20 },
      { header: 'Telefon', key: 'client_phone', width: 15 },
      { header: 'Manzil', key: 'address', width: 25 },
      { header: 'Mahsulot', key: 'product', width: 20 },
      { header: 'Miqdor', key: 'quantity', width: 10 },
      { header: 'Holat', key: 'status', width: 15 },
      { header: 'Yaratilgan sana', key: 'created_at', width: 20 },
      { header: 'Mahsulot sanasi', key: 'product_date', width: 15 },
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Tugagan barcode', key: 'completion_barcode', width: 15 },
      { header: 'Masofa (km)', key: 'distance_km', width: 12 },
      { header: 'Masofa to\'lovi', key: 'distance_fee', width: 15 },
      { header: 'Ish turi', key: 'work_type', width: 15 },
      { header: 'Ish to\'lovi', key: 'work_fee', width: 15 },
      { header: 'Mahsulot summasi', key: 'product_total', width: 15 },
      { header: 'Umumiy to\'lov', key: 'total_payment', width: 15 },
      { header: 'Kafolat', key: 'warranty_status', width: 15 }
    ];
    
    // Status mapping
    const statusMap = {
      'new': 'Yangi',
      'accepted': 'Qabul qilindi',
      'on_way': 'Yo\'lda',
      'arrived': 'Yetib keldi',
      'delivered': 'Yetkazildi'
    };
    
    // Add data rows
    orders.rows.forEach(order => {
      worksheet.addRow({
        id: order.id,
        master_name: order.master_name || '-',
        region: order.region || '-',
        client_name: order.client_name || '-',
        client_phone: order.client_phone || '-',
        address: order.address || '-',
        product: order.product || '-',
        quantity: order.quantity || 0,
        status: statusMap[order.status] || order.status,
        created_at: order.created_at ? new Date(order.created_at).toLocaleString('uz-UZ') : '-',
        product_date: order.product_date ? new Date(order.product_date).toLocaleDateString('uz-UZ') : '-',
        barcode: order.barcode || '-',
        completion_barcode: order.completion_barcode || '-',
        distance_km: parseFloat(order.distance_km) || 0,
        distance_fee: Math.round(parseFloat(order.distance_fee) || 0),
        work_type: order.work_type || '-',
        work_fee: Math.round(parseFloat(order.work_fee) || 0),
        product_total: Math.round(parseFloat(order.product_total) || 0),
        total_payment: Math.round(parseFloat(order.total_payment) || 0),
        warranty_status: order.warranty_status
      });
    });
    
    // Calculate summary
    const totalOrders = orders.rows.length;
    const deliveredOrders = orders.rows.filter(o => o.status === 'delivered').length;
    const totalPayment = Math.round(orders.rows.reduce((sum, o) => sum + (parseFloat(o.total_payment) || 0), 0));
    const totalDistance = orders.rows.reduce((sum, o) => sum + (parseFloat(o.distance_km) || 0), 0);
    
    // Add summary row
    worksheet.addRow({});
    worksheet.addRow({
      id: 'JAMI:',
      master_name: `${totalOrders} ta buyurtma`,
      region: `${deliveredOrders} ta yetkazilgan`,
      client_name: `Umumiy to'lov: ${totalPayment.toLocaleString()} so'm`,
      address: `Jami masofa: ${totalDistance.toFixed(1)} km`
    });
    
    const fileName = `oylik_hisobot_${year}_${month.toString().padStart(2, '0')}_${Date.now()}.xlsx`;
    const filePath = path.join('/tmp', fileName);
    
    await workbook.xlsx.writeFile(filePath);
    
    try {
      await ctx.replyWithDocument(
        new InputFile(filePath, fileName),
        { 
          caption: `📊 Oylik hisobot\n\n` +
            `📅 Sana: ${year}-${month.toString().padStart(2, '0')}\n` +
            `📋 Jami buyurtmalar: ${totalOrders} ta\n` +
            `✅ Yetkazilgan: ${deliveredOrders} ta\n` +
            `💰 Umumiy to'lov: ${Math.round(totalPayment).toLocaleString()} so'm\n` +
            `📍 Jami masofa: ${totalDistance.toFixed(1)} km`,
          reply_markup: getAdminMenu()
        }
      );
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
    
    clearSession(ctx.from.id);
  } catch (error) {
    console.error('Report month callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('back_to_admin', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    clearSession(ctx.from.id);
    ctx.editMessageText('Admin paneliga xush kelibsiz! 🔧', { reply_markup: getAdminMenu() });
  } catch (error) {
    console.error('Back to admin callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:document', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    
    if (session.step === 'excel_import') {
      const document = ctx.message.document;
      const fileName = document.file_name || '';
      
      if (!fileName.match(/\.(xlsx|xls)$/i)) {
        return ctx.reply('❌ Faqat Excel fayl (.xlsx, .xls) yuborishingiz mumkin!');
      }
      
      const importRegion = session.data.importRegion || null;
      const regionText = importRegion ? importRegion : 'Barcha viloyatlar';
      ctx.reply(`⏳ Fayl yuklanmoqda va qayta ishlanmoqda...\n📍 Viloyat: ${regionText}`);
      
      try {
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        const buffer = await downloadFile(fileUrl);
        
        const result = await importProductsFromExcel(buffer, importRegion);
        
        let message = '📊 Excel import natijasi:\n\n';
        message += `📍 Viloyat: ${regionText}\n`;
        message += `✅ Yangi qo'shildi: ${result.imported} ta\n`;
        message += `🔄 Yangilandi: ${result.updated} ta\n`;
        message += `📝 Jami qatorlar: ${result.total} ta\n`;
        
        if (result.skipped > 0) {
          message += `\n⚠️ O'tkazib yuborildi: ${result.skipped} ta\n`;
          const errorSample = result.errors.slice(0, 5);
          if (errorSample.length > 0) {
            message += '\nXatoliklar:\n';
            errorSample.forEach(err => {
              message += `• ${err}\n`;
            });
            if (result.errors.length > 5) {
              message += `... va yana ${result.errors.length - 5} ta xatolik`;
            }
          }
        }
        
        clearSession(ctx.from.id);
        ctx.reply(message, { reply_markup: getAdminMenu() });
      } catch (importError) {
        console.error('Excel import error:', importError);
        ctx.reply('❌ Excel faylni o\'qishda xatolik: ' + importError.message, { reply_markup: getAdminMenu() });
        clearSession(ctx.from.id);
      }
    }
  } catch (error) {
    console.error('Document handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:photo', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    
    if (session.step === 'after_photo') {
      session.data.afterPhoto = fileId;
      const order = await pool.query(
        `SELECT o.*, m.name as master_name, m.region, m.service_center_id,
                sc.lat as service_center_lat, sc.lng as service_center_lng
         FROM orders o 
         JOIN masters m ON o.master_id = m.id 
         LEFT JOIN service_centers sc ON m.service_center_id = sc.id
         WHERE o.id = $1`,
        [session.data.orderId]
      );
      
      if (order.rows.length > 0) {
        const od = order.rows[0];
        let distanceKm = 0;
        let distanceFee = 0;
        
        // Use service center location if available, otherwise skip distance calculation
        if (od.service_center_lat && od.service_center_lng && od.lat && od.lng) {
          distanceKm = calculateDistance(od.service_center_lat, od.service_center_lng, od.lat, od.lng);
          distanceFee = calculateDistanceFee(distanceKm);
          
          await pool.query(
            'UPDATE orders SET after_photo = $1, distance_km = $2, distance_fee = $3 WHERE id = $4',
            [fileId, distanceKm, distanceFee, session.data.orderId]
          );
        } else {
          await pool.query(
            'UPDATE orders SET after_photo = $1 WHERE id = $2',
            [fileId, session.data.orderId]
          );
        }
        
        try {
          const distanceText = distanceKm > 0 ? `\n📍 Masofa: ~${distanceKm.toFixed(2)} km (${distanceFee.toLocaleString('uz-UZ')} so'm)` : '';
          await sendPhotoToAdmins(
            fileId,
            {
              caption: `✅ USTA ISHNI TUGATDI!\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📋 Buyurtma ID: #${session.data.orderId}\n` +
                `👷 Usta: ${od.master_name}\n` +
                `📍 Viloyat: ${od.region || 'Noma\'lum'}\n` +
                `👤 Mijoz: ${od.client_name}\n` +
                `📦 Mahsulot: ${od.product}${distanceText}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📸 Ishdan KEYINGI rasm`
            }
          );
        } catch (adminError) {
          console.error('Failed to notify admin about after photo:', adminError);
        }
      } else {
        await pool.query(
          'UPDATE orders SET after_photo = $1 WHERE id = $2',
          [fileId, session.data.orderId]
        );
      }
      
      session.step = 'completion_gps';
      
      const keyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      ctx.reply('📸 Keyingi rasm saqlandi!\n\n📍 Endi joylashuvingizni yuboring:', { reply_markup: keyboard });
    } else if (session.step === 'spare_part_photo') {
      session.data.sparePartPhoto = fileId;
      await pool.query(
        'UPDATE orders SET spare_part_photo = $1, spare_part_sent = TRUE WHERE id = $2',
        [fileId, session.data.orderId]
      );
      
      const order = await pool.query(
        `SELECT o.*, m.name as master_name, m.region 
         FROM orders o 
         JOIN masters m ON o.master_id = m.id 
         WHERE o.id = $1`,
        [session.data.orderId]
      );
      
      if (order.rows.length > 0) {
        const od = order.rows[0];
        
        try {
          const keyboard = new InlineKeyboard()
            .text('✅ Qabul qilish', `accept_spare_part:${session.data.orderId}`);
          
          await sendPhotoToAdmins(
            fileId,
            {
              caption: `📦 EHTIYOT QISM YUBORILDI!\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📋 Buyurtma ID: #${session.data.orderId}\n` +
                `👷 Usta: ${od.master_name}\n` +
                `📍 Viloyat: ${od.region || 'Noma\'lum'}\n` +
                `📦 Mahsulot: ${od.product}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Ehtiyot qismni qabul qilish uchun tugmani bosing:`,
              reply_markup: keyboard
            }
          );
        } catch (adminError) {
          console.error('Failed to notify admin about spare part:', adminError);
        }
      }
      
      ctx.reply('📸 Ehtiyot qism rasmi yuborildi!\n\n' +
        '⏳ Admin ehtiyot qismni qabul qilishini kuting.\n' +
        'Qabul qilinganda sizga xabar keladi.');
    }
  } catch (error) {
    console.error('Photo handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.catch((err) => {
  console.error('Error:', err);
});

process.once('SIGINT', () => {
  console.log('SIGINT received, stopping bot...');
  bot.stop();
});

process.once('SIGTERM', () => {
  console.log('SIGTERM received, stopping bot...');
  bot.stop();
});

async function startBot() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.start({
      drop_pending_updates: true,
      onStart: () => {
        console.log('Bot is running...');
        console.log('Brando Bot - Started with NeonDB 2025');
      }
    });
  } catch (error) {
    if (error.error_code === 409) {
      console.log('Another bot instance detected. Waiting 5 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return startBot();
    }
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();

