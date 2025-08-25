const cooldowns = new Map();

class CooldownUtils {
    /**
     * Vérifie si un utilisateur est en cooldown pour une commande
     * @param {string} userId - ID de l'utilisateur
     * @param {string} commandName - Nom de la commande
     * @param {number} cooldownTime - Temps de cooldown en secondes
     * @returns {Object} - Informations sur le cooldown
     */
    static checkCooldown(userId, commandName, cooldownTime) {
        const now = Date.now();
        const cooldownKey = `${userId}_${commandName}`;
        
        if (!cooldowns.has(cooldownKey)) {
            // Pas de cooldown actif
            cooldowns.set(cooldownKey, now);
            return {
                isOnCooldown: false,
                timeLeft: 0
            };
        }

        const lastUsed = cooldowns.get(cooldownKey);
        const timePassed = (now - lastUsed) / 1000;
        const timeLeft = cooldownTime - timePassed;

        if (timeLeft > 0) {
            // Encore en cooldown
            return {
                isOnCooldown: true,
                timeLeft: Math.ceil(timeLeft)
            };
        } else {
            // Cooldown terminé
            cooldowns.set(cooldownKey, now);
            return {
                isOnCooldown: false,
                timeLeft: 0
            };
        }
    }

    /**
     * Remet à zéro le cooldown d'un utilisateur pour une commande
     * @param {string} userId - ID de l'utilisateur
     * @param {string} commandName - Nom de la commande
     */
    static resetCooldown(userId, commandName) {
        const cooldownKey = `${userId}_${commandName}`;
        cooldowns.delete(cooldownKey);
    }

    /**
     * Obtient le temps restant du cooldown
     * @param {string} userId - ID de l'utilisateur
     * @param {string} commandName - Nom de la commande
     * @param {number} cooldownTime - Temps de cooldown en secondes
     * @returns {number} - Temps restant en secondes
     */
    static getTimeLeft(userId, commandName, cooldownTime) {
        const cooldownKey = `${userId}_${commandName}`;
        
        if (!cooldowns.has(cooldownKey)) {
            return 0;
        }

        const now = Date.now();
        const lastUsed = cooldowns.get(cooldownKey);
        const timePassed = (now - lastUsed) / 1000;
        const timeLeft = cooldownTime - timePassed;

        return Math.max(0, Math.ceil(timeLeft));
    }

    /**
     * Formate le temps restant en format lisible
     * @param {number} seconds - Temps en secondes
     * @returns {string} - Temps formaté
     */
    static formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
        }

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes < 60) {
            if (remainingSeconds === 0) {
                return `${minutes} minute${minutes > 1 ? 's' : ''}`;
            }
            return `${minutes} minute${minutes > 1 ? 's' : ''} et ${remainingSeconds} seconde${remainingSeconds > 1 ? 's' : ''}`;
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            return `${hours} heure${hours > 1 ? 's' : ''}`;
        }
        return `${hours} heure${hours > 1 ? 's' : ''} et ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }

    /**
     * Nettoie les cooldowns expirés
     * @param {number} maxAge - Âge maximum en millisecondes
     */
    static cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 heures par défaut
        const now = Date.now();
        const toDelete = [];

        for (const [key, timestamp] of cooldowns.entries()) {
            if (now - timestamp > maxAge) {
                toDelete.push(key);
            }
        }

        toDelete.forEach(key => cooldowns.delete(key));
        
        if (toDelete.length > 0) {
            console.log(`Nettoyage des cooldowns: ${toDelete.length} entrées supprimées.`);
        }
    }

    /**
     * Obtient les statistiques des cooldowns
     * @returns {Object} - Statistiques
     */
    static getStats() {
        const now = Date.now();
        let activeCooldowns = 0;
        const commandStats = new Map();

        for (const [key, timestamp] of cooldowns.entries()) {
            const [userId, commandName] = key.split('_');
            const age = (now - timestamp) / 1000;

            if (age < 3600) { // Cooldowns actifs dans la dernière heure
                activeCooldowns++;
            }

            if (!commandStats.has(commandName)) {
                commandStats.set(commandName, 0);
            }
            commandStats.set(commandName, commandStats.get(commandName) + 1);
        }

        return {
            totalCooldowns: cooldowns.size,
            activeCooldowns,
            commandStats: Object.fromEntries(commandStats)
        };
    }

    /**
     * Applique un cooldown global pour un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @param {number} cooldownTime - Temps de cooldown en secondes
     */
    static setGlobalCooldown(userId, cooldownTime) {
        const cooldownKey = `${userId}_global`;
        cooldowns.set(cooldownKey, Date.now());
        
        // Supprimer automatiquement après le cooldown
        setTimeout(() => {
            cooldowns.delete(cooldownKey);
        }, cooldownTime * 1000);
    }

    /**
     * Vérifie si un utilisateur est en cooldown global
     * @param {string} userId - ID de l'utilisateur
     * @param {number} cooldownTime - Temps de cooldown en secondes
     * @returns {Object} - Informations sur le cooldown global
     */
    static checkGlobalCooldown(userId, cooldownTime) {
        return this.checkCooldown(userId, 'global', cooldownTime);
    }

    /**
     * Applique un cooldown basé sur le statut de l'utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @param {string} commandName - Nom de la commande
     * @param {string} userStatus - Statut de l'utilisateur
     * @param {Object} cooldownConfig - Configuration des cooldowns
     * @returns {Object} - Informations sur le cooldown
     */
    static checkStatusBasedCooldown(userId, commandName, userStatus, cooldownConfig) {
        let cooldownTime;

        switch (userStatus) {
            case 'staff':
                cooldownTime = cooldownConfig.staff || 0;
                break;
            case 'premium':
                cooldownTime = cooldownConfig.premium || cooldownConfig.default;
                break;
            case 'gratuit':
            default:
                cooldownTime = cooldownConfig.default;
                break;
        }

        if (cooldownTime === 0) {
            return {
                isOnCooldown: false,
                timeLeft: 0
            };
        }

        return this.checkCooldown(userId, commandName, cooldownTime);
    }

    /**
     * Obtient tous les cooldowns actifs pour un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @returns {Array} - Liste des cooldowns actifs
     */
    static getUserCooldowns(userId) {
        const userCooldowns = [];
        const now = Date.now();

        for (const [key, timestamp] of cooldowns.entries()) {
            if (key.startsWith(`${userId}_`)) {
                const commandName = key.split('_')[1];
                const age = (now - timestamp) / 1000;
                
                userCooldowns.push({
                    command: commandName,
                    startedAt: new Date(timestamp),
                    ageSeconds: Math.floor(age)
                });
            }
        }

        return userCooldowns.sort((a, b) => b.startedAt - a.startedAt);
    }

    /**
     * Supprime tous les cooldowns d'un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @returns {number} - Nombre de cooldowns supprimés
     */
    static clearUserCooldowns(userId) {
        const toDelete = [];
        
        for (const key of cooldowns.keys()) {
            if (key.startsWith(`${userId}_`)) {
                toDelete.push(key);
            }
        }

        toDelete.forEach(key => cooldowns.delete(key));
        return toDelete.length;
    }
}

// Nettoyage automatique des cooldowns toutes les heures
setInterval(() => {
    CooldownUtils.cleanup();
}, 60 * 60 * 1000);

module.exports = CooldownUtils;