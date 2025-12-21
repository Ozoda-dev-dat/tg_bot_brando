# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with Node.js and PostgreSQL. The bot helps manage delivery orders, warehouses, and technicians (masters).

## Project Structure
- `bot.js` - Main bot logic with Grammy framework
- `start.js` - Entry point that checks environment and database setup
- `setup-db.js` - Database schema setup script
- `schema.sql` - PostgreSQL database schema

## Technology Stack
- **Runtime**: Node.js 20
- **Framework**: Grammy (Telegram Bot framework)
- **Database**: PostgreSQL
- **Libraries**: dotenv, pg, exceljs, xlsx

## Required Secrets
The following secrets must be set in the Secrets tab:
- `BOT_TOKEN` - Telegram bot token from @BotFather
- `ADMIN_CHAT_ID` - Telegram chat ID for admin notifications
- `ADMIN_USER_ID` - Telegram user ID of the administrator

## Running the Bot
The bot runs via the configured workflow which executes `node start.js`.

## Database
Uses PostgreSQL with tables for:
- `service_centers` - Service center locations
- `masters` - Technicians/delivery workers
- `warehouse` - Product inventory
- `clients` - Customer information
- `orders` - Delivery orders
