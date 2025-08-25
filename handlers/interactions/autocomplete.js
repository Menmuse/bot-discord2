/**
 * Gestionnaire d'autocomplétion Discord.js v14.21
 * Gestion optimisée des suggestions avec cache et validation
 */

const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/logger');
const InteractionValidator = require('./validator');

class AutocompleteHandler {
    constructor(client) {
        this.client = client;
        this.validator = new InteractionValidator();
        this.logger = new Logger('Autocomplete');
        
        // Cache pour les suggestions fréquentes
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Gère une interaction d'autocomplétion
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     */
    async handle(interaction) {
        // Validation stricte pour l'autocomplétion
        if (!this.validator.validateAutocomplete(interaction)) {
            this.logger.debug('Interaction d\'autocomplétion invalide ou expirée', {
                commandName: interaction.commandName,
                age: Date.now() - interaction.createdTimestamp
            });
            return;
        }

        const command = this.client.commands.get(interaction.commandName);
        
        if (!command || !command.autocomplete) {
            this.logger.warn('Autocomplétion non disponible pour cette commande', {
                commandName: interaction.commandName
            });
            return this._respondEmpty(interaction);
        }

        try {
            // Vérifier le cache d'abord
            const cacheKey = this._getCacheKey(interaction);
            const cachedResult = this.cache.get(cacheKey);
            
            if (cachedResult && this._isCacheValid(cachedResult.timestamp)) {
                return this._respondWithChoices(interaction, cachedResult.choices);
            }

            // Exécuter l'autocomplétion de la commande
            const choices = await this._executeAutocomplete(command, interaction);
            
            // Mettre en cache le résultat
            this.cache.set(cacheKey, {
                choices,
                timestamp: Date.now()
            });

            // Nettoyer le cache périodiquement
            this._cleanCache();

            return this._respondWithChoices(interaction, choices);

        } catch (error) {
            // Ignorer les erreurs connues d'interaction
            if (this._isKnownInteractionError(error)) {
                this.logger.debug('Erreur d\'interaction connue ignorée', {
                    code: error.code,
                    commandName: interaction.commandName
                });
                return;
            }

            this.logger.error('Erreur lors de l\'autocomplétion', {
                commandName: interaction.commandName,
                error: error.message,
                stack: error.stack
            });

            return this._respondEmpty(interaction);
        }
    }

    /**
     * Exécute l'autocomplétion spécifique à la commande
     * @param {Object} command 
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     * @returns {Array}
     */
    async _executeAutocomplete(command, interaction) {
        // Gestion spéciale pour la commande PDF
        if (interaction.commandName === 'pdf') {
            return this._handlePDFAutocomplete(interaction);
        }

        // Gestion générique
        const result = await command.autocomplete(interaction);
        
        // Si la commande retourne directement les choix
        if (Array.isArray(result)) {
            return result;
        }

        // Si la commande a déjà répondu, retourner vide
        return [];
    }

    /**
     * Gestion spécifique de l'autocomplétion PDF
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     * @returns {Array}
     */
    async _handlePDFAutocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const templatesDir = path.join(__dirname, '../../assets/pdf-templates');
        
        try {
            if (!fs.existsSync(templatesDir)) {
                return [];
            }

            const files = fs.readdirSync(templatesDir)
                .filter(file => file.endsWith('.pdf'))
                .map(file => file.replace('.pdf', ''))
                .filter(name => name.toLowerCase().includes(focused.toLowerCase()))
                .slice(0, 25) // Limite Discord
                .map(name => ({
                    name: name,
                    value: name
                }));

            return files;
        } catch (error) {
            this.logger.error('Erreur lors de l\'autocomplétion PDF', {
                error: error.message,
                templatesDir
            });
            return [];
        }
    }

    /**
     * Répond avec des choix d'autocomplétion
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     * @param {Array} choices 
     */
    async _respondWithChoices(interaction, choices) {
        try {
            // Vérifier à nouveau avant de répondre
            if (interaction.responded || interaction.replied) {
                return;
            }

            // Limiter à 25 choix maximum (limite Discord)
            const limitedChoices = choices.slice(0, 25);
            
            await interaction.respond(limitedChoices);
            
            this.logger.debug('Autocomplétion réussie', {
                commandName: interaction.commandName,
                choicesCount: limitedChoices.length
            });
        } catch (error) {
            if (!this._isKnownInteractionError(error)) {
                this.logger.error('Erreur lors de la réponse d\'autocomplétion', {
                    error: error.message,
                    commandName: interaction.commandName
                });
            }
        }
    }

    /**
     * Répond avec une liste vide
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     */
    async _respondEmpty(interaction) {
        try {
            if (!interaction.responded && !interaction.replied) {
                await interaction.respond([]);
            }
        } catch (error) {
            // Ignorer les erreurs lors de la réponse vide
            this.logger.debug('Erreur lors de la réponse vide d\'autocomplétion', {
                error: error.message
            });
        }
    }

    /**
     * Génère une clé de cache pour l'interaction
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     * @returns {string}
     */
    _getCacheKey(interaction) {
        const focused = interaction.options.getFocused();
        return `${interaction.commandName}:${focused}`;
    }

    /**
     * Vérifie si le cache est encore valide
     * @param {number} timestamp 
     * @returns {boolean}
     */
    _isCacheValid(timestamp) {
        return (Date.now() - timestamp) < this.cacheTimeout;
    }

    /**
     * Nettoie le cache des entrées expirées
     */
    _cleanCache() {
        const now = Date.now();
        
        for (const [key, value] of this.cache.entries()) {
            if (!this._isCacheValid(value.timestamp)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Vérifie si c'est une erreur d'interaction connue
     * @param {Error} error 
     * @returns {boolean}
     */
    _isKnownInteractionError(error) {
        const knownCodes = [
            10062, // Unknown interaction
            40060, // Interaction has already been acknowledged
            10008  // Unknown message
        ];
        
        return knownCodes.includes(error.code);
    }

    /**
     * Nettoie complètement le cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.info('Cache d\'autocomplétion vidé');
    }

    /**
     * Obtient les statistiques du cache
     * @returns {Object}
     */
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        
        for (const value of this.cache.values()) {
            if (this._isCacheValid(value.timestamp)) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        }
        
        return {
            total: this.cache.size,
            valid: validEntries,
            expired: expiredEntries
        };
    }
}

module.exports = AutocompleteHandler;