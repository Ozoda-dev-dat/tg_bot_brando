require('dotenv').config();
const grammy = require('grammy');
const Bot = grammy.Bot;
const { InlineKeyboard, Keyboard } = require('grammy');
const { Pool } = require('pg');
const XLSX  = require('xlsx');
const https = require('https');
const http = require('http');


const bot = new Bot(process.env.BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (global.isBotInitialized) {
    console.log("⚠️ Bot already initialized, preventing double declaration.");
    return; // Bot allaqachon yuklangan bo'lsa, kodning qolgan qismini bajarmaydi
}
global.isBotInitialized = true;


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
      
      const parsedQuantity = parseInt(quantity);
      const validQuantity = !isNaN(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : null;
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE warehouse SET category = COALESCE($1, category), subcategory = COALESCE($2, subcategory), quantity = COALESCE($3, quantity) WHERE id = $4',
          [category || null, subcategory || null, validQuantity, existing.rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          'INSERT INTO warehouse (name, category, subcategory, region, quantity, price) VALUES ($1, $2, $3, $4, $5, 0)',
          [String(model).trim(), category || null, subcategory || null, region, validQuantity || 0]
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
  "Qashqadaryo viloyati": ["Chiroqchi", "Dehqonobod", "G'uzor", "Kasbi", "Kitob", "Kitob", "Koson", "Mirishkor", "Muborak", "Nishon", "Qamashi", "Kitob", "Qarshi", "Shahrisabz", "Yakkabog'", "Ko'kdala"],
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
    .text('📦 Mahsulot qo\'shish')
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
    ctx.reply('Mijoz ism-sharifini kiriting:');
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
    const telegramId = ctx.from.id;
    if (!isAdmin(telegramId)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(telegramId);
    session.step = 'product_name';
    session.data = {};
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📥 Excel import', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'excel_import_region';
    session.data = {};
    
    const keyboard = new InlineKeyboard();
    getRegionCategories().forEach((category, index) => {
      if (index % 2 === 0) keyboard.row();
      keyboard.text(category, `excel_region:${category}`);
    });
    keyboard.row().text('Barcha viloyatlar', 'excel_region:all');
    
    ctx.reply('Excel import uchun viloyatni tanlang:', { reply_markup: keyboard });
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
      `SELECT o.id, o.client_name, o.product, o.status, m.name as master_name, o.created_at 
       FROM orders o 
       LEFT JOIN masters m ON o.master_id = m.id 
       ORDER BY o.created_at DESC LIMIT 50`
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Buyurtmalar topilmadi');
    }
    
    let message = '📋 Barcha buyurtmalar (so\'nggi 50 ta):\n\n';
    orders.rows.forEach(order => {
      const date = new Date(order.created_at).toLocaleString('uz-UZ');
      const status = {
        'new': '🆕 Yangi',
        'accepted': '✅ Qabul qilingan',
        'on_way': '🚗 Yo\'lda',
        'arrived': '📍 Yetib keldi',
        'delivered': '🏁 Yakunlangan'
      }[order.status] || order.status;
      
      message += `📋 ID: #${order.id}\n`;
      message += `👤 Mijoz: ${order.client_name}\n`;
      message += `📦 Mahsulot: ${order.product}\n`;
      message += `👷 Usta: ${order.master_name || 'Belgilanmagan'}\n`;
      message += `📊 Status: ${status}\n`;
      message += `📅 Sana: ${date}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('👥 Barcha ustalar', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const masters = await pool.query('SELECT * FROM masters ORDER BY name');
    
    if (masters.rows.length === 0) {
      return ctx.reply('Ustalar topilmadi');
    }
    
    let message = '👥 Barcha ustalar:\n\n';
    masters.rows.forEach(master => {
      message += `👷 ${master.name}\n`;
      message += `📍 Viloyat: ${master.region || 'Noma\'lum'}\n`;
      message += `📞 Tel: ${master.phone || 'Kiritilmagan'}\n`;
      message += `TG ID: ${master.telegram_id || 'Kiritilmagan'}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📦 Ombor', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const isMaster = await pool.query(
      'SELECT region FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    const isAdminUser = isAdmin(telegramId);
    const masterRegion = isMaster.rows[0]?.region;
    
    const keyboard = new InlineKeyboard();
    getRegionCategories().forEach((category, index) => {
      if (index % 2 === 0) keyboard.row();
      keyboard.text(category, `region:${category}`);
    });
    
    if (isAdminUser) {
      keyboard.row().text('Barcha viloyatlar', 'region:all');
    }
    
    if (masterRegion) {
      ctx.reply(`📦 Ombor: ${masterRegion}\n\nViloyatni tanlang:`, { reply_markup: keyboard });
    } else if (isAdminUser) {
      ctx.reply('📦 Ombor\n\nViloyatni tanlang:', { reply_markup: keyboard });
    } else {
      ctx.reply('Ombor ma\'lumotiga kirish huquqingiz yo\'q');
    }
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📦 Mahsulot qo\'shish', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    if (!isAdmin(telegramId)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(telegramId);
    session.step = 'add_product_name';
    session.data = {};
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('Mening buyurtmalarim', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const orders = await pool.query(
      `SELECT o.id, o.client_name, o.product, o.status, o.created_at 
       FROM orders o 
       JOIN masters m ON o.master_id = m.id 
       WHERE m.telegram_id = $1 
       ORDER BY o.created_at DESC LIMIT 20`,
      [telegramId]
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Sizda buyurtmalar yo\'q');
    }
    
    let message = '📋 Mening buyurtmalarim:\n\n';
    orders.rows.forEach(order => {
      const date = new Date(order.created_at).toLocaleString('uz-UZ');
      const status = {
        'new': '🆕 Yangi',
        'accepted': '✅ Qabul qilingan',
        'on_way': '🚗 Yo\'lda',
        'arrived': '📍 Yetib keldi',
        'delivered': '🏁 Yakunlangan'
      }[order.status] || order.status;
      
      message += `📋 ID: #${order.id}\n`;
      message += `👤 Mijoz: ${order.client_name}\n`;
      message += `📦 Mahsulot: ${order.product}\n`;
      message += `📊 Status: ${status}\n`;
      message += `📅 Sana: ${date}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('🔙 Orqaga', async (ctx) => {
  try {
    clearSession(ctx.from.id);
    ctx.reply('Bosh menyuga qaytdingiz', { reply_markup: getMainMenu() });
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('callback_query:data', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('region:')) {
      const region = data.replace('region:', '');
      const keyboard = new InlineKeyboard();
      const subcats = getSubcategories(region);
      
      subcats.forEach((sub, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(sub, `subregion:${region}:${sub}`);
      });
      
      keyboard.row().text('🔙 Orqaga', 'back_regions');
      
      ctx.editMessageText(`📍 Viloyat: ${region}\n\nTumanni tanlang:`, { reply_markup: keyboard });
    } else if (data.startsWith('subregion:')) {
      const [_, region, subregion] = data.split(':');
      const isAll = region === 'all';
      
      let query = 'SELECT * FROM warehouse';
      const params = [];
      
      if (!isAll) {
        query += ' WHERE region = $1 AND subcategory = $2';
        params.push(region, subregion);
      }
      
      query += ' ORDER BY name';
      
      const products = await pool.query(query, params);
      
      if (products.rows.length === 0) {
        return ctx.editMessageText('Mahsulotlar topilmadi');
      }
      
      let message = `📦 Ombor: ${isAll ? 'Barcha viloyatlar' : `${region} / ${subregion}`}\n\n`;
      products.rows.forEach(p => {
        message += `📦 ${p.name}\n`;
        message += `🔢 Soni: ${p.quantity || 0}\n`;
        message += `💰 Narx: ${p.price || 0} so'm\n\n`;
      });
      
      ctx.editMessageText(message);
    } else if (data === 'back_regions') {
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `region:${category}`);
      });
      if (isAdmin(ctx.from.id)) {
        keyboard.row().text('Barcha viloyatlar', 'region:all');
      }
      
      ctx.editMessageText('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (data.startsWith('excel_region:')) {
      const region = data.replace('excel_region:', '');
      const session = getSession(ctx.from.id);
      session.step = 'excel_import';
      session.data.importRegion = region === 'all' ? null : region;
      
      ctx.editMessageText(
        'Excel faylni yuboring (.xlsx yoki .xls):\n\n' +
        'Fayl ustunlari:\n' +
        '• MODEL (majburiy)\n' +
        '• CATEGORY\n' +
        '• SUB CATEGORY\n' +
        '• QUANTITY',
        { reply_markup: undefined }
      );
    } else if (data.startsWith('accept_order:')) {
      const orderId = data.replace('accept_order:', '');
      const telegramId = ctx.from.id;
      
      const master = await pool.query(
        'SELECT id, name FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
      }
      
      const order = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND status = $2',
        [orderId, 'new']
      );
      
      if (order.rows.length === 0) {
        return ctx.reply('Buyurtma topilmadi yoki allaqachon qabul qilingan.');
      }
      
      await pool.query(
        'UPDATE orders SET master_id = $1, status = $2, accepted_at = NOW() WHERE id = $3',
        [master.rows[0].id, 'accepted', orderId]
      );
      
      const keyboard = new InlineKeyboard()
        .text('🚗 Yo\'ldaman', `on_way:${orderId}`)
        .row()
        .text('📍 Yetib keldim', `arrived:${orderId}`);
      
      ctx.editMessageText(
        `✅ Buyurtma #${orderId} qabul qilindi!\n\n` +
        `Buyurtma batafsil:\n` +
        `👤 Mijoz: ${order.client_name}\n` +
        `📦 Mahsulot: ${order.product}\n` +
        `📍 Manzil: ${order.address}\n\n` +
        `Yo'ldan chiqsangiz "Yo\'ldaman" tugmasini bosing.`,
        { reply_markup: keyboard }
      );
      
      await notifyAdmins(
        `✅ BUYURTMA QABUL QILINDI!\n\n` +
        `📋 Buyurtma ID: #${orderId}\n` +
        `👷 Usta: ${master.rows[0].name}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}`
      );
    } else if (data.startsWith('reject_order:')) {
      const orderId = data.replace('reject_order:', '');
      const telegramId = ctx.from.id;
      
      const master = await pool.query(
        'SELECT name, region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
      }
      
      const order = await pool.query(
        'SELECT client_name, product, address, lat, lng FROM orders WHERE id = $1 AND status = $2',
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
      
      ctx.editMessageText(
        `❌ Buyurtma #${orderId} rad etildi.\n\n` +
        `Keyingi eng yaqin ustaga xabar yuboriladi.`,
        { reply_markup: undefined }
      );
      
      const orderData = order.rows[0];
      const notifyResult = await notifyClosestMaster(master.rows[0].region, orderId, {
        clientName: orderData.client_name,
        product: orderData.product,
        address: orderData.address
      }, orderData.lat, orderData.lng, excludedMasters);
      
      if (!notifyResult.success) {
        await notifyAdmins(
          `⚠️ Ustalar topilmadi!\n\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `Iltimos, buyurtmani qo'lda tayinlang.`
        );
      }
    } else if (data.startsWith('on_way:')) {
      const orderId = data.replace('on_way:', '');
      
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
      
      ctx.editMessageText('Iltimos, GPS joylashuvingizni yuboring:', { reply_markup: keyboard });
    } else if (data.startsWith('arrived:')) {
      const orderId = data.replace('arrived:', '');
      
      await pool.query(
        "UPDATE orders SET status = 'arrived' WHERE id = $1",
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'before_photo';
      ctx.editMessageText('📍 Yetib keldingiz! Holat yangilandi.\n\n📸 Ishni boshlashdan OLDINGI rasmni yuboring:');
    } else if (data.startsWith('warranty_expired:')) {
      const orderId = data.replace('warranty_expired:', '');
      
      await pool.query(
        'UPDATE orders SET warranty_expired = TRUE WHERE id = $1',
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'finish_order_ready';
      
      const keyboard = new InlineKeyboard()
        .text('✅ Buyurtmani yakunlash', `finish_order:${orderId}`);
      
      ctx.editMessageText('Kafolat muddati tugagan deb belgilandi.\n\nBuyurtmani yakunlash uchun tugmani bosing:', { reply_markup: keyboard });
    } else if (data.startsWith('warranty_valid:')) {
      const orderId = data.replace('warranty_valid:', '');
      
      await pool.query(
        'UPDATE orders SET warranty_expired = FALSE WHERE id = $1',
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'spare_part_photo';
      
      ctx.editMessageText('⚠️ Kafolat hali amal qilmoqda!\n\n' +
        'Eski ehtiyot qismni yangi bilan almashtirishingiz kerak.\n' +
        'Eski qismni katta omborga yuborishingiz kerak.\n\n' +
        '📸 Iltimos, eski ehtiyot qism rasmini yuboring:');
    } else if (data.startsWith('accept_spare_part:')) {
      const orderId = data.replace('accept_spare_part:', '');
      
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
      
      ctx.editMessageText(`✅ Buyurtma #${orderId} uchun ehtiyot qism qabul qilindi. Usta xabardor qilindi.`);
    } else if (data.startsWith('finish_order:')) {
      const orderId = data.replace('finish_order:', '');
      
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
      
      ctx.editMessageText('✅ Buyurtma muvaffaqiyatli yakunlandi!', { reply_markup: getMainMenu() });
      
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
    }
  } catch (error) {
    console.error('Callback query error:', error);
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

bot.on('message:location', async (ctx) => {
  try {
    const { latitude, longitude } = ctx.message.location;
    const telegramId = ctx.from.id;
    const session = getSession(telegramId);
    
    if (session.step === 'awaiting_start_location') {
      setMasterLocation(telegramId, latitude, longitude);
      await saveMasterLocationToDb(telegramId, latitude, longitude);
      
      clearSession(telegramId);
      ctx.reply(
        '📍 Joylashuvingiz saqlandi!\n\n' +
        'Bosh menu:',
        { reply_markup: getMainMenu() }
      );
    } else if (session.step === 'master_gps') {
      await pool.query(
        'UPDATE orders SET completion_gps_lat = $1, completion_gps_lng = $2 WHERE id = $3',
        [latitude, longitude, session.data.orderId]
      );
      
      const warrantyKeyboard = new InlineKeyboard()
        .text('❌ Kafolat muddati tugagan', `warranty_expired:${session.data.orderId}`)
        .row()
        .text('✅ Kafolat hali amal qilmoqda', `warranty_valid:${session.data.orderId}`);
      
      ctx.reply(
        '📍 GPS saqlandi!\n\n' +
        'Kafolat holatini tanlang:',
        { reply_markup: warrantyKeyboard }
      );
    } else if (pendingOrderLocations.has(telegramId)) {
      const pending = pendingOrderLocations.get(telegramId);
      pendingOrderLocations.delete(telegramId);
      
      if (Date.now() - pending.timestamp > 30 * 60 * 1000) {
        return ctx.reply('Xabar muddati o\'tgan. Iltimos, yangi buyurtma kutib turing.');
      }
      
      setMasterLocation(telegramId, latitude, longitude);
      await saveMasterLocationToDb(telegramId, latitude, longitude);
      
      const distance = calculateDistance(latitude, longitude, pending.orderDetails.lat, pending.orderDetails.lng);
      const distanceKm = distance.toFixed(2);
      
      const acceptKeyboard = new InlineKeyboard()
        .text('✅ Qabul qilish', `accept_order:${pending.orderId}`)
        .row()
        .text('❌ Rad etish', `reject_order:${pending.orderId}`);
      
      ctx.reply(
        `📍 Joylashuvingiz saqlandi!\n\n` +
        `📏 Masofa: ~${distanceKm} km\n\n` +
        `Buyurtmani qabul qilasizmi?`,
        { reply_markup: acceptKeyboard }
      );
      
      const master = await pool.query(
        'SELECT name, phone FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length > 0) {
        await notifyAdmins(
          `📍 Usta joylashuvi yuborildi!\n\n` +
          `📋 Buyurtma ID: #${pending.orderId}\n` +
          `👷 Usta: ${master.rows[0].name}\n` +
          `📏 Masofa: ~${distanceKm} km\n` +
          `📞 Tel: ${master.rows[0].phone || 'Kiritilmagan'}\n\n` +
          `Usta tasdiqlashini kutmoqda...`
        );
      }
    }
  } catch (error) {
    console.error('Location handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:text', async (ctx) => {
  try {
    const text = ctx.message.text.trim();
    const session = getSession(ctx.from.id);
    
    if (session.step === 'admin_master_name') {
      session.data.name = text;
      session.step = 'admin_master_phone';
      ctx.reply('Telefon raqamini kiriting (+998...):');
    } else if (session.step === 'admin_master_phone') {
      session.data.phone = text;
      session.step = 'admin_master_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `master_region:${category}`);
      });
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'admin_master_subregion') {
      session.data.subcategory = text;
      session.step = 'admin_master_telegram_id';
      ctx.reply('Telegram ID sini kiriting (majburiy emas, bo\'sh qoldirsa bo\'ladi):');
    } else if (session.step === 'admin_master_telegram_id') {
      session.data.telegramId = text || null;
      
      await pool.query(
        'INSERT INTO masters (name, phone, region, subcategory, telegram_id) VALUES ($1, $2, $3, $4, $5)',
        [session.data.name, session.data.phone, session.data.region, session.data.subcategory, session.data.telegramId]
      );
      
      clearSession(ctx.from.id);
      ctx.reply('✅ Usta qo\'shildi!', { reply_markup: getAdminMenu() });
    } else if (session.step === 'customer_name') {
      session.data.clientName = text;
      session.step = 'customer_product';
      ctx.reply('Mahsulot nomini kiriting:');
    } else if (session.step === 'customer_product') {
      session.data.product = text;
      session.step = 'customer_address';
      ctx.reply('Manzilni kiriting:');
    } else if (session.step === 'customer_address') {
      session.data.address = text;
      session.step = 'customer_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `order_region:${category}`);
      });
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'add_product_name') {
      session.data.name = text;
      session.step = 'add_product_quantity';
      ctx.reply('Soni kiriting:');
    } else if (session.step === 'add_product_quantity') {
      const quantity = parseInt(text);
      if (isNaN(quantity)) {
        return ctx.reply('Iltimos, son kiriting');
      }
      session.data.quantity = quantity;
      session.step = 'add_product_price';
      ctx.reply('Narxini kiriting:');
    } else if (session.step === 'add_product_price') {
      const price = parseInt(text);
      if (isNaN(price)) {
        return ctx.reply('Iltimos, son kiriting');
      }
      session.data.price = price;
      session.step = 'add_product_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `product_region:${category}`);
      });
      keyboard.row().text('Barcha viloyatlar', 'product_region:all');
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Text message handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.catch((err) => {
  console.error('Error:', err);
});


// ──────────────────────────────────────────────────────────────
// FINAL & 100% WORKING VERSIYA (Render + Grammy v1.20+)
// ──────────────────────────────────────────────────────────────

require('dotenv').config();
const { Bot, InlineKeyboard, Keyboard } = require('grammy');
const { Pool } = require('pg');
const XLSX  = require('xlsx');
const https = require('https');
const http = require('http');


const bot = new Bot(process.env.BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });


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
      
      const parsedQuantity = parseInt(quantity);
      const validQuantity = !isNaN(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : null;
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE warehouse SET category = COALESCE($1, category), subcategory = COALESCE($2, subcategory), quantity = COALESCE($3, quantity) WHERE id = $4',
          [category || null, subcategory || null, validQuantity, existing.rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          'INSERT INTO warehouse (name, category, subcategory, region, quantity, price) VALUES ($1, $2, $3, $4, $5, 0)',
          [String(model).trim(), category || null, subcategory || null, region, validQuantity || 0]
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
  "Qashqadaryo viloyati": ["Chiroqchi", "Dehqonobod", "G'uzor", "Kasbi", "Kitob", "Kitob", "Koson", "Mirishkor", "Muborak", "Nishon", "Qamashi", "Kitob", "Qarshi", "Shahrisabz", "Yakkabog'", "Ko'kdala"],
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
    .text('📦 Mahsulot qo\'shish')
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
    ctx.reply('Mijoz ism-sharifini kiriting:');
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
    const telegramId = ctx.from.id;
    if (!isAdmin(telegramId)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(telegramId);
    session.step = 'product_name';
    session.data = {};
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📥 Excel import', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(ctx.from.id);
    session.step = 'excel_import_region';
    session.data = {};
    
    const keyboard = new InlineKeyboard();
    getRegionCategories().forEach((category, index) => {
      if (index % 2 === 0) keyboard.row();
      keyboard.text(category, `excel_region:${category}`);
    });
    keyboard.row().text('Barcha viloyatlar', 'excel_region:all');
    
    ctx.reply('Excel import uchun viloyatni tanlang:', { reply_markup: keyboard });
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
      `SELECT o.id, o.client_name, o.product, o.status, m.name as master_name, o.created_at 
       FROM orders o 
       LEFT JOIN masters m ON o.master_id = m.id 
       ORDER BY o.created_at DESC LIMIT 50`
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Buyurtmalar topilmadi');
    }
    
    let message = '📋 Barcha buyurtmalar (so\'nggi 50 ta):\n\n';
    orders.rows.forEach(order => {
      const date = new Date(order.created_at).toLocaleString('uz-UZ');
      const status = {
        'new': '🆕 Yangi',
        'accepted': '✅ Qabul qilingan',
        'on_way': '🚗 Yo\'lda',
        'arrived': '📍 Yetib keldi',
        'delivered': '🏁 Yakunlangan'
      }[order.status] || order.status;
      
      message += `📋 ID: #${order.id}\n`;
      message += `👤 Mijoz: ${order.client_name}\n`;
      message += `📦 Mahsulot: ${order.product}\n`;
      message += `👷 Usta: ${order.master_name || 'Belgilanmagan'}\n`;
      message += `📊 Status: ${status}\n`;
      message += `📅 Sana: ${date}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('👥 Barcha ustalar', async (ctx) => {
  try {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const masters = await pool.query('SELECT * FROM masters ORDER BY name');
    
    if (masters.rows.length === 0) {
      return ctx.reply('Ustalar topilmadi');
    }
    
    let message = '👥 Barcha ustalar:\n\n';
    masters.rows.forEach(master => {
      message += `👷 ${master.name}\n`;
      message += `📍 Viloyat: ${master.region || 'Noma\'lum'}\n`;
      message += `📞 Tel: ${master.phone || 'Kiritilmagan'}\n`;
      message += `TG ID: ${master.telegram_id || 'Kiritilmagan'}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📦 Ombor', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const isMaster = await pool.query(
      'SELECT region FROM masters WHERE telegram_id = $1',
      [telegramId]
    );
    
    const isAdminUser = isAdmin(telegramId);
    const masterRegion = isMaster.rows[0]?.region;
    
    const keyboard = new InlineKeyboard();
    getRegionCategories().forEach((category, index) => {
      if (index % 2 === 0) keyboard.row();
      keyboard.text(category, `region:${category}`);
    });
    
    if (isAdminUser) {
      keyboard.row().text('Barcha viloyatlar', 'region:all');
    }
    
    if (masterRegion) {
      ctx.reply(`📦 Ombor: ${masterRegion}\n\nViloyatni tanlang:`, { reply_markup: keyboard });
    } else if (isAdminUser) {
      ctx.reply('📦 Ombor\n\nViloyatni tanlang:', { reply_markup: keyboard });
    } else {
      ctx.reply('Ombor ma\'lumotiga kirish huquqingiz yo\'q');
    }
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('📦 Mahsulot qo\'shish', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    if (!isAdmin(telegramId)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }
    
    const session = getSession(telegramId);
    session.step = 'add_product_name';
    session.data = {};
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('Mening buyurtmalarim', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const orders = await pool.query(
      `SELECT o.id, o.client_name, o.product, o.status, o.created_at 
       FROM orders o 
       JOIN masters m ON o.master_id = m.id 
       WHERE m.telegram_id = $1 
       ORDER BY o.created_at DESC LIMIT 20`,
      [telegramId]
    );
    
    if (orders.rows.length === 0) {
      return ctx.reply('Sizda buyurtmalar yo\'q');
    }
    
    let message = '📋 Mening buyurtmalarim:\n\n';
    orders.rows.forEach(order => {
      const date = new Date(order.created_at).toLocaleString('uz-UZ');
      const status = {
        'new': '🆕 Yangi',
        'accepted': '✅ Qabul qilingan',
        'on_way': '🚗 Yo\'lda',
        'arrived': '📍 Yetib keldi',
        'delivered': '🏁 Yakunlangan'
      }[order.status] || order.status;
      
      message += `📋 ID: #${order.id}\n`;
      message += `👤 Mijoz: ${order.client_name}\n`;
      message += `📦 Mahsulot: ${order.product}\n`;
      message += `📊 Status: ${status}\n`;
      message += `📅 Sana: ${date}\n\n`;
    });
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.hears('🔙 Orqaga', async (ctx) => {
  try {
    clearSession(ctx.from.id);
    ctx.reply('Bosh menyuga qaytdingiz', { reply_markup: getMainMenu() });
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('callback_query:data', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('region:')) {
      const region = data.replace('region:', '');
      const keyboard = new InlineKeyboard();
      const subcats = getSubcategories(region);
      
      subcats.forEach((sub, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(sub, `subregion:${region}:${sub}`);
      });
      
      keyboard.row().text('🔙 Orqaga', 'back_regions');
      
      ctx.editMessageText(`📍 Viloyat: ${region}\n\nTumanni tanlang:`, { reply_markup: keyboard });
    } else if (data.startsWith('subregion:')) {
      const [_, region, subregion] = data.split(':');
      const isAll = region === 'all';
      
      let query = 'SELECT * FROM warehouse';
      const params = [];
      
      if (!isAll) {
        query += ' WHERE region = $1 AND subcategory = $2';
        params.push(region, subregion);
      }
      
      query += ' ORDER BY name';
      
      const products = await pool.query(query, params);
      
      if (products.rows.length === 0) {
        return ctx.editMessageText('Mahsulotlar topilmadi');
      }
      
      let message = `📦 Ombor: ${isAll ? 'Barcha viloyatlar' : `${region} / ${subregion}`}\n\n`;
      products.rows.forEach(p => {
        message += `📦 ${p.name}\n`;
        message += `🔢 Soni: ${p.quantity || 0}\n`;
        message += `💰 Narx: ${p.price || 0} so'm\n\n`;
      });
      
      ctx.editMessageText(message);
    } else if (data === 'back_regions') {
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `region:${category}`);
      });
      if (isAdmin(ctx.from.id)) {
        keyboard.row().text('Barcha viloyatlar', 'region:all');
      }
      
      ctx.editMessageText('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (data.startsWith('excel_region:')) {
      const region = data.replace('excel_region:', '');
      const session = getSession(ctx.from.id);
      session.step = 'excel_import';
      session.data.importRegion = region === 'all' ? null : region;
      
      ctx.editMessageText(
        'Excel faylni yuboring (.xlsx yoki .xls):\n\n' +
        'Fayl ustunlari:\n' +
        '• MODEL (majburiy)\n' +
        '• CATEGORY\n' +
        '• SUB CATEGORY\n' +
        '• QUANTITY',
        { reply_markup: undefined }
      );
    } else if (data.startsWith('accept_order:')) {
      const orderId = data.replace('accept_order:', '');
      const telegramId = ctx.from.id;
      
      const master = await pool.query(
        'SELECT id, name FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
      }
      
      const order = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND status = $2',
        [orderId, 'new']
      );
      
      if (order.rows.length === 0) {
        return ctx.reply('Buyurtma topilmadi yoki allaqachon qabul qilingan.');
      }
      
      await pool.query(
        'UPDATE orders SET master_id = $1, status = $2, accepted_at = NOW() WHERE id = $3',
        [master.rows[0].id, 'accepted', orderId]
      );
      
      const keyboard = new InlineKeyboard()
        .text('🚗 Yo\'ldaman', `on_way:${orderId}`)
        .row()
        .text('📍 Yetib keldim', `arrived:${orderId}`);
      
      ctx.editMessageText(
        `✅ Buyurtma #${orderId} qabul qilindi!\n\n` +
        `Buyurtma batafsil:\n` +
        `👤 Mijoz: ${order.client_name}\n` +
        `📦 Mahsulot: ${order.product}\n` +
        `📍 Manzil: ${order.address}\n\n` +
        `Yo'ldan chiqsangiz "Yo\'ldaman" tugmasini bosing.`,
        { reply_markup: keyboard }
      );
      
      await notifyAdmins(
        `✅ BUYURTMA QABUL QILINDI!\n\n` +
        `📋 Buyurtma ID: #${orderId}\n` +
        `👷 Usta: ${master.rows[0].name}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString('uz-UZ')}`
      );
    } else if (data.startsWith('reject_order:')) {
      const orderId = data.replace('reject_order:', '');
      const telegramId = ctx.from.id;
      
      const master = await pool.query(
        'SELECT name, region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        return ctx.reply('Siz usta sifatida ro\'yxatdan o\'tmagansiz.');
      }
      
      const order = await pool.query(
        'SELECT client_name, product, address, lat, lng FROM orders WHERE id = $1 AND status = $2',
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
      
      ctx.editMessageText(
        `❌ Buyurtma #${orderId} rad etildi.\n\n` +
        `Keyingi eng yaqin ustaga xabar yuboriladi.`,
        { reply_markup: undefined }
      );
      
      const orderData = order.rows[0];
      const notifyResult = await notifyClosestMaster(master.rows[0].region, orderId, {
        clientName: orderData.client_name,
        product: orderData.product,
        address: orderData.address
      }, orderData.lat, orderData.lng, excludedMasters);
      
      if (!notifyResult.success) {
        await notifyAdmins(
          `⚠️ Ustalar topilmadi!\n\n` +
          `📋 Buyurtma ID: #${orderId}\n` +
          `Iltimos, buyurtmani qo'lda tayinlang.`
        );
      }
    } else if (data.startsWith('on_way:')) {
      const orderId = data.replace('on_way:', '');
      
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
      
      ctx.editMessageText('Iltimos, GPS joylashuvingizni yuboring:', { reply_markup: keyboard });
    } else if (data.startsWith('arrived:')) {
      const orderId = data.replace('arrived:', '');
      
      await pool.query(
        "UPDATE orders SET status = 'arrived' WHERE id = $1",
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'before_photo';
      ctx.editMessageText('📍 Yetib keldingiz! Holat yangilandi.\n\n📸 Ishni boshlashdan OLDINGI rasmni yuboring:');
    } else if (data.startsWith('warranty_expired:')) {
      const orderId = data.replace('warranty_expired:', '');
      
      await pool.query(
        'UPDATE orders SET warranty_expired = TRUE WHERE id = $1',
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'finish_order_ready';
      
      const keyboard = new InlineKeyboard()
        .text('✅ Buyurtmani yakunlash', `finish_order:${orderId}`);
      
      ctx.editMessageText('Kafolat muddati tugagan deb belgilandi.\n\nBuyurtmani yakunlash uchun tugmani bosing:', { reply_markup: keyboard });
    } else if (data.startsWith('warranty_valid:')) {
      const orderId = data.replace('warranty_valid:', '');
      
      await pool.query(
        'UPDATE orders SET warranty_expired = FALSE WHERE id = $1',
        [orderId]
      );
      
      const session = getSession(ctx.from.id);
      session.data.orderId = orderId;
      session.step = 'spare_part_photo';
      
      ctx.editMessageText('⚠️ Kafolat hali amal qilmoqda!\n\n' +
        'Eski ehtiyot qismni yangi bilan almashtirishingiz kerak.\n' +
        'Eski qismni katta omborga yuborishingiz kerak.\n\n' +
        '📸 Iltimos, eski ehtiyot qism rasmini yuboring:');
    } else if (data.startsWith('accept_spare_part:')) {
      const orderId = data.replace('accept_spare_part:', '');
      
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
      
      ctx.editMessageText(`✅ Buyurtma #${orderId} uchun ehtiyot qism qabul qilindi. Usta xabardor qilindi.`);
    } else if (data.startsWith('finish_order:')) {
      const orderId = data.replace('finish_order:', '');
      
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
      
      ctx.editMessageText('✅ Buyurtma muvaffaqiyatli yakunlandi!', { reply_markup: getMainMenu() });
      
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
    }
  } catch (error) {
    console.error('Callback query error:', error);
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

bot.on('message:location', async (ctx) => {
  try {
    const { latitude, longitude } = ctx.message.location;
    const telegramId = ctx.from.id;
    const session = getSession(telegramId);
    
    if (session.step === 'awaiting_start_location') {
      setMasterLocation(telegramId, latitude, longitude);
      await saveMasterLocationToDb(telegramId, latitude, longitude);
      
      clearSession(telegramId);
      ctx.reply(
        '📍 Joylashuvingiz saqlandi!\n\n' +
        'Bosh menu:',
        { reply_markup: getMainMenu() }
      );
    } else if (session.step === 'master_gps') {
      await pool.query(
        'UPDATE orders SET completion_gps_lat = $1, completion_gps_lng = $2 WHERE id = $3',
        [latitude, longitude, session.data.orderId]
      );
      
      const warrantyKeyboard = new InlineKeyboard()
        .text('❌ Kafolat muddati tugagan', `warranty_expired:${session.data.orderId}`)
        .row()
        .text('✅ Kafolat hali amal qilmoqda', `warranty_valid:${session.data.orderId}`);
      
      ctx.reply(
        '📍 GPS saqlandi!\n\n' +
        'Kafolat holatini tanlang:',
        { reply_markup: warrantyKeyboard }
      );
    } else if (pendingOrderLocations.has(telegramId)) {
      const pending = pendingOrderLocations.get(telegramId);
      pendingOrderLocations.delete(telegramId);
      
      if (Date.now() - pending.timestamp > 30 * 60 * 1000) {
        return ctx.reply('Xabar muddati o\'tgan. Iltimos, yangi buyurtma kutib turing.');
      }
      
      setMasterLocation(telegramId, latitude, longitude);
      await saveMasterLocationToDb(telegramId, latitude, longitude);
      
      const distance = calculateDistance(latitude, longitude, pending.orderDetails.lat, pending.orderDetails.lng);
      const distanceKm = distance.toFixed(2);
      
      const acceptKeyboard = new InlineKeyboard()
        .text('✅ Qabul qilish', `accept_order:${pending.orderId}`)
        .row()
        .text('❌ Rad etish', `reject_order:${pending.orderId}`);
      
      ctx.reply(
        `📍 Joylashuvingiz saqlandi!\n\n` +
        `📏 Masofa: ~${distanceKm} km\n\n` +
        `Buyurtmani qabul qilasizmi?`,
        { reply_markup: acceptKeyboard }
      );
      
      const master = await pool.query(
        'SELECT name, phone FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length > 0) {
        await notifyAdmins(
          `📍 Usta joylashuvi yuborildi!\n\n` +
          `📋 Buyurtma ID: #${pending.orderId}\n` +
          `👷 Usta: ${master.rows[0].name}\n` +
          `📏 Masofa: ~${distanceKm} km\n` +
          `📞 Tel: ${master.rows[0].phone || 'Kiritilmagan'}\n\n` +
          `Usta tasdiqlashini kutmoqda...`
        );
      }
    }
  } catch (error) {
    console.error('Location handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:text', async (ctx) => {
  try {
    const text = ctx.message.text.trim();
    const session = getSession(ctx.from.id);
    
    if (session.step === 'admin_master_name') {
      session.data.name = text;
      session.step = 'admin_master_phone';
      ctx.reply('Telefon raqamini kiriting (+998...):');
    } else if (session.step === 'admin_master_phone') {
      session.data.phone = text;
      session.step = 'admin_master_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `master_region:${category}`);
      });
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'admin_master_subregion') {
      session.data.subcategory = text;
      session.step = 'admin_master_telegram_id';
      ctx.reply('Telegram ID sini kiriting (majburiy emas, bo\'sh qoldirsa bo\'ladi):');
    } else if (session.step === 'admin_master_telegram_id') {
      session.data.telegramId = text || null;
      
      await pool.query(
        'INSERT INTO masters (name, phone, region, subcategory, telegram_id) VALUES ($1, $2, $3, $4, $5)',
        [session.data.name, session.data.phone, session.data.region, session.data.subcategory, session.data.telegramId]
      );
      
      clearSession(ctx.from.id);
      ctx.reply('✅ Usta qo\'shildi!', { reply_markup: getAdminMenu() });
    } else if (session.step === 'customer_name') {
      session.data.clientName = text;
      session.step = 'customer_product';
      ctx.reply('Mahsulot nomini kiriting:');
    } else if (session.step === 'customer_product') {
      session.data.product = text;
      session.step = 'customer_address';
      ctx.reply('Manzilni kiriting:');
    } else if (session.step === 'customer_address') {
      session.data.address = text;
      session.step = 'customer_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `order_region:${category}`);
      });
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    } else if (session.step === 'add_product_name') {
      session.data.name = text;
      session.step = 'add_product_quantity';
      ctx.reply('Soni kiriting:');
    } else if (session.step === 'add_product_quantity') {
      const quantity = parseInt(text);
      if (isNaN(quantity)) {
        return ctx.reply('Iltimos, son kiriting');
      }
      session.data.quantity = quantity;
      session.step = 'add_product_price';
      ctx.reply('Narxini kiriting:');
    } else if (session.step === 'add_product_price') {
      const price = parseInt(text);
      if (isNaN(price)) {
        return ctx.reply('Iltimos, son kiriting');
      }
      session.data.price = price;
      session.step = 'add_product_region';
      
      const keyboard = new InlineKeyboard();
      getRegionCategories().forEach((category, index) => {
        if (index % 2 === 0) keyboard.row();
        keyboard.text(category, `product_region:${category}`);
      });
      keyboard.row().text('Barcha viloyatlar', 'product_region:all');
      
      ctx.reply('Viloyatni tanlang:', { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Text message handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.catch((err) => {
  console.error('Error:', err);
});


// ──────────────────────────────────────────────────────────────
// FINAL & 100% WORKING VERSIYA (Render + Grammy v1.20+)
// ──────────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER_EXTERNAL_URL || !!process.env.RENDER;

if (isProduction) {
  const express = require('express');
  const app = express();
  app.use(express.json());

  const domain = process.env.RENDER_EXTERNAL_URL;
  const port   = Number(process.env.PORT) || 10000;

  if (!domain) {
    console.error('RENDER_EXTERNAL_URL topilmadi!');
    process.exit(1);
  }

  console.log(`Webhook o‘rnatilmoqda: ${domain}`);

  // 1. Botni majburiy init qilamiz
  bot.init().then(async () => {
    console.log('Bot muvaffaqiyatli init qilindi');

    // 2. Webhook o‘rnatamiz
    const webhookUrl = `${domain}/webhook`;
    await bot.api.setWebhook(webhookUrl);
    console.log(`Webhook muvaffaqiyatli o‘rnatildi: ${webhookUrl}`);
  }).catch(err => {
    console.error('Bot init yoki webhook xatosi:', err.message);
  });

  // 3. Express route
  app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body);  // bu yerda init bo‘lgani uchun ishlaydi
    res.sendStatus(200);
  });

  // Health check
  app.get('/', (req, res) => {
    res.send('Brando Bot ishlayapti! Webhook active!');
  });

  // Serverni ishga tushiramiz
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server ${port} portda ishlayapti`);
    console.log(`Webhook URL: ${domain}/webhook`);
    console.log('Bot to‘liq tayyor – Render’da ishlayapti!');
  });

} else {
  // Lokal polling
  console.log('Lokal polling rejimida...');
  bot.start({ drop_pending_updates: true });
}

console.log('Brando Bot - Started with NeonDB 2025');
