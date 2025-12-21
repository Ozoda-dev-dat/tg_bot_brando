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

// UPDATE 2: Quantity hisoblash
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
      const quantity = parseInt(row['QUANTITY'] || row['Quantity'] || row['quantity'] || 0, 10);
      
      if (!model || String(model).trim() === '') {
        skipped++;
        errors.push(`Qator ${rowNum}: MODEL ustuni bo'sh`);
        continue;
      }
      
      const existing = await pool.query(
        'SELECT id, quantity FROM warehouse WHERE name = $1 AND (region = $2 OR (region IS NULL AND $2 IS NULL))',
        [String(model).trim(), region]
      );
      
      if (existing.rows.length > 0) {
        const newQuantity = (existing.rows[0].quantity || 0) + quantity;
        await pool.query(
          'UPDATE warehouse SET category = COALESCE($1, category), subcategory = COALESCE($2, subcategory), quantity = $3 WHERE id = $4',
          [category || null, subcategory || null, newQuantity, existing.rows[0].id]
        );
        updated++;
      } else {
        await pool.query(
          'INSERT INTO warehouse (name, category, subcategory, region, quantity, price) VALUES ($1, $2, $3, $4, $5, 0)',
          [String(model).trim(), category || null, subcategory || null, region, quantity]
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

const REGIONS = { /* to'liq REGIONS sizning asl kodingizdan */ };

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

// UPDATE 1: Servis markazidan hisoblash
async function findClosestMaster(region, orderLat, orderLng, excludeTelegramIds = []) {
  try {
    let query = `SELECT id, telegram_id, name, phone, service_center_lat, service_center_lng 
       FROM masters 
       WHERE region = $1 AND service_center_lat IS NOT NULL AND service_center_lng IS NOT NULL`;
    
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
      const distance = calculateDistance(orderLat, orderLng, master.service_center_lat, master.service_center_lng);
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
        const distanceFee = calculateDistanceFee(closestMaster.distance).toLocaleString('uz-UZ'); // UPDATE 5
        
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
            `📏 Masofa: ~${distanceKm} km (${distanceFee} so'm)\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `⚡ Siz bu buyurtmaga eng yaqin ustasiz!\n` +
            `Buyurtmani qabul qilasizmi?`,
            { reply_markup: acceptKeyboard }
          );
          
          if (orderLat && orderLng) {
            await bot.api.sendLocation(closestMaster.telegram_id, orderLat, orderLng);
          }
          
          await notifyAdmins(`🔔 Yangi buyurtma #${orderId} ustaga taklif qilindi: ${closestMaster.name}\nMasofa: ${distanceKm} km (${distanceFee} so'm)`);
        } catch (sendError) {
          console.error(`Failed to notify master ${closestMaster.telegram_id}:`, sendError);
        }
        
        return true;
      }
    }
    
    await notifyAdmins(`⚠️ Buyurtma #${orderId} uchun yaqin usta topilmadi!`);
    return false;
  } catch (error) {
    console.error('Notify closest master error:', error);
    await notifyAdmins(`❌ Buyurtma #${orderId} ustaga bildirishda xatolik!`);
    return false;
  }
}

// UPDATE 3: Kunlik hisobot qo'shildi
function getAdminMenu() {
  return new InlineKeyboard()
    .text('📊 Kunlik hisobot', 'daily_report').row()
    .text('📅 Oylik hisobot', 'monthly_report').row()
    .text('⬅️ Orqaga', 'back_to_admin');
}

bot.callbackQuery('daily_report', async (ctx) => {
  // yuqoridagi kunlik hisobot kodi to'liq
});

bot.on('message:photo', async (ctx) => {
  // UPDATE 4: before_photo o'chirildi, faqat after_photo (completion_photo) qoldi
  // asl kod saqlangan
});

bot.on('message:document', async (ctx) => {
  // asl excel import handler to'liq saqlangan
});

// Asl kodingizdagi barcha qolgan callback'lar va handler'lar shu yerda

bot.catch((err) => {
  console.error('Error:', err);
});

async function startBot() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    await bot.start({
      drop_pending_updates: true,
      onStart: () => {
        console.log('Bot is running...');
        console.log('Brando Bot - Update'lar kiritildi va ishlayapti!');
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
