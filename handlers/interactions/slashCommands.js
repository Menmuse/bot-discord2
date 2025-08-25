/**
 * Gestionnaire des commandes slash Discord.js v14.21
 * Gestion centralisée avec cooldowns, permissions et logging
 */

const { Collection, MessageFlags } = require('discord.js');
const { query } = require('../../config/database');
const config = require('../../config');
const Logger = require('../../utils/logger');
const InteractionValidator = require('./validator');

class SlashCommandHandler {
    constructor(client) {
        this.client = client;
        this.validator = new InteractionValidator();
        this.logger = new Logger('SlashCommands');
        
        // Initialiser les cooldowns si pas déjà fait
        if (!this.client.cooldowns) {
            this.client.cooldowns = new Collection();
        }
    }

    /**
     * Gère une interaction de commande slash
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     */
    async handle(interaction) {
        const command = this.client.commands.get(interaction.commandName);
        
        if (!command) {
            this.logger.warn('Commande introuvable', {
                commandName: interaction.commandName,
                userId: interaction.user.id
            });
            
            return this._replyError(interaction, '❌ Cette commande n\'existe pas.');
        }

        try {
            // Vérifications préalables
            const validationResult = await this._validateCommand(interaction, command);
            if (!validationResult.success) {
                return this._replyError(interaction, validationResult.message);
            }

            // Vérifier et appliquer le cooldown
            const cooldownResult = this._handleCooldown(interaction, command);
            if (!cooldownResult.success) {
                return this._replyError(interaction, cooldownResult.message);
            }

            // S'assurer que l'utilisateur existe en base
            await this._ensureUserExists(interaction.user.id);

            // Exécuter la commande
            await command.execute(interaction);

            // Logger l'utilisation
            await this._logUsage(interaction);

            this.logger.info('Commande exécutée avec succès', {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guild.id
            });

        } catch (error) {
            this.logger.error('Erreur lors de l\'exécution de la commande', {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                error: error.message,
                stack: error.stack
            });

            await this._handleCommandError(interaction, error);
        }
    }

    /**
     * Valide une commande avant exécution
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     * @param {Object} command 
     * @returns {Object}
     */
    async _validateCommand(interaction, command) {
        // Vérifier les permissions si définies
        if (command.permissions && !this.validator.hasPermissions(interaction, command.permissions)) {
            return {
                success: false,
                message: '❌ Vous n\'avez pas les permissions nécessaires pour utiliser cette commande.'
            };
        }

        // Vérifier le type de canal si défini
        if (command.allowedChannels && !this.validator.isInValidChannel(interaction, command.allowedChannels)) {
            return {
                success: false,
                message: '❌ Cette commande ne peut pas être utilisée dans ce type de canal.'
            };
        }

        // Vérifier le statut de l'utilisateur
        const userStatus = await this._getUserStatus(interaction.user.id);
        if (userStatus === 'banned') {
            return {
                success: false,
                message: '🚫 Vous êtes banni du service.'
            };
        }

        // Vérifier les crédits si nécessaire
        if (command.requiresCredits) {
            const hasCredits = await this._checkCredits(interaction.user.id, command.creditCost || 1);
            if (!hasCredits) {
                return {
                    success: false,
                    message: `❌ Crédits insuffisants. Cette commande coûte ${command.creditCost || 1} crédit(s).`
                };
            }
        }

        return { success: true };
    }

    /**
     * Gère le système de cooldown
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     * @param {Object} command 
     * @returns {Object}
     */
    _handleCooldown(interaction, command) {
        const cooldownAmount = (command.cooldown ?? 3) * 1000;
        const commandName = command.data.name;
        
        if (!this.client.cooldowns.has(commandName)) {
            this.client.cooldowns.set(commandName, new Collection());
        }

        const now = Date.now();
        const timestamps = this.client.cooldowns.get(commandName);
        
        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            
            if (now < expirationTime) {
                const timeLeft = Math.round((expirationTime - now) / 1000);
                return {
                    success: false,
                    message: `⏳ Veuillez patienter ${timeLeft} seconde(s) avant de réutiliser \`${commandName}\`.`
                };
            }
        }

        // Appliquer le cooldown
        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        return { success: true };
    }

    /**
     * Répond avec un message d'erreur
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     * @param {string} message 
     */
    async _replyError(interaction, message) {
        try {
            if (this.validator.canReply(interaction)) {
                await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            } else if (this.validator.canEdit(interaction)) {
                await interaction.editReply({ content: message });
            } else {
                await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            this.logger.error('Impossible de répondre avec un message d\'erreur', {
                error: error.message,
                commandName: interaction.commandName
            });
        }
    }

    /**
     * Gère les erreurs de commande
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     * @param {Error} error 
     */
    async _handleCommandError(interaction, error) {
        const errorMessage = '❌ Une erreur est survenue lors de l\'exécution de cette commande.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        } catch (replyError) {
            this.logger.error('Impossible de répondre après erreur de commande', {
                originalError: error.message,
                replyError: replyError.message
            });
        }
    }

    /**
     * S'assure que l'utilisateur existe en base de données
     * @param {string} userId 
     */
    async _ensureUserExists(userId) {
        try {
            const result = await query('SELECT discord_id FROM users WHERE discord_id = ?', [userId]);
            
            if (result.length === 0) {
                await query(
                    'INSERT INTO users (discord_id, credits, status, created_at) VALUES (?, ?, ?, NOW())',
                    [userId, config.credits.defaultAmount || 10, 'active']
                );
                
                this.logger.info('Nouvel utilisateur créé', { userId });
            }
        } catch (error) {
            this.logger.error('Erreur lors de la création/vérification utilisateur', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Récupère le statut d'un utilisateur
     * @param {string} userId 
     * @returns {string}
     */
    async _getUserStatus(userId) {
        try {
            const result = await query('SELECT status FROM users WHERE discord_id = ?', [userId]);
            return result.length > 0 ? result[0].status : 'active';
        } catch (error) {
            this.logger.error('Erreur lors de la récupération du statut utilisateur', {
                userId,
                error: error.message
            });
            return 'active';
        }
    }

    /**
     * Vérifie si l'utilisateur a suffisamment de crédits
     * @param {string} userId 
     * @param {number} cost 
     * @returns {boolean}
     */
    async _checkCredits(userId, cost) {
        try {
            const result = await query('SELECT credits, status FROM users WHERE discord_id = ?', [userId]);
            
            if (result.length === 0) return false;
            
            const user = result[0];
            
            // Les utilisateurs premium/staff ont des crédits illimités
            if (user.status === 'premium' || user.status === 'staff') {
                return true;
            }
            
            return user.credits >= cost;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification des crédits', {
                userId,
                cost,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Enregistre l'utilisation d'une commande
     * @param {import('discord.js').ChatInputCommandInteraction} interaction 
     */
    async _logUsage(interaction) {
        try {
            await query(
                'INSERT INTO usage_logs (user_id, action, command_name, details, created_at) VALUES (?, ?, ?, ?, NOW())',
                [
                    interaction.user.id,
                    'command',
                    interaction.commandName,
                    JSON.stringify({
                        guildId: interaction.guild.id,
                        channelId: interaction.channel.id,
                        options: interaction.options.data
                    })
                ]
            );
        } catch (error) {
            this.logger.error('Erreur lors du logging d\'usage', {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                error: error.message
            });
        }
    }
}

module.exports = SlashCommandHandler;