/**
 * Gestionnaire d'événements pour les interactions Discord.js v14.21
 * Architecture modulaire avec gestionnaires dédiés
 */

const { Events } = require('discord.js');
const interactionHandler = require('../../handlers/interactions');
const InteractionErrorHandler = require('../../handlers/interactions/errorHandler');
const Logger = require('../../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const logger = new Logger('InteractionCreate');
        const errorHandler = new InteractionErrorHandler(client);
        
        try {
            // Déléguer le traitement au gestionnaire d'interactions
            await interactionHandler.execute(interaction, client);
            
        } catch (error) {
            // Utiliser le gestionnaire d'erreurs centralisé
            const errorId = await errorHandler.handleError(error, interaction, {
                interactionType: interaction.type,
                commandName: interaction.commandName || interaction.customId,
                timestamp: new Date().toISOString()
            });
            
            logger.error('Erreur lors du traitement de l\'interaction', {
                errorId,
                userId: interaction.user?.id,
                interactionType: interaction.type,
                error: error.message
            });
        }
    }
};

/**
 * ARCHITECTURE REFACTORISÉE
 * 
 * L'ancien système monolithique a été remplacé par une architecture modulaire :
 * 
 * 1. InteractionManager (handlers/interactions/index.js)
 *    - Point d'entrée principal pour toutes les interactions
 *    - Routage vers les gestionnaires appropriés
 *    - Validation de base des interactions
 * 
 * 2. SlashCommandHandler (handlers/interactions/slashCommands.js)
 *    - Gestion des commandes slash
 *    - Cooldowns et permissions
 *    - Logging et validation
 * 
 * 3. ButtonHandler (handlers/interactions/buttons.js)
 *    - Gestion des interactions de boutons
 *    - Routage par type de bouton
 *    - Validation des customId
 * 
 * 4. ModalHandler (handlers/interactions/modals.js)
 *    - Gestion des soumissions de modales
 *    - Traitement des formulaires PDF et factures
 *    - Validation des données
 * 
 * 5. AutocompleteHandler (handlers/interactions/autocomplete.js)
 *    - Gestion de l'autocomplétion
 *    - Cache des suggestions
 *    - Gestion des timeouts
 * 
 * 6. InteractionValidator (handlers/interactions/validator.js)
 *    - Validation centralisée des interactions
 *    - Vérification des expirations
 *    - Contrôles de permissions
 * 
 * 7. InteractionErrorHandler (handlers/interactions/errorHandler.js)
 *    - Gestion centralisée des erreurs
 *    - Classification et logging
 *    - Notifications administrateur
 * 
 * AVANTAGES DE CETTE ARCHITECTURE :
 * 
 * ✅ Séparation des responsabilités
 * ✅ Code plus maintenable et testable
 * ✅ Gestion d'erreurs robuste
 * ✅ Validation centralisée
 * ✅ Logging structuré
 * ✅ Extensibilité facilitée
 * ✅ Conformité Discord.js v14.21
 * ✅ Réduction de la duplication de code
 * ✅ Meilleure gestion des timeouts
 * ✅ Architecture scalable
 * 
 * Cette refactorisation suit les bonnes pratiques de développement
 * et améliore significativement la qualité du code.
 */