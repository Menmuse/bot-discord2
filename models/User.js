const { query } = require('../config/database');
const crypto = require('crypto');

class User {
    constructor(data) {
        this.id = data.id;
        this.discord_id = data.discord_id;
        this.credits = data.credits || 0;
        this.credits_spent = data.credits_spent || 0;
        this.status = data.status || 'gratuit';
        this.language = data.language || 'fr';
        this.referral_code = data.referral_code;
        this.referred_by = data.referred_by;
        this.premium_until = data.premium_until;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    /**
     * Trouve ou crée un utilisateur
     * @param {string} discordId - L'ID Discord de l'utilisateur
     * @returns {Promise<User>} - L'instance de l'utilisateur
     */
    static async findOrCreate(discordId) {
        try {
            // Chercher l'utilisateur existant
            const result = await query('SELECT * FROM users WHERE discord_id = ?', [discordId]);
            
            if (result.length > 0) {
                return new User(result[0]);
            }

            // Créer un nouvel utilisateur
            const referralCode = User.generateReferralCode();
            const insertResult = await query(
                'INSERT INTO users (discord_id, credits, referral_code, status, language) VALUES (?, ?, ?, ?, ?)',
                [discordId, 0, referralCode, 'gratuit', 'fr']
            );

            // Récupérer l'utilisateur créé
            const newUserResult = await query('SELECT * FROM users WHERE id = ?', [insertResult.insertId]);
            return new User(newUserResult[0]);

        } catch (error) {
            console.error('Erreur lors de la création/recherche de l\'utilisateur:', error);
            throw error;
        }
    }

    /**
     * Trouve un utilisateur par son ID Discord
     * @param {string} discordId - L'ID Discord de l'utilisateur
     * @returns {Promise<User|null>} - L'instance de l'utilisateur ou null
     */
    static async findByDiscordId(discordId) {
        try {
            const result = await query('SELECT * FROM users WHERE discord_id = ?', [discordId]);
            return result.length > 0 ? new User(result[0]) : null;
        } catch (error) {
            console.error('Erreur lors de la recherche de l\'utilisateur:', error);
            throw error;
        }
    }

    /**
     * Trouve un utilisateur par son code de parrainage
     * @param {string} referralCode - Le code de parrainage
     * @returns {Promise<User|null>} - L'instance de l'utilisateur ou null
     */
    static async findByReferralCode(referralCode) {
        try {
            const result = await query('SELECT * FROM users WHERE referral_code = ?', [referralCode]);
            return result.length > 0 ? new User(result[0]) : null;
        } catch (error) {
            console.error('Erreur lors de la recherche par code de parrainage:', error);
            throw error;
        }
    }

    /**
     * Met à jour les crédits de l'utilisateur
     * @param {number} amount - Montant à ajouter (peut être négatif)
     * @param {string} description - Description de la transaction
     * @param {string} type - Type de transaction
     * @returns {Promise<boolean>} - Succès de l'opération
     */
    async updateCredits(amount, description, type = 'system') {
        try {
            const newCredits = Math.max(0, this.credits + amount);
            const newCreditsSpent = amount < 0 ? this.credits_spent + Math.abs(amount) : this.credits_spent;

            // Mettre à jour les crédits
            await query(
                'UPDATE users SET credits = ?, credits_spent = ?, updated_at = NOW() WHERE discord_id = ?',
                [newCredits, newCreditsSpent, this.discord_id]
            );

            // Créer une transaction
            await query(
                'INSERT INTO transactions (user_id, amount, description, type) VALUES (?, ?, ?, ?)',
                [this.discord_id, amount, description, type]
            );

            // Mettre à jour l'instance
            this.credits = newCredits;
            this.credits_spent = newCreditsSpent;

            return true;
        } catch (error) {
            console.error('Erreur lors de la mise à jour des crédits:', error);
            throw error;
        }
    }

    /**
     * Met à jour le statut de l'utilisateur
     * @param {string} status - Nouveau statut
     * @param {Date|null} premiumUntil - Date d'expiration du premium (optionnel)
     * @returns {Promise<boolean>} - Succès de l'opération
     */
    async updateStatus(status, premiumUntil = null) {
        try {
            await query(
                'UPDATE users SET status = ?, premium_until = ?, updated_at = NOW() WHERE discord_id = ?',
                [status, premiumUntil, this.discord_id]
            );

            this.status = status;
            this.premium_until = premiumUntil;

            return true;
        } catch (error) {
            console.error('Erreur lors de la mise à jour du statut:', error);
            throw error;
        }
    }

    /**
     * Met à jour la langue de l'utilisateur
     * @param {string} language - Nouvelle langue
     * @returns {Promise<boolean>} - Succès de l'opération
     */
    async updateLanguage(language) {
        try {
            await query(
                'UPDATE users SET language = ?, updated_at = NOW() WHERE discord_id = ?',
                [language, this.discord_id]
            );

            this.language = language;

            return true;
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la langue:', error);
            throw error;
        }
    }

    /**
     * Vérifie si l'utilisateur peut effectuer une action (crédits suffisants)
     * @param {number} cost - Coût de l'action
     * @returns {boolean} - Peut effectuer l'action
     */
    canAfford(cost) {
        return this.credits >= cost || this.isPremiumOrStaff();
    }

    /**
     * Vérifie si l'utilisateur est premium ou staff
     * @returns {boolean} - Est premium ou staff
     */
    isPremiumOrStaff() {
        if (this.status === 'staff') return true;
        if (this.status === 'premium') {
            if (!this.premium_until) return true; // Premium permanent
            return new Date() < new Date(this.premium_until);
        }
        return false;
    }

    /**
     * Vérifie si l'utilisateur est banni
     * @returns {boolean} - Est banni
     */
    isBanned() {
        return this.status === 'banni';
    }

    /**
     * Obtient les transactions récentes de l'utilisateur
     * @param {number} limit - Nombre de transactions à récupérer
     * @returns {Promise<Array>} - Liste des transactions
     */
    async getRecentTransactions(limit = 5) {
        try {
            const result = await query(
                'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [this.discord_id, limit]
            );
            return result;
        } catch (error) {
            console.error('Erreur lors de la récupération des transactions:', error);
            throw error;
        }
    }

    /**
     * Obtient les statistiques d'utilisation de l'utilisateur
     * @returns {Promise<Object>} - Statistiques d'utilisation
     */
    async getUsageStats() {
        try {
            const result = await query(
                'SELECT COUNT(*) as total_actions, SUM(CASE WHEN action = "pdf_generated" THEN 1 ELSE 0 END) as pdf_count FROM usage_logs WHERE user_id = ?',
                [this.discord_id]
            );
            return result[0];
        } catch (error) {
            console.error('Erreur lors de la récupération des statistiques:', error);
            throw error;
        }
    }

    /**
     * Obtient les statistiques de parrainage de l'utilisateur
     * @returns {Promise<Object>} - Statistiques de parrainage
     */
    async getReferralStats() {
        try {
            const result = await query(
                'SELECT COUNT(*) as total_referrals, SUM(reward_amount) as total_credits_earned FROM referral_rewards WHERE referrer_id = ?',
                [this.discord_id]
            );
            return result[0];
        } catch (error) {
            console.error('Erreur lors de la récupération des statistiques de parrainage:', error);
            throw error;
        }
    }

    /**
     * Obtient les parrainages récents de l'utilisateur
     * @param {number} limit - Nombre de parrainages à récupérer
     * @returns {Promise<Array>} - Liste des parrainages
     */
    async getRecentReferrals(limit = 5) {
        try {
            const result = await query(
                'SELECT * FROM referral_rewards WHERE referrer_id = ? ORDER BY created_at DESC LIMIT ?',
                [this.discord_id, limit]
            );
            return result;
        } catch (error) {
            console.error('Erreur lors de la récupération des parrainages:', error);
            throw error;
        }
    }

    /**
     * Génère un code de parrainage unique
     * @returns {string} - Code de parrainage
     */
    static generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Utilise un code de parrainage
     * @param {string} referralCode - Code de parrainage à utiliser
     * @param {number} referrerBonus - Bonus pour le parrain
     * @param {number} referredBonus - Bonus pour le filleul
     * @returns {Promise<Object>} - Résultat de l'opération
     */
    async useReferralCode(referralCode, referrerBonus = 50, referredBonus = 25) {
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                // Vérifier si l'utilisateur a déjà utilisé un code
                if (this.referred_by) {
                    return { success: false, message: 'Vous avez déjà utilisé un code de parrainage.' };
                }

                // Trouver le parrain
                const referrer = await User.findByReferralCode(referralCode);
                if (!referrer) {
                    return { success: false, message: 'Code de parrainage invalide.' };
                }

                // Vérifier que ce n'est pas son propre code
                if (referrer.discord_id === this.discord_id) {
                    return { success: false, message: 'Vous ne pouvez pas utiliser votre propre code de parrainage.' };
                }

                // Vérifier à nouveau si l'utilisateur n'a pas déjà utilisé un code (double vérification)
                const currentUser = await User.findByDiscordId(this.discord_id);
                if (currentUser && currentUser.referred_by) {
                    return { success: false, message: 'Vous avez déjà utilisé un code de parrainage.' };
                }

                // Commencer une transaction MySQL avec un timeout plus court
                await query('SET SESSION innodb_lock_wait_timeout = 10');
                await query('START TRANSACTION');

                try {
                    // Mettre à jour le filleul avec un verrou explicite
                    await query(
                        'UPDATE users SET referred_by = ?, credits = credits + ?, updated_at = NOW() WHERE discord_id = ? AND referred_by IS NULL',
                        [referrer.discord_id, referredBonus, this.discord_id]
                    );

                    // Vérifier que la mise à jour a bien eu lieu
                    const updateResult = await query(
                        'SELECT ROW_COUNT() as affected_rows'
                    );
                    
                    if (updateResult[0].affected_rows === 0) {
                        await query('ROLLBACK');
                        return { success: false, message: 'Vous avez déjà utilisé un code de parrainage.' };
                    }

                    // Mettre à jour le parrain
                    await query(
                        'UPDATE users SET credits = credits + ?, updated_at = NOW() WHERE discord_id = ?',
                        [referrerBonus, referrer.discord_id]
                    );

                    // Créer les transactions
                    await query(
                        'INSERT INTO transactions (user_id, amount, description, type) VALUES (?, ?, ?, ?)',
                        [this.discord_id, referredBonus, `Bonus de parrainage (code: ${referralCode})`, 'referral_bonus']
                    );

                    await query(
                        'INSERT INTO transactions (user_id, amount, description, type) VALUES (?, ?, ?, ?)',
                        [referrer.discord_id, referrerBonus, `Bonus de parrainage (filleul: ${this.discord_id})`, 'referral_bonus']
                    );

                    // Enregistrer la récompense de parrainage avec gestion des doublons
                    await query(
                        'INSERT INTO referral_rewards (referrer_id, referred_id, reward_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reward_amount = VALUES(reward_amount)',
                        [referrer.discord_id, this.discord_id, referrerBonus]
                    );

                    // Valider la transaction
                    await query('COMMIT');

                    // Mettre à jour les instances
                    this.referred_by = referrer.discord_id;
                    this.credits += referredBonus;
                    referrer.credits += referrerBonus;

                    return { 
                        success: true, 
                        message: 'Code de parrainage utilisé avec succès !',
                        referrer: referrer,
                        referrerBonus: referrerBonus,
                        referredBonus: referredBonus
                    };

                } catch (error) {
                    await query('ROLLBACK');
                    throw error;
                }

            } catch (error) {
                attempt++;
                console.error(`Erreur lors de l'utilisation du code de parrainage (tentative ${attempt}/${maxRetries}):`, error);
                
                // Si c'est une erreur de timeout et qu'il reste des tentatives
                if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
                    console.log(`Nouvelle tentative dans ${attempt * 1000}ms...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000)); // Délai progressif
                    continue;
                }
                
                // Si c'est la dernière tentative ou une autre erreur
                throw error;
            }
        }
    }

    /**
     * Convertit l'utilisateur en objet simple
     * @returns {Object} - Objet utilisateur
     */
    toObject() {
        return {
            id: this.id,
            discord_id: this.discord_id,
            credits: this.credits,
            credits_spent: this.credits_spent,
            status: this.status,
            language: this.language,
            referral_code: this.referral_code,
            referred_by: this.referred_by,
            premium_until: this.premium_until,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

module.exports = User;