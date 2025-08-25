/**
 * Gestionnaire principal des interactions Discord.js v14.21
 * Architecture modulaire pour une meilleure maintenabilité
 */

const { Events, MessageFlags } = require('discord.js');
const SlashCommandHandler = require('./slashCommands');
const ButtonHandler = require('./buttons');
const ModalHandler = require('./modals');
const AutocompleteHandler = require('./autocomplete');
const InteractionValidator = require('./validator');
const Logger = require('../../utils/logger');

class InteractionManager {
    constructor(client) {
        this.client = client;
        this.slashHandler = new SlashCommandHandler(client);
        this.buttonHandler = new ButtonHandler(client);
        this.modalHandler = new ModalHandler(client);
        this.autocompleteHandler = new AutocompleteHandler(client);
        this.validator = new InteractionValidator();
        this.logger = new Logger('InteractionManager');
    }

    /**
     * Gestionnaire principal des interactions
     * @param {import('discord.js').Interaction} interaction 
     */
    async handleInteraction(interaction) {
        try {
            // Validation de base de l'interaction
            if (!this.validator.isValid(interaction)) {
                this.logger.warn('Interaction invalide ou expirée', {
                    type: interaction.type,
                    customId: interaction.customId || interaction.commandName,
                    userId: interaction.user?.id
                });
                return;
            }

            // Vérifier si l'interaction est encore valide
            if (interaction.replied || interaction.deferred) {
                console.log('Interaction déjà traitée, abandon du routage');
                return;
            }
            
            // Routage selon le type d'interaction
            switch (true) {
                case interaction.isChatInputCommand():
                    await this.slashHandler.handle(interaction);
                    break;
                    
                case interaction.isButton():
                    await this.buttonHandler.handle(interaction);
                    break;
                    
                case interaction.isModalSubmit():
                    await this.modalHandler.handle(interaction);
                    break;
                    
                case interaction.isAutocomplete():
                    await this.autocompleteHandler.handle(interaction);
                    break;
                    
                default:
                    this.logger.warn('Type d\'interaction non géré', {
                        type: interaction.type,
                        constructor: interaction.constructor.name
                    });
            }
        } catch (error) {
            this.logger.error('Erreur dans le gestionnaire d\'interactions', {
                error: error.message,
                stack: error.stack,
                interaction: {
                    type: interaction.type,
                    customId: interaction.customId || interaction.commandName,
                    userId: interaction.user?.id
                }
            });

            // Tentative de réponse d'erreur à l'utilisateur
            await this._handleError(interaction, error);
        }
    }

    /**
     * Gestion des erreurs avec réponse utilisateur
     * @param {import('discord.js').Interaction} interaction 
     * @param {Error} error 
     */
    async _handleError(interaction, error) {
        const errorMessage = '❌ Une erreur inattendue s\'est produite. Veuillez réessayer.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ 
                    content: errorMessage, 
                    flags: MessageFlags.Ephemeral 
                });
            } else if (interaction.isRepliable()) {
                await interaction.reply({ 
                    content: errorMessage, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } catch (replyError) {
            this.logger.error('Impossible de répondre à l\'interaction après erreur', {
                originalError: error.message,
                replyError: replyError.message
            });
        }
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (!client.interactionManager) {
            client.interactionManager = new InteractionManager(client);
        }
        
        await client.interactionManager.handleInteraction(interaction);
    }
};