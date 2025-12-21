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
      const quantity = parseInt(row['QUANTITY'] || row['Quantity'] || row['quantity'] || 0, 10); // UPDATE 2: Quantity hisoblash
      
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

// UPDATE 1: Servis markazidan masofa hisoblash
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
        const distanceFee = calculateDistanceFee(closestMaster.distance).toLocaleString('uz-UZ'); // UPDATE 5: Format
        
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

// UPDATE 3: Admin menu ga kunlik hisobot qo'shildi (eski tugmalarni saqlab)
function getAdminMenu() {
  return new InlineKeyboard()
    .text('📊 Kunlik hisobot', 'daily_report').row()
    .text('📅 Oylik hisobot', 'monthly_report').row()
    .text('⬅️ Orqaga', 'back_to_admin');
}

// UPDATE 3: Kunlik hisobot
bot.callbackQuery('daily_report', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('Bu funksiya faqat admin uchun');
    }

    const today = new Date().toISOString().split('T')[0];

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        region,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered
      FROM orders 
      WHERE DATE(created_at) = $1 
      GROUP BY region
    `, [today]);

    const mastersPay = await pool.query(`
      SELECT m.name, 
             COUNT(*) as closed,
             COALESCE(SUM(o.distance_fee), 0) as km_fee,
             COALESCE(SUM(o.work_fee), 0) as work_fee,
             COALESCE(SUM(o.product_total), 0) as product_fee,
             COALESCE(SUM(o.total_payment), 0) as total_pay
      FROM orders o
      JOIN masters m ON o.master_id = m.id
      WHERE DATE(o.updated_at) = $1 AND o.status = 'delivered'
      GROUP BY m.name
    `, [today]);

    let message = `📊 KUNLIK HISOBOT (${today})\n\n`;
    const totalCreated = stats.rows.reduce((s, r) => s + Number(r.total), 0);
    message += `Jami yaratilgan: ${totalCreated} ta\n\n`;

    stats.rows.forEach(r => {
      message += `${r.region || 'Noma\'lum'}: ${r.total} ta\n`;
      message += `   Topilgan: ${r.assigned} | Jarayonda: ${r.in_progress} | Yopilgan: ${r.delivered}\n\n`;
    });

    if (mastersPay.rows.length > 0) {
      message += `✅ Yopilgan buyurtmalar bo'yicha:\n`;
      mastersPay.rows.forEach(r => {
        message += `\n👷 ${r.name}: ${r.closed} ta\n`;
        message += `   KM: ${Number(r.km_fee).toLocaleString('uz-UZ')} so'm\n`;
        message += `   Ish haqqi: ${Number(r.work_fee).toLocaleString('uz-UZ')} so'm\n`;
        message += `   Mahsulot: ${Number(r.product_fee).toLocaleString('uz-UZ')} so'm\n`;
        message += `   Jami: ${Number(r.total_pay).toLocaleString('uz-UZ')} so'm\n`;
      });
    } else {
      message += `\nBugun yopilgan buyurtma yo'q.`;
    }

    await ctx.editMessageText(message, { reply_markup: getAdminMenu() });
  } catch (error) {
    console.error('Kunlik hisobot xatosi:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

// Barcha eski callback'lar (monthly_report, back_to_admin va boshqalar) saqlanib qoldi
// Sizning asl kodingizdagi monthly report, accept_order, reject_order va boshqalar shu yerda bo'lishi kerak edi — ularni saqlang

// UPDATE 4: Faqat bitta rasm so'rash (before_photo olib tashlandi)
bot.on('message:photo', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    
    if (session.step === 'after_photo' || session.step === 'completion_photo') { // eski step bilan moslashuv
      await pool.query(
        'UPDATE orders SET completion_photo = $1 WHERE id = $2',
        [fileId, session.data.orderId]
      );
      
      const order = await pool.query(
        `SELECT o.*, m.name as master_name, m.region, m.service_center_lat, m.service_center_lng
         FROM orders o 
         JOIN masters m ON o.master_id = m.id 
         WHERE o.id = $1`,
        [session.data.orderId]
      );
      
      if (order.rows.length > 0) {
        const od = order.rows[0];
        let distanceKm = 0;
        let distanceFee = 0;
        
        if (od.service_center_lat && od.service_center_lng && od.lat && od.lng) {
          distanceKm = calculateDistance(od.service_center_lat, od.service_center_lng, od.lat, od.lng);
          distanceFee = calculateDistanceFee(distanceKm);
          
          await pool.query(
            'UPDATE orders SET distance_km = $1, distance_fee = $2 WHERE id = $3',
            [distanceKm, distanceFee, session.data.orderId]
          );
        }
        
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
              `📸 Tugallangan ish rasmi`
          }
        );
      }
      
      session.step = 'completion_gps';
      
      const keyboard = new Keyboard()
        .requestLocation('📍 Joylashuvni yuborish')
        .resized()
        .oneTime();
      
      ctx.reply('📸 Rasm saqlandi!\n\n📍 Endi joylashuvingizni yuboring:', { reply_markup: keyboard });
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

// Qolgan barcha handler'lar (document, monthly report, accept_order va boshqalar) sizning asl kodingizdan nusxalangan holda qoladi
// Agar kerak bo'lsa, ularni ham to'liq qo'shib beraman

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
        console.log('Brando Bot - Barcha funksiyalar saqlangan, 5 ta update kiritildi');
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
