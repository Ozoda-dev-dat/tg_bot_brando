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
          `Narx: $${session.data.productPrice}\n` +
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
      ctx.reply('Telefon raqamini yuboring (matn yoki kontakt):');
    } else if (session.step === 'phone') {
      session.data.phone = ctx.message.text;
      session.step = 'address';
      ctx.reply('Manzilni yuboring (matn yoki joylashuv):');
    } else if (session.step === 'address') {
      session.data.address = ctx.message.text;
      session.data.lat = null;
      session.data.lng = null;
      session.step = 'product';
      
      const products = await pool.query('SELECT DISTINCT name FROM warehouse ORDER BY name');
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
    } else if (session.step === 'product_manual') {
      session.data.product = ctx.message.text;
      session.step = 'quantity';
      ctx.reply('Miqdorni kiriting:');
    } else if (session.step === 'quantity') {
      const quantity = parseInt(ctx.message.text);
      if (isNaN(quantity) || quantity <= 0) {
        return ctx.reply('Iltimos, to\'g\'ri miqdorni kiriting');
      }
      
      session.data.quantity = quantity;
      
      const stock = await pool.query(
        'SELECT quantity FROM warehouse WHERE name = $1',
        [session.data.product]
      );
      
      if (stock.rows.length === 0 || stock.rows[0].quantity < quantity) {
        const available = stock.rows.length > 0 ? stock.rows[0].quantity : 0;
        return ctx.reply(`Omborda yetarli emas. Mavjud: ${available}`);
      }
      
      const telegramId = ctx.from.id;
      const master = await pool.query(
        'SELECT id, name FROM masters WHERE telegram_id = $1',
        [telegramId]
      );
      
      const orderResult = await pool.query(
        `INSERT INTO orders (master_id, client_name, client_phone, address, lat, lng, product, quantity, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new') RETURNING id`,
        [master.rows[0].id, session.data.customerName, session.data.phone, 
         session.data.address, session.data.lat, session.data.lng,
         session.data.product, session.data.quantity]
      );
      
      await pool.query('SELECT decrease_stock($1, $2)', [session.data.product, session.data.quantity]);
      
      session.data.orderId = orderResult.rows[0].id;
      session.step = 'on_way_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yo\'ldaman', `on_way:${session.data.orderId}`);
      
      ctx.reply('Buyurtma yaratildi!', { reply_markup: keyboard });
      
      if (ADMIN_CHAT_ID) {
        try {
          await bot.api.sendMessage(
            ADMIN_CHAT_ID,
            `🆕 Yangi buyurtma #${orderResult.rows[0].id}\n\n` +
            `Usta: ${master.rows[0].name}\n` +
            `Mijoz: ${session.data.customerName}\n` +
            `Telefon: ${session.data.phone}\n` +
            `Manzil: ${session.data.address}\n` +
            `Mahsulot: ${session.data.product}\n` +
            `Miqdor: ${session.data.quantity}`
          );
        } catch (adminError) {
          console.error('Failed to notify admin:', adminError);
        }
      }
    }
  } catch (error) {
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
      
      const products = await pool.query('SELECT DISTINCT name FROM warehouse ORDER BY name');
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
    }
  } catch (error) {
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
    const session = getSession(ctx.from.id);
    session.data.orderId = orderId;
    session.step = 'before_photo';
    ctx.reply('Oldingi rasmni yuboring:');
  } catch (error) {
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
      ctx.reply('Keyingi rasmni yuboring:');
    } else if (session.step === 'after_photo') {
      session.data.afterPhoto = fileId;
      await pool.query(
        'UPDATE orders SET after_photo = $1 WHERE id = $2',
        [fileId, session.data.orderId]
      );
      session.step = 'signature';
      ctx.reply('Imzoni yuboring (rasm sifatida):');
    } else if (session.step === 'signature') {
      session.data.signature = fileId;
      await pool.query(
        'UPDATE orders SET signature = $1 WHERE id = $2',
        [fileId, session.data.orderId]
      );
      session.step = 'delivered_pending';
      
      const keyboard = new InlineKeyboard()
        .text('Yetkazildi', `delivered:${session.data.orderId}`);
      
      ctx.reply('Barcha rasmlar qabul qilindi', { reply_markup: keyboard });
    }
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.callbackQuery(/^delivered:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    
    await pool.query(
      "UPDATE orders SET status = 'closed' WHERE id = $1",
      [orderId]
    );
    
    clearSession(ctx.from.id);
    
    ctx.reply('Buyurtma bajarildi!', { reply_markup: getMainMenu() });
  } catch (error) {
    ctx.reply('Xatolik yuz berdi');
  }
});

bot.catch((err) => {
  console.error('Error:', err);
});

bot.start();
console.log('Brando Bot - Started with NeonDB 2025');
