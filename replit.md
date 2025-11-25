# Telegram Delivery Bot

## Overview
This is a Telegram bot built with Node.js, Grammy.js, and NeonDB (PostgreSQL) for managing delivery orders by masters/workers. The bot interface is fully in Uzbek language.

## Tech Stack
- Node.js 20
- Grammy.js (Telegram Bot Framework)
- PostgreSQL (NeonDB)
- pg (PostgreSQL client)
- dotenv (environment variables)

## Database Tables

### 1. masters
Stores information about masters/workers
- id: Serial primary key
- name: Text field for master name
- phone: Unique text field for phone number
- telegram_id: Unique big integer for Telegram ID
- region: Text field for regional assignment

### 2. warehouse
Inventory management table
- id: Serial primary key
- name: Unique text field for product name
- quantity: Integer with default 0
- price: Numeric field for product price
- category: Text field for product category
- subcategory: Text field for product subcategory

### 3. clients
Customer information table
- id: Serial primary key
- name: Text field for client name
- phone: Text field for phone number
- address: Text field for client address

### 4. orders
Order management and tracking
- id: Serial primary key
- master_id: Foreign key reference to masters table
- client_name: Text field for client name
- client_phone: Text field for client phone
- address: Text field for delivery/service address
- lat: Double precision for latitude coordinate
- lng: Double precision for longitude coordinate
- product: Text field for product description
- quantity: Integer for order quantity
- status: Text field with default 'new'
- before_photo: Text field for photo URL/path
- after_photo: Text field for photo URL/path
- signature: Text field for signature data
- created_at: Timestamp with default NOW()

## Database Functions

### decrease_stock(p_name TEXT, p_qty INT)
Safely reduces warehouse inventory quantity
- Parameters: product name and quantity to decrease
- Only updates if sufficient quantity is available
- Returns void

## Bot Features

### Authentication
- `/start` - Checks if user is registered in masters table by telegram_id
- Shows "Contact Admin" if not registered
- Shows permanent menu keyboard if registered

### Admin Panel (Button-Based)
When the admin user starts the bot, they see a special admin menu with the following buttons:
- **➕ Usta qo'shish** (Add Master) - Create new masters/workers
  - Collects: name, phone, telegram_id, region
  - Validates unique phone and telegram_id
  - Provides error feedback for duplicates
- **➕ Mahsulot qo'shish** (Add Product) - Add products to warehouse
  - Collects: name, quantity, price, category (optional), subcategory (optional)
  - Validates input and checks for duplicates
- **👥 Barcha ustalar** (View All Masters) - Display all registered masters with details
- **📋 Barcha buyurtmalar** (View All Orders) - Show last 20 orders with master names
- **📦 Ombor** (Warehouse) - View warehouse inventory
- **🔙 Orqaga** (Back) - Return to admin menu

All admin functions are accessible via buttons (no "/" commands needed).
The `/addmaster` command is still available as a fallback option.

### Permanent Menu
The bot displays a persistent keyboard with the following buttons (in Uzbek):
- Row 1: `+ Yangi yetkazish` (+ New delivery)
- Row 2: `Mening buyurtmalarim` (My orders) | `Ombor` (Stock)

### Menu Commands

#### + New delivery
Initiates the delivery workflow (see below)

#### My orders
Displays the last 10 orders for the current master showing:
- Order ID
- Customer name
- Product
- Status

#### Stock
Shows all products in the warehouse with:
- Product name
- Current quantity
- Price

### Delivery Workflow
1. **+ New Delivery** - Initiates new order
2. **Customer name** - Text input
3. **Phone** - Contact or text input
4. **Address** - Text or location input
5. **Product** - Select from warehouse or manual entry
6. **Quantity** - Validates against warehouse stock
7. **Order Creation** - Saves to database and decreases stock
8. **"Yo'ldaman"** - Updates status to 'on_way' and requests GPS location
9. **GPS Location** - Master sends current GPS coordinates (auto-requested)
10. **"Yetib keldim"** - Master arrived, prompts for photos
11. **Before photo** - Upload image
12. **After photo** - Upload image
13. **Signature** - Upload signature image
14. **"Yetkazildi"** - Updates status to 'closed'

### Session Management
- Uses in-memory Map for session storage
- Tracks multi-step conversation flow
- Stores temporary order data

### Error Handling
- All errors show "An error occurred" message
- Bot error catching enabled

## Environment Variables
Required secrets:
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `ADMIN_CHAT_ID` - Admin group chat ID for order notifications (format: -100xxxxxxxxx)
- `ADMIN_USER_ID` - Admin's Telegram user ID for /addmaster command access

## Admin Notifications
When a new order is created, the bot sends a notification to the admin group (if ADMIN_CHAT_ID is configured) containing:
- Order ID
- Master name
- Customer name and phone
- Address
- Product and quantity

## Files
- `bot.js` - Main bot application
- `package.json` - NPM dependencies (grammy, pg, dotenv)
- `schema.sql` - Database schema
- `test_connection.py` - Database connection test
- `.env.example` - Environment variables template

## Language
All bot messages, buttons, and responses are in Uzbek language for better user experience.

## GPS Tracking
When a master clicks "Yo'ldaman" (I'm on my way), the bot automatically:
- Requests GPS location from the master
- Saves master's current coordinates to the database (master_current_lat, master_current_lng)
- These coordinates can be used by the web admin panel to track master locations in real-time

## Recent Changes
- 2025-11-25: Initial database schema creation with 4 tables and 1 stored function
- 2025-11-25: Created fully functional Telegram bot with delivery workflow
- 2025-11-25: Added permanent menu keyboard with "My orders" and "Stock" features
- 2025-11-25: Added admin group notifications for new orders
- 2025-11-25: Updated console startup message to "Brando Bot - Started with NeonDB 2025"
- 2025-11-25: Converted entire bot interface to Uzbek language
- 2025-11-25: Added GPS tracking feature - "Yo'ldaman" button now auto-requests and saves master GPS location
- 2025-11-25: Imported and configured bot to run in Replit environment with PostgreSQL database
- 2025-11-25: Added admin functionality - /addmaster command to create new masters/workers with proper authentication
- 2025-11-25: Converted all admin functions to button-based interface (Add Master, Add Product, View Masters, View All Orders)
- 2025-11-25: Created admin panel with persistent keyboard menu for easy navigation
