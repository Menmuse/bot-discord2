/**
 * Gestionnaire de boutons Discord.js v14.21
 * Architecture modulaire avec validation et sécurité
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { query } = require('../../config/database');
const config = require('../../config');
const Logger = require('../../utils/logger');
const InteractionValidator = require('./validator');

class ButtonHandler {
    constructor(client) {
        this.client = client;
        this.validator = new InteractionValidator();
        this.logger = new Logger('ButtonHandler');
        
        // Registre des gestionnaires de boutons
        this.handlers = new Map();
        this._registerHandlers();
    }

    /**
     * Enregistre tous les gestionnaires de boutons
     */
    _registerHandlers() {
        // Boutons PDF
        this.handlers.set('pdf_modal_', this._handlePDFModal.bind(this));
        this.handlers.set('next_', this._handleNextPDFPage.bind(this));
        
        // Boutons facture
        this.handlers.set('next_facture_', this._handleNextFacturePage.bind(this));
        
        // Boutons système
        this.handlers.set('language_', this._handleLanguage.bind(this));
        this.handlers.set('role_', this._handleRole.bind(this));
        this.handlers.set('ticket_', this._handleTicket.bind(this));
        
        // Boutons crédits
        this.handlers.set('buy_credits', this._handleBuyCredits.bind(this));
        this.handlers.set('refer_friend', this._handleReferFriend.bind(this));
    }

    /**
     * Gère une interaction de bouton
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async handle(interaction) {
        if (!this.validator.isValidButtonId(interaction.customId)) {
            this.logger.warn('CustomId de bouton invalide', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
            return this._replyError(interaction, '❌ Bouton invalide.');
        }

        // Trouver le gestionnaire approprié
        const handler = this._findHandler(interaction.customId);
        
        if (!handler) {
            this.logger.warn('Gestionnaire de bouton introuvable', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
            return this._replyError(interaction, '❌ Action non reconnue.');
        }

        try {
            await handler(interaction);
            
            this.logger.debug('Bouton traité avec succès', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
        } catch (error) {
            this.logger.error('Erreur lors du traitement du bouton', {
                customId: interaction.customId,
                userId: interaction.user.id,
                error: error.message,
                stack: error.stack
            });

            await this._handleError(interaction, error);
        }
    }

    /**
     * Trouve le gestionnaire approprié pour un customId
     * @param {string} customId 
     * @returns {Function|null}
     */
    _findHandler(customId) {
        for (const [prefix, handler] of this.handlers.entries()) {
            if (customId.startsWith(prefix)) {
                return handler;
            }
        }
        return null;
    }

    /**
     * Gère les boutons de modale PDF
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handlePDFModal(interaction) {
        const model = interaction.customId.replace('pdf_modal_', '');
        
        // Vérifier l'existence du modèle
        const templatePath = path.join(__dirname, '../../assets/pdf-templates', `${model}.pdf`);
        
        if (!fs.existsSync(templatePath)) {
            return this._replyError(interaction, `❌ Modèle PDF "${model}" introuvable.`);
        }

        try {
            // Charger le PDF et extraire les champs
            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fieldNames = [...new Set(form.getFields().map(f => f.getName()))];
            
            if (fieldNames.length === 0) {
                return this._replyError(interaction, '❌ Ce modèle PDF ne contient aucun champ à remplir.');
            }

            // Créer la modale avec les premiers champs
            const modal = this._createPDFModal(model, fieldNames, 0);
            
            // Afficher la modale directement (pas de defer pour les boutons qui affichent des modales)
            await interaction.showModal(modal);
            
            this.logger.info('Modale PDF affichée', {
                model,
                fieldsCount: fieldNames.length,
                userId: interaction.user.id
            });
        } catch (error) {
            this.logger.error('Erreur lors de la création de la modale PDF', {
                model,
                error: error.message
            });
            
            // Si on ne peut pas afficher la modale, répondre avec une erreur
            if (!interaction.replied && !interaction.deferred) {
                return this._replyError(interaction, '❌ Erreur lors de l\'ouverture du formulaire.');
            }
        }
    }

    /**
     * Gère les boutons "Suivant" pour les PDF
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleNextPDFPage(interaction) {
        const parts = interaction.customId.split('_');
        const [, model, pageStr] = parts;
        const page = parseInt(pageStr, 10);

        if (isNaN(page)) {
            return this._replyError(interaction, '❌ Page invalide.');
        }

        try {
            // Charger le modèle PDF
            const templatePath = path.join(__dirname, '../../assets/pdf-templates', `${model}.pdf`);
            
            if (!fs.existsSync(templatePath)) {
                return this._replyError(interaction, '❌ Modèle PDF introuvable.');
            }

            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fieldNames = [...new Set(form.getFields().map(f => f.getName()))];
            
            // Créer la modale pour la page suivante
            const modal = this._createPDFModal(model, fieldNames, page);
            
            // Afficher la modale directement (pas de defer pour les boutons qui affichent des modales)
            await interaction.showModal(modal);
            
        } catch (error) {
            this.logger.error('Erreur lors du passage à la page suivante', {
                model,
                page,
                error: error.message
            });
            
            // Si on ne peut pas afficher la modale, répondre avec une erreur
            if (!interaction.replied && !interaction.deferred) {
                return this._replyError(interaction, '❌ Erreur lors du chargement de la page suivante.');
            }
        }
    }

    /**
     * Gère les boutons "Suivant" pour les factures
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleNextFacturePage(interaction) {
        // Implémentation similaire aux PDF mais pour les factures
        const parts = interaction.customId.split('_');
        const [, , model, pageStr] = parts;
        const page = parseInt(pageStr, 10);

        // Logique spécifique aux factures
        this.logger.info('Traitement page facture suivante', {
            model,
            page,
            userId: interaction.user.id
        });

        // TODO: Implémenter la logique des factures
        return this._replyError(interaction, '🚧 Fonctionnalité en développement.');
    }

    /**
     * Gère les boutons de langue
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleLanguage(interaction) {
        const language = interaction.customId.replace('language_', '');
        
        // TODO: Implémenter la gestion des langues
        await this._replySuccess(interaction, `🌐 Langue changée vers: ${language}`);
    }

    /**
     * Gère les boutons de rôle
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleRole(interaction) {
        const roleId = interaction.customId.replace('role_', '');
        
        try {
            const role = interaction.guild.roles.cache.get(roleId);
            
            if (!role) {
                return this._replyError(interaction, '❌ Rôle introuvable.');
            }

            const member = interaction.member;
            
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(role);
                await this._replySuccess(interaction, `➖ Rôle **${role.name}** retiré.`);
            } else {
                await member.roles.add(role);
                await this._replySuccess(interaction, `➕ Rôle **${role.name}** ajouté.`);
            }
        } catch (error) {
            this.logger.error('Erreur lors de la gestion du rôle', {
                roleId,
                userId: interaction.user.id,
                error: error.message
            });
            
            return this._replyError(interaction, '❌ Erreur lors de la gestion du rôle.');
        }
    }

    /**
     * Gère les boutons de ticket
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleTicket(interaction) {
        const action = interaction.customId.replace('ticket_', '');
        
        // TODO: Implémenter la gestion des tickets
        await this._replySuccess(interaction, `🎫 Action ticket: ${action}`);
    }

    /**
     * Gère le bouton d'achat de crédits
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleBuyCredits(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('💰 Acheter des crédits')
            .setDescription('Contactez un administrateur pour acheter des crédits.')
            .setColor(config.colors.info)
            .setTimestamp();

        await this._replyEmbed(interaction, embed);
    }

    /**
     * Gère le bouton de parrainage
     * @param {import('discord.js').ButtonInteraction} interaction 
     */
    async _handleReferFriend(interaction) {
        try {
            // Récupérer ou créer le code de parrainage
            const result = await query('SELECT referral_code FROM users WHERE discord_id = ?', [interaction.user.id]);
            
            let referralCode;
            if (result.length > 0 && result[0].referral_code) {
                referralCode = result[0].referral_code;
            } else {
                referralCode = this._generateReferralCode();
                await query('UPDATE users SET referral_code = ? WHERE discord_id = ?', [referralCode, interaction.user.id]);
            }

            const embed = new EmbedBuilder()
                .setTitle('👥 Parrainage')
                .setDescription(`Votre code de parrainage: \`${referralCode}\`\n\nPartagez ce code avec vos amis pour gagner des crédits !`)
                .setColor(config.colors.success)
                .setTimestamp();

            await this._replyEmbed(interaction, embed);
        } catch (error) {
            this.logger.error('Erreur lors de la génération du code de parrainage', {
                userId: interaction.user.id,
                error: error.message
            });
            
            return this._replyError(interaction, '❌ Erreur lors de la génération du code de parrainage.');
        }
    }

    /**
     * Crée une modale PDF
     * @param {string} model 
     * @param {string[]} fieldNames 
     * @param {number} page 
     * @returns {ModalBuilder}
     */
    _createPDFModal(model, fieldNames, page) {
        const maxFields = 5;
        const slice = fieldNames.slice(page * maxFields, (page + 1) * maxFields);
        
        const modal = new ModalBuilder()
            .setCustomId(`modal_${model}_${page}`)
            .setTitle(`Champs ${page * maxFields + 1} à ${page * maxFields + slice.length}`);
        
        const rows = slice.map(name => {
            let displayName = name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
            
            return new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(name)
                    .setLabel(displayName.substring(0, 45))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(100)
                    .setPlaceholder(`Entrez ${displayName.toLowerCase()}`)
            );
        });
        
        modal.addComponents(...rows);
        return modal;
    }

    /**
     * Génère un code de parrainage
     * @returns {string}
     */
    _generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Diffère une réponse
     * @param {import('discord.js').ButtonInteraction} interaction 
     * @param {string} content 
     */
    async _deferReply(interaction, content = '⏳ Traitement en cours...') {
        if (this.validator.canDefer(interaction)) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (content !== '⏳ Traitement en cours...') {
                await interaction.editReply({ content });
            }
        }
    }

    /**
     * Répond avec un message d'erreur
     * @param {import('discord.js').ButtonInteraction} interaction 
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
                error: error.message
            });
        }
    }

    /**
     * Répond avec un message de succès
     * @param {import('discord.js').ButtonInteraction} interaction 
     * @param {string} message 
     */
    async _replySuccess(interaction, message) {
        try {
            if (this.validator.canReply(interaction)) {
                await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            } else if (this.validator.canEdit(interaction)) {
                await interaction.editReply({ content: message });
            } else {
                await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            this.logger.error('Impossible de répondre avec un message de succès', {
                error: error.message
            });
        }
    }

    /**
     * Répond avec un embed
     * @param {import('discord.js').ButtonInteraction} interaction 
     * @param {EmbedBuilder} embed 
     */
    async _replyEmbed(interaction, embed) {
        try {
            if (this.validator.canReply(interaction)) {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else if (this.validator.canEdit(interaction)) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            this.logger.error('Impossible de répondre avec un embed', {
                error: error.message
            });
        }
    }

    /**
     * Gère les erreurs générales
     * @param {import('discord.js').ButtonInteraction} interaction 
     * @param {Error} error 
     */
    async _handleError(interaction, error) {
        const errorMessage = '❌ Une erreur est survenue lors du traitement de cette action.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        } catch (replyError) {
            this.logger.error('Impossible de répondre après erreur', {
                originalError: error.message,
                replyError: replyError.message
            });
        }
    }
}

module.exports = ButtonHandler;