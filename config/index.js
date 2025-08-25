require('dotenv').config();

// Configuration principale du bot
const config = {
    // Configuration Discord
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '=',
    version: process.env.VERSION || '2.0.0',
    loadSlashsGlobal: process.env.LOAD_SLASHS_GLOBAL === 'true',
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    ownerId: process.env.OWNER_ID,

    // Configuration de la base de données
    database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
        acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
        timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
        reconnect: process.env.DB_RECONNECT === 'true',
        charset: process.env.DB_CHARSET || 'utf8mb4'
    },

    // Configuration des couleurs
    colors: {
        primary: process.env.COLOR_PRIMARY || '#5865F2',
        secondary: process.env.COLOR_SECONDARY || '#99AAB5',
        success: process.env.COLOR_SUCCESS || '#57F287',
        warning: process.env.COLOR_WARNING || '#FEE75C',
        error: process.env.COLOR_ERROR || '#ED4245',
        info: process.env.COLOR_INFO || '#5865F2'
    },

    // Configuration des emojis
    emojis: {
        success: process.env.EMOJI_SUCCESS || '✅',
        error: process.env.EMOJI_ERROR || '❌',
        warning: process.env.EMOJI_WARNING || '⚠️',
        info: process.env.EMOJI_INFO || 'ℹ️',
        loading: process.env.EMOJI_LOADING || '⏳',
        premium: process.env.EMOJI_PREMIUM || '👑',
        credits: process.env.EMOJI_CREDITS || '💰',
        ticket: process.env.EMOJI_TICKET || '🎫',
        pdf: process.env.EMOJI_PDF || '📄'
    },

    // Configuration des crédits
    credits: {
        pdfCost: parseInt(process.env.CREDITS_PDF_COST) || 5,
        referralReward: parseInt(process.env.CREDITS_REFERRAL_REWARD) || 5,
        dailyBonus: parseInt(process.env.CREDITS_DAILY_BONUS) || 0
    },

    // Configuration des canaux
    channels: {
        logs: process.env.CHANNEL_LOGS,
        tickets: process.env.CHANNEL_TICKETS
    },

    // Configuration des rôles
    roles: {
        premium: process.env.ROLE_PREMIUM,
        staff: process.env.ROLE_STAFF,
        french: process.env.ROLE_FRENCH,
        english: process.env.ROLE_ENGLISH,
        notifications: process.env.ROLE_NOTIFICATIONS,
        events: process.env.ROLE_EVENTS,
        news: process.env.ROLE_NEWS
    }
};

module.exports = config;