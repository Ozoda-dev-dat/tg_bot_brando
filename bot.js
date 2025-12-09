require('dotenv').config();
const grammy = require('grammy');
const Bot = grammy.Bot;
const { InlineKeyboard, Keyboard } = require('grammy');
const { Pool } = require('pg');
const XLSX  = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const bot = global.botInstance || new Bot(process.env.BOT_TOKEN);
const pool = global.poolInstance || new Pool({ connectionString: process.env.DATABASE_URL });

if (global.botInstance) {
    console.log("⚠️ Bot already initialized, reusing existing instance.");
} else {
    global.botInstance = bot;
    global.poolInstance = pool;
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
      
      try {
        pendingOrderLocations.set(master.telegram_id, {
          orderId,
          region,
          orderDetails,
          timestamp: Date.now()
        });
        
        const locationKeyboard = new Keyboard()
          .requestLocation('📍 Joylashuvni yuborish')
          .resized()
          .oneTime();
        
        await bot.api.sendMessage(
          master.telegram_id,
          `🆕 Yangi buyurtma!\n\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `👤 Mijoz: ${orderDetails.clientName}\n` +
          `📦 Mahsulot: ${orderDetails.product}\n` +
          `📍 Manzil: ${orderDetails.address}\n\n` +
          `⚡ Buyurtmani qabul qilish uchun joylashuvingizni yuboring:`,
          { reply_markup: locationKeyboard }
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
    .text('📥 Excel import').text('📋 Barcha buyurtmalar').row()
    .text('👥 Barcha ustalar').text('📦 Ombor').row()
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
    session.step = 'customer_name';
    session.data = {};
    ctx.reply('Mijoz ismini kiriting:');
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
        { source: filePath, filename: fileName },
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
    session.step = 'customer_name';
    session.data = {};
    ctx.reply('Mijoz ismini kiriting:');
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
    
    session.step = 'product';
    session.data.productPage = 0;
    
    const products = await pool.query(
      'SELECT DISTINCT name, quantity FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 ORDER BY name',
      [master.region]
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
      ctx.reply(`👷 Tanlangan usta: ${master.name}\n\n📦 Mahsulotni tanlang:`, { reply_markup: keyboard });
    } else {
      clearSession(ctx.from.id);
      ctx.reply('❌ Omborda mahsulot yo\'q.', { reply_markup: getAdminMenu() });
    }
  } catch (error) {
    console.error('Select master callback error:', error);
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
    
    try {
      await pool.query(
        'INSERT INTO masters (name, phone, telegram_id, region) VALUES ($1, $2, $3, $4)',
        [session.data.masterName, session.data.masterPhone, session.data.masterTelegramId, fullRegion]
      );
      
      await ctx.editMessageText(
        `✅ Yangi usta qo'shildi!\n\n` +
        `Ism: ${session.data.masterName}\n` +
        `Telefon: ${session.data.masterPhone}\n` +
        `Telegram ID: ${session.data.masterTelegramId}\n` +
        `Hudud: ${fullRegion}`
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
    console.error('Region subcategory callback error:', error);
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
    } else if (session.step === 'customer_name') {
      session.data.customerName = ctx.message.text;
      session.step = 'phone';
      
      const contactKeyboard = new Keyboard()
        .requestContact('📱 Kontaktni yuborish')
        .resized()
        .oneTime();
      
      ctx.reply('Telefon raqamini yuboring (matn yoki kontakt):', { reply_markup: contactKeyboard });
    } else if (session.step === 'phone') {
      session.data.phone = ctx.message.text;
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
    } else if (session.step === 'quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity <= 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting');
      }
      
      session.data.quantity = quantity;
      
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
      
      if (stock.rows.length === 0 || available < quantity) {
        const shortage = quantity - available;
        
        try {
          await notifyAdmins(
            `⚠️ OMBORDA MAHSULOT YETISHMAYAPTI!\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 Viloyat: ${masterRegion || 'Noma\'lum'}\n` +
            `👷 Usta: ${masterName}\n` +
            `📦 Mahsulot: ${session.data.product}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📊 Omborda mavjud: ${available} dona\n` +
            `📋 Kerak: ${quantity} dona\n` +
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
      
      const orderResult = await pool.query(
        `INSERT INTO orders (master_id, client_name, client_phone, address, lat, lng, product, quantity, status, master_telegram_id, barcode) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10) RETURNING id, created_at`,
        [masterId, session.data.customerName, session.data.phone, 
         session.data.address, session.data.lat, session.data.lng,
         session.data.product, session.data.quantity, masterTelegramId, session.data.barcode || null]
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
      session.data.phone = ctx.message.contact.phone_number;
      session.step = 'address';
      
      const locationKeyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      ctx.reply('📍 Mijoz joylashuvini yuboring:', { reply_markup: locationKeyboard });
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
      
      session.step = 'arrived_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yetib keldim', `arrived:${session.data.orderId}`);
      
      ctx.reply('📍 GPS joylashuv saqlandi!\nHolat: Yo\'lda', { reply_markup: keyboard });
    } else if (session.step === 'completion_gps') {
      const completionLat = ctx.message.location.latitude;
      const completionLng = ctx.message.location.longitude;
      
      await pool.query(
        'UPDATE orders SET completion_gps_lat = $1, completion_gps_lng = $2 WHERE id = $3',
        [completionLat, completionLng, session.data.orderId]
      );
      
      session.step = 'warranty_question';
      
      const keyboard = new InlineKeyboard()
        .text('✅ Ha, kafolat muddati tugagan', `warranty_expired:${session.data.orderId}`)
        .row()
        .text('❌ Yo\'q, kafolat hali amal qilmoqda', `warranty_valid:${session.data.orderId}`);
      
      ctx.reply('📍 Joylashuv saqlandi!\n\nMahsulot kafolat muddati tugaganmi?', { reply_markup: keyboard });
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
      session.step = 'product';
      session.data.productPage = 0;
      
      const masterResult = await pool.query(
        'SELECT region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      const masterRegion = masterResult.rows.length > 0 ? masterResult.rows[0].region : null;
      session.data.masterRegion = masterRegion;
      
      const products = await pool.query(
        'SELECT DISTINCT name, quantity FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 ORDER BY name',
        [masterRegion]
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
        ctx.reply('📦 Mahsulotni tanlang:', { reply_markup: keyboard });
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
    session.data.product = ctx.match[1];
    
    if (isAdmin(ctx.from.id)) {
      session.step = 'barcode';
      ctx.reply('📊 Mahsulot shtrix kodini kiriting (kafolat tekshirish uchun):');
    } else {
      session.step = 'quantity';
      ctx.reply('Miqdorni kiriting:');
    }
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^product_next:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    const pageSize = 8;
    
    const products = await pool.query(
      'SELECT DISTINCT name, quantity FROM warehouse WHERE (region = $1 OR region IS NULL) AND quantity > 0 ORDER BY name',
      [session.data.masterRegion]
    );
    
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
    
    rejectedOrderMasters.delete(orderId);
    
    await notifyAdmins(
      `✅ BUYURTMA QABUL QILINDI!\n\n` +
      `📋 Buyurtma ID: #${orderId}\n` +
      `👷 Usta: ${master.rows[0].name}\n` +
      `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}`
    );
    
    const session = getSession(telegramId);
    session.data.orderId = orderId;
    session.step = 'on_way_pending';
    
    const keyboard = new InlineKeyboard()
      .text('Yo\'ldaman', `on_way:${orderId}`);
    
    ctx.reply(
      `✅ Buyurtma #${orderId} qabul qilindi!\n\n` +
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
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'before_photo';
    ctx.reply('📍 Yetib keldingiz! Holat yangilandi.\n\n📸 Ishni boshlashdan OLDINGI rasmni yuboring:');
  } catch (error) {
    console.error('Arrived callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^warranty_expired:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    await pool.query(
      'UPDATE orders SET warranty_expired = TRUE WHERE id = $1',
      [orderId]
    );
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'finish_order_ready';
    
    const keyboard = new InlineKeyboard()
      .text('✅ Buyurtmani yakunlash', `finish_order:${orderId}`);
    
    ctx.reply('Kafolat muddati tugagan deb belgilandi.\n\nBuyurtmani yakunlash uchun tugmani bosing:', { reply_markup: keyboard });
  } catch (error) {
    console.error('Warranty expired callback error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^warranty_valid:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    await pool.query(
      'UPDATE orders SET warranty_expired = FALSE WHERE id = $1',
      [orderId]
    );
    
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'spare_part_photo';
    
    ctx.reply('⚠️ Kafolat hali amal qilmoqda!\n\n' +
      'Eski ehtiyot qismni yangi bilan almashtirishingiz kerak.\n' +
      'Eski qismni katta omborga yuborishingiz kerak.\n\n' +
      '📸 Iltimos, eski ehtiyot qism rasmini yuboring:');
  } catch (error) {
    console.error('Warranty valid callback error:', error);
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
    
    if (!before_photo) {
      return ctx.reply('⚠️ Ishdan oldingi rasm yuklanmagan!');
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
    
    await pool.query(
      "UPDATE orders SET status = 'delivered' WHERE id = $1",
      [orderId]
    );
    
    clearSession(ctx.from.id);
    
    ctx.reply('✅ Buyurtma muvaffaqiyatli yakunlandi!', { reply_markup: getMainMenu() });
    
    try {
      const orderDetails = await pool.query(
        `SELECT o.*, m.name as master_name 
         FROM orders o 
         JOIN masters m ON o.master_id = m.id 
         WHERE o.id = $1`,
        [orderId]
      );
      
      if (orderDetails.rows.length > 0) {
        const od = orderDetails.rows[0];
        const warrantyStatus = od.warranty_expired ? 'Tugagan' : 'Amal qilmoqda';
        
        await notifyAdmins(
          `✅ BUYURTMA YAKUNLANDI!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `👷 Usta: ${od.master_name}\n` +
          `👤 Mijoz: ${od.client_name}\n` +
          `📦 Mahsulot: ${od.product}\n` +
          `🛡️ Kafolat: ${warrantyStatus}\n` +
          `━━━━━━━━━━━━━━━━━━━━`
        );
      }
    } catch (adminError) {
      console.error('Failed to notify admin about completion:', adminError);
    }
  } catch (error) {
    console.error('Finish order callback error:', error);
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
    
    if (session.step === 'before_photo') {
      session.data.beforePhoto = fileId;
      await pool.query(
        'UPDATE orders SET before_photo = $1 WHERE id = $2',
        [fileId, session.data.orderId]
      );
      session.step = 'after_photo';
      ctx.reply('📸 Oldingi rasm saqlandi!\n\nEndi ishdan KEYINGI rasmni yuboring:');
    } else if (session.step === 'after_photo') {
      session.data.afterPhoto = fileId;
      await pool.query(
        'UPDATE orders SET after_photo = $1 WHERE id = $2',
        [fileId, session.data.orderId]
      );
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

bot.start();

console.log('Bot is running...');

console.log('Brando Bot - Started with NeonDB 2025');

