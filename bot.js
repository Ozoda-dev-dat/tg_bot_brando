require('dotenv').config();
const { Bot, InlineKeyboard, Keyboard } = require('grammy');
const { Pool } = require('pg');

const bot = new Bot(process.env.BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : null;

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: null, data: {} });
  }
  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.set(userId, { step: null, data: {} });
}

function isAdmin(userId) {
  return ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

function getMainMenu() {
  return new Keyboard()
    .text('+ Yangi yetkazish').row()
    .text('Mening buyurtmalarim').text('Ombor').row()
    .text('📦 Mahsulot qo\'shish')
    .resized()
    .persistent();
}

function getAdminMenu() {
  return new Keyboard()
    .text('➕ Usta qo\'shish').text('➕ Mahsulot qo\'shish').row()
    .text('👥 Barcha ustalar').text('📋 Barcha buyurtmalar').row()
    .text('📦 Ombor').text('🔙 Orqaga')
    .resized()
    .persistent();
}

bot.command('start', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    clearSession(telegramId);
    
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
    ctx.reply(`Xush kelibsiz ${master.name}!`, { reply_markup: getMainMenu() });
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
    if (isAdmin(ctx.from.id)) {
      return ctx.reply('Admin paneliga xush kelibsiz! 🔧', { reply_markup: getAdminMenu() });
    }
    
    const result = await pool.query(
      'SELECT * FROM masters WHERE telegram_id = $1',
      [ctx.from.id]
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
    const session = getSession(ctx.from.id);
    session.step = 'customer_name';
    session.data = {};
    ctx.reply('Mijoz ismini kiriting:');
  } catch (error) {
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
      session.step = 'admin_master_region';
      ctx.reply('Hududni kiriting:');
    } else if (session.step === 'admin_master_region') {
      session.data.masterRegion = ctx.message.text;
      
      try {
        await pool.query(
          'INSERT INTO masters (name, phone, telegram_id, region) VALUES ($1, $2, $3, $4)',
          [session.data.masterName, session.data.masterPhone, session.data.masterTelegramId, session.data.masterRegion]
        );
        
        ctx.reply(
          `✅ Yangi usta qo'shildi!\n\n` +
          `Ism: ${session.data.masterName}\n` +
          `Telefon: ${session.data.masterPhone}\n` +
          `Telegram ID: ${session.data.masterTelegramId}\n` +
          `Hudud: ${session.data.masterRegion}`,
          { reply_markup: getAdminMenu() }
        );
        
        clearSession(ctx.from.id);
      } catch (dbError) {
        if (dbError.code === '23505') {
          ctx.reply('Xatolik: Bu telefon yoki Telegram ID allaqachon mavjud');
        } else {
          ctx.reply('Ma\'lumotlar bazasiga saqlashda xatolik');
        }
      }
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
      
      ctx.reply('Manzilni yuboring (matn yoki joylashuv):', { reply_markup: locationKeyboard });
    } else if (session.step === 'address') {
      session.data.address = ctx.message.text;
      session.data.lat = null;
      session.data.lng = null;
      session.step = 'product';
      
      const telegramId = ctx.from.id;
      const masterResult = await pool.query(
        'SELECT region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      const masterRegion = masterResult.rows.length > 0 ? masterResult.rows[0].region : null;
      
      const products = await pool.query(
        'SELECT DISTINCT name FROM warehouse WHERE region = $1 OR region IS NULL ORDER BY name',
        [masterRegion]
      );
      if (products.rows.length > 0) {
        const keyboard = new InlineKeyboard();
        products.rows.slice(0, 10).forEach(p => {
          keyboard.text(p.name, `product:${p.name}`).row();
        });
        keyboard.text('Qo\'lda kiritish', 'product_manual');
        ctx.reply('Mahsulotni tanlang yoki qo\'lda kiriting:', { reply_markup: keyboard });
      } else {
        ctx.reply('Mahsulot nomini kiriting:');
      }
    } else if (session.step === 'product' || session.step === 'product_manual') {
      session.data.product = ctx.message.text;
      session.step = 'quantity';
      ctx.reply('Miqdorni kiriting:');
    } else if (session.step === 'quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity <= 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting');
      }
      
      session.data.quantity = quantity;
      
      const telegramId = ctx.from.id;
      const master = await pool.query(
        'SELECT id, name, phone as master_phone, region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (master.rows.length === 0) {
        clearSession(ctx.from.id);
        return ctx.reply('Siz ro\'yxatdan o\'tmagansiz. Adminga murojaat qiling.');
      }
      
      const masterRegion = master.rows[0].region;
      
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
        
        if (ADMIN_CHAT_ID) {
          try {
            await bot.api.sendMessage(
              ADMIN_CHAT_ID,
              `⚠️ OMBORDA MAHSULOT YETISHMAYAPTI!\n\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `📍 Viloyat: ${masterRegion || 'Noma\'lum'}\n` +
              `👷 Usta: ${master.rows[0].name}\n` +
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
        }
        
        clearSession(ctx.from.id);
        return ctx.reply(`Omborda yetarli emas. Mavjud: ${available} dona. Adminga xabar yuborildi.`, { reply_markup: getMainMenu() });
      }
      
      const orderResult = await pool.query(
        `INSERT INTO orders (master_id, client_name, client_phone, address, lat, lng, product, quantity, status, master_telegram_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9) RETURNING id, created_at`,
        [master.rows[0].id, session.data.customerName, session.data.phone, 
         session.data.address, session.data.lat, session.data.lng,
         session.data.product, session.data.quantity, telegramId]
      );
      
      await pool.query(
        'UPDATE warehouse SET quantity = quantity - $1 WHERE id = $2',
        [session.data.quantity, stockId]
      );
      
      session.data.orderId = orderResult.rows[0].id;
      session.step = 'on_way_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yo\'ldaman', `on_way:${session.data.orderId}`);
      
      ctx.reply('Buyurtma yaratildi!', { reply_markup: keyboard });
      
      if (ADMIN_CHAT_ID) {
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
          
          await bot.api.sendMessage(
            ADMIN_CHAT_ID,
            `🆕 Yangi buyurtma yaratildi:\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 Buyurtma ID: #${orderResult.rows[0].id}\n` +
            `📅 Sana: ${orderDate}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👷 USTA MA'LUMOTLARI:\n` +
            `   Ism: ${master.rows[0].name}\n` +
            `   Tel: ${master.rows[0].master_phone || 'Kiritilmagan'}\n` +
            `   Viloyat: ${master.rows[0].region || 'Kiritilmagan'}\n\n` +
            `👤 MIJOZ MA'LUMOTLARI:\n` +
            `   Ism: ${session.data.customerName}\n` +
            `   Tel: ${session.data.phone}\n` +
            `   Manzil: ${session.data.address}\n` +
            locationInfo + `\n` +
            `📦 BUYURTMA:\n` +
            `   Mahsulot: ${session.data.product}\n` +
            `   Miqdor: ${session.data.quantity} dona`
          );
        } catch (adminError) {
          console.error('Failed to notify admin:', adminError);
        }
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
      ctx.reply('Manzilni yuboring (matn yoki joylashuv):');
    }
  } catch (error) {
    console.error('Contact handler error:', error);
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.on('message:location', async (ctx) => {
  try {
    const session = getSession(ctx.from.id);
    if (session.step === 'address') {
      session.data.address = 'Joylashuv';
      session.data.lat = ctx.message.location.latitude;
      session.data.lng = ctx.message.location.longitude;
      session.step = 'product';
      
      const telegramId = ctx.from.id;
      const masterResult = await pool.query(
        'SELECT region FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      const masterRegion = masterResult.rows.length > 0 ? masterResult.rows[0].region : null;
      
      const products = await pool.query(
        'SELECT DISTINCT name FROM warehouse WHERE region = $1 OR region IS NULL ORDER BY name',
        [masterRegion]
      );
      if (products.rows.length > 0) {
        const keyboard = new InlineKeyboard();
        products.rows.slice(0, 10).forEach(p => {
          keyboard.text(p.name, `product:${p.name}`).row();
        });
        keyboard.text('Qo\'lda kiritish', 'product_manual');
        ctx.reply('Mahsulotni tanlang yoki qo\'lda kiriting:', { reply_markup: keyboard });
      } else {
        ctx.reply('Mahsulot nomini kiriting:');
      }
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

bot.callbackQuery(/^product:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    session.data.product = ctx.match[1];
    session.step = 'quantity';
    ctx.reply('Miqdorni kiriting:');
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery('product_manual', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const session = getSession(ctx.from.id);
    session.step = 'product_manual';
    ctx.reply('Mahsulot nomini kiriting:');
  } catch (error) {
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
    
    if (ADMIN_CHAT_ID) {
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
          
          await bot.api.sendMessage(
            ADMIN_CHAT_ID,
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
    console.error('Finish order callback error:', error);
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
      
      if (ADMIN_CHAT_ID && order.rows.length > 0) {
        const od = order.rows[0];
        
        try {
          const keyboard = new InlineKeyboard()
            .text('✅ Qabul qilish', `accept_spare_part:${session.data.orderId}`);
          
          await bot.api.sendPhoto(
            ADMIN_CHAT_ID,
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
console.log('Brando Bot - Started with NeonDB 2025');
