/**
 * Gestionnaire d'erreurs centralisé pour les interactions Discord.js v14.21
 * Gestion robuste des erreurs avec logging et réponses appropriées
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');
const Logger = require('../../utils/logger');
const config = require('../../config');

class InteractionErrorHandler {
    constructor(client) {
        this.client = client;
        this.logger = new Logger('InteractionErrorHandler');
        
        // Types d'erreurs connues
        this.errorTypes = {
            INTERACTION_EXPIRED: 'INTERACTION_EXPIRED',
            INTERACTION_ALREADY_REPLIED: 'INTERACTION_ALREADY_REPLIED',
            MISSING_PERMISSIONS: 'MISSING_PERMISSIONS',
            RATE_LIMITED: 'RATE_LIMITED',
            VALIDATION_ERROR: 'VALIDATION_ERROR',
            DATABASE_ERROR: 'DATABASE_ERROR',
            FILE_NOT_FOUND: 'FILE_NOT_FOUND',
            INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
            USER_BANNED: 'USER_BANNED',
            UNKNOWN_ERROR: 'UNKNOWN_ERROR'
        };
        
        // Messages d'erreur utilisateur
        this.userMessages = {
            [this.errorTypes.INTERACTION_EXPIRED]: '⏰ Cette interaction a expiré. Veuillez réessayer.',
            [this.errorTypes.INTERACTION_ALREADY_REPLIED]: '⚠️ Cette interaction a déjà été traitée.',
            [this.errorTypes.MISSING_PERMISSIONS]: '🔒 Vous n\'avez pas les permissions nécessaires.',
            [this.errorTypes.RATE_LIMITED]: '⏳ Vous allez trop vite ! Veuillez patienter.',
            [this.errorTypes.VALIDATION_ERROR]: '❌ Données invalides fournies.',
            [this.errorTypes.DATABASE_ERROR]: '🗄️ Erreur de base de données. Veuillez réessayer.',
            [this.errorTypes.FILE_NOT_FOUND]: '📁 Fichier ou modèle introuvable.',
            [this.errorTypes.INSUFFICIENT_CREDITS]: '💰 Crédits insuffisants pour cette action.',
            [this.errorTypes.USER_BANNED]: '🚫 Vous êtes banni du service.',
            [this.errorTypes.UNKNOWN_ERROR]: '❌ Une erreur inattendue s\'est produite.'
        };
    }

    /**
     * Gère une erreur d'interaction
     * @param {Error} error - L'erreur à traiter
     * @param {import('discord.js').Interaction} interaction - L'interaction concernée
     * @param {Object} context - Contexte additionnel
     */
    async handleError(error, interaction, context = {}) {
        const errorType = this._classifyError(error);
        const errorId = this._generateErrorId();
        
        // Logger l'erreur avec contexte complet
        await this._logError(error, interaction, context, errorType, errorId);
        
        // Répondre à l'utilisateur si possible
        await this._respondToUser(error, interaction, errorType, errorId);
        
        // Notifier les administrateurs si nécessaire
        if (this._shouldNotifyAdmins(errorType)) {
            await this._notifyAdmins(error, interaction, context, errorType, errorId);
        }
        
        return errorId;
    }

    /**
     * Classifie le type d'erreur
     * @param {Error} error 
     * @returns {string}
     */
    _classifyError(error) {
        const message = error.message.toLowerCase();
        
        // Erreurs Discord.js spécifiques
        if (message.includes('interaction has already been acknowledged') || 
            message.includes('already replied')) {
            return this.errorTypes.INTERACTION_ALREADY_REPLIED;
        }
        
        if (message.includes('interaction has expired') || 
            message.includes('unknown interaction')) {
            return this.errorTypes.INTERACTION_EXPIRED;
        }
        
        if (message.includes('missing permissions') || 
            message.includes('insufficient permissions')) {
            return this.errorTypes.MISSING_PERMISSIONS;
        }
        
        if (message.includes('rate limit') || 
            message.includes('too many requests')) {
            return this.errorTypes.RATE_LIMITED;
        }
        
        // Erreurs métier
        if (message.includes('validation') || 
            message.includes('invalid')) {
            return this.errorTypes.VALIDATION_ERROR;
        }
        
        if (message.includes('database') || 
            message.includes('sql') || 
            message.includes('connection')) {
            return this.errorTypes.DATABASE_ERROR;
        }
        
        if (message.includes('file not found') || 
            message.includes('enoent') || 
            message.includes('no such file')) {
            return this.errorTypes.FILE_NOT_FOUND;
        }
        
        if (message.includes('insufficient credits') || 
            message.includes('not enough credits')) {
            return this.errorTypes.INSUFFICIENT_CREDITS;
        }
        
        if (message.includes('banned') || 
            message.includes('blacklisted')) {
            return this.errorTypes.USER_BANNED;
        }
        
        return this.errorTypes.UNKNOWN_ERROR;
    }

    /**
     * Génère un ID unique pour l'erreur
     * @returns {string}
     */
    _generateErrorId() {
        return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Enregistre l'erreur dans les logs
     * @param {Error} error 
     * @param {import('discord.js').Interaction} interaction 
     * @param {Object} context 
     * @param {string} errorType 
     * @param {string} errorId 
     */
    async _logError(error, interaction, context, errorType, errorId) {
        const logData = {
            errorId,
            errorType,
            message: error.message,
            stack: error.stack,
            userId: interaction?.user?.id,
            username: interaction?.user?.username,
            guildId: interaction?.guild?.id,
            guildName: interaction?.guild?.name,
            channelId: interaction?.channel?.id,
            interactionType: interaction?.type,
            commandName: interaction?.commandName || interaction?.customId,
            timestamp: new Date().toISOString(),
            context
        };
        
        // Log selon la sévérité
        if (this._isCriticalError(errorType)) {
            this.logger.error('Erreur critique d\'interaction', logData);
        } else if (this._isWarningError(errorType)) {
            this.logger.warn('Erreur d\'interaction (avertissement)', logData);
        } else {
            this.logger.info('Erreur d\'interaction (info)', logData);
        }
        
        // Sauvegarder en base de données si configuré
        if (config.logging?.saveToDatabase) {
            await this._saveErrorToDatabase(logData);
        }
    }

    /**
     * Répond à l'utilisateur avec un message d'erreur approprié
     * @param {Error} error 
     * @param {import('discord.js').Interaction} interaction 
     * @param {string} errorType 
     * @param {string} errorId 
     */
    async _respondToUser(error, interaction, errorType, errorId) {
        if (!interaction || !this._canRespondToInteraction(interaction)) {
            return;
        }
        
        const userMessage = this.userMessages[errorType] || this.userMessages[this.errorTypes.UNKNOWN_ERROR];
        
        // Créer l'embed d'erreur
        const embed = new EmbedBuilder()
            .setColor(config.colors?.error || '#FF0000')
            .setTitle('❌ Erreur')
            .setDescription(userMessage)
            .setTimestamp();
        
        // Ajouter l'ID d'erreur pour les erreurs critiques
        if (this._isCriticalError(errorType)) {
            embed.setFooter({ 
                text: `ID d'erreur: ${errorId}`,
                iconURL: this.client.user?.displayAvatarURL()
            });
        }
        
        try {
            if (interaction.replied || interaction.deferred) {
                if (interaction.followUp) {
                    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.editReply({ embeds: [embed] });
                }
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (replyError) {
            this.logger.warn('Impossible de répondre à l\'utilisateur après erreur', {
                originalError: error.message,
                replyError: replyError.message,
                errorId
            });
        }
    }

    /**
     * Notifie les administrateurs des erreurs critiques
     * @param {Error} error 
     * @param {import('discord.js').Interaction} interaction 
     * @param {Object} context 
     * @param {string} errorType 
     * @param {string} errorId 
     */
    async _notifyAdmins(error, interaction, context, errorType, errorId) {
        if (!config.notifications?.adminChannelId) {
            return;
        }
        
        try {
            const channel = await this.client.channels.fetch(config.notifications.adminChannelId);
            if (!channel) return;
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 Erreur Critique Détectée')
                .setDescription(`**Type:** ${errorType}\n**ID:** ${errorId}`)
                .addFields(
                    {
                        name: '👤 Utilisateur',
                        value: interaction?.user ? `${interaction.user.username} (${interaction.user.id})` : 'Inconnu',
                        inline: true
                    },
                    {
                        name: '🏠 Serveur',
                        value: interaction?.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'MP',
                        inline: true
                    },
                    {
                        name: '⚙️ Commande/Action',
                        value: interaction?.commandName || interaction?.customId || 'Inconnue',
                        inline: true
                    },
                    {
                        name: '❌ Message d\'erreur',
                        value: `\`\`\`${error.message.substring(0, 1000)}\`\`\``,
                        inline: false
                    }
                )
                .setTimestamp();
            
            if (context && Object.keys(context).length > 0) {
                embed.addFields({
                    name: '📋 Contexte',
                    value: `\`\`\`json\n${JSON.stringify(context, null, 2).substring(0, 1000)}\`\`\``,
                    inline: false
                });
            }
            
            await channel.send({ embeds: [embed] });
        } catch (notifyError) {
            this.logger.error('Erreur lors de la notification des admins', {
                error: notifyError.message,
                originalErrorId: errorId
            });
        }
    }

    /**
     * Vérifie si on peut répondre à l'interaction
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    _canRespondToInteraction(interaction) {
        if (!interaction) return false;
        
        // Vérifier si l'interaction n'a pas expiré
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const maxAge = 15 * 60 * 1000; // 15 minutes
        
        return (now - interactionTime) < maxAge;
    }

    /**
     * Détermine si l'erreur est critique
     * @param {string} errorType 
     * @returns {boolean}
     */
    _isCriticalError(errorType) {
        const criticalErrors = [
            this.errorTypes.DATABASE_ERROR,
            this.errorTypes.UNKNOWN_ERROR
        ];
        
        return criticalErrors.includes(errorType);
    }

    /**
     * Détermine si l'erreur est un avertissement
     * @param {string} errorType 
     * @returns {boolean}
     */
    _isWarningError(errorType) {
        const warningErrors = [
            this.errorTypes.MISSING_PERMISSIONS,
            this.errorTypes.RATE_LIMITED,
            this.errorTypes.VALIDATION_ERROR,
            this.errorTypes.FILE_NOT_FOUND,
            this.errorTypes.INSUFFICIENT_CREDITS,
            this.errorTypes.USER_BANNED
        ];
        
        return warningErrors.includes(errorType);
    }

    /**
     * Détermine si les admins doivent être notifiés
     * @param {string} errorType 
     * @returns {boolean}
     */
    _shouldNotifyAdmins(errorType) {
        const notifyErrors = [
            this.errorTypes.DATABASE_ERROR,
            this.errorTypes.UNKNOWN_ERROR
        ];
        
        return notifyErrors.includes(errorType);
    }

    /**
     * Sauvegarde l'erreur en base de données
     * @param {Object} logData 
     */
    async _saveErrorToDatabase(logData) {
        try {
            const { query } = require('../../config/database');
            
            await query(
                `INSERT INTO error_logs 
                 (error_id, error_type, message, stack_trace, user_id, guild_id, 
                  channel_id, interaction_type, command_name, context, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    logData.errorId,
                    logData.errorType,
                    logData.message,
                    logData.stack,
                    logData.userId,
                    logData.guildId,
                    logData.channelId,
                    logData.interactionType,
                    logData.commandName,
                    JSON.stringify(logData.context)
                ]
            );
        } catch (dbError) {
            this.logger.error('Erreur lors de la sauvegarde en base de données', {
                error: dbError.message,
                originalErrorId: logData.errorId
            });
        }
    }

    /**
     * Crée une erreur personnalisée avec type
     * @param {string} type 
     * @param {string} message 
     * @param {Object} context 
     * @returns {Error}
     */
    createError(type, message, context = {}) {
        const error = new Error(message);
        error.type = type;
        error.context = context;
        return error;
    }

    /**
     * Gère les erreurs de validation
     * @param {string} field 
     * @param {string} value 
     * @param {string} expected 
     * @returns {Error}
     */
    createValidationError(field, value, expected) {
        return this.createError(
            this.errorTypes.VALIDATION_ERROR,
            `Validation échouée pour le champ '${field}': reçu '${value}', attendu '${expected}'`,
            { field, value, expected }
        );
    }

    /**
     * Gère les erreurs de permissions
     * @param {string} permission 
     * @param {string} action 
     * @returns {Error}
     */
    createPermissionError(permission, action) {
        return this.createError(
            this.errorTypes.MISSING_PERMISSIONS,
            `Permission '${permission}' requise pour '${action}'`,
            { permission, action }
        );
    }

    /**
     * Gère les erreurs de crédits insuffisants
     * @param {number} required 
     * @param {number} available 
     * @returns {Error}
     */
    createInsufficientCreditsError(required, available) {
        return this.createError(
            this.errorTypes.INSUFFICIENT_CREDITS,
            `Crédits insuffisants: ${required} requis, ${available} disponibles`,
            { required, available }
        );
    }

    /**
     * Nettoie les anciens logs d'erreur
     * @param {number} daysToKeep - Nombre de jours à conserver
     */
    async cleanOldErrorLogs(daysToKeep = 30) {
        try {
            const { query } = require('../../config/database');
            
            const result = await query(
                'DELETE FROM error_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
                [daysToKeep]
            );
            
            this.logger.info(`Nettoyage des logs d'erreur: ${result.affectedRows} entrées supprimées`);
        } catch (error) {
            this.logger.error('Erreur lors du nettoyage des logs', {
                error: error.message
            });
        }
    }

    /**
     * Obtient les statistiques d'erreurs
     * @param {number} days - Nombre de jours à analyser
     * @returns {Object}
     */
    async getErrorStats(days = 7) {
        try {
            const { query } = require('../../config/database');
            
            const stats = await query(
                `SELECT error_type, COUNT(*) as count 
                 FROM error_logs 
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) 
                 GROUP BY error_type 
                 ORDER BY count DESC`,
                [days]
            );
            
            return stats.reduce((acc, row) => {
                acc[row.error_type] = row.count;
                return acc;
            }, {});
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des statistiques', {
                error: error.message
            });
            return {};
        }
    }
}

module.exports = InteractionErrorHandler;