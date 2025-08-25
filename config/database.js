require('dotenv').config();
const mysql = require('mysql2/promise');

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
    timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
    reconnect: process.env.DB_RECONNECT === 'true',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    // Paramètres pour gérer les connexions perdues
    keepAliveInitialDelay: 0,
    enableKeepAlive: true,
    // Gestion des erreurs de connexion
    handleDisconnects: true,
    // Timeout pour les requêtes inactives
    idleTimeout: 28800000, // 8 heures
    // Retry automatique
    maxReconnects: 3,
    reconnectDelay: 2000
};

// Pool de connexions
const pool = mysql.createPool(dbConfig);

// Gestion des événements du pool
pool.on('connection', (connection) => {
    console.log('🔗 Nouvelle connexion établie avec la base de données');
});

pool.on('error', (error) => {
    console.error('❌ Erreur du pool de connexions:', error.message);
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 Reconnexion automatique en cours...');
    }
});

// Test de connexion au démarrage
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connexion à la base de données réussie');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Échec de la connexion à la base de données:', error.message);
        return false;
    }
}

// Fonction pour exécuter des requêtes avec retry automatique
async function query(sql, params = [], retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const [results] = await pool.execute(sql, params);
            return results;
        } catch (error) {
            console.error(`Erreur lors de l'exécution de la requête (tentative ${attempt}/${retries}):`, error.message);
            
            // Erreurs de connexion qui justifient un retry
            const retryableErrors = [
                'ECONNRESET',
                'ECONNREFUSED', 
                'ETIMEDOUT',
                'PROTOCOL_CONNECTION_LOST',
                'ER_SERVER_SHUTDOWN',
                'ENOTFOUND'
            ];
            
            const shouldRetry = retryableErrors.some(errCode => 
                error.code === errCode || error.message.includes(errCode)
            );
            
            if (shouldRetry && attempt < retries) {
                console.log(`Nouvelle tentative dans ${dbConfig.reconnectDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, dbConfig.reconnectDelay * attempt));
                continue;
            }
            
            // Si toutes les tentatives échouent ou erreur non-retryable
            console.error('Erreur définitive lors de l\'exécution de la requête:', error);
            throw error;
        }
    }
}

// Fonction d'initialisation de la base de données
async function initializeDatabase() {
    try {
        console.log('🔄 Initialisation de la base de données...');
        
        // Test de connexion avant initialisation
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Impossible de se connecter à la base de données');
        }
        
        // Créer la table users si elle n'existe pas
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                credits INT DEFAULT 100,
                credits_spent INT DEFAULT 0,
                premium BOOLEAN DEFAULT FALSE,
                banned BOOLEAN DEFAULT FALSE,
                language ENUM('fr', 'en') DEFAULT 'fr',
                referral_code VARCHAR(10) UNIQUE,
                referred_by VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Créer la table transactions si elle n'existe pas
        await query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                type ENUM('credit', 'debit', 'premium', 'referral', 'admin') NOT NULL,
                amount INT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Créer la table tickets si elle n'existe pas
        await query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) UNIQUE NOT NULL,
                status ENUM('open', 'closed') DEFAULT 'open',
                subject VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ Base de données initialisée avec succès');
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation de la base de données:', error);
        throw error;
    }
}

module.exports = {
    pool,
    query,
    initializeDatabase,
    testConnection
};