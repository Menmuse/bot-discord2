/**
 * Validateur d'interactions Discord.js v14.21
 * Centralise toutes les validations d'interactions
 */

class InteractionValidator {
    constructor() {
        this.MAX_INTERACTION_AGE = 15 * 60 * 1000; // 15 minutes
        this.MAX_AUTOCOMPLETE_AGE = 3 * 1000; // 3 secondes pour l'autocomplétion
    }

    /**
     * Vérifie si une interaction est valide
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    isValid(interaction) {
        if (!interaction) return false;
        
        // Vérifications de base
        if (!interaction.user || !interaction.guild) {
            return false;
        }

        // Vérification de l'âge de l'interaction
        if (!this.isNotExpired(interaction)) {
            return false;
        }

        // Vérifications spécifiques par type
        if (interaction.isAutocomplete()) {
            return this.validateAutocomplete(interaction);
        }

        return true;
    }

    /**
     * Vérifie si l'interaction n'a pas expiré
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    isNotExpired(interaction) {
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const age = now - interactionTime;
        
        // Limite plus stricte pour l'autocomplétion
        if (interaction.isAutocomplete()) {
            return age < this.MAX_AUTOCOMPLETE_AGE;
        }
        
        return age < this.MAX_INTERACTION_AGE;
    }

    /**
     * Validation spécifique pour l'autocomplétion
     * @param {import('discord.js').AutocompleteInteraction} interaction 
     * @returns {boolean}
     */
    validateAutocomplete(interaction) {
        // Vérifier si déjà traitée
        if (interaction.responded || interaction.replied) {
            return false;
        }

        // Vérifier l'âge plus strictement
        const now = Date.now();
        const age = now - interaction.createdTimestamp;
        
        return age < this.MAX_AUTOCOMPLETE_AGE;
    }

    /**
     * Vérifie si une interaction peut être répondue
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    canReply(interaction) {
        if (!interaction.isRepliable()) return false;
        
        return !interaction.replied && !interaction.deferred;
    }

    /**
     * Vérifie si une interaction peut être différée
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    canDefer(interaction) {
        if (!interaction.isRepliable()) return false;
        
        return !interaction.replied && !interaction.deferred;
    }

    /**
     * Vérifie si une interaction peut être éditée
     * @param {import('discord.js').Interaction} interaction 
     * @returns {boolean}
     */
    canEdit(interaction) {
        if (!interaction.isRepliable()) return false;
        
        return interaction.replied || interaction.deferred;
    }

    /**
     * Valide un customId de bouton
     * @param {string} customId 
     * @returns {boolean}
     */
    isValidButtonId(customId) {
        if (!customId || typeof customId !== 'string') return false;
        
        // Vérifier la longueur (Discord limite à 100 caractères)
        if (customId.length > 100) return false;
        
        // Vérifier les caractères autorisés
        const validPattern = /^[a-zA-Z0-9_-]+$/;
        return validPattern.test(customId);
    }

    /**
     * Valide un customId de modale
     * @param {string} customId 
     * @returns {boolean}
     */
    isValidModalId(customId) {
        return this.isValidButtonId(customId); // Mêmes règles
    }

    /**
     * Vérifie si l'utilisateur a les permissions nécessaires
     * @param {import('discord.js').Interaction} interaction 
     * @param {import('discord.js').PermissionResolvable[]} permissions 
     * @returns {boolean}
     */
    hasPermissions(interaction, permissions) {
        if (!interaction.member || !permissions) return true;
        
        return interaction.member.permissions.has(permissions);
    }

    /**
     * Vérifie si l'utilisateur est dans un canal approprié
     * @param {import('discord.js').Interaction} interaction 
     * @param {string[]} allowedChannelTypes 
     * @returns {boolean}
     */
    isInValidChannel(interaction, allowedChannelTypes = []) {
        if (!interaction.channel || allowedChannelTypes.length === 0) return true;
        
        return allowedChannelTypes.includes(interaction.channel.type);
    }
}

module.exports = InteractionValidator;