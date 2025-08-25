/**
 * Logger utility pour le bot Discord
 * Gestion centralisée des logs avec différents niveaux
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor(context = 'Bot') {
        this.context = context;
        this.logDir = path.join(__dirname, '../logs');
        
        // Créer le dossier logs s'il n'existe pas
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Formate un message de log
     * @param {string} level - Niveau du log (INFO, WARN, ERROR, DEBUG)
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     * @returns {string} Message formaté
     */
    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const contextStr = this.context ? `[${this.context}]` : '';
        const dataStr = Object.keys(data).length > 0 ? ` | Data: ${JSON.stringify(data)}` : '';
        
        return `${timestamp} [${level}] ${contextStr} ${message}${dataStr}`;
    }

    /**
     * Écrit un log dans un fichier
     * @param {string} level - Niveau du log
     * @param {string} message - Message formaté
     */
    writeToFile(level, message) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filename = `${date}.log`;
            const filepath = path.join(this.logDir, filename);
            
            fs.appendFileSync(filepath, message + '\n');
        } catch (error) {
            console.error('Erreur lors de l\'écriture du log:', error);
        }
    }

    /**
     * Log d'information
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     */
    info(message, data = {}) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        console.log(`\x1b[36m${formattedMessage}\x1b[0m`); // Cyan
        this.writeToFile('INFO', formattedMessage);
    }

    /**
     * Log d'avertissement
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     */
    warn(message, data = {}) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        console.warn(`\x1b[33m${formattedMessage}\x1b[0m`); // Yellow
        this.writeToFile('WARN', formattedMessage);
    }

    /**
     * Log d'erreur
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     */
    error(message, data = {}) {
        const formattedMessage = this.formatMessage('ERROR', message, data);
        console.error(`\x1b[31m${formattedMessage}\x1b[0m`); // Red
        this.writeToFile('ERROR', formattedMessage);
    }

    /**
     * Log de debug
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     */
    debug(message, data = {}) {
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
            const formattedMessage = this.formatMessage('DEBUG', message, data);
            console.log(`\x1b[35m${formattedMessage}\x1b[0m`); // Magenta
            this.writeToFile('DEBUG', formattedMessage);
        }
    }

    /**
     * Log de succès
     * @param {string} message - Message à logger
     * @param {Object} data - Données additionnelles
     */
    success(message, data = {}) {
        const formattedMessage = this.formatMessage('SUCCESS', message, data);
        console.log(`\x1b[32m${formattedMessage}\x1b[0m`); // Green
        this.writeToFile('SUCCESS', formattedMessage);
    }

    /**
     * Nettoie les anciens logs (garde les 30 derniers jours)
     */
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const fileDate = new Date(file.replace('.log', ''));
                    if (fileDate < thirtyDaysAgo) {
                        fs.unlinkSync(path.join(this.logDir, file));
                        this.info(`Ancien log supprimé: ${file}`);
                    }
                }
            });
        } catch (error) {
            this.error('Erreur lors du nettoyage des logs', { error: error.message });
        }
    }
}

module.exports = Logger;